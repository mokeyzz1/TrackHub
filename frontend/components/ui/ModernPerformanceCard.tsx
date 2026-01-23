import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../design-system/colors';
import { spacing } from '../../design-system/spacing';

interface PerformanceCardProps {
  athleteName: string;
  schoolName: string;
  event: string;
  time: string;
  improvement?: string;
  isNewPR?: boolean;
  isSchoolRecord?: boolean;
  onPress?: () => void;
}

export const ModernPerformanceCard: React.FC<PerformanceCardProps> = ({
  athleteName,
  schoolName,
  event,
  time,
  improvement,
  isNewPR,
  isSchoolRecord,
  onPress,
}) => {
  const getBadgeConfig = () => {
    if (isSchoolRecord) return { text: 'SR', colors: ['#8B5CF6', '#EC4899'] };
    if (isNewPR) return { text: 'PR', colors: [colors.performance.newPR, colors.performance.improvement] };
    return null;
  };

  const badge = getBadgeConfig();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={styles.card}>
        {/* Glassmorphism background */}
        <LinearGradient
          colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.7)']}
          style={styles.cardBackground}
        />
        
        {/* Badge for PR/SR */}
        {badge && (
          <LinearGradient
            colors={badge.colors}
            style={styles.badge}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.badgeText}>{badge.text}</Text>
          </LinearGradient>
        )}

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.athleteName}>
            {athleteName}
          </Text>
          <Text style={styles.schoolName}>
            {schoolName}
          </Text>
          
          <View style={styles.performanceRow}>
            <View style={styles.eventContainer}>
              <Text style={styles.event}>{event}</Text>
            </View>
            <Text style={styles.time}>
              {time}
            </Text>
          </View>

          {improvement && (
            <View style={styles.improvementRow}>
              <Ionicons name="trending-up" size={12} color={colors.performance.improvement} />
              <Text style={styles.improvement}>
                {improvement} improvement
              </Text>
            </View>
          )}
        </View>

        {/* Subtle track lane accent */}
        <View style={styles.laneAccent} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: 200,
    height: 140,
    borderRadius: spacing.radiusMd,
    marginRight: spacing.lg,
    position: 'relative',
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  cardBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: spacing.radiusMd,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  badge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radiusSm,
    zIndex: 1,
  },
  badgeText: {
    fontSize: 10,
    color: colors.text.white,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  athleteName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  schoolName: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  eventContainer: {
    backgroundColor: colors.primary.laneBlue + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.sm,
  },
  event: {
    fontSize: 12,
    color: colors.primary.laneBlue,
    fontWeight: '600',
  },
  time: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  improvementRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  improvement: {
    fontSize: 10,
    color: colors.performance.improvement,
    marginLeft: spacing.xs,
    fontWeight: '500',
  },
  laneAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primary.trackOrange,
    borderBottomLeftRadius: spacing.radiusMd,
    borderBottomRightRadius: spacing.radiusMd,
  },
});
