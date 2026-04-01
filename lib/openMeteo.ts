// Minimal Open-Meteo helper: free, no API key, supports up to 16 days
export async function fetchOpenMeteoForecast(lat: number, lon: number, days: number = 15) {
  const forecast_days = Math.min(Math.max(1, Math.floor(days)), 16);
  const dailyVars = [
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'precipitation_probability_mean',
    'weathercode',
    'windspeed_10m_max'
  ];

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${dailyVars.join(',')}&timezone=auto&forecast_days=${forecast_days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  const data = await res.json();

  const daily = data.daily || {};
  const times: string[] = daily.time || [];
  const daysArr = times.map((date: string, i: number) => {
    const maxTemp = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[i] : null;
    const minTemp = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[i] : null;
    const pop = Array.isArray(daily.precipitation_probability_mean) ? Math.round(daily.precipitation_probability_mean[i]) : (Array.isArray(daily.precipitation_sum) ? (daily.precipitation_sum[i] > 0 ? 60 : 0) : 0);
    const wind_kph = Array.isArray(daily.windspeed_10m_max) ? daily.windspeed_10m_max[i] : 0;
    const weathercode = Array.isArray(daily.weathercode) ? daily.weathercode[i] : null;
    const avgTemp = (typeof maxTemp === 'number' && typeof minTemp === 'number') ? Math.round((maxTemp + minTemp) / 2) : (maxTemp ?? minTemp ?? null);
    return {
      date,
      text: weatherCodeToText(weathercode),
      icon: '',
      maxTemp,
      minTemp,
      avgTemp,
      pop,
      wind_kph,
      raw: data,
    };
  });

  return { provider: 'open-meteo', city: { name: data.timezone || 'Open-Meteo' }, days: daysArr, raw: data };
}

function weatherCodeToText(code: number | null) {
  if (code === null || code === undefined) return '';
  const map: Record<number, string> = {
    0: 'Açık', 1: 'Açık', 2: 'Parçalı bulutlu', 3: 'Bulutlu',
    45: 'Sis', 48: 'Donan sis',
    51: 'Hafif yağmur', 61: 'Yağmur', 63: 'Yoğun yağmur',
    71: 'Kar', 73: 'Yoğun kar',
    80: 'Sağanak yağmur', 81: 'Yoğun sağanak',
    95: 'Gök gürültülü sağanak'
  };
  return map[code] ?? '';
}

export function evaluateOpenMeteoForecast(days: any[] | undefined) {
  if (!Array.isArray(days) || days.length === 0) return '';
  let maxPop = 0;
  let totalAvgTemp = 0;
  let count = 0;
  for (const d of days) {
    const p = Number(d.pop ?? 0) || 0;
    const t = Number(d.avgTemp ?? 0) || 0;
    maxPop = Math.max(maxPop, p);
    totalAvgTemp += t;
    count += 1;
  }
  const avgTemp = Math.round(totalAvgTemp / Math.max(1, count));
  const msgs: string[] = [];
  if (maxPop >= 70) msgs.push('Yağış riski yüksek gün(ler) var.');
  else if (maxPop >= 40) msgs.push('Yağış ihtimali var.');
  if (avgTemp <= 0) msgs.push('Soğuk; don riski olabilir.');
  if (msgs.length === 0) return '';
  return `${msgs.join(' ')} (Ortalama sıcaklık ${avgTemp}°C)`;
}
