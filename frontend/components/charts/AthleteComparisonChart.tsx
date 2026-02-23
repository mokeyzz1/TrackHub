import React from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { colors } from '../../design-system/colors';

interface AthleteStats {
  name: string;
  school: string;
  personalBest: string;
  personalBestSeason?: 'I' | 'O' | null;
  average: string;
}

interface HeadToHeadData {
  athlete1Wins: number;
  athlete2Wins: number;
  ties: number;
  races: Array<{
    meet_name: string;
    date: string;
    athlete1_place: number;
    athlete2_place: number;
    athlete1_mark: string;
    athlete2_mark: string;
  }>;
}

interface AthleteComparisonChartProps {
  athlete1: AthleteStats;
  athlete2: AthleteStats;
  eventName: string;
  headToHead?: HeadToHeadData | null;
}

export const AthleteComparisonChart: React.FC<AthleteComparisonChartProps> = ({
  athlete1,
  athlete2,
  eventName,
  headToHead,
}) => {
  // Convert time strings to seconds for comparison
  const timeToSeconds = (timeStr: string): number => {
    if (!timeStr || timeStr === 'N/A') return Infinity;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeStr) || Infinity;
  };

  const pb1 = timeToSeconds(athlete1.personalBest);
  const pb2 = timeToSeconds(athlete2.personalBest);
  const hasPBs = pb1 !== Infinity && pb2 !== Infinity;
  const pbDiff = hasPBs ? Math.abs(pb1 - pb2) : 0;

  const renderComparison = (
    label: string,
    value1: string | number,
    value2: string | number,
    athlete1Better: boolean | null,
  ) => {
    const bothNA = value1 === 'N/A' && value2 === 'N/A';
    return (
      <View style={styles.comparisonRow}>
        <View
          style={[
            styles.valueBox,
            styles.valueBoxLeft,
            athlete1Better === true && styles.valueBoxBetter,
          ]}
        >
          <Text style={[styles.value, athlete1Better === true && styles.valueBetter]}>
            {value1}
          </Text>
        </View>

        <View style={styles.labelBox}>
          <Text style={styles.label}>{label}</Text>
        </View>

        <View
          style={[
            styles.valueBox,
            styles.valueBoxRight,
            athlete1Better === false && styles.valueBoxBetter,
          ]}
        >
          <Text style={[styles.value, athlete1Better === false && styles.valueBetter]}>
            {value2}
          </Text>
        </View>
      </View>
    );
  };

  // Determine overall winner based on PR
  const getWinner = () => {
    if (!hasPBs) return null;
    return pb1 < pb2 ? athlete1 : athlete2;
  };
  const winner = getWinner();

  // Format the time difference nicely
  const formatTimeDiff = (diff: number) => {
    if (diff >= 60) {
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
    }
    return `${diff.toFixed(2)}s`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{eventName}</Text>
        <Text style={styles.subtitle}>Event Comparison</Text>
      </View>

      {/* Athlete headers */}
      <View style={styles.athleteHeaders}>
        <View style={styles.athleteHeaderBox}>
          <Text style={styles.athleteName}>{athlete1.name}</Text>
          <Text style={styles.athleteSchool}>{athlete1.school}</Text>
        </View>

        <View style={styles.vsBox}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={styles.athleteHeaderBox}>
          <Text style={styles.athleteName}>{athlete2.name}</Text>
          <Text style={styles.athleteSchool}>{athlete2.school}</Text>
        </View>
      </View>

      {/* PR Comparison - Main Section */}
      <View style={styles.prSection}>
        <Text style={styles.sectionTitle}>Personal Best</Text>
        <View style={styles.prRow}>
          <View style={[styles.prBox, hasPBs && pb1 < pb2 && styles.prBoxWinner]}>
            <View style={styles.prTimeContainer}>
              <Text style={[styles.prTime, hasPBs && pb1 < pb2 && styles.prTimeWinner]}>
                {athlete1.personalBest}
              </Text>
              {athlete1.personalBestSeason && (
                <View style={[styles.seasonBadge, athlete1.personalBestSeason === 'I' ? styles.seasonBadgeIndoor : styles.seasonBadgeOutdoor]}>
                  <Text style={styles.seasonBadgeText}>{athlete1.personalBestSeason}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={[styles.prBox, hasPBs && pb2 < pb1 && styles.prBoxWinner]}>
            <View style={styles.prTimeContainer}>
              <Text style={[styles.prTime, hasPBs && pb2 < pb1 && styles.prTimeWinner]}>
                {athlete2.personalBest}
              </Text>
              {athlete2.personalBestSeason && (
                <View style={[styles.seasonBadge, athlete2.personalBestSeason === 'I' ? styles.seasonBadgeIndoor : styles.seasonBadgeOutdoor]}>
                  <Text style={styles.seasonBadgeText}>{athlete2.personalBestSeason}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        {hasPBs && (
          <View style={styles.fasterBox}>
            <Text style={styles.fasterLabel}>
              {pb1 < pb2 ? athlete1.name : athlete2.name} is faster by {formatTimeDiff(pbDiff)}
            </Text>
          </View>
        )}
      </View>

      {/* Average Time Comparison */}
      {(athlete1.average !== 'N/A' || athlete2.average !== 'N/A') && (
        <View style={styles.comparisons}>
          {renderComparison(
            'Average',
            athlete1.average,
            athlete2.average,
            timeToSeconds(athlete1.average) < timeToSeconds(athlete2.average),
          )}
        </View>
      )}

      {/* Head to Head Record */}
      {headToHead && headToHead.races.length > 0 ? (
        <>
          <View style={styles.h2hSection}>
            <Text style={styles.h2hTitle}>Head-to-Head Record</Text>
            <View style={styles.h2hRecord}>
              <View style={[styles.h2hBox, headToHead.athlete1Wins > headToHead.athlete2Wins && styles.h2hBoxWinner]}>
                <Text style={[styles.h2hCount, headToHead.athlete1Wins > headToHead.athlete2Wins && styles.h2hCountWinner]}>
                  {headToHead.athlete1Wins}
                </Text>
                <Text style={styles.h2hLabel}>Wins</Text>
              </View>
              <View style={styles.h2hDash}>
                <Text style={styles.h2hDashText}>-</Text>
              </View>
              <View style={[styles.h2hBox, headToHead.athlete2Wins > headToHead.athlete1Wins && styles.h2hBoxWinner]}>
                <Text style={[styles.h2hCount, headToHead.athlete2Wins > headToHead.athlete1Wins && styles.h2hCountWinner]}>
                  {headToHead.athlete2Wins}
                </Text>
                <Text style={styles.h2hLabel}>Wins</Text>
              </View>
            </View>
            <Text style={styles.h2hRaces}>{headToHead.races.length} race{headToHead.races.length !== 1 ? 's' : ''} together</Text>
          </View>

          {/* Recent Races */}
          <View style={styles.recentRaces}>
            <Text style={styles.recentRacesTitle}>Recent Matchups</Text>
            {headToHead.races.slice(0, 3).map((race, index) => {
              // Format date safely (avoid 12/31/69 for null/invalid dates)
              const formatDate = (dateStr: string) => {
                if (!dateStr) return 'Date N/A';
                const date = new Date(dateStr);
                if (isNaN(date.getTime()) || date.getFullYear() < 2000) return 'Date N/A';
                return date.toLocaleDateString();
              };
              return (
                <View key={index} style={styles.raceRow}>
                  <View style={styles.raceInfo}>
                    <Text style={styles.raceMeet} numberOfLines={1}>{race.meet_name}</Text>
                    <Text style={styles.raceDate}>{formatDate(race.date)}</Text>
                  </View>
                  <View style={styles.raceResults}>
                    <Text style={[styles.racePlace, race.athlete1_place < race.athlete2_place && styles.racePlaceWinner]}>
                      #{race.athlete1_place}
                    </Text>
                    <Text style={styles.raceVs}>vs</Text>
                    <Text style={[styles.racePlace, race.athlete2_place < race.athlete1_place && styles.racePlaceWinner]}>
                      #{race.athlete2_place}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <View style={styles.noH2hBox}>
          <Text style={styles.noH2hText}>No race together in this event</Text>
        </View>
      )}

      {/* No PR data message */}
      {!hasPBs && (
        <View style={styles.noPRBox}>
          <Text style={styles.noPRText}>PR data not available for this event</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 20,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  athleteHeaders: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
  },
  athleteHeaderBox: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 12,
    alignItems: 'center',
  },
  athleteName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  athleteSchool: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  vsBox: {
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  vsText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.white,
  },
  comparisons: {
    gap: 12,
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  valueBox: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 10,
    alignItems: 'center',
  },
  valueBoxLeft: {
    // Default styling
  },
  valueBoxRight: {
    // Default styling
  },
  valueBoxBetter: {
    backgroundColor: colors.performance.newPR,
    borderWidth: 3,
  },
  value: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  valueBetter: {
    color: colors.text.white,
  },
  labelBox: {
    width: 100,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.tertiary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 12,
  },
  prSection: {
    marginBottom: 20,
  },
  prRow: {
    flexDirection: 'row',
    gap: 12,
  },
  prBox: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 16,
    alignItems: 'center',
  },
  prBoxWinner: {
    backgroundColor: colors.performance.newPR,
  },
  prTime: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  prTimeWinner: {
    color: colors.text.white,
  },
  prTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seasonBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  seasonBadgeIndoor: {
    backgroundColor: '#6366F1', // Indigo for indoor
  },
  seasonBadgeOutdoor: {
    backgroundColor: '#10B981', // Green for outdoor
  },
  seasonBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.text.white,
  },
  fasterBox: {
    marginTop: 12,
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  fasterLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.white,
    textAlign: 'center',
  },
  h2hSection: {
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 16,
    alignItems: 'center',
  },
  h2hTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  h2hRecord: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  h2hBox: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 12,
    minWidth: 70,
    alignItems: 'center',
  },
  h2hBoxWinner: {
    backgroundColor: colors.performance.newPR,
    borderWidth: 3,
  },
  h2hCount: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.primary,
  },
  h2hCountWinner: {
    color: colors.text.white,
  },
  h2hLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
  },
  h2hDash: {
    paddingHorizontal: 8,
  },
  h2hDashText: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.tertiary,
  },
  h2hRaces: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginTop: 8,
  },
  noPRBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    alignItems: 'center',
  },
  noPRText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  noH2hBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    alignItems: 'center',
  },
  noH2hText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  recentRaces: {
    marginTop: 16,
  },
  recentRacesTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  raceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 12,
    marginBottom: 8,
  },
  raceInfo: {
    flex: 1,
  },
  raceMeet: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
  },
  raceDate: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  raceResults: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  racePlace: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.secondary,
    minWidth: 30,
    textAlign: 'center',
  },
  racePlaceWinner: {
    color: colors.primary.trackOrange,
  },
  raceVs: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
});
