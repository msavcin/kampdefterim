import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useTheme } from './ThemeProvider';

const DAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isBeforeDay(a: Date, b: Date): boolean {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return da.getTime() < db.getTime();
}

function isBetween(date: Date, start: Date, end: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return d > s && d < e;
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function formatDateTR(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

type DateRangePickerProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (startDate: Date, endDate: Date) => void;
  initialStartDate?: Date | null;
  initialEndDate?: Date | null;
  minDate?: Date;
  title?: string;
};

export default function DateRangePicker({
  visible,
  onClose,
  onConfirm,
  initialStartDate,
  initialEndDate,
  minDate,
  title = 'Tarih Aralığı Seçin',
}: DateRangePickerProps) {
  const { theme } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

  const today = useMemo(() => new Date(), []);
  const effectiveMinDate = minDate || today;

  const [startDate, setStartDate] = useState<Date | null>(initialStartDate ?? null);
  const [endDate, setEndDate] = useState<Date | null>(initialEndDate ?? null);
  const [baseMonth, setBaseMonth] = useState(() => {
    const ref = initialStartDate ?? today;
    return { year: ref.getFullYear(), month: ref.getMonth() };
  });

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setStartDate(initialStartDate ?? null);
      setEndDate(initialEndDate ?? null);
      const ref = initialStartDate ?? today;
      setBaseMonth({ year: ref.getFullYear(), month: ref.getMonth() });
    }
  }, [visible]);

  const goToPrevMonth = useCallback(() => {
    setBaseMonth(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { ...prev, month: prev.month - 1 };
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setBaseMonth(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { ...prev, month: prev.month + 1 };
    });
  }, []);

  const handleDayPress = useCallback((date: Date) => {
    if (!startDate || (startDate && endDate)) {
      // First selection or reset
      setStartDate(date);
      setEndDate(null);
    } else {
      // Second selection
      if (isBeforeDay(date, startDate)) {
        setStartDate(date);
        setEndDate(null);
      } else if (isSameDay(date, startDate)) {
        // Same day - ignore
      } else {
        setEndDate(date);
      }
    }
  }, [startDate, endDate]);

  const handleConfirm = useCallback(() => {
    if (startDate && endDate) {
      onConfirm(startDate, endDate);
      onClose();
    } else if (startDate) {
      // Allow single date - set end = start
      onConfirm(startDate, startDate);
      onClose();
    }
  }, [startDate, endDate, onConfirm, onClose]);

  const handleClear = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
  }, []);

  const secondMonth = useMemo(() => {
    if (baseMonth.month === 11) return { year: baseMonth.year + 1, month: 0 };
    return { year: baseMonth.year, month: baseMonth.month + 1 };
  }, [baseMonth]);

  const nightCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  const renderMonth = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    // Monday = 0, Sunday = 6
    let startWeekDay = firstDay.getDay() - 1;
    if (startWeekDay < 0) startWeekDay = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (number | null)[] = [];
    for (let i = 0; i < startWeekDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Pad end to fill row
    while (cells.length % 7 !== 0) cells.push(null);

    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }

    return (
      <View style={[dynStyles.monthContainer, { width: screenWidth < 500 ? screenWidth - 48 : (screenWidth - 72) / 2 }]}>
        <Text style={[dynStyles.monthTitle, { color: theme.colors.text }]}>
          {MONTHS_TR[month]} {year}
        </Text>
        <View style={dynStyles.weekHeader}>
          {DAYS_TR.map(d => (
            <View key={d} style={dynStyles.weekDayCell}>
              <Text style={[dynStyles.weekDayText, { color: theme.colors.muted }]}>{d}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={dynStyles.weekRow}>
            {row.map((day, ci) => {
              if (day === null) {
                return <View key={ci} style={dynStyles.dayCell} />;
              }

              const date = new Date(year, month, day);
              const isPast = isBeforeDay(date, effectiveMinDate) && !isSameDay(date, effectiveMinDate);
              const isStart = startDate ? isSameDay(date, startDate) : false;
              const isEnd = endDate ? isSameDay(date, endDate) : false;
              const inRange = startDate && endDate ? isBetween(date, startDate, endDate) : false;
              const isToday = isSameDay(date, today);

              let bgStyle: any = {};
              let textStyle: any = { color: theme.colors.text };
              let leftFill = false;
              let rightFill = false;

              if (isPast) {
                textStyle = { color: theme.colors.muted, opacity: 0.4 };
              } else if (isStart || isEnd) {
                bgStyle = { backgroundColor: theme.colors.primary, borderRadius: 20 };
                textStyle = { color: '#fff', fontWeight: '700' as const };
                if (isStart && endDate) rightFill = true;
                if (isEnd && startDate) leftFill = true;
              } else if (inRange) {
                bgStyle = { backgroundColor: theme.colors.primaryLight, borderRadius: 0 };
                textStyle = { color: theme.colors.primaryDark, fontWeight: '500' as const };
                leftFill = true;
                rightFill = true;
              } else if (isToday) {
                bgStyle = { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 20 };
              }

              return (
                <View key={ci} style={dynStyles.dayCell}>
                  {leftFill && <View style={[dynStyles.rangeFill, dynStyles.rangeFillLeft, { backgroundColor: theme.colors.primaryLight }]} />}
                  {rightFill && <View style={[dynStyles.rangeFill, dynStyles.rangeFillRight, { backgroundColor: theme.colors.primaryLight }]} />}
                  <TouchableOpacity
                    style={[dynStyles.dayButton, bgStyle]}
                    onPress={() => !isPast && handleDayPress(date)}
                    disabled={isPast}
                    activeOpacity={0.7}
                  >
                    <Text style={[dynStyles.dayText, textStyle]}>{day}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const summaryText = useMemo(() => {
    if (!startDate && !endDate) return 'Tarih seçilmedi';
    if (startDate && !endDate) return `${formatDateTR(startDate)} - ?`;
    if (startDate && endDate) return `${formatDateTR(startDate)} - ${formatDateTR(endDate)} (${nightCount} gece)`;
    return '';
  }, [startDate, endDate, nightCount]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[dynStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[dynStyles.container, { backgroundColor: theme.colors.surface, height: screenHeight * 0.85 }]}>
          {/* Header */}
          <View style={[dynStyles.header, { borderBottomColor: theme.colors.border }]}>
            <Text style={[dynStyles.title, { color: theme.colors.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={dynStyles.closeBtn}>
              <Text style={[dynStyles.closeBtnText, { color: theme.colors.muted }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={[dynStyles.summaryRow, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Text style={[dynStyles.summaryText, { color: theme.colors.text }]}>{summaryText}</Text>
          </View>

          {/* Calendar */}
          <ScrollView style={dynStyles.calendarScroll} contentContainerStyle={dynStyles.calendarContent}>
            {/* Navigation */}
            <View style={dynStyles.navRow}>
              <TouchableOpacity onPress={goToPrevMonth} style={dynStyles.navArrow}>
                <Text style={[dynStyles.navArrowText, { color: theme.colors.text }]}>‹</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={goToNextMonth} style={dynStyles.navArrow}>
                <Text style={[dynStyles.navArrowText, { color: theme.colors.text }]}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Month grids */}
            {screenWidth < 500 ? (
              // Mobile: stacked
              <View>
                {renderMonth(baseMonth.year, baseMonth.month)}
                <View style={{ height: 16 }} />
                {renderMonth(secondMonth.year, secondMonth.month)}
              </View>
            ) : (
              // Tablet/wide: side by side
              <View style={dynStyles.monthsRow}>
                {renderMonth(baseMonth.year, baseMonth.month)}
                <View style={{ width: 24 }} />
                {renderMonth(secondMonth.year, secondMonth.month)}
              </View>
            )}
          </ScrollView>

          {/* Bottom actions */}
          <View style={[dynStyles.bottomBar, { borderTopColor: theme.colors.border }]}>
            <TouchableOpacity onPress={handleClear} style={dynStyles.clearBtn}>
              <Text style={[dynStyles.clearBtnText, { color: theme.colors.muted }]}>Temizle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!startDate}
              style={[
                dynStyles.confirmBtn,
                { backgroundColor: startDate ? theme.colors.primary : theme.colors.muted },
              ]}
            >
              <Text style={dynStyles.confirmBtnText}>
                {startDate && endDate ? `Seç (${nightCount} gece)` : startDate ? 'Tek gün seç' : 'Tarih seçin'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dynStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '600',
  },
  summaryRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarScroll: {
    flex: 1,
  },
  calendarContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowText: {
    fontSize: 28,
    fontWeight: '300',
  },
  monthsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  monthContainer: {
    marginBottom: 4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  weekHeader: {
    flexDirection: 'row',
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 8,
  },
  weekDayText: {
    fontSize: 13,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    maxHeight: 44,
  },
  dayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
  },
  rangeFill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    zIndex: 1,
  },
  rangeFillLeft: {
    left: 0,
    right: '50%',
  },
  rangeFillRight: {
    left: '50%',
    right: 0,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  confirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
