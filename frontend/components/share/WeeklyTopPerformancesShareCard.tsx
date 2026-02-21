import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../design-system/colors';
import { normalizeEventName } from '../../utils/eventNames';

interface Performance {
  full_name: string;
  school_name: string | null;
  event_name: string;
  mark_raw: string;
  gender: string;
  waPoints?: number;
}

interface WeeklyTopPerformancesShareCardProps {
  performances: Performance[];
  weekLabel: string;
  divisionLabel: string;
  dateRange: string;
}

export const WeeklyTopPerformancesShareCard = forwardRef<View, WeeklyTopPerformancesShareCardProps>(
  ({ performances, weekLabel, divisionLabel, dateRange }, ref) => {
    // Take top 10 performances
    const topPerformances = performances.slice(0, 10);

    return (
      <View ref={ref} style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={colors.gradients.trackHero as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.brandRow}>
            <Ionicons name="trophy" size={24} color={colors.text.white} />
            <Text style={styles.brandText}>TRACKHUB</Text>
          </View>
          <Text style={styles.headerTitle}>TOP PERFORMANCES</Text>
          <Text style={styles.headerSubtitle}>{weekLabel} • {divisionLabel}</Text>
          <Text style={styles.dateRange}>{dateRange}</Text>
        </LinearGradient>

        {/* Performances List */}
        <View style={styles.listSection}>
          {topPerformances.map((perf, index) => (
            <View key={index} style={styles.performanceRow}>
              <View style={[
                styles.rankBadge,
                index === 0 && styles.rankGold,
                index === 1 && styles.rankSilver,
                index === 2 && styles.rankBronze,
              ]}>
                <Text style={[
                  styles.rankText,
                  index < 3 && styles.rankTextTop
                ]}>{index + 1}</Text>
              </View>
              <View style={styles.performanceInfo}>
                <Text style={styles.athleteName} numberOfLines={1}>{perf.full_name}</Text>
                <Text style={styles.schoolEvent} numberOfLines={1}>
                  {perf.school_name || 'Unknown'} • {perf.gender === 'F' ? 'W' : 'M'} {normalizeEventName(perf.event_name)}
                </Text>
              </View>
              <View style={styles.markContainer}>
                <Text style={styles.mark}>{perf.mark_raw}</Text>
                {perf.waPoints && (
                  <Text style={styles.points}>{perf.waPoints} pts</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Download TrackHub</Text>
          <Text style={styles.footerUrl}>trackhub.app</Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: 350,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  dateRange: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  listSection: {
    padding: 12,
    gap: 6,
  },
  performanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 10,
    gap: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankGold: {
    backgroundColor: '#FFD700',
  },
  rankSilver: {
    backgroundColor: '#C0C0C0',
  },
  rankBronze: {
    backgroundColor: '#CD7F32',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.primary,
  },
  rankTextTop: {
    color: colors.text.white,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  performanceInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  schoolEvent: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 1,
  },
  markContainer: {
    alignItems: 'flex-end',
  },
  mark: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
  },
  points: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  footer: {
    backgroundColor: colors.borders.thick,
    paddingVertical: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.white,
  },
  footerUrl: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary.finishYellow,
    marginTop: 2,
  },
});
