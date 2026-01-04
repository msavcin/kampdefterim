// TürkiyeAPI'den il ve ilçe verisi çekip, TypeScript map'leri üreten script
// Çalıştırmak için: node scripts/generate-province-maps.js > provinceMap.generated.ts

const https = require('https');

const API_URL = 'https://api.turkiyeapi.dev/v1/provinces';

function normalize(str) {
  return str
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/Ç/g, 'c')
    .replace(/Ğ/g, 'g')
    .replace(/İ/g, 'i')
    .replace(/Ö/g, 'o')
    .replace(/Ş/g, 's')
    .replace(/Ü/g, 'u')
    .replace(/\s+/g, '');
}

https.get(API_URL, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const provinces = json.data;
    const provinceNameToValilikId = {};
    const districtToProvinceMap = {};
    provinces.forEach(prov => {
      const pname = normalize(prov.name);
      provinceNameToValilikId[pname] = parseInt(prov.id);
      (prov.districts || []).forEach(dist => {
        const dname = normalize(dist.name);
        districtToProvinceMap[dname] = pname;
      });
    });
    // TypeScript çıktısı
    console.log('// Otomatik oluşturuldu: https://api.turkiyeapi.dev/v1/provinces\n');
    console.log('export const provinceNameToValilikId: Record<string, number> = ' + JSON.stringify(provinceNameToValilikId, null, 2) + ';\n');
    console.log('export const districtToProvinceMap: Record<string, string> = ' + JSON.stringify(districtToProvinceMap, null, 2) + ';\n');
  });
});
