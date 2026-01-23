/**
 * Sports UI Examples - Bold Simpson Aesthetic
 *
 * This file demonstrates various UI patterns for displaying sports data
 * with high readability while maintaining the fun, bold Simpson vibe.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../design-system/colors';

// ============================================================
// 1. LEADERBOARD RANK DISPLAY
// ============================================================
export const LeaderboardRank = ({ rank, time, name }: { rank: number; time: string; name: string }) => {
  const isTopThree = rank <= 3;
  const getRankColor = () => {
    if (rank === 1) return colors.gradients.goldMedal;
    if (rank === 2) return ['#C0C0C0', '#E8E8E8']; // Silver
    if (rank === 3) return ['#CD7F32', '#E8B089']; // Bronze
    return ['#FFFFFF', '#F0F0F0'];
  };

  return (
    <View style={rankStyles.container}>
      <LinearGradient colors={getRankColor()} style={rankStyles.rankBadge}>
        <Text style={[rankStyles.rankNumber, isTopThree && rankStyles.rankNumberBold]}>
          {rank}
        </Text>
      </LinearGradient>
      <View style={rankStyles.info}>
        <Text style={rankStyles.name}>{name}</Text>
        <Text style={rankStyles.time}>{time}</Text>
      </View>
    </View>
  );
};

const rankStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    padding: 14,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    marginBottom: 10,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  rankBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rankNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  rankNumberBold: {
    fontSize: 22,
    color: colors.primary.trackOrange,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  time: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier', // Monospaced for alignment
  },
});

// ============================================================
// 2. LARGE TIME DISPLAY (For Featured Performances)
// ============================================================
export const FeaturedTimeDisplay = ({ time, label }: { time: string; label: string }) => {
  return (
    <View style={timeStyles.container}>
      <LinearGradient
        colors={colors.gradients.trackHero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={timeStyles.gradient}
      >
        <Text style={timeStyles.time}>{time}</Text>
        <View style={timeStyles.labelBadge}>
          <Text style={timeStyles.label}>{label}</Text>
        </View>
      </LinearGradient>
    </View>
  );
};

const timeStyles = StyleSheet.create({
  container: {
    borderRadius: 24,
    borderWidth: 5,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  gradient: {
    padding: 32,
    alignItems: 'center',
  },
  time: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.text.white,
    fontFamily: 'Courier',
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
    letterSpacing: 2,
  },
  labelBadge: {
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    marginTop: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: 1,
  },
});

// ============================================================
// 3. MEET RESULT DISPLAY (Place + Time)
// ============================================================
export const MeetResult = ({
  place,
  event,
  time,
  isPR
}: {
  place: number;
  event: string;
  time: string;
  isPR?: boolean
}) => {
  return (
    <View style={meetStyles.container}>
      <View style={meetStyles.placeSection}>
        <Text style={meetStyles.placeText}>{place}</Text>
        <Text style={meetStyles.placeSuffix}>
          {place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}
        </Text>
      </View>

      <View style={meetStyles.divider} />

      <View style={meetStyles.details}>
        <Text style={meetStyles.event}>{event}</Text>
        <View style={meetStyles.timeRow}>
          <Text style={meetStyles.time}>{time}</Text>
          {isPR && (
            <View style={meetStyles.prBadge}>
              <Ionicons name="star" size={12} color={colors.text.white} />
              <Text style={meetStyles.prText}>PR</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const meetStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 16,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  placeSection: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    lineHeight: 38,
  },
  placeSuffix: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.tertiary,
  },
  divider: {
    width: 4,
    backgroundColor: colors.borders.thick,
    marginHorizontal: 14,
    borderRadius: 2,
  },
  details: {
    flex: 1,
    justifyContent: 'center',
  },
  event: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.tertiary,
    marginBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  time: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.performance.newPR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  prText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.text.white,
  },
});

// ============================================================
// 4. STAT COMPARISON (Side by Side)
// ============================================================
export const StatComparison = ({
  label1,
  value1,
  label2,
  value2
}: {
  label1: string;
  value1: string;
  label2: string;
  value2: string
}) => {
  return (
    <View style={statStyles.container}>
      <View style={statStyles.stat}>
        <Text style={statStyles.label}>{label1}</Text>
        <Text style={statStyles.value}>{value1}</Text>
      </View>

      <View style={statStyles.vs}>
        <Text style={statStyles.vsText}>VS</Text>
      </View>

      <View style={statStyles.stat}>
        <Text style={statStyles.label}>{label2}</Text>
        <Text style={statStyles.value}>{value2}</Text>
      </View>
    </View>
  );
};

const statStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 20,
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.tertiary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  vs: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary.duffPink,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  vsText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.white,
  },
});

// ============================================================
// 5. RECORD INDICATOR BADGES
// ============================================================
export const RecordBadge = ({ type }: { type: 'PR' | 'SR' | 'NR' | 'WR' }) => {
  const getBadgeConfig = () => {
    switch (type) {
      case 'PR':
        return { text: 'PERSONAL RECORD', colors: colors.gradients.performance, icon: 'trending-up' as const };
      case 'SR':
        return { text: 'SCHOOL RECORD', colors: colors.gradients.division, icon: 'trophy' as const };
      case 'NR':
        return { text: 'NATIONAL RECORD', colors: ['#DC2626', '#F87171'], icon: 'flag' as const };
      case 'WR':
        return { text: 'WORLD RECORD', colors: colors.gradients.goldMedal, icon: 'star' as const };
    }
  };

  const config = getBadgeConfig();

  return (
    <LinearGradient
      colors={config.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={badgeStyles.container}
    >
      <Ionicons name={config.icon} size={16} color={colors.text.white} />
      <Text style={badgeStyles.text}>{config.text}</Text>
    </LinearGradient>
  );
};

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 1,
  },
});
