import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../design-system';

interface SectionProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
    icon?: keyof typeof Ionicons.glyphMap;
  };
  children: React.ReactNode;
  gap?: keyof typeof spacing;
  style?: ViewStyle;
}

/**
 * Section component with title, optional subtitle, and action button
 * Use for grouping related content on a screen
 */
export const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  action,
  children,
  gap = 'md',
  style,
}) => {
  return (
    <View style={[styles.section, { gap: spacing[gap] }, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {action && (
          <TouchableOpacity onPress={action.onPress} style={styles.action}>
            <Text style={styles.actionText}>{action.label}</Text>
            {action.icon && (
              <Ionicons name={action.icon} size={16} color={colors.primary.trackOrange} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary.trackOrange,
  },
});
