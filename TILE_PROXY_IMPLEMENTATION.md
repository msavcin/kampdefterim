# Tile Proxy Backend Implementation

## Supabase Edge Function Örneği

### 1. Function Oluşturma

```bash
# Supabase CLI ile yeni function oluştur
supabase functions new tiles
```

### 2. Implementation (supabase/functions/tiles/index.ts)

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// CartoDB tile sağlayıcıları (subdomain rotation için)
const TILE_PROVIDERS = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager',
  'https://c.basemaps.cartocdn.com/rastertiles/voyager',
  'https://d.basemaps.cartocdn.com/rastertiles/voyager',
]

// Basit in-memory cache (production'da Redis kullanın)
const tileCache = new Map<string, { data: ArrayBuffer; timestamp: number }>()
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 gün

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const pathMatch = url.pathname.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)\.png/)
    
    if (!pathMatch) {
      return new Response('Invalid tile path', { status: 400 })
    }

    const [, z, x, y] = pathMatch
    const cacheKey = `${z}/${x}/${y}`

    // CORS headers
    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800', // 7 gün browser cache
    })

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    // Cache kontrolü
    const cached = tileCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[TILE_CACHE] HIT: ${cacheKey}`)
      return new Response(cached.data, { headers })
    }

    // Subdomain seçimi (load balancing)
    const providerIndex = (parseInt(x) + parseInt(y)) % TILE_PROVIDERS.length
    const tileUrl = `${TILE_PROVIDERS[providerIndex]}/${z}/${x}/${y}.png`

    console.log(`[TILE_CACHE] MISS: ${cacheKey} -> ${tileUrl}`)

    // Tile'ı CartoDB'den çek
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'KampDefterim/1.3 (Contact: info@kampdefterim.com)',
      },
    })

    if (!response.ok) {
      console.error(`[TILE_ERROR] ${response.status}: ${cacheKey}`)
      return new Response('Tile not found', { status: response.status })
    }

    const tileData = await response.arrayBuffer()

    // Cache'e kaydet (memory sınırını kontrol et)
    if (tileCache.size < 10000) { // Max 10k tile in memory
      tileCache.set(cacheKey, { data: tileData, timestamp: Date.now() })
    }

    return new Response(tileData, { headers })
  } catch (error) {
    console.error('[TILE_PROXY_ERROR]', error)
    return new Response('Internal server error', { status: 500 })
  }
})
```

### 3. Deploy

```bash
# Function'ı deploy et
supabase functions deploy tiles

# Test et
curl https://YOUR_PROJECT.supabase.co/functions/v1/tiles/13/4821/6160.png
```

## Redis Cache (Production İçin Önerilen)

```typescript
import { Redis } from 'https://esm.sh/@upstash/redis@1.20.1'

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_TOKEN')!,
})

// Cache'den oku (VERSION key ile!)
const TILE_CACHE_VERSION = 'v2_cartodb' // OpenStreetMap'ten CartoDB'ye geçişte değiştirin
const cacheKey = `${TILE_CACHE_VERSION}:${z}/${x}/${y}`

const cached = await redis.getBuffer(cacheKey)
if (cached) {
  return new Response(cached, { headers })
}

// Cache'e yaz
await redis.setex(cacheKey, 604800, tileData) // 7 gün TTL
```

### Cache Temizleme (Tile Provider Değişikliğinde)

```bash
# Eski cache'leri temizle (Redis CLI)
redis-cli KEYS "v1_osm:*" | xargs redis-cli DEL

# veya tüm tile cache'ini temizle
redis-cli FLUSHDB

# veya backend'de endpoint ekle
# GET /admin/clear-tile-cache?version=v1_osm
```

## CDN Entegrasyonu (İsteğe Bağlı)

### Cloudflare Workers

