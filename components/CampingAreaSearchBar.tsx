import React, { useState, useEffect, useRef } from 'react';
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Search } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { CampingArea } from '../lib/database';
import { getCampingTypeLabel } from '../lib/categories';
import { filterCampingAreasByUser } from '../lib/accessControl';

interface Props {
  campingAreas: CampingArea[];
  onSelect: (area: CampingArea) => void;
  onShowOnMap?: (area: CampingArea) => void;
  user?: any;
  isGuest?: boolean;
  isConnected?: boolean;
}

// Merkezi kamp türü yönetiminden label çek
function getTypeLabel(type: string): string {
  return getCampingTypeLabel(type);
}

export default function CampingAreaSearchBar({ campingAreas, onSelect, onShowOnMap, user, isGuest, isConnected = true }: Props) {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<CampingArea[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const filteredAreas = filterCampingAreasByUser(campingAreas, user, isGuest);
    
    // Arama metnine göre filtrele
    if (searchText.length >= 3) {
      const lower = searchText.toLowerCase();
      const searchResults = filteredAreas.filter(
        a => (a.name?.toLowerCase().includes(lower) || (a.type?.toLowerCase?.() || '').includes(lower))
      );
      if (isMountedRef.current) {
        setResults(searchResults);
      }
    } else {
      if (isMountedRef.current) {
        setResults([]);
      }
    }
  }, [searchText, campingAreas, user, isGuest]);

  return (
    <View style={styles.container}>
      {/* Guest User Premium Banner - Hide when offline */}
      {isGuest && isConnected && (
        <View style={styles.guestBanner}>
          <Text style={styles.guestBannerText}>
            Tüm kamp alanlarında arama yapabilmek için Premium aboneliğe sahip olmanız gerekmektedir.
          </Text>
          <TouchableOpacity
            style={styles.premiumButton}
            onPress={() => router.push('/premium' as any)}
          >
            <Text style={styles.premiumButtonText}>Premium Ol!</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchRow}>
        <Search size={22} color="#059669" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.input}
          placeholder="Kamp alanı ara..."
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>
      
      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => onSelect(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.type}>{getTypeLabel(item.tags?.type || item.type)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={styles.mapButton}
                  onPress={() => onShowOnMap && onShowOnMap(item)}
                >
                  <Text style={styles.mapText}>Haritada Göster</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailButton} onPress={() => onSelect(item)}>
                  <Text style={styles.detailText}>Detaylı Bilgi</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  guestBanner: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  guestBannerText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  premiumButton: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 8,
  },
  premiumButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#f8fafc',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  type: {
    fontSize: 13,
    color: '#059669',
    marginTop: 2,
  },
  mapButton: {
    backgroundColor: '#e0e7ef',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 0,
    marginRight: 6,
  },
  mapText: {
    color: '#2563eb',
    fontWeight: 'bold',
    fontSize: 13,
  },
  detailButton: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  detailText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
