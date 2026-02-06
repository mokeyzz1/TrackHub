import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../design-system/colors';
import { getEventResults, getRelayResults, getMeetByName, isRelayEvent } from '../services/database-supabase';

// ============================================
// TYPES
// ============================================

interface EventResult {
  result_id: number;
  athlete_id: number;
  athlete_name: string;
  gender?: string;
  class_year?: string;
  school_name: string;
  mark_raw: string;
  mark_seconds?: number;
  place: number;
  round: string;
  wind?: number;
  isMissing?: boolean;
}

interface RelayResult {
  relay_result_id: number;
  team_id: number;
  gender?: string;
  school_name: string;
  mark_raw: string;
  mark_seconds?: number;
  place: number;
  round: string;
  athletes: {
    athlete_id: number;
    name: string;
    class_year?: string;
    leg_order: number;
  }[];
}

interface RoundGroup {
  roundName: string;
  results: EventResult[];
  wind?: number;
}

interface RelayRoundGroup {
  roundName: string;
  results: RelayResult[];
}

// ============================================
// HELPERS
// ============================================

// Determine round priority for sorting (Finals first, then heats in numeric order, prelims at end)
function getRoundPriority(round: string): number {
  const r = round.toLowerCase();
  if (r.includes('final')) return 0;
  if (r.includes('semi')) return 1;

  // Individual heats - extract number and sort numerically (Heat 1 = 10, Heat 2 = 11, etc.)
  const heatMatch = r.match(/heat\s*(\d+)/i);
  if (heatMatch) {
    return 10 + parseInt(heatMatch[1], 10);
  }

  // Combined prelims at end
  if (r.includes('prelim')) return 200;

  return 50;
}

// Check if a round is an individual heat (not combined)
function isIndividualHeat(round: string): boolean {
  const r = round.toLowerCase();
  return (r.includes('heat') || r.includes('prelim')) && /\d/.test(r);
}

// Normalize round names (F -> Final, P -> Prelims, etc.)
function normalizeRoundName(round: string): string {
  if (!round) return 'Results';
  const r = round.trim();

  // Exact matches for abbreviations
  if (r === 'F') return 'Final';
  if (r === 'P') return 'Prelims';
  if (r === 'S' || r === 'SF') return 'Semifinal';

  // Already full names
  if (r.toLowerCase() === 'final' || r.toLowerCase() === 'finals') return 'Final';
  if (r.toLowerCase() === 'prelim' || r.toLowerCase() === 'prelims') return 'Prelims';
  if (r.toLowerCase() === 'semifinal' || r.toLowerCase() === 'semifinals') return 'Semifinal';

  return r;
}

// Check if a round is an individual heat (Heat 1, Heat 2, etc.)
function isIndividualHeatRound(roundName: string): boolean {
  const r = roundName.toLowerCase();
  return (r.includes('heat') && /\d/.test(r));
}

// Check if a round is combined preliminaries
function isCombinedPrelims(roundName: string): boolean {
  const r = roundName.toLowerCase();
  return r === 'prelims' || r === 'preliminaries' || r === 'prelim';
}

// Check if a round should have sequential places filled (Finals, Semis)
function shouldFillMissingPlaces(roundName: string): boolean {
  const r = roundName.toLowerCase();
  // Don't fill for individual heats or combined prelims (we recalculate those)
  if (isIndividualHeatRound(roundName)) return false;
  if (isCombinedPrelims(roundName)) return false;
  // Fill for finals and semifinals
  if (r.includes('final')) return true;
  if (r.includes('semi')) return true;
  if (r === 'results') return true;
  return false;
}

// Recalculate places based on times (for heats and prelims)
function recalculatePlaces(results: EventResult[]): EventResult[] {
  if (results.length === 0) return results;

  // Sort by mark_seconds (time) - lower is better for running events
  // If mark_seconds is not available, try to parse mark_raw
  const sorted = [...results].sort((a, b) => {
    const aTime = a.mark_seconds ?? parseTimeToSeconds(a.mark_raw);
    const bTime = b.mark_seconds ?? parseTimeToSeconds(b.mark_raw);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });

  // Assign new places
  return sorted.map((result, index) => ({
    ...result,
    place: index + 1,
  }));
}