```javascript
export default {
  async fetch(request) {
    const cache = caches.default
    let response = await cache.match(request)
    
    if (!response) {
      // CartoDB'den çek
      const url = new URL(request.url)
      const [, z, x, y] = url.pathname.match(/\/tiles\/(\d+)\/(\d+)\/(\d+)\.png/)
      const tileUrl = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`
      
      response = await fetch(tileUrl)
      response = new Response(response.body, response)
      response.headers.set('Cache-Control', 'public, max-age=604800')
      
      // CDN cache'e kaydet
      await cache.put(request, response.clone())
    }
    
    return response
  }
}
```

## Rate Limiting Örneği

```typescript
// Basit rate limiting (IP bazlı)
const rateLimits = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const limit = rateLimits.get(ip)
  
  if (!limit || now > limit.resetTime) {
    rateLimits.set(ip, { count: 1, resetTime: now + 60000 }) // 1 dakika
    return true
  }
  
  if (limit.count >= 1000) { // 1000 request/minute
    return false
  }
  
  limit.count++
  return true
}

// Kullanım
const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
if (!checkRateLimit(clientIp)) {
  return new Response('Rate limit exceeded', { status: 429 })
}
```

## Analytics Tracking

```typescript
// Tile usage analytics
interface TileStats {
  timestamp: number
  z: number
  x: number
  y: number
  cacheHit: boolean
}

async function trackTileUsage(stats: TileStats) {
  // Supabase'e kaydet
  await supabaseClient
    .from('tile_analytics')
    .insert({
      zoom: stats.z,
      tile_x: stats.x,
      tile_y: stats.y,
      cache_hit: stats.cacheHit,
      timestamp: new Date(stats.timestamp).toISOString(),
    })
}
```

## Performans Optimizasyonları

### 1. Tile Compression
```typescript
import { compress } from 'https://deno.land/x/compress@v0.4.5/mod.ts'

// PNG optimize et
const optimized = await compress(tileData, { quality: 85 })
```

### 2. WebP Dönüşümü (Modern tarayıcılar için)
```typescript
// PNG -> WebP dönüşümü (daha küçük dosya boyutu)
const webp = await convertToWebP(tileData)
```

### 3. Batch Prefetch
```typescript
// Kullanıcı zoom 13'te tile istediğinde, etrafındaki tile'ları da prefetch et
async function prefetchSurroundingTiles(z: number, x: number, y: number) {
  const promises = []
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      promises.push(fetchAndCacheTile(z, x + dx, y + dy))
    }
  }
  await Promise.allSettled(promises)
}
```

## Monitoring ve Alerting

```typescript
// Tile error rate monitoring
let errorCount = 0
let totalRequests = 0

setInterval(() => {
  const errorRate = errorCount / totalRequests
  if (errorRate > 0.05) { // %5'ten fazla hata
    console.error(`[ALERT] High tile error rate: ${errorRate * 100}%`)
    // Slack/email notification gönder
  }
  errorCount = 0
  totalRequests = 0
}, 60000) // Her dakika kontrol
```

## Fallback Strategy

```typescript
const FALLBACK_PROVIDERS = [
  'https://tile.openstreetmap.org',
  'https://mt1.google.com/vt/lyrs=m', // Google Maps (use with caution)
]

async function fetchTileWithFallback(z: number, x: number, y: number) {
  for (const provider of [TILE_PROVIDERS[0], ...FALLBACK_PROVIDERS]) {
    try {
      const response = await fetch(`${provider}/${z}/${x}/${y}.png`, { timeout: 5000 })
      if (response.ok) return response
    } catch (error) {
      console.warn(`Provider ${provider} failed, trying next...`)
    }
  }
  throw new Error('All tile providers failed')
}
```

## Maliyet Optimizasyonu

### Tahmini Kullanım:
- **Ortalama tile/request:** 50 tile
- **Günlük aktif kullanıcı:** 100
- **Aylık tile request:** 100 × 30 × 50 = 150,000 tile

### Cache ile tasarruf:
- **Cache hit rate:** %80-90
- **Gerçek CartoDB request:** 15,000-30,000 tile/ay
- **CartoDB limit:** 75,000 tile/ay ✅
- **Buffer:** %50-80 (güvenli alan)

## Sonuç

**Backend proxy kullanarak:**
- ✅ CartoDB kullanımını %80-90 azaltırsınız
- ✅ Rate limit sorunlarını önlersiniz
- ✅ Gelecekte sağlayıcı değiştirmek kolay
- ✅ Analytics ile kullanım takibi
- ✅ CDN ile global performans artışı

**Tavsiye:** Başlangıçta Supabase Edge Function + in-memory cache yeterli. Büyüdükçe Redis/CDN ekleyin.
