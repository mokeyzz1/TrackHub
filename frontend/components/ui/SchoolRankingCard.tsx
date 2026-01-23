import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../design-system/colors';
import { spacing } from '../../design-system/spacing';
import { TrophyIcon } from '../icons/TrophyIcon';

interface SchoolRankingCardProps {
  rank: number;
  schoolName: string;
  conference: string;
  division: 'D1' | 'D2' | 'D3' | 'NAIA' | 'NJCAA';
  points?: number;
  onPress?: () => void;
}

export const SchoolRankingCard: React.FC<SchoolRankingCardProps> = ({
  rank,
  schoolName,
  conference,
  division,
  points,
  onPress,
}) => {
  const getDivisionColor = () => {
    switch (division) {
      case 'D1': return colors.division.d1;
      case 'D2': return colors.division.d2;
      case 'D3': return colors.division.d3;
      case 'NAIA': return colors.division.naia;
      case 'NJCAA': return colors.division.njcaa;
      default: return colors.primary.trackOrange;
    }
  };

  const isTopThree = rank <= 3;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.container}>
      <View style={styles.card}>
        {/* Rank Badge */}
        <LinearGradient
          colors={rank === 1 ? colors.gradients.goldMedal : ['#FFFFFF', '#F5F5F5']}
          style={styles.rankBadge}
        >
          <Text style={[styles.rankText, rank === 1 && styles.rankTextGold]}>
            {rank}
          </Text>
        </LinearGradient>

        {/* School Info */}
        <View style={styles.content}>
          <Text style={styles.schoolName} numberOfLines={1}>
            {schoolName}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.divisionBadge, { backgroundColor: getDivisionColor() }]}>
              <Text style={styles.divisionText}>{division}</Text>
            </View>
            <Text style={styles.conference}>{conference}</Text>
          </View>
        </View>

        {/* Points (if provided) */}
        {points !== undefined && (
          <View style={styles.pointsContainer}>
            <Text style={styles.pointsValue}>{points}</Text>
            <Text style={styles.pointsLabel}>PTS</Text>
          </View>
        )}

        {/* Arrow */}
        <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
      </View>

      {/* Trophy icon for top 3 */}
      {isTopThree && (
        <View style={[styles.trophyBadge, { top: -8, right: -8 }]}>
          <TrophyIcon
            color={rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze'}
            size={32}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    position: 'relative',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  rankText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text.primary,
  },
  rankTextGold: {
    color: colors.primary.trackOrange,
  },
  content: {
    flex: 1,
    gap: 6,
  },
  schoolName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  divisionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  divisionText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 0.5,
  },
  conference: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  pointsContainer: {
    alignItems: 'center',
    marginRight: 12,
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
  },
  pointsLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.text.tertiary,
    marginTop: 2,
  },
  trophyBadge: {
    position: 'absolute',
    zIndex: 10,
  },
  trophyGradient: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
});
