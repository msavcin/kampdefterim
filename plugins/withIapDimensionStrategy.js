const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * react-native-iap eski sürümlerde "store", yeni Nitro/OpenIAP sürümlerinde
 * "platform" flavor dimension kullanabilir. Ana uygulama tarafında Play
 * flavor'ını açıkça seçerek Gradle ambiguity hatalarını önlüyoruz.
 */
const withIapDimensionStrategy = (config) => {
  return withAppBuildGradle(config, (mod) => {
    const buildGradle = mod.modResults.contents;
    const missingLines = [];

    if (!buildGradle.includes('missingDimensionStrategy "store"')) {
      missingLines.push('        missingDimensionStrategy "store", "play"');
    }
    if (!buildGradle.includes('missingDimensionStrategy "platform"')) {
      missingLines.push('        missingDimensionStrategy "platform", "play"');
    }

    if (missingLines.length === 0) {
      return mod;
    }

    mod.modResults.contents = buildGradle.replace(
      /defaultConfig\s*\{/,
      `defaultConfig {\n${missingLines.join('\n')}`,
    );

    return mod;
  });
};

module.exports = withIapDimensionStrategy;
