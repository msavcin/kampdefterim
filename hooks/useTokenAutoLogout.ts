import { useEffect } from 'react';
import { getToken, removeToken } from '../lib/auth';
import { useRouter } from 'expo-router';
import { jwtDecode } from 'jwt-decode';

export default function useTokenAutoLogout() {
  const router = useRouter();
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    async function checkToken() {
      const token = await getToken();
      if (!token) return;
      try {
        const decoded: any = jwtDecode(token);
        if (decoded && decoded.exp) {
          const now = Date.now() / 1000;
          const expiresIn = decoded.exp - now;
          if (expiresIn <= 0) {
            await removeToken();
            router.replace('/(auth)/login');
            return;
          }
          timeout = setTimeout(async () => {
            await removeToken();
            router.replace('/(auth)/login');
          }, expiresIn * 1000);
        }
      } catch (e) {
        // Token decode edilemiyorsa çıkış yap
        await removeToken();
        router.replace('/(auth)/login');
      }
    }
    checkToken();
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, []);
}
