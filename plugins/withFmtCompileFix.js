const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Xcode 26 / Apple Clang 17+ ile gelen fmt kütüphanesi uyumsuzluğunu düzeltir.
 * react-native-ble-plx gibi native modüller fmt kütüphanesini kullanır.
 * Yeni Clang, `consteval` fonksiyonlarını daha katı denetler ve
 * FMT_COMPILE_STRING bağlamında derleme hatasına yol açar.
 * Çözüm: tüm pod hedefleri için FMT_ENFORCE_COMPILE_STRING=0 flag'ini ekler.
 */
const withFmtCompileFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8');

      // Zaten eklenmiş mi kontrol et
      if (podfile.includes('FMT_ENFORCE_COMPILE_STRING')) {
        return config;
      }

      const fixSnippet = `
# Fix: fmt consteval uyumsuzluğu - Xcode 26 / Apple Clang 17+
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      cppflags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
      unless cppflags.include?('FMT_ENFORCE_COMPILE_STRING')
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = cppflags + ' -DFMT_ENFORCE_COMPILE_STRING=0'
      end
    end
  end
end
`;

      podfile += fixSnippet;
      fs.writeFileSync(podfilePath, podfile);

      return config;
    },
  ]);
};

module.exports = withFmtCompileFix;