// Parse time string to seconds (handles formats like "6.75", "1:23.45", "NT", "DNS", etc.)
function parseTimeToSeconds(mark: string): number | null {
  if (!mark) return null;
  const cleaned = mark.trim().replace(/\s*\([^)]*\)/g, ''); // Remove wind readings like "(2.1)"

  // Skip non-time marks
  if (['NT', 'DNS', 'DNF', 'DQ', 'FS', 'NH', 'NM', '-', 'FOUL', 'SCR'].includes(cleaned.toUpperCase())) {
    return null;
  }

  // Handle mm:ss.xx format
  const minSecMatch = cleaned.match(/^(\d+):(\d+\.?\d*)$/);
  if (minSecMatch) {
    return parseInt(minSecMatch[1]) * 60 + parseFloat(minSecMatch[2]);
  }

  // Handle ss.xx format
  const secMatch = cleaned.match(/^(\d+\.?\d*)$/);
  if (secMatch) {
    return parseFloat(secMatch[1]);
  }

  return null;
}

// Fill in missing places with placeholder entries (only for actual Finals with ~8 athletes)
function fillMissingPlaces(results: EventResult[], roundName: string): EventResult[] {
  if (results.length === 0) return results;

  // Sort by place first
  const sorted = [...results].sort((a, b) => (a.place || 999) - (b.place || 999));

  // Only fill gaps for finals/semis, not individual heats
  if (!shouldFillMissingPlaces(roundName)) {
    return sorted;
  }

  // Don't fill gaps if more than 10 results - this is likely combined results, not actual finals
  // (gaps would be from filtering by gender, not actually missing athletes)
  if (sorted.length > 10) {
    return sorted;
  }

  // Find the range of places (start from 1, go to max place)
  const maxPlace = Math.max(...sorted.map(r => r.place || 0));
  if (maxPlace === 0) return sorted;

  // Don't fill if max place is way higher than result count (combined results scenario)
  if (maxPlace > sorted.length * 2) {
    return sorted;
  }

  const filledResults: EventResult[] = [];
  const existingPlaces = new Set(sorted.map(r => r.place));

  for (let place = 1; place <= maxPlace; place++) {
    if (existingPlaces.has(place)) {
      // Add the actual result
      const result = sorted.find(r => r.place === place);
      if (result) filledResults.push(result);
    } else {
      // Add a placeholder for missing place
      filledResults.push({
        result_id: -place, // Negative ID to indicate placeholder
        athlete_id: 0,
        athlete_name: 'MISSING',
        school_name: '-',
        mark_raw: '-',
        place: place,
        round: sorted[0]?.round || 'Results',
        isMissing: true,
      } as EventResult & { isMissing: boolean });
    }
  }

  return filledResults;
}

// Group results by round
function groupByRound(results: EventResult[]): RoundGroup[] {
  const groups = new Map<string, EventResult[]>();

  results.forEach(result => {
    const round = normalizeRoundName(result.round || 'Results');
    if (!groups.has(round)) {
      groups.set(round, []);
    }
    groups.get(round)!.push(result);
  });

  // Convert to array and process each round appropriately
  return Array.from(groups.entries())
    .map(([roundName, roundResults]) => {
      let processedResults: EventResult[];

      if (isIndividualHeatRound(roundName) || isCombinedPrelims(roundName)) {
        // Recalculate places based on times for heats and prelims
        processedResults = recalculatePlaces(roundResults);
      } else {
        // Fill missing places for finals/semis
        processedResults = fillMissingPlaces(roundResults, roundName);
      }

      return {
        roundName,
        results: processedResults,
        wind: roundResults[0]?.wind,
      };
    })
    .sort((a, b) => getRoundPriority(a.roundName) - getRoundPriority(b.roundName));
}

