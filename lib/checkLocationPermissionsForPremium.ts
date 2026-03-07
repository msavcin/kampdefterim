import * as Location from 'expo-location';

export async function checkLocationPermissionsForPremium(user) {
  // Offline mod için foreground izni yeterli
  // Background izni artık istenmez
  if (!user?.isPremium && !user?.offline_enabled) return true;
  const fg = await Location.getForegroundPermissionsAsync();
  return fg.status === 'granted';
}
