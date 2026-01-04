import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isLoggedIn } from '../lib/auth';

export default function RootLayout() {
  useFrameworkReady();
  const router = useRouter();
  const segments = useSegments();
  const [checked, setChecked] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState<null | 'login' | 'tabs'>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const logged = await isLoggedIn();
        const isAuthRoute = segments[0] === '(auth)';
        const isLogoutRoute = segments[1] === 'logout';
        if (!logged && !isAuthRoute) {
          setShouldRedirect('login');
        } else if (logged && isAuthRoute && !isLogoutRoute) {
          setShouldRedirect('tabs');
        } else {
          setShouldRedirect(null);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setChecked(true);
      }
    }
    checkAuth();
  }, [segments]);

  useEffect(() => {
    if (!checked) return;
    if (shouldRedirect === 'login') {
      router.replace('/(auth)/login');
    } else if (shouldRedirect === 'tabs') {
      router.replace('/(tabs)');
    }
  }, [checked, shouldRedirect]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <StatusBar style="dark" />
      <Slot />
    </SafeAreaView>
  );
}
