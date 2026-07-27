/**
 * Admin Settings API
 * 
 * Superadmin kullanıcılar için sistem ayarlarını yönetir
 * - AI Review değerlendirme limitleri
 * - Global açma/kapama ayarları
 * - UI gösterim ayarları
 */

import { apiFetch } from './apiFetch';

export interface AdminSetting {
  key: string;
  value: string;
  description?: string;
  updated_at?: string;
  updated_by?: number;
}

export interface AIReviewSettings {
  dailyLimit: number;
  enabledGlobal: boolean;
  showInUI: boolean;
}

export interface AppRuntimeSettings {
  nonPremiumCampingAreaLimit: number;
}

export interface AppPermissionsSettings {
  nonPremiumCampingAreaLimit: number;
}

/**
 * Tüm admin ayarlarını getirir (sadece superadmin)
 */
export async function getAdminSettings(): Promise<AdminSetting[]> {
  try {
    const response = await apiFetch('/admin/settings', {
      method: 'GET'
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => null);
      console.error(`[AdminSettings] getAdminSettings HTTP ${response.status}:`, bodyText || response.statusText);
      throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    const data = await response.json();
    return data.settings || [];
  } catch (error) {
    console.error('[AdminSettings] getAdminSettings hatası:', error);
    // Backend endpoint hazır değilse default değerler döndür
    console.warn('[AdminSettings] Backend endpoint bulunamadı, default değerler kullanılıyor');
    return [
      { key: 'ai_review_daily_limit', value: '100', description: 'Günlük maksimum AI değerlendirme sayısı' },
      { key: 'ai_review_enabled_global', value: 'true', description: 'Sistem genelinde AI değerlendirmesi aktif mi' },
      { key: 'ai_review_show_in_ui', value: 'true', description: 'UI\'da AI değerlendirmesi gösterilsin mi' }
    ];
  }
}

/**
 * Belirli bir ayarı getirir
 */
export async function getAdminSetting(key: string): Promise<string | null> {
  try {
    const response = await apiFetch(`/admin/settings/${key}`, {
      method: 'GET'
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.value || null;
  } catch (error) {
    console.error(`[AdminSettings] getAdminSetting(${key}) hatası:`, error);
    return null;
  }
}

/**
 * Bir ayarı günceller (sadece superadmin)
 */
export async function updateAdminSetting(
  key: string,
  value: string
): Promise<boolean> {
  try {
    const response = await apiFetch(`/admin/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error(`[AdminSettings] updateAdminSetting(${key}) hatası:`, error);
    console.warn('[AdminSettings] Backend endpoint bulunamadı, güncelleme atlanıyor');
    return false;
  }
}


/**
 * Yeni bir ayar oluşturur (sadece superadmin)
 */
export async function createAdminSetting(
  key: string,
  value: string,
  description?: string
): Promise<boolean> {
  try {
    const response = await apiFetch('/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, description })
    });

    return response.ok || response.status === 409;
  } catch (error) {
    console.error(`[AdminSettings] createAdminSetting(${key}) hatası:`, error);
    return false;
  }
}

/**
 * Mobil uygulama runtime ayarlarını getirir.
 * Bu endpoint superadmin olmayan kullanıcılar tarafından da okunabilir güvenli değerler döndürür.
 */
export async function getAppRuntimeSettings(): Promise<AppRuntimeSettings> {
  try {
    const response = await apiFetch('/admin/app-config', { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rawLimit = data?.settings?.non_premium_camping_area_limit;
    const parsedLimit = Number.parseInt(String(rawLimit ?? '10'), 10);
    return {
      nonPremiumCampingAreaLimit:
        Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 10,
    };
  } catch (error) {
    console.warn('[AdminSettings] getAppRuntimeSettings fallback kullanıyor:', error);
    return { nonPremiumCampingAreaLimit: 10 };
  }
}

export async function getAppPermissionsSettings(): Promise<AppPermissionsSettings> {
  const runtime = await getAppRuntimeSettings();
  return {
    nonPremiumCampingAreaLimit: runtime.nonPremiumCampingAreaLimit,
  };
}

export async function updateAppPermissionsSettings(
  settings: Partial<AppPermissionsSettings>
): Promise<boolean> {
  try {
    const updates: Promise<boolean>[] = [];

    if (settings.nonPremiumCampingAreaLimit !== undefined) {
      const key = 'non_premium_camping_area_limit';
      const value = String(settings.nonPremiumCampingAreaLimit);
      updates.push(
        updateAdminSetting(key, value).then(async (ok) => {
          if (ok) return true;
          return createAdminSetting(
            key,
            value,
            'Premium olmayan kullanıcıların ekleyebileceği maksimum kamp alanı sayısı'
          );
        })
      );
    }

    const results = await Promise.all(updates);
    return results.every(Boolean);
  } catch (error) {
    console.error('[AdminSettings] updateAppPermissionsSettings hatası:', error);
    return false;
  }
}

/**
 * AI Review ayarlarını toplu olarak getirir
 */
export async function getAIReviewSettings(): Promise<AIReviewSettings> {
  try {
    const settings = await getAdminSettings();
    
    const dailyLimitSetting = settings.find(s => s.key === 'ai_review_daily_limit');
    const enabledGlobalSetting = settings.find(s => s.key === 'ai_review_enabled_global');
    const showInUISetting = settings.find(s => s.key === 'ai_review_show_in_ui');

    return {
      dailyLimit: parseInt(dailyLimitSetting?.value || '100', 10),
      enabledGlobal: enabledGlobalSetting?.value === 'true',
      showInUI: showInUISetting?.value === 'true'
    };
  } catch (error) {
    console.error('[AdminSettings] getAIReviewSettings hatası:', error);
    // Fallback değerler
    return {
      dailyLimit: 100,
      enabledGlobal: true,
      showInUI: true
    };
  }
}

/**
 * AI Review ayarlarını toplu olarak günceller
 */
export async function updateAIReviewSettings(
  settings: Partial<AIReviewSettings>
): Promise<boolean> {
  try {
    const updates: Promise<boolean>[] = [];

    if (settings.dailyLimit !== undefined) {
      updates.push(
        updateAdminSetting('ai_review_daily_limit', settings.dailyLimit.toString())
      );
    }

    if (settings.enabledGlobal !== undefined) {
      updates.push(
        updateAdminSetting('ai_review_enabled_global', settings.enabledGlobal.toString())
      );
    }

    if (settings.showInUI !== undefined) {
      updates.push(
        updateAdminSetting('ai_review_show_in_ui', settings.showInUI.toString())
      );
    }

    await Promise.all(updates);
    return true;
  } catch (error) {
    console.error('[AdminSettings] updateAIReviewSettings hatası:', error);
    console.warn('[AdminSettings] Backend endpoint bulunamadı, güncelleme atlanıyor');
    return false;
  }
}

/**
 * Bugün yapılan AI review sayısını getirir
 */
export async function getTodayAIReviewCount(): Promise<number> {
  try {
    const response = await apiFetch('/admin/ai-reviews/today-count', {
      method: 'GET'
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => null);
      console.error(`[AdminSettings] getTodayAIReviewCount HTTP ${response.status}:`, bodyText || response.statusText);
      throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    console.error('[AdminSettings] getTodayAIReviewCount hatası:', error);
    return 0;
  }
}

/**
 * AI review istatistiklerini getirir
 */
export interface AIReviewStats {
  totalEvaluated: number;
  evaluatedLast24h: number;
  evaluatedLast7d: number;
  pendingEvaluation: number; // owner_id null olanlar
  dailyLimit: number;
  todayCount: number;
  remainingToday: number;
}

export async function getAIReviewStats(): Promise<AIReviewStats> {
  try {
    const response = await apiFetch('/admin/ai-reviews/stats', {
      method: 'GET'
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => null);
      console.error(`[AdminSettings] getAIReviewStats HTTP ${response.status}:`, bodyText || response.statusText);
      throw new Error(`HTTP ${response.status}: ${bodyText || response.statusText}`);
    }

    const data = await response.json();
    
    // Backend snake_case gönderiyor, camelCase'e çevir
    return {
      totalEvaluated: data.total_evaluated ?? 0,
      evaluatedLast24h: data.evaluated_last_24h ?? 0,
      evaluatedLast7d: data.evaluated_last_7d ?? 0,
      pendingEvaluation: data.pending_evaluation ?? 0,
      dailyLimit: data.dailyLimit ?? 100,
      todayCount: data.todayCount ?? 0,
      remainingToday: data.remainingToday ?? 100
    };
  } catch (error) {
    console.error('[AdminSettings] getAIReviewStats hatası:', error);
    return {
      totalEvaluated: 0,
      evaluatedLast24h: 0,
      evaluatedLast7d: 0,
      pendingEvaluation: 0,
      dailyLimit: 100,
      todayCount: 0,
      remainingToday: 100
    };
  }
}
