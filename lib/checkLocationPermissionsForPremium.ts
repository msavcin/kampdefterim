import * as Location from 'expo-location';

export async function checkLocationPermissionsForPremium(user) {
  // Premium kullanıcıda hem foreground hem background izin granted olmalı
  if (!user?.offline_enabled) return true;
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.status === 'granted';
}
