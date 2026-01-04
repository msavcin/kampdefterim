import { useEffect } from 'react';
import { getDatabase } from '@/lib/database';

declare global {
  interface Window {
    frameworkReady?: () => void;
  }
}

export function useFrameworkReady() {
  useEffect(() => {
    // Initialize database singleton
    getDatabase().init();
    
    if (typeof window !== 'undefined') {
      window.frameworkReady?.();
    }
  }, []);
}
