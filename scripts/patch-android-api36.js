#!/usr/bin/env node
/*
 * Patch an already-generated Expo/React Native android project to target API 36.
 *
 * app.json + expo-build-properties are applied during `expo prebuild`/EAS builds.
 * If you build directly with `cd android && ./gradlew bundleRelease`, the existing
 * native Gradle files may keep their old SDK values. This script updates those
 * generated native files in-place.
 */
const fs = require('fs');
const path = require('path');

const startDir = process.cwd();
const projectRoot = path.basename(startDir) === 'android' ? path.dirname(startDir) : startDir;
const androidDir = path.join(projectRoot, 'android');

const updates = {
  'android.buildToolsVersion': '36.0.0',
  'android.compileSdkVersion': '36',
  'android.targetSdkVersion': '36',
  'android.kotlinVersion': '2.2.0',
  'android.kspVersion': '2.2.0-2.0.2',
};

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bulunamadı: ${filePath}`);
  }
}

function upsertGradleProperty(content, key, value) {
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, `${key}=${value}`);
  return `${content.trimEnd()}\n${key}=${value}\n`;
}

function patchGradleProperties() {
  const filePath = path.join(androidDir, 'gradle.properties');
  ensureFile(filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    content = upsertGradleProperty(content, key, value);
  }
  fs.writeFileSync(filePath, content);
  console.log(`[api36] Güncellendi: ${path.relative(projectRoot, filePath)}`);
}

function patchRootBuildGradleFallbacks() {
  const filePath = path.join(androidDir, 'build.gradle');
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  const replacements = [
    [/(buildToolsVersion\s*=\s*findProperty\(['"]android\.buildToolsVersion['"]\)\s*\?:\s*)['"][^'"]+['"]/, `$1'${updates['android.buildToolsVersion']}'`],
    [/(compileSdkVersion\s*=\s*Integer\.parseInt\(findProperty\(['"]android\.compileSdkVersion['"]\)\s*\?:\s*)['"][^'"]+['"](\)?)?/, `$1'${updates['android.compileSdkVersion']}'$2`],
    [/(targetSdkVersion\s*=\s*Integer\.parseInt\(findProperty\(['"]android\.targetSdkVersion['"]\)\s*\?:\s*)['"][^'"]+['"](\)?)?/, `$1'${updates['android.targetSdkVersion']}'$2`],
    [/(kotlinVersion\s*=\s*findProperty\(['"]android\.kotlinVersion['"]\)\s*\?:\s*)['"][^'"]+['"]/, `$1'${updates['android.kotlinVersion']}'`],
    [/(kspVersion\s*=\s*findProperty\(['"]android\.kspVersion['"]\)\s*\?:\s*)['"][^'"]+['"]/, `$1'${updates['android.kspVersion']}'`],
  ];

  let changed = false;
  for (const [re, replacement] of replacements) {
    const next = content.replace(re, replacement);
    if (next !== content) changed = true;
    content = next;
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log(`[api36] Fallback değerleri güncellendi: ${path.relative(projectRoot, filePath)}`);
  }
}

function main() {
  if (!fs.existsSync(androidDir)) {
    console.error(`[api36] Android klasörü bulunamadı: ${androidDir}`);
    console.error('[api36] Önce native proje üretin: npx expo prebuild --platform android');
    process.exit(1);
  }
  patchGradleProperties();
  patchRootBuildGradleFallbacks();
  console.log('[api36] Tamam. Şimdi `cd android && ./gradlew clean bundleRelease` çalıştırın.');
}

main();