// Group relay results by round
function groupRelayByRound(results: RelayResult[]): RelayRoundGroup[] {
  const groups = new Map<string, RelayResult[]>();

  results.forEach(result => {
    const round = normalizeRoundName(result.round || 'Results');
    if (!groups.has(round)) {
      groups.set(round, []);
    }
    groups.get(round)!.push(result);
  });

  // Convert to array and sort by round priority
  return Array.from(groups.entries())
    .map(([roundName, results]) => ({
      roundName,
      results: results.sort((a, b) => (a.place || 999) - (b.place || 999)),
    }))
    .sort((a, b) => getRoundPriority(a.roundName) - getRoundPriority(b.roundName));
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function EventResultsScreen() {
  const { meetName, eventName, date, gender, meetId } = useLocalSearchParams<{
    meetName: string;
    eventName: string;
    date: string;
    gender?: string;
    meetId?: string;
  }>();

  const [results, setResults] = useState<EventResult[]>([]);
  const [relayResults, setRelayResults] = useState<RelayResult[]>([]);
  const [isRelay, setIsRelay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResults();
  }, [meetName, eventName, date, gender, meetId]);

  async function fetchResults() {
    if (!meetName || !eventName || !date) {
      setError('Missing event information');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check if this is a relay event
      const relay = isRelayEvent(eventName);
      setIsRelay(relay);

      const meetIdNum = meetId ? parseInt(meetId, 10) : undefined;

      if (relay) {
        // Fetch relay results
        const data = await getRelayResults(meetName, eventName, date, gender || undefined, meetIdNum);
        setRelayResults(data as RelayResult[]);
        setResults([]);
      } else {
        // Fetch individual results
        const data = await getEventResults(meetName, eventName, date, gender || undefined, meetIdNum);
        setResults(data as EventResult[]);
        setRelayResults([]);
      }
    } catch (err) {
      console.error('Error fetching event results:', err);
      setError('Failed to load results');
    } finally {
      setLoading(false);
    }
  }

  // Group results by round
  const roundGroups = useMemo(() => groupByRound(results), [results]);
  const relayRoundGroups = useMemo(() => groupRelayByRound(relayResults), [relayResults]);

  function formatDate(dateString: string) {
    const [year, month, day] = dateString.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // ============================================
  // RENDER HELPERS
  // ============================================

  function renderResultRow(result: EventResult, index: number, isLast: boolean) {
    const isTopThree = result.place >= 1 && result.place <= 3;
    const isMissing = result.isMissing === true;

    // Missing row - not clickable, different styling
    if (isMissing) {
      return (
        <View
          key={`missing-${result.place}`}
          style={[styles.resultRow, styles.resultRowMissing, isLast && styles.resultRowLast]}
        >
          {/* Place */}
          <View style={styles.placeCell}>
            <Text style={[styles.placeText, styles.placeTextMissing]}>
              {result.place}
            </Text>
          </View>

          {/* Name - MISSING */}
          <View style={styles.nameCell}>
            <Text style={styles.missingText}>MISSING</Text>
          </View>

          {/* Year */}
          <View style={styles.yearCell}>
            <Text style={styles.missingText}>-</Text>
          </View>

          {/* Team */}
          <View style={styles.teamCell}>
            <Text style={styles.missingText}>-</Text>
          </View>

          {/* Time/Mark */}
          <View style={styles.timeCell}>
            <Text style={styles.missingText}>-</Text>
          </View>
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={result.result_id}
        style={[styles.resultRow, isLast && styles.resultRowLast]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/athlete/${result.athlete_id}`);
        }}
        activeOpacity={0.7}
      >
        {/* Place */}
        <View style={[styles.placeCell, isTopThree && styles.placeCellTop]}>
          <Text style={[styles.placeText, isTopThree && styles.placeTextTop]}>
            {result.place || '-'}
          </Text>
        </View>

        {/* Name */}
        <View style={styles.nameCell}>
          <Text style={styles.nameText} numberOfLines={1}>
            {result.athlete_name}
          </Text>
        </View>

        {/* Year */}
        <View style={styles.yearCell}>
          <Text style={styles.yearText}>{result.class_year || '-'}</Text>
        </View>

        {/* Team */}
        <View style={styles.teamCell}>
          <Text style={styles.teamText} numberOfLines={1}>
            {result.school_name}
          </Text>
        </View>

        {/* Time/Mark */}
        <View style={styles.timeCell}>
          <Text style={styles.timeText}>{result.mark_raw || '-'}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  function renderRoundSection(group: RoundGroup, index: number) {
    const isHeat = isIndividualHeat(group.roundName);

    return (
      <View key={group.roundName} style={styles.roundSection}>
        {/* Round Header */}
        <View style={[styles.roundHeader, isHeat && styles.roundHeaderHeat]}>
          <Text style={[styles.roundTitle, isHeat && styles.roundTitleHeat]}>
            {group.roundName}
          </Text>
          {group.wind !== undefined && group.wind !== null && (
            <Text style={[styles.windText, isHeat && styles.windTextHeat]}>
              W: {group.wind}
            </Text>
          )}
        </View>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <View style={styles.placeCell}>
            <Text style={styles.headerText}>PL</Text>
          </View>
          <View style={styles.nameCell}>
            <Text style={styles.headerText}>NAME</Text>
          </View>
          <View style={styles.yearCell}>
            <Text style={styles.headerText}>YR</Text>
          </View>
          <View style={styles.teamCell}>
            <Text style={styles.headerText}>TEAM</Text>
          </View>
          <View style={styles.timeCell}>
            <Text style={styles.headerText}>TIME</Text>
          </View>
        </View>

        {/* Results */}
        <View style={styles.tableBody}>
          {group.results.map((result, idx) =>
            renderResultRow(result, idx, idx === group.results.length - 1)
          )}
        </View>
      </View>
    );
  }

  function renderRelayResultRow(result: RelayResult, index: number, isLast: boolean) {
    const isTopThree = result.place >= 1 && result.place <= 3;

    return (
      <View
        key={result.relay_result_id}
        style={[styles.relayResultRow, isLast && styles.resultRowLast]}
      >
        {/* Main Row - Place, School, Time */}
        <View style={styles.relayMainRow}>
          <View style={[styles.placeCell, isTopThree && styles.placeCellTop]}>
            <Text style={[styles.placeText, isTopThree && styles.placeTextTop]}>
              {result.place || '-'}
            </Text>
          </View>

          <View style={styles.relayTeamCell}>
            <Text style={styles.relayTeamText} numberOfLines={1}>
              {result.school_name}
            </Text>
          </View>

          <View style={styles.timeCell}>
            <Text style={styles.timeText}>{result.mark_raw || '-'}</Text>
          </View>
        </View>

        {/* Athletes List */}
        {result.athletes && result.athletes.length > 0 && (
          <View style={styles.relayAthletesContainer}>
            {result.athletes
              .sort((a, b) => a.leg_order - b.leg_order)
              .map((athlete, idx) => (
                <TouchableOpacity
                  key={`${result.relay_result_id}-${athlete.athlete_id}-${idx}`}
                  style={styles.relayAthleteRow}
                  onPress={() => {
                    if (athlete.athlete_id) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/athlete/${athlete.athlete_id}`);
                    }
                  }}
                  activeOpacity={athlete.athlete_id ? 0.7 : 1}
                  disabled={!athlete.athlete_id}
                >
                  <View style={styles.legBadge}>
                    <Text style={styles.legBadgeText}>{athlete.leg_order}</Text>
                  </View>
                  <Text style={styles.relayAthleteName} numberOfLines={1}>
                    {athlete.name || 'Unknown'}
                  </Text>
                  {athlete.class_year && (
                    <Text style={styles.relayAthleteYear}>{athlete.class_year}</Text>
                  )}
                </TouchableOpacity>
              ))}
          </View>
        )}
      </View>
    );
  }

  function renderRelayRoundSection(group: RelayRoundGroup, index: number) {
    const isHeat = isIndividualHeat(group.roundName);

    return (
      <View key={group.roundName} style={styles.roundSection}>
        {/* Round Header */}
        <View style={[styles.roundHeader, isHeat && styles.roundHeaderHeat]}>
          <Text style={[styles.roundTitle, isHeat && styles.roundTitleHeat]}>
            {group.roundName}
          </Text>
        </View>

        {/* Table Header - Simpler for relays */}
        <View style={styles.tableHeader}>
          <View style={styles.placeCell}>
            <Text style={styles.headerText}>PL</Text>
          </View>
          <View style={styles.relayTeamCell}>
            <Text style={styles.headerText}>TEAM</Text>
          </View>
          <View style={styles.timeCell}>
            <Text style={styles.headerText}>TIME</Text>
          </View>
        </View>

        {/* Results */}
        <View style={styles.tableBody}>
          {group.results.map((result, idx) =>
            renderRelayResultRow(result, idx, idx === group.results.length - 1)
          )}
        </View>
      </View>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary.trackOrange} />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {gender === 'M' ? "Men's " : gender === 'F' ? "Women's " : ''}{eventName}
          </Text>
        </View>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Meet Info - Clickable */}
      <TouchableOpacity
        style={styles.meetInfoCard}
        onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          // Try to find the meet in database first
          const meet = await getMeetByName(meetName || '', date || undefined);
          if (meet?.meet_id) {
            router.push(`/meet/${meet.meet_id}`);
          } else {
            // Fallback: navigate with meetName and meetDate params
            router.push({
              pathname: '/meet/[id]',
              params: {
                id: 'fallback',
                meetName: meetName || '',
                meetDate: date || '',
              },
            });
          }
        }}
        activeOpacity={0.7}
      >
        <View style={styles.meetInfoContent}>
          <View style={styles.meetInfoText}>
            <Text style={styles.meetName} numberOfLines={2}>{meetName}</Text>
            <Text style={styles.meetDate}>{date ? formatDate(date) : ''}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
        </View>
      </TouchableOpacity>

      {/* Results */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {isRelay ? (
          // Relay Results
          relayRoundGroups.length > 0 ? (
            relayRoundGroups.map((group, index) => renderRelayRoundSection(group, index))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>No relay results found</Text>
            </View>
          )
        ) : (
          // Individual Results
          roundGroups.length > 0 ? (
            roundGroups.map((group, index) => renderRoundSection(group, index))
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>No results found</Text>
            </View>
          )
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  goBackButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 12,
  },
  goBackText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgrounds.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
  },
  headerPlaceholder: {
    width: 44,
  },

  // Meet Info Card
  meetInfoCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 16,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  meetName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  meetInfoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meetInfoText: {
    flex: 1,
  },
  meetDate: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Round Section
  roundSection: {
    marginBottom: 20,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  roundHeaderHeat: {
    backgroundColor: colors.backgrounds.cream,
  },
  roundTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.white,
  },
  roundTitleHeat: {
    color: colors.text.primary,
  },
  windText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.white,
  },
  windTextHeat: {
    color: colors.text.tertiary,
  },

  // Table Header
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8EAF0',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.medium,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },

  // Table Body
  tableBody: {
    // Container for result rows
  },

  // Result Row
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borders.light,
  },
  resultRowLast: {
    borderBottomWidth: 0,
  },
  resultRowMissing: {
    backgroundColor: '#FEF2F2',
  },
  missingText: {
    fontSize: 12,
    fontWeight: '600',
    fontStyle: 'italic',
    color: '#DC2626',
  },
  placeTextMissing: {
    color: '#DC2626',
    fontWeight: '700',
  },

  // Table Cells
  placeCell: {
    width: 36,
    alignItems: 'center',
  },
  placeCellTop: {
    // Could add background for top 3
  },
  placeText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  placeTextTop: {
    color: colors.primary.trackOrange,
    fontWeight: '900',
  },

  nameCell: {
    flex: 2,
    paddingRight: 8,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },

  yearCell: {
    width: 40,
    alignItems: 'center',
  },
  yearText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
  },

  teamCell: {
    flex: 1.5,
    paddingRight: 8,
  },
  teamText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  timeCell: {
    width: 60,
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },

  // Relay Styles
  relayResultRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borders.light,
  },
  relayMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  relayTeamCell: {
    flex: 1,
    paddingRight: 8,
  },
  relayTeamText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  relayAthletesContainer: {
    marginTop: 8,
    marginLeft: 36,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.borders.medium,
  },
  relayAthleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  legBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary.trackOrange,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  legBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text.white,
  },
  relayAthleteName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  relayAthleteYear: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
    marginLeft: 8,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.tertiary,
  },

  bottomSpacing: {
    height: 40,
  },
});
