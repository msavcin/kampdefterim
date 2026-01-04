

import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { removeToken } from '../../lib/auth';
import { useRouter } from 'expo-router';
import { getMe } from '../../lib/userCommunityApi';
import { syncPendingChanges } from '../../lib/syncPendingChanges';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react-native';

function LogoutProgress() {
  const router = useRouter();
  const [steps, setSteps] = useState([
    { key: 'getMe', label: 'Kullanıcı bilgisi alınıyor', status: 'pending' },
    { key: 'sync', label: 'Bekleyen veriler gönderiliyor', status: 'pending' },
    { key: 'logout', label: 'Çıkış yapılıyor', status: 'pending' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    (async () => {
      // 1. Kullanıcı bilgisi al
      setSteps(s => s.map(step => step.key === 'getMe' ? { ...step, status: 'loading' } : step));
      let me = null;
      let userId = null;
      try {
        me = await getMe();
        userId = me && (me.id || me.user_id);
        setSteps(s => s.map(step => step.key === 'getMe' ? { ...step, status: 'success' } : step));
      } catch (err: any) {
        setSteps(s => s.map(step => step.key === 'getMe' ? { ...step, status: 'error' } : step));
        setError('Kullanıcı bilgisi alınamadı.');
        return;
      }
      // 2. Bekleyen verileri gönder
      setSteps(s => s.map(step => step.key === 'sync' ? { ...step, status: 'loading' } : step));
      let syncError = false;
      try {
        if (userId) {
          await syncPendingChanges(userId);
        } else {
          await syncPendingChanges();
        }
        setSteps(s => s.map(step => step.key === 'sync' ? { ...step, status: 'success' } : step));
      } catch (err: any) {
        setSteps(s => s.map(step => step.key === 'sync' ? { ...step, status: 'error' } : step));
        setError('Bekleyen veriler gönderilemedi.');
        syncError = true;
      }
      // 3. Token sil ve çıkış yap (sync hata verse bile devam et)
      setSteps(s => s.map(step => step.key === 'logout' ? { ...step, status: 'loading' } : step));
      try {
        await removeToken();
        setSteps(s => s.map(step => step.key === 'logout' ? { ...step, status: 'success' } : step));
        if (isMounted.current) {
          router.replace('/(auth)/login');
        }
      } catch (err: any) {
        setSteps(s => s.map(step => step.key === 'logout' ? { ...step, status: 'error' } : step));
        setError('Çıkış işlemi tamamlanamadı.');
      }
    })();
    return () => { isMounted.current = false; };
  }, []);
  const getIcon = (status: string) => {
    if (status === 'success') return <CheckCircle size={22} color="#22c55e" style={{ marginRight: 8 }} />;
    if (status === 'error') return <XCircle size={22} color="#ef4444" style={{ marginRight: 8 }} />;
    if (status === 'loading') return <Loader2 size={22} color="#6366f1" style={{ marginRight: 8 }} />;
    return <Loader2 size={22} color="#a1a1aa" style={{ marginRight: 8, opacity: 0.5 }} />;
  };
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
      <View style={{ width: 320, maxWidth: '90%', backgroundColor: '#fff', borderRadius: 14, padding: 24, shadowColor: '#6366f1', shadowOpacity: 0.10, shadowRadius: 12, elevation: 3 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#3730a3', marginBottom: 18, textAlign: 'center' }}>Çıkış Yapılıyor</Text>
        {steps.map(step => (
          <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            {getIcon(step.status)}
            <Text style={{ fontSize: 15, color: step.status === 'error' ? '#ef4444' : '#222', fontWeight: step.status === 'success' ? 'bold' : 'normal' }}>{step.label}</Text>
          </View>
        ))}
        {error && <Text style={{ color: '#ef4444', fontSize: 14, marginTop: 8, textAlign: 'center' }}>{error}</Text>}
      </View>
    </View>
  );
}

export default function LogoutScreen() {
  return <LogoutProgress />;
}
