const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * react-native-iap, "store" adında iki product flavor tanımlar: amazon ve play.
 * Ana uygulama bu dimension'ı tanımlamadığı için Gradle "ambiguity" hatası verir.
 * missingDimensionStrategy ile hangi flavor'ın kullanılacağını belirtiyoruz.
 */
const withIapDimensionStrategy = (config) => {
  return withAppBuildGradle(config, (mod) => {
    const buildGradle = mod.modResults.contents;

    // Zaten eklenmiş mi kontrol et
    if (buildGradle.includes('missingDimensionStrategy')) {
      return mod;
    }

    // defaultConfig bloğunun içine missingDimensionStrategy ekle
    mod.modResults.contents = buildGradle.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n        missingDimensionStrategy "store", "play"`
    );

    return mod;
  });
};

module.exports = withIapDimensionStrategy;
