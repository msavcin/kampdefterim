/**
 * UserCard — Ortak kullanıcı künyesi bileşeni
 * 
 * Profil sayfasında arkadaş listesi, topluluk üyeleri ve
 * arkadaşlık isteklerinde kullanılan standart kart yapısı.
 * 
 * Kullanım:
 *   <UserCard
 *     name="Ali Yılmaz"
 *     username="aliyilmaz"
 *     email="ali@mail.com"
 *     avatarUrl="https://..."
 *     actions={[
 *       { icon: 'CheckCircle', color: 'success', onPress: () => {} },
 *       { icon: 'Trash2', color: 'danger', onPress: () => {} },
 *     ]}
 *   />
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';
import FriendAvatar from './FriendAvatar';
import ThemedIcon from './ThemedIcon';
import { spacing, borderRadius } from '../constants/theme/spacing';
import { fontSizes, fontWeights } from '../constants/theme/typography';

type ActionButton = {
  icon: string;
  color: 'primary' | 'danger' | 'success' | 'warning' | 'info' | 'muted';
  onPress: () => void;
  label?: string;
  disabled?: boolean;
};

type UserCardProps = {
  name?: string;
  username?: string;
  email?: string;
  tag?: string;
  avatarUrl?: string;
  avatarSize?: number;
  /** Sağ taraftaki aksiyon butonları (ikonlu) */
  actions?: ActionButton[];
  /** Alt kısma eklenen aksiyon butonları (tam genişlik) */
  bottomActions?: ActionButton[];
  /** Durum badge'i */
  statusBadge?: React.ReactNode;
  style?: any;
};

const colorMap = {
  primary: { bg: (c: any) => c.primaryLight, border: (c: any) => c.primary, icon: (c: any) => c.primary },
  danger: { bg: () => '#fee2e2', border: (c: any) => c.danger, icon: (c: any) => c.danger },
  success: { bg: () => '#dcfce7', border: () => '#22c55e', icon: () => '#22c55e' },
  warning: { bg: () => '#fef3c7', border: (c: any) => c.warning, icon: (c: any) => c.warning },
  info: { bg: () => '#dbeafe', border: (c: any) => c.info, icon: (c: any) => c.info },
  muted: { bg: (c: any) => c.surfaceVariant, border: (c: any) => c.border, icon: (c: any) => c.muted },
};

export default function UserCard({
  name,
  username,
  email,
  tag,
  avatarUrl,
  avatarSize = 48,
  actions,
  bottomActions,
  statusBadge,
  style,
}: UserCardProps) {
  const { colors } = useTheme();

  const displayName = name || username || 'Kullanıcı';

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceVariant, borderRadius: borderRadius.lg }, style]}>
      <View style={styles.topRow}>
        <View style={{ marginRight: spacing.md }}>
          <FriendAvatar
            avatar_url={avatarUrl}
            name={displayName}
            size={avatarSize}
          />
        </View>

        <View style={styles.infoContainer}>
          <Text style={[styles.name, { color: colors.primary }]} numberOfLines={1}>
            {displayName}
          </Text>
          {username && (
            <Text style={[styles.secondary, { color: colors.muted }]} numberOfLines={1}>
              @{username}
            </Text>
          )}
          {email && (
            <Text style={[styles.secondary, { color: colors.muted }]} numberOfLines={1}>
              {email}
            </Text>
          )}
          {tag && (
            <Text style={[styles.secondary, { color: colors.warning }]} numberOfLines={1}>
              {tag}
            </Text>
          )}
        </View>

        {/* Sağ taraf: aksiyon butonları veya status badge */}
        {statusBadge ? (
          <View style={styles.statusContainer}>{statusBadge}</View>
        ) : actions && actions.length > 0 ? (
          <View style={styles.actionsColumn}>
            {actions.map((action, idx) => {
              const cm = colorMap[action.color] || colorMap.muted;
              return (
                <TouchableOpacity
                  key={idx}
                  onPress={action.onPress}
                  disabled={action.disabled}
                  style={[
                    styles.iconButton,
                    {
                      backgroundColor: cm.bg(colors),
                      borderColor: cm.border(colors),
                      opacity: action.disabled ? 0.5 : 1,
                    },
                  ]}
                >
                  <ThemedIcon name={action.icon} size={12} color={cm.icon(colors)} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* Alt aksiyon butonları (kabul et / reddet gibi) */}
      {bottomActions && bottomActions.length > 0 && (
        <View style={styles.bottomActionsRow}>
          {bottomActions.map((action, idx) => {
            const cm = colorMap[action.color] || colorMap.muted;
            return (
              <TouchableOpacity
                key={idx}
                onPress={action.onPress}
                disabled={action.disabled}
                style={[
                  styles.bottomButton,
                  { backgroundColor: cm.border(colors), opacity: action.disabled ? 0.5 : 1 },
                ]}
              >
                {action.label && (
                  <Text style={styles.bottomButtonText}>{action.label}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.lg,
  },
  secondary: {
    fontSize: fontSizes.md,
  },
  statusContainer: {
    marginLeft: spacing.sm,
  },
  actionsColumn: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    borderRadius: borderRadius.xl,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  bottomActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm + 2,
    gap: spacing.sm + 2,
  },
  bottomButton: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  bottomButtonText: {
    color: '#fff',
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.md + 1,
  },
});
