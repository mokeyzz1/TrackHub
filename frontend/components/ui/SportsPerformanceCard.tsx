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
  waPoints?: number; // World Athletics scoring points
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
  waPoints,
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
              <MedalIcon place={rank as 1 | 2 | 3} size={28} />
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
                <Ionicons name={badgeConfig.icon} size={8} color={colors.text.white} />
                <Text style={styles.performanceBadgeText}>{badgeConfig.text}</Text>
              </LinearGradient>
            )}
          </View>

          {/* Bottom: Event & Time */}
          <View style={styles.performanceRow}>
            <View style={styles.eventContainer}>
              <Ionicons name="flag" size={9} color={colors.primary.trackOrange} />
              <Text style={styles.eventText}>{event}</Text>
              {date && (
                <View style={styles.dateContainer}>
                  <Ionicons name="calendar-outline" size={8} color={colors.text.secondary} />
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
              <View style={styles.timeRow}>
                <Text style={styles.timeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{time}</Text>
                {improvement && (
                  <View style={styles.improvementBadge}>
                    <Ionicons name="arrow-down" size={8} color={colors.performance.improvement} />
                    <Text style={styles.improvementText}>{improvement}</Text>
                  </View>
                )}
              </View>
              {waPoints !== undefined && waPoints > 0 && (
                <View style={styles.waPointsBadge}>
                  <Ionicons name="analytics" size={8} color={colors.primary.trackOrange} />
                  <Text style={styles.waPointsText}>{waPoints} pts</Text>
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
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: spacing.sm,
    paddingVertical: 8,
    marginHorizontal: 0,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  rankContainer: {
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
  },
  rankTextGold: {
    color: colors.primary.trackOrange,
  },
  content: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  athleteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  athleteInfo: {
    flex: 1,
    gap: 1,
  },
  athleteName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  schoolName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  performanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borders.thick,
  },
  performanceBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 0.3,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  eventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borders.thick,
  },
  eventText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.primary,
  },
  timeContainer: {
    alignItems: 'flex-end',
    gap: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
    maxWidth: 90,
  },
  improvementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  improvementText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.performance.improvement,
  },
  waPointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.primary.trackOrange,
  },
  waPointsText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary.trackOrange,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 4,
  },
  dateText: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
