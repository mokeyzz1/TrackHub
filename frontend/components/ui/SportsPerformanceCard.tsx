import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../design-system/colors';
import { spacing } from '../../design-system/spacing';
import { MedalIcon } from '../icons/MedalIcon';

interface SportsPerformanceCardProps {
  rank?: number;
  athleteName: string;
  schoolName: string;
  event: string;
  time: string;
  date?: string;
  badge?: 'PR' | 'SR' | 'SB' | 'NQ'; // Personal Record, School Record, Season Best, National Qualifier
  improvement?: string;
  onPress?: () => void;
}

export const SportsPerformanceCard: React.FC<SportsPerformanceCardProps> = ({
  rank,
  athleteName,
  schoolName,
  event,
  time,
  date,
  badge,
  improvement,
  onPress,
}) => {
  const getBadgeConfig = () => {
    switch (badge) {
      case 'SR':
        return {
          text: 'SCHOOL RECORD',
          colors: [colors.performance.schoolRecord, '#C77DFF'],
          icon: 'trophy' as const
        };
      case 'PR':
        return {
          text: 'PERSONAL BEST',
          colors: [colors.performance.newPR, '#69F0AE'],
          icon: 'trending-up' as const
        };
      case 'SB':
        return {
          text: 'SEASON BEST',
          colors: [colors.performance.seasonBest, '#64B5F6'],
          icon: 'star' as const
        };
      case 'NQ':
        return {
          text: 'QUALIFIED',
          colors: [colors.performance.nationalQual, '#FFB74D'],
          icon: 'checkmark-circle' as const
        };
      default:
        return null;
    }
  };

  const badgeConfig = getBadgeConfig();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.container}>
      <View style={styles.card}>
        {/* Left Side: Rank Badge (if provided) */}
        {rank !== undefined && (
          <View style={styles.rankContainer}>
            {rank <= 3 ? (
              <MedalIcon place={rank as 1 | 2 | 3} size={44} />
            ) : (
              <LinearGradient
                colors={['#FFFFFF', '#F0F0F0']}
                style={styles.rankBadge}
              >
                <Text style={styles.rankText}>{rank}</Text>
              </LinearGradient>
            )}
          </View>
        )}

        {/* Main Content */}
        <View style={styles.content}>
          {/* Top: Athlete Info */}
          <View style={styles.athleteRow}>
            <View style={styles.athleteInfo}>
              <Text style={styles.athleteName} numberOfLines={1}>
                {athleteName}
              </Text>
              <Text style={styles.schoolName} numberOfLines={1}>
                {schoolName}
              </Text>
            </View>

            {/* Performance Badge */}
            {badgeConfig && (
              <LinearGradient
                colors={badgeConfig.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.performanceBadge}
              >
                <Ionicons name={badgeConfig.icon} size={10} color={colors.text.white} />
                <Text style={styles.performanceBadgeText}>{badgeConfig.text}</Text>
              </LinearGradient>
            )}
          </View>

          {/* Bottom: Event & Time */}
          <View style={styles.performanceRow}>
            <View style={styles.eventContainer}>
              <Ionicons name="flag" size={11} color={colors.primary.trackOrange} />
              <Text style={styles.eventText}>{event}</Text>
              {date && (
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar-outline" size={10} color={colors.text.secondary} />
                  <Text style={styles.dateText}>
                    {new Date(date).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.timeContainer}>
              <Text style={styles.timeText}>{time}</Text>
              {improvement && (
                <View style={styles.improvementBadge}>
                  <Ionicons name="arrow-down" size={10} color={colors.performance.improvement} />
                  <Text style={styles.improvementText}>{improvement}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    // Remove marginBottom since parent now uses gap
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: spacing.radiusMd,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: spacing.lg, // Increased padding for better alignment
    marginHorizontal: 0, // Ensure no extra margins
    // Shadow for depth
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0, // Hard shadow, no blur (cartoon style)
  },
  rankContainer: {
    marginRight: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  rankText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  rankTextGold: {
    color: colors.primary.trackOrange,
  },
  content: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center', // Center content vertically
  },
  athleteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center', // Changed to center for better alignment
    gap: spacing.md, // Increased gap for better spacing
  },
  athleteInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  athleteName: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  schoolName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  performanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  performanceBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 0.5,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.lg, // Increased gap to ensure time has proper space
    minHeight: 32, // Ensure consistent row height
  },
  eventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  eventText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.primary,
  },
  timeContainer: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  timeText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier', // Monospaced for time readability
    letterSpacing: 0.5,
  },
  improvementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  improvementText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.performance.improvement,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: spacing.xs,
  },
  dateText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
