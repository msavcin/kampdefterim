const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Google Play Photo/Video Permissions Policy uyumluluğu için
 * READ_MEDIA_IMAGES ve READ_MEDIA_VIDEO izinlerini AndroidManifest'ten kaldırır.
 * Bu izinler expo-image-picker tarafından otomatik ekleniyor; ancak
 * preferSystemPhotoPicker (Android Photo Picker) kullanıldığında hiçbiri gerekmez.
 *
 * Sadece filter() ile silmek yetmez: bağımlılık AAR'larının kendi manifest'lerinden
 * gelen izinler manifest merger tarafından tekrar eklenir. Bu nedenle
 * tools:node="remove" ile merge işlemini de engelliyoruz.
 */
const withRemoveMediaPermissions = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const PERMISSIONS_TO_REMOVE = [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.ACCESS_MEDIA_LOCATION',
    ];

    // tools: namespace'ini manifest köküne ekle (yoksa)
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Ana manifest'ten eşleşen izinleri kaldır
    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter((perm) => {
        const name = perm.$?.['android:name'];
        return !PERMISSIONS_TO_REMOVE.includes(name);
      });
    }

    // tools:node="remove" girdileri ekle — AAR merge'den gelenleri de engeller
    if (!manifest['uses-permission-sdk-23']) {
      manifest['uses-permission-sdk-23'] = [];
    }

    for (const permission of PERMISSIONS_TO_REMOVE) {
      const alreadyBlocked = (manifest['uses-permission'] || []).some(
        (p) => p.$?.['android:name'] === permission && p.$?.['tools:node'] === 'remove'
      );
      if (!alreadyBlocked) {
        if (!manifest['uses-permission']) {
          manifest['uses-permission'] = [];
        }
        manifest['uses-permission'].push({
          $: {
            'android:name': permission,
            'tools:node': 'remove',
          },
        });
      }
    }

    return config;
  });
};

module.exports = withRemoveMediaPermissions;
