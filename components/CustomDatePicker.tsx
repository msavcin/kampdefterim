import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';

const aylar = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

export function formatDateTR(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const ITEM_HEIGHT = 40; // sabit öğe yüksekliği, otomatik kaydırma için kullanılır

export function formatDateBackend(date, format = 'iso') {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (format === 'iso') {
    return d.toISOString().slice(0, 16).replace('T', ' '); // 'YYYY-MM-DD HH:mm'
  }
  if (format === 'date') {
    return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }
  return d.toISOString();
}

export default function CustomDatePicker({
  value,
  onChange,
  minYear = new Date().getFullYear(),
  maxYear = 2100,
  visible,
  onClose,
  title = 'Tarih Seç',
}) {
  const now = new Date();
  const initial = value ? new Date(value) : now;
  const [day, setDay] = useState(initial.getDate());
  const [month, setMonth] = useState(initial.getMonth());
  const [year, setYear] = useState(initial.getFullYear());

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Scroll refleri: modal açıldığında seçili gün/ay/yıl her zaman görünür olacak şekilde kaydırma yapılır
  const dayRef = useRef<ScrollView | null>(null);
  const monthRef = useRef<ScrollView | null>(null);
  const yearRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!visible) return;
    // indexleri hesapla
    const dayIndex = day - 1;
    const monthIndex = month;
    const yearIndex = year - minYear;
    const clamp = (v: number) => Math.max(0, v);
    const offsetFor = (index: number) => clamp((index - 2) * ITEM_HEIGHT);
    // Küçük bir timeout ile layout'un hazır olmasını bekle
    setTimeout(() => {
      dayRef.current?.scrollTo({ y: offsetFor(dayIndex), animated: false });
      monthRef.current?.scrollTo({ y: offsetFor(monthIndex), animated: false });
      yearRef.current?.scrollTo({ y: offsetFor(yearIndex), animated: false });
    }, 0);
  }, [visible]);

  const handleSelect = () => {
    const selected = new Date(year, month, day);
    onChange && onChange(selected);
    onClose && onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.row}>
            <ScrollView ref={dayRef} style={styles.col}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <TouchableOpacity key={d} onPress={() => setDay(d)} style={[styles.item, day === d && styles.selected]}>
                  <Text style={day === d ? styles.selectedText : styles.text}>{pad(d)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView ref={monthRef} style={styles.col}>
              {aylar.map((a, i) => (
                <TouchableOpacity key={a} onPress={() => setMonth(i)} style={[styles.item, month === i && styles.selected]}>
                  <Text style={month === i ? styles.selectedText : styles.text}>{a}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView ref={yearRef} style={styles.col}>
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i).map(y => (
                <TouchableOpacity key={y} onPress={() => setYear(y)} style={[styles.item, year === y && styles.selected]}>
                  <Text style={year === y ? styles.selectedText : styles.text}>{y}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.button} onPress={handleSelect}>
            <Text style={styles.buttonText}>Seç</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Kapat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(31,41,55,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    minWidth: 320,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  col: {
    maxHeight: 120,
    width: 70,
    marginHorizontal: 4,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  selected: {
    backgroundColor: '#2563eb',
  },
  text: {
    color: '#1f2937',
    fontSize: 16,
  },
  selectedText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
    width: 120,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: '#e5e7eb',
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    width: 120,
  },
  cancelButtonText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
