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
  appLatestVersion: string;
  appMinSupportedVersion: string;
  appUpdateRequired: boolean;
  appUpdateMessage: string;
  appUpdateAndroidUrl: string;
  appUpdateIosUrl: string;
}

export interface AppPermissionsSettings extends AppRuntimeSettings {}

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
const DEFAULT_APP_RUNTIME_SETTINGS: AppRuntimeSettings = {
  nonPremiumCampingAreaLimit: 10,
  appLatestVersion: '',
  appMinSupportedVersion: '',
  appUpdateRequired: false,
  appUpdateMessage: "Kamp Defterim'in yeni bir sürümü hazır. Daha iyi performans ve yeni özellikler için güncelleyin.",
  appUpdateAndroidUrl: 'https://play.google.com/store/apps/details?id=com.spondylus.boltexponativewind',
  appUpdateIosUrl: 'https://apps.apple.com/tr/app/kamp-defterim/id6759046939?l=tr',
};

function parseBooleanSetting(value: unknown): boolean {
  return String(value ?? '').toLowerCase() === 'true' || String(value ?? '') === '1';
}

export async function getAppRuntimeSettings(): Promise<AppRuntimeSettings> {
  try {
    const response = await apiFetch('/admin/app-config', { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const raw = data?.settings || {};
    const parsedLimit = Number.parseInt(String(raw.non_premium_camping_area_limit ?? DEFAULT_APP_RUNTIME_SETTINGS.nonPremiumCampingAreaLimit), 10);
    return {
      nonPremiumCampingAreaLimit:
        Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : DEFAULT_APP_RUNTIME_SETTINGS.nonPremiumCampingAreaLimit,
      appLatestVersion: String(raw.app_latest_version ?? DEFAULT_APP_RUNTIME_SETTINGS.appLatestVersion).trim(),
      appMinSupportedVersion: String(raw.app_min_supported_version ?? DEFAULT_APP_RUNTIME_SETTINGS.appMinSupportedVersion).trim(),
      appUpdateRequired: parseBooleanSetting(raw.app_update_required ?? DEFAULT_APP_RUNTIME_SETTINGS.appUpdateRequired),
      appUpdateMessage: String(raw.app_update_message ?? DEFAULT_APP_RUNTIME_SETTINGS.appUpdateMessage),
      appUpdateAndroidUrl: String(raw.app_update_android_url ?? DEFAULT_APP_RUNTIME_SETTINGS.appUpdateAndroidUrl),
      appUpdateIosUrl: String(raw.app_update_ios_url ?? DEFAULT_APP_RUNTIME_SETTINGS.appUpdateIosUrl),
    };
  } catch (error) {
    console.warn('[AdminSettings] getAppRuntimeSettings fallback kullanıyor:', error);
    return DEFAULT_APP_RUNTIME_SETTINGS;
  }
}

/**
 * Get raw app config map from server (includes admin-set values like checklist_visible_types)
 */
export async function getAppConfig(): Promise<Record<string, any>> {
  try {
    const response = await apiFetch('/admin/app-config', { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data?.settings || {};
  } catch (error) {
    console.warn('[AdminSettings] getAppConfig fallback empty:', error);
    return {};
  }
}

export async function getAppPermissionsSettings(): Promise<AppPermissionsSettings> {
  return getAppRuntimeSettings();
}

export async function updateAppPermissionsSettings(
  settings: Partial<AppPermissionsSettings>
): Promise<boolean> {
  try {
    const updates: Promise<boolean>[] = [];

    const queueSettingUpdate = (key: string, value: string, description: string) => {
      updates.push(
        updateAdminSetting(key, value).then(async (ok) => {
          if (ok) return true;
          return createAdminSetting(key, value, description);
        })
      );
    };

    if (settings.nonPremiumCampingAreaLimit !== undefined) {
      queueSettingUpdate(
        'non_premium_camping_area_limit',
        String(settings.nonPremiumCampingAreaLimit),
        'Premium olmayan kullanıcıların ekleyebileceği maksimum kamp alanı sayısı'
      );
    }

    if (settings.appLatestVersion !== undefined) {
      queueSettingUpdate('app_latest_version', settings.appLatestVersion, 'Mobil uygulama için yayınlanan son sürüm');
    }
    if (settings.appMinSupportedVersion !== undefined) {
      queueSettingUpdate('app_min_supported_version', settings.appMinSupportedVersion, 'Zorunlu güncelleme için minimum desteklenen sürüm');
    }
    if (settings.appUpdateRequired !== undefined) {
      queueSettingUpdate('app_update_required', String(settings.appUpdateRequired), 'Yeni sürüm güncellemesi zorunlu mu');
    }
    if (settings.appUpdateMessage !== undefined) {
      queueSettingUpdate('app_update_message', settings.appUpdateMessage, 'Yeni sürüm bildirimi mesajı');
    }
    if (settings.appUpdateAndroidUrl !== undefined) {
      queueSettingUpdate('app_update_android_url', settings.appUpdateAndroidUrl, 'Android güncelleme mağaza bağlantısı');
    }
    if (settings.appUpdateIosUrl !== undefined) {
      queueSettingUpdate('app_update_ios_url', settings.appUpdateIosUrl, 'iOS güncelleme mağaza bağlantısı');
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
