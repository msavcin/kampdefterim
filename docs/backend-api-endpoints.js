/**
 * Backend API Endpoint'leri - AI Review Evaluation
 * 
 * Bu dosya backend API endpoint'lerinin implementasyonunu içerir.
 * Node.js/Express kullanılarak yazılmıştır.
 * 
 * Gereksinimler:
 * - npm install @google/maps
 * - npm install openai (veya mevcut AI provider)
 * - GOOGLE_PLACES_API_KEY environment variable
 * - Existing AI provider configuration
 */

const express = require('express');
const { Client } = require('@google/maps');
const router = express.Router();

// Google Places client (API key environment variable'dan alınır)
const googleMapsClient = new Client({
  key: process.env.GOOGLE_PLACES_API_KEY
});

// Existing AI evaluation function (mevcut sistemden import)
// const { evaluateWithAI } = require('./aiEvaluationService');

/**
 * Helper: booking_url'den Google Place ID parse et
 */
function parseGooglePlaceIdFromUrl(bookingUrl) {
  if (!bookingUrl) return null;

  try {
    const url = new URL(bookingUrl);
    
    // Format 1: cid parametresi
    const cid = url.searchParams.get('cid');
    if (cid) return `cid:${cid}`;

    // Format 2: place_id parametresi
    const placeId = url.searchParams.get('place_id');
    if (placeId) return placeId;

    // Format 3: q parametresinde place_id
    const q = url.searchParams.get('q');
    if (q && q.includes('place_id:')) {
      const match = q.match(/place_id:([A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }

    // Format 4: URL path'de place ID
    const pathMatch = url.pathname.match(/place\/([A-Za-z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

  } catch (e) {
    console.warn('URL parse hatası:', e);
  }

  return null;
}

/**
 * Helper: 6 ay cooldown kontrolü
 */
function isCooldownExpired(lastEvaluatedDate) {
  if (!lastEvaluatedDate) return true;
  
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  return new Date(lastEvaluatedDate) < sixMonthsAgo;
}

/**
 * Helper: Günlük limit kontrolü
 */
async function checkDailyLimit(db) {
  // Admin settings'den limiti al
  const limitResult = await db.query(
    `SELECT value FROM admin_settings WHERE key = 'ai_review_daily_limit'`
  );
  const dailyLimit = parseInt(limitResult.rows[0]?.value || '100', 10);

  // Bugün yapılan değerlendirme sayısını al
  const countResult = await db.query(
    `SELECT COUNT(*) as count FROM campgrounds 
     WHERE DATE(ai_review_generated_at) = CURRENT_DATE`
  );
  const todayCount = parseInt(countResult.rows[0]?.count || '0', 10);

  return {
    limit: dailyLimit,
    used: todayCount,
    remaining: Math.max(0, dailyLimit - todayCount),
    canProceed: todayCount < dailyLimit
  };
}

/**
 * POST /google-places/details
 * Google Place detaylarını getirir
 */
router.post('/google-places/details', async (req, res) => {
  try {
    const { place_id, fields } = req.body;

    if (!place_id) {
      return res.status(400).json({ error: 'place_id gerekli' });
    }

    const response = await googleMapsClient.placeDetails({
      params: {
        place_id,
        fields: fields || [
          'place_id', 'name', 'formatted_address', 'rating',
          'user_ratings_total', 'reviews', 'photos', 'website',
          'formatted_phone_number', 'opening_hours', 'types'
        ],
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Google Places API hatası:', error);
    res.status(500).json({ error: 'Google Places API hatası' });
  }
});

/**
 * POST /google-places/search
 * Koordinat ve isimle Google Place arar
 */
router.post('/google-places/search', async (req, res) => {
  try {
    const { query, location, radius } = req.body;

    const response = await googleMapsClient.findPlaceFromText({
      params: {
        input: query,
        inputtype: 'textquery',
        fields: ['place_id', 'name', 'geometry'],
        locationbias: location ? `circle:${radius || 1000}@${location.lat},${location.lng}` : undefined,
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Google Places Search hatası:', error);
    res.status(500).json({ error: 'Arama başarısız' });
  }
});

/**
 * GET /admin/settings
 * Tüm admin ayarlarını getirir (sadece superadmin)
 */
router.get('/admin/settings', async (req, res) => {
  try {
    // Auth middleware'den gelen user
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const result = await req.db.query(
      `SELECT key, value, description, updated_at, updated_by 
       FROM admin_settings 
       ORDER BY key`
    );

    res.json({ settings: result.rows });
  } catch (error) {
    console.error('Admin settings getirme hatası:', error);
    res.status(500).json({ error: 'Ayarlar getirilemedi' });
  }
});

/**
 * PUT /admin/settings/:key
 * Bir admin ayarını günceller (sadece superadmin)
 */
router.put('/admin/settings/:key', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const { key } = req.params;
    const { value } = req.body;

    await req.db.query(
      `UPDATE admin_settings 
       SET value = $1, updated_by = $2, updated_at = NOW()
       WHERE key = $3`,
      [value, req.user.id, key]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Admin setting güncelleme hatası:', error);
    res.status(500).json({ error: 'Ayar güncellenemedi' });
  }
});

/**
 * GET /admin/ai-reviews/stats
 * AI review istatistiklerini getirir
 */
router.get('/admin/ai-reviews/stats', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const dailyLimit = await checkDailyLimit(req.db);

    const stats = await req.db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE owner_id IS NULL AND ai_review_generated_at IS NOT NULL) as total_evaluated,
        COUNT(*) FILTER (WHERE owner_id IS NULL AND ai_review_generated_at >= NOW() - INTERVAL '24 hours') as evaluated_last_24h,
        COUNT(*) FILTER (WHERE owner_id IS NULL AND ai_review_generated_at >= NOW() - INTERVAL '7 days') as evaluated_last_7d,
        COUNT(*) FILTER (WHERE owner_id IS NULL AND ai_review_generated_at IS NULL) as pending_evaluation
      FROM campgrounds
      WHERE status = 'active'
    `);

    const row = stats.rows[0];
    res.json({
      total_evaluated: parseInt(row.total_evaluated || 0),
      evaluated_last_24h: parseInt(row.evaluated_last_24h || 0),
      evaluated_last_7d: parseInt(row.evaluated_last_7d || 0),
      pending_evaluation: parseInt(row.pending_evaluation || 0),
      dailyLimit: dailyLimit.limit,
      todayCount: dailyLimit.used,
      remainingToday: dailyLimit.remaining
    });
  } catch (error) {
    console.error('AI review stats hatası:', error);
    res.status(500).json({ error: 'İstatistikler getirilemedi' });
  }
});

/**
 * GET /admin/ai-reviews/today-count
 * Bugün yapılan AI review sayısı
 */
router.get('/admin/ai-reviews/today-count', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const result = await req.db.query(
      `SELECT COUNT(*) as count FROM campgrounds 
       WHERE DATE(ai_review_generated_at) = CURRENT_DATE`
    );

    res.json({ count: parseInt(result.rows[0]?.count || '0', 10) });
  } catch (error) {
    console.error('Today count hatası:', error);
    res.status(500).json({ error: 'Sayım yapılamadı' });
  }
});

/**
 * POST /camping-areas/evaluate-reviews
 * Tek bir kamp alanı için AI review değerlendirmesi yapar
 */
router.post('/camping-areas/evaluate-reviews', async (req, res) => {
  try {
    const { campground_id, force } = req.body;

    if (!campground_id) {
      return res.status(400).json({ error: 'campground_id gerekli' });
    }

    // Kamp alanını getir
    const campResult = await req.db.query(
      `SELECT * FROM campgrounds WHERE id = $1`,
      [campground_id]
    );

    if (campResult.rows.length === 0) {
      return res.status(404).json({ error: 'Kamp alanı bulunamadı' });
    }

    const campground = campResult.rows[0];

    // owner_id kontrolü (boş olmalı)
    if (campground.owner_id && !force) {
      return res.status(400).json({ 
        error: 'Bu kamp alanı bir kullanıcıya ait, AI değerlendirmesi yapılamaz' 
      });
    }

    // Cooldown kontrolü (6 ay)
    if (!force && !isCooldownExpired(campground.ai_review_generated_at)) {
      const lastEval = new Date(campground.ai_review_generated_at);
      const nextAllowed = new Date(lastEval);
      nextAllowed.setMonth(nextAllowed.getMonth() + 6);
      const remaining = Math.floor((nextAllowed - new Date()) / 1000);
      
      return res.status(429).json({ 
        error: '6 aylık cooldown süresi dolmadı',
        cooldown_remaining: remaining
      });
    }

    // Günlük limit kontrolü
    const limitCheck = await checkDailyLimit(req.db);
    if (!limitCheck.canProceed && !force) {
      return res.status(429).json({ 
        error: 'Günlük limit doldu',
        limit: limitCheck.limit,
        used: limitCheck.used
      });
    }

    // Global enable kontrolü
    const enabledResult = await req.db.query(
      `SELECT value FROM admin_settings WHERE key = 'ai_review_enabled_global'`
    );
    const globalEnabled = enabledResult.rows[0]?.value === 'true';
    
    if (!globalEnabled && !force) {
      return res.status(403).json({ error: 'AI değerlendirme sistem genelinde kapalı' });
    }

    // Google Place ID'yi al veya parse et
    let placeId = campground.google_place_id;
    
    if (!placeId && campground.booking_url) {
      placeId = parseGooglePlaceIdFromUrl(campground.booking_url);
    }

    if (!placeId) {
      // İsim ve koordinatla ara
      try {
        const searchResponse = await googleMapsClient.findPlaceFromText({
          params: {
            input: campground.name,
            inputtype: 'textquery',
            fields: ['place_id'],
            locationbias: `circle:1000@${campground.latitude},${campground.longitude}`,
            key: process.env.GOOGLE_PLACES_API_KEY
          }
        });

        if (searchResponse.data.candidates?.length > 0) {
          placeId = searchResponse.data.candidates[0].place_id;
        }
      } catch (e) {
        console.warn('Place search hatası:', e);
      }
    }

    if (!placeId) {
      return res.status(404).json({ error: 'Google Place ID bulunamadı' });
    }

    // Google Place detaylarını al
    // NOT: Google Places API reviews field'ı maksimum 5 yorum döndürür
    const placeResponse = await googleMapsClient.placeDetails({
      params: {
        place_id: placeId,
        fields: [
          'reviews', 'rating', 'user_ratings_total', 'website',
          'formatted_phone_number', 'price_level', 'types'
        ],
        language: 'tr', // Türkçe yorumları önceliklendir
        reviews_sort: 'most_relevant', // En alakalı yorumları getir
        key: process.env.GOOGLE_PLACES_API_KEY
      }
    });

    const placeDetails = placeResponse.data.result;

    // Yorumları özetle
    // NOT: Google Places API maksimum 5 yorum döndürür
    const actualReviewCount = placeDetails.user_ratings_total || 0;
    let reviewSummary = 'Bu kamp alanı için Google Places üzerinde henüz yorum bulunmuyor.';
    
    if (placeDetails.reviews && placeDetails.reviews.length > 0) {
      const sampleSize = placeDetails.reviews.length;
      reviewSummary = `Google Places'te toplam ${actualReviewCount} yorum bulunmaktadır. Aşağıda API'den alınan ${sampleSize} örnek yorum gösterilmektedir:\n\n`;
      reviewSummary += placeDetails.reviews
        .map((r, i) => `[Yorum ${i + 1}] ${r.author_name} (${r.rating}/5):\n${r.text}\n(Yayınlanma: ${r.relative_time_description || 'Bilinmiyor'})`)
        .join('\n\n');
    }

    // AI ile değerlendir (mevcut sistem kullanılır)
    // Bu kısım mevcut AI evaluation sistemine uyarlanmalı
    const reviewCount = placeDetails.user_ratings_total || 0;
    const aiPrompt = `
  Aşağıdaki kamp alanı hakkında Google Places yorumlarını analiz ederek, potansiyel kampçılar için kısa ve yapılandırılmış bir değerlendirme oluşturun.

  Kamp Alanı: ${campground.name}
  Konum: ${campground.formatted_address || `${campground.latitude}, ${campground.longitude}`}

  ÖNEMLI: Google Places API kısıtlaması nedeniyle aşağıda yalnızca ${placeDetails.reviews?.length || 0} örnek yorum gösterilmektedir.
  Ancak toplam ${reviewCount} kullanıcı yorumu bulunmaktadır.
  Değerlendirmenizi sadece bu örnek yorumlara dayandırın, ancak toplam yorum sayısını da dikkate alın.

  Google Places Yorumları:
  ${reviewSummary}

  Lütfen çıktıyı şu formatta üretin (metin olarak):
  1) Kısa özet paragraf (1-2 cümle). Toplam yorum sayısını ve genel dağılımı belirtin.
  2) "Artılar:" başlığı altında madde işaretli kısa cümleler (maks. 5 madde).
  3) "Eksiler:" başlığı altında madde işaretli kısa cümleler (maks. 5 madde).
  4) Son satıra şu notu ekleyin: "Not: Bu değerlendirme ${placeDetails.reviews?.length || 0} örnek yoruma dayanmaktadır (toplam ${reviewCount} yorum)."

  Madde işaretleri kısa ve doğrudan olsun; kullanıcı odaklı, yardımcı bir dil kullanın.
  `;

    // Mevcut AI service'i kullan (örnek)
    // const aiEvaluation = await evaluateWithAI(aiPrompt);
    const aiEvaluation = `[AI değerlendirmesi buraya gelecek - mevcut AI service entegre edilmeli]`;

    // Veritabanını güncelle
    const updateData = {
      ai_review_evaluation: aiEvaluation,
      ai_review_generated_at: new Date().toISOString(),
      google_place_id: placeId,
      last_google_sync_at: new Date().toISOString()
    };

    // Google'dan alınan diğer bilgileri güncelle
    if (placeDetails.rating) updateData.rating = placeDetails.rating;
    if (placeDetails.user_ratings_total) updateData.review_count = placeDetails.user_ratings_total;
    if (placeDetails.website) updateData.website = placeDetails.website;
    if (placeDetails.formatted_phone_number) updateData.phone = placeDetails.formatted_phone_number;
    if (placeDetails.price_level) {
      updateData.price_range = '₺'.repeat(placeDetails.price_level);
    }

    await req.db.query(
      `UPDATE campgrounds SET
        ai_review_evaluation = $1,
        ai_review_generated_at = $2,
        google_place_id = $3,
        last_google_sync_at = $4,
        rating = COALESCE($5, rating),
        review_count = COALESCE($6, review_count),
        website = COALESCE($7, website),
        phone = COALESCE($8, phone),
        price_range = COALESCE($9, price_range),
        updated_at = NOW()
      WHERE id = $10`,
      [
        updateData.ai_review_evaluation,
        updateData.ai_review_generated_at,
        updateData.google_place_id,
        updateData.last_google_sync_at,
        updateData.rating || null,
        updateData.review_count || null,
        updateData.website || null,
        updateData.phone || null,
        updateData.price_range || null,
        campground_id
      ]
    );

    res.json({
      success: true,
      evaluation: updateData
    });

  } catch (error) {
    console.error('AI review evaluation hatası:', error);
    res.status(500).json({ error: 'Değerlendirme yapılamadı' });
  }
});

/**
 * POST /camping-areas/batch-evaluate-reviews
 * Toplu AI review değerlendirmesi
 */
router.post('/camping-areas/batch-evaluate-reviews', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const { limit, force } = req.body;

    // Günlük limit kontrolü
    const limitCheck = await checkDailyLimit(req.db);
    const processLimit = limit || limitCheck.remaining;

    if (processLimit <= 0 && !force) {
      return res.status(429).json({ error: 'Günlük limit doldu' });
    }

    // Değerlendirmeye uygun alanları bul
    const eligibleQuery = `
      SELECT id, name, booking_url 
      FROM campgrounds
      WHERE owner_id IS NULL
        AND status = 'active'
        AND (
          ai_review_generated_at IS NULL 
          OR ai_review_generated_at < NOW() - INTERVAL '6 months'
        )
        AND (ai_review_enabled IS NULL OR ai_review_enabled = true)
      ORDER BY ai_review_generated_at ASC NULLS FIRST
      LIMIT $1
    `;

    const eligibleResult = await req.db.query(eligibleQuery, [processLimit]);

    const results = [];
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const campground of eligibleResult.rows) {
      try {
        // Her alan için evaluate endpoint'ini çağır
        const evalResponse = await fetch(`${req.protocol}://${req.get('host')}/camping-areas/evaluate-reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.authorization
          },
          body: JSON.stringify({
            campground_id: campground.id,
            force
          })
        });

        if (evalResponse.ok) {
          processed++;
          results.push({ campground_id: campground.id, success: true });
        } else {
          const errorData = await evalResponse.json();
          if (evalResponse.status === 429) {
            skipped++;
          } else {
            failed++;
          }
          results.push({
            campground_id: campground.id,
            success: false,
            error: errorData.error
          });
        }
      } catch (error) {
        failed++;
        results.push({
          campground_id: campground.id,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      processed,
      failed,
      skipped,
      results
    });

  } catch (error) {
    console.error('Batch evaluation hatası:', error);
    res.status(500).json({ error: 'Toplu değerlendirme yapılamadı' });
  }
});

/**
 * GET /camping-areas/:id/ai-review
 * Bir kamp alanının AI review değerlendirmesini getirir
 */
router.get('/camping-areas/:id/ai-review', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await req.db.query(
      `SELECT 
        id as campground_id,
        ai_review_evaluation,
        ai_review_generated_at,
        google_place_id
      FROM campgrounds
      WHERE id = $1 AND ai_review_evaluation IS NOT NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'AI değerlendirmesi bulunamadı' });
    }

    res.json({ review: result.rows[0] });
  } catch (error) {
    console.error('AI review getirme hatası:', error);
    res.status(500).json({ error: 'Değerlendirme getirilemedi' });
  }
});

/**
 * GET /camping-areas/eligible-for-review
 * Değerlendirmeye uygun kamp alanlarını listeler
 */
router.get('/camping-areas/eligible-for-review', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const result = await req.db.query(`
      SELECT 
        id,
        name,
        booking_url,
        ai_review_generated_at as last_evaluated
      FROM campgrounds
      WHERE owner_id IS NULL
        AND status = 'active'
        AND (
          ai_review_generated_at IS NULL 
          OR ai_review_generated_at < NOW() - INTERVAL '6 months'
        )
        AND (ai_review_enabled IS NULL OR ai_review_enabled = true)
      ORDER BY ai_review_generated_at ASC NULLS FIRST
      LIMIT 100
    `);

    res.json({ areas: result.rows });
  } catch (error) {
    console.error('Eligible areas getirme hatası:', error);
    res.status(500).json({ error: 'Liste getirilemedi' });
  }
});

/**
 * DELETE /camping-areas/:id/ai-review
 * Bir kamp alanının AI review değerlendirmesini siler
 */
router.delete('/camping-areas/:id/ai-review', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const { id } = req.params;

    await req.db.query(
      `UPDATE campgrounds 
       SET ai_review_evaluation = NULL,
           ai_review_generated_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('AI review silme hatası:', error);
    res.status(500).json({ error: 'Değerlendirme silinemedi' });
  }
});

/**
 * PUT /camping-areas/:id/ai-review-toggle
 * Bir kamp alanı için AI review'u aktif/pasif yapar
 */
router.put('/camping-areas/:id/ai-review-toggle', async (req, res) => {
  try {
    if (req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Yetkisiz erişim' });
    }

    const { id } = req.params;
    const { enabled } = req.body;

    await req.db.query(
      `UPDATE campgrounds SET ai_review_enabled = $1, updated_at = NOW() WHERE id = $2`,
      [enabled, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('AI review toggle hatası:', error);
    res.status(500).json({ error: 'Ayar güncellenemedi' });
  }
});

module.exports = router;
