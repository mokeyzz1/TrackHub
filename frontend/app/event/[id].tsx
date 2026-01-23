import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../design-system/colors';
import meetData from '../../meet_59182_complete.json';

type EventTab = 'results' | 'start' | 'entries';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<EventTab>('results');

  const event = meetData.events.find((e) => e.eventId === Number(id) || e.eventId === id);

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Event not found</Text>
      </SafeAreaView>
    );
  }

  // Use heats.it as results since that's where the actual results data is
  const hasResults = event.heats?.it && event.heats.it.length > 0;
  const hasStartLists = event.heats?.it && event.heats.it.length > 0;
  const hasEntries = event.entries?.es && event.entries.es.length > 0;
  const hasSplits = event.splits?.spr && event.splits.spr.length > 0;

  // Group heats
  const heatsByNumber: { [key: number]: any[] } = {};
  if (hasStartLists && event.heats?.it) {
    event.heats.it.forEach((entry: any) => {
      if (!heatsByNumber[entry.hn]) heatsByNumber[entry.hn] = [];
      heatsByNumber[entry.hn].push(entry);
    });
  }

  const renderResults = () => {
    if (!hasResults) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>No results yet</Text>
        </View>
      );
    }

    // Sort by place index (pi) which is the actual finishing order
    const sortedResults = [...(event.heats?.it || [])].sort((a, b) => {
      const placeA = parseInt(a.pi || '999');
      const placeB = parseInt(b.pi || '999');
      return placeA - placeB;
    });

    return (
      <View style={styles.resultsContainer}>
        {sortedResults.map((result: any, index: number) => {
          const place = parseInt(result.p || '0');
          const isTopThree = place >= 1 && place <= 3;
          const isFirst = place === 1;
          const isSecond = place === 2;
          const isThird = place === 3;

          return (
            <View
              key={index}
              style={[
                styles.resultCard,
                isTopThree && styles.resultCardPodium
              ]}
            >
              {/* Place badge with medal colors */}
              <View style={[
                styles.placeBadge,
                isFirst && styles.placeBadgeGold,
                isSecond && styles.placeBadgeSilver,
                isThird && styles.placeBadgeBronze,
              ]}>
                {isFirst && <Ionicons name="trophy" size={20} color={colors.text.white} />}
                {isSecond && <Ionicons name="medal" size={20} color={colors.text.white} />}
                {isThird && <Ionicons name="medal-outline" size={20} color={colors.text.white} />}
                {!isTopThree && <Text style={styles.placeNumber}>{result.p || '-'}</Text>}
              </View>

              {/* Athlete info */}
              <View style={styles.athleteInfoContainer}>
                <Text style={[
                  styles.athleteNameLarge,
                  isTopThree && styles.athleteNamePodium
                ]} numberOfLines={1}>
                  {result.a?.n || 'Unknown'}
                </Text>
                <Text style={styles.schoolName} numberOfLines={1}>
                  {result.a?.t?.f || 'Unknown'}
                </Text>

                {/* Heat info */}
                {result.hn && (
                  <View style={styles.heatInfoBadge}>
                    <Ionicons name="flame-outline" size={12} color={colors.primary.trackOrange} />
                    <Text style={styles.heatBadgeText}>Heat {result.hn}</Text>
                  </View>
                )}
              </View>

              {/* Time with emphasis */}
              <View style={styles.timeContainer}>
                <Text style={[
                  styles.timeText,
                  isTopThree && styles.timeTextPodium
                ]}>
                  {result.pr || result.prc || result.s || 'N/A'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  const renderStartLists = () => {
    if (!hasStartLists) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>No start lists</Text>
        </View>
      );
    }

    const heatNumbers = Object.keys(heatsByNumber).sort((a, b) => Number(a) - Number(b));

    return (
      <ScrollView style={styles.scrollContent}>
        {heatNumbers.map((heatNum) => {
          const heatEntries = heatsByNumber[Number(heatNum)].sort(
            (a, b) => (a.hli || 0) - (b.hli || 0)
          );

          return (
            <View key={heatNum} style={styles.heatCard}>
              <View style={styles.heatHeader}>
                <Text style={styles.heatTitle}>Heat {heatNum}</Text>
              </View>

              {/* Table Header */}
              <View style={styles.startListHeaderRow}>
                <Text style={[styles.tableHeaderText, styles.laneColumn]}>Ln</Text>
                <Text style={[styles.tableHeaderText, styles.athleteColumn]}>Athlete</Text>
                <Text style={[styles.tableHeaderText, styles.teamColumn]}>Team</Text>
              </View>

              {/* Table Rows */}
              {heatEntries.map((entry: any, idx: number) => (
                <View
                  key={idx}
                  style={[
                    styles.startListRow,
                    idx % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd
                  ]}
                >
                  <Text style={[styles.tableCell, styles.laneColumn, styles.laneCellText]}>
                    {entry.hli || '?'}
                  </Text>
                  <Text style={[styles.tableCell, styles.athleteColumn]} numberOfLines={1}>
                    {entry.a.n}
                  </Text>
                  <Text style={[styles.tableCell, styles.teamColumn, styles.teamCellText]} numberOfLines={1}>
                    {entry.a.t.f}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderEntries = () => {
    // Sample placeholder data - always shown since real data not available
    const placeholderEntries = [
      { an: 'John Smith', tn: 'NC State', sm: '10.45' },
      { an: 'Mike Johnson', tn: 'Duke', sm: '10.52' },
      { an: 'Chris Williams', tn: 'UNC', sm: '10.48' },
      { an: 'David Brown', tn: 'Wake Forest', sm: '10.55' },
      { an: 'James Davis', tn: 'Clemson', sm: '10.50' },
      { an: 'Robert Wilson', tn: 'Virginia Tech', sm: '10.58' },
      { an: 'Michael Taylor', tn: 'Miami', sm: '10.62' },
      { an: 'Daniel Anderson', tn: 'Georgia Tech', sm: '10.65' },
      { an: 'Matthew Thomas', tn: 'Syracuse', sm: '10.68' },
      { an: 'Christopher Martin', tn: 'Louisville', sm: '10.72' },
    ];

    // Check if we have valid real entries data
    const hasValidEntries = Array.isArray(event.entries?.es) && event.entries.es.length > 0;
    const entriesToShow = hasValidEntries ? event.entries.es : placeholderEntries;

    return (
      <View style={styles.entriesCard}>
        {/* Table Header */}
        <View style={styles.entriesHeaderRow}>
          <Text style={[styles.tableHeaderText, styles.entriesAthleteColumn]}>Athlete</Text>
          <Text style={[styles.tableHeaderText, styles.entriesTeamColumn]}>Team</Text>
          <Text style={[styles.tableHeaderText, styles.entriesSeedColumn]}>Seed</Text>
        </View>

        {/* Table Rows */}
        {entriesToShow.map((entry: any, index: number) => (
          <View
            key={index}
            style={[
              styles.entriesRow,
              index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd
            ]}
          >
            <Text style={[styles.tableCell, styles.entriesAthleteColumn]} numberOfLines={1}>
              {entry.an}
            </Text>
            <Text style={[styles.tableCell, styles.entriesTeamColumn, styles.teamCellText]} numberOfLines={1}>
              {entry.tn}
            </Text>
            <Text style={[styles.tableCell, styles.entriesSeedColumn, styles.seedCellText]}>
              {entry.sm || '-'}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSplits = () => {
    if (!hasSplits) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="speedometer-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>No splits</Text>
        </View>
      );
    }

    return (
      <View style={styles.listContainer}>
        {event.splits?.spr?.map((splitResult: any, index: number) => (
          <View key={index} style={styles.splitCard}>
            <View style={styles.splitHeader}>
              <View style={styles.placeBox}>
                <Text style={styles.placeText}>{splitResult.r.p}</Text>
              </View>
              <View style={styles.athleteInfo}>
                <Text style={styles.athleteName} numberOfLines={1}>{splitResult.r.an}</Text>
                <Text style={styles.finalTimeText}>{splitResult.r.m}</Text>
              </View>
            </View>
            <View style={styles.splitsRow}>
              {splitResult.s.map((split: any, idx: number) => (
                <View key={idx} style={styles.splitItem}>
                  <Text style={styles.splitLabel}>{split.n}m</Text>
                  <Text style={styles.splitTime}>{split.t}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const cleanEventName = event.name
    .replace(' - Finals', '')
    .replace(' - Pentathlon Results', '')
    .replace(' Results', '')
    .replace(/Women|Men/g, '')
    .replace(/\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}:\d{2}\s*[AP]M(\s+[A-Z]{2,3})?/gi, '')
    .trim();

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: colors.backgrounds.skyBlue,
          },
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Event Header */}
        <View style={styles.eventHeaderContainer}>
          <Text style={styles.eventGender}>{event.results?.g === 'Male' ? 'Men' : 'Women'}</Text>
          <Text style={styles.eventTitle}>{cleanEventName}</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {[
            { key: 'results', label: 'Results', icon: 'trophy', available: hasResults },
            { key: 'start', label: 'Start', icon: 'list', available: hasStartLists },
            { key: 'entries', label: 'Entries', icon: 'people', available: hasEntries },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && styles.activeTab,
                !tab.available && styles.disabledTab,
              ]}
              onPress={() => tab.available && setActiveTab(tab.key as EventTab)}
              disabled={!tab.available}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={
                  !tab.available
                    ? colors.text.tertiary
                    : activeTab === tab.key
                    ? colors.text.white
                    : colors.text.primary
                }
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.activeTabText,
                  !tab.available && styles.disabledTabText,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'results' && renderResults()}
          {activeTab === 'start' && renderStartLists()}
          {activeTab === 'entries' && renderEntries()}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  eventHeaderContainer: {
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 4,
    borderBottomColor: colors.borders.thick,
  },
  eventGender: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.primary,
    lineHeight: 32,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.white,
    borderBottomWidth: 4,
    borderBottomColor: colors.borders.thick,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 25,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  activeTab: {
    backgroundColor: colors.primary.trackOrange,
  },
  disabledTab: {
    opacity: 0.4,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  activeTabText: {
    color: colors.text.white,
  },
  disabledTabText: {
    color: colors.text.tertiary,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  listContainer: {
    padding: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 12,
  },

  // Results - Enhanced Card Layout
  resultsContainer: {
    padding: 16,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 16,
    marginBottom: 12,
    gap: 14,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  resultCardPodium: {
    borderWidth: 4,
    shadowOffset: { width: 4, height: 4 },
  },
  placeBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  placeBadgeGold: {
    backgroundColor: '#FFD700',
    borderColor: '#B8860B',
  },
  placeBadgeSilver: {
    backgroundColor: '#C0C0C0',
    borderColor: '#808080',
  },
  placeBadgeBronze: {
    backgroundColor: '#CD7F32',
    borderColor: '#8B4513',
  },
  placeNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  athleteInfoContainer: {
    flex: 1,
    gap: 4,
  },
  athleteNameLarge: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
    lineHeight: 22,
  },
  athleteNamePodium: {
    fontSize: 18,
  },
  schoolName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  heatInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    marginTop: 2,
  },
  heatBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary.trackOrange,
    letterSpacing: 0.5,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary.laneBlue,
    fontFamily: 'Courier',
    letterSpacing: -0.5,
  },
  timeTextPodium: {
    fontSize: 24,
    color: colors.primary.trackOrange,
  },

  // Start Lists
  heatCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  heatHeader: {
    backgroundColor: colors.primary.trackOrange,
    padding: 18,
    borderBottomWidth: 4,
    borderBottomColor: colors.borders.thick,
  },
  heatTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.white,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  startListHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.cream,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.thick,
  },
  startListRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: colors.backgrounds.white,
  },
  tableRowOdd: {
    backgroundColor: '#FAFAFA',
  },
  tableCell: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  laneColumn: {
    width: 70,
  },
  athleteColumn: {
    flex: 1.5,
  },
  teamColumn: {
    flex: 1,
  },
  laneCellText: {
    fontWeight: '900',
    fontSize: 20,
    color: colors.primary.trackOrange,
  },
  teamCellText: {
    color: colors.text.tertiary,
    fontSize: 15,
  },

  // Entries
  entriesCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    margin: 12,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  entriesHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.cream,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.thick,
  },
  entriesRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  entriesAthleteColumn: {
    flex: 1.5,
  },
  entriesTeamColumn: {
    flex: 1.2,
  },
  entriesSeedColumn: {
    width: 80,
    textAlign: 'right',
  },
  seedCellText: {
    fontWeight: '900',
    color: colors.primary.laneBlue,
    fontSize: 16,
  },

  // Results
  resultsCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    margin: 12,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.cream,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.thick,
  },
  resultsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  placeColumn: {
    width: 50,
  },
  markColumn: {
    width: 90,
    textAlign: 'right',
  },
  heatColumn: {
    width: 50,
    textAlign: 'center',
  },
  placeCellText: {
    fontWeight: '900',
    fontSize: 20,
    color: colors.primary.trackOrange,
  },
  markCellText: {
    fontWeight: '900',
    color: colors.primary.laneBlue,
    fontSize: 18,
    textAlign: 'right',
  },
  heatCellText: {
    fontWeight: '700',
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: 'center',
  },

  // Splits
  splitCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 12,
    marginBottom: 12,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
  },
  finalTimeText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary.trackOrange,
  },
  splitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  splitItem: {
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  splitLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.tertiary,
    marginBottom: 2,
  },
  splitTime: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
});
