import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../design-system/colors';
import { AthleteComparisonChart } from '../components/charts/AthleteComparisonChart';
import { FadeInCard } from '../components/animations/FadeInCard';
import { searchAthletes, getAthleteComparisonStats, getHeadToHead, SeasonFilter } from '../services/database';

interface AthleteSearchResult {
  athlete_id: number;
  full_name: string;
  gender: string;
  class_year: string;
  primary_events: string;
  school_name: string;
  division: string;
}

interface AthleteComparisonData {
  athlete_id: number;
  full_name: string;
  school_name: string;
  gender: string;
  division: string;
  eventStats: Record<string, any>;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  }
  return secs.toFixed(2);
}

export default function CompareAthletesScreen() {
  const { athleteId } = useLocalSearchParams<{ athleteId?: string }>();
  const preloadedRef = useRef(false);

  const [athlete1, setAthlete1] = useState<AthleteComparisonData | null>(null);
  const [athlete2, setAthlete2] = useState<AthleteComparisonData | null>(null);
  const [showPicker, setShowPicker] = useState<1 | 2 | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AthleteSearchResult[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all');
  const [athlete1Id, setAthlete1Id] = useState<number | null>(null);
  const [athlete2Id, setAthlete2Id] = useState<number | null>(null);

  // Pre-load athlete if coming from athlete profile
  useEffect(() => {
    const loadPreselectedAthlete = async () => {
      if (athleteId && !preloadedRef.current) {
        preloadedRef.current = true;
        const id = parseInt(athleteId, 10);
        // Skip if ID is invalid
        if (isNaN(id) || id <= 0) return;

        setLoading(true);
        try {
          const stats = await getAthleteComparisonStats(id, seasonFilter);
          if (stats) {
            setAthlete1(stats);
            setAthlete1Id(id);
            // Automatically open picker for athlete 2
            setTimeout(() => setShowPicker(2), 300);
          }
        } catch (error) {
          console.error('Error loading preselected athlete:', error);
        } finally {
          setLoading(false);
        }
      }
    };
    loadPreselectedAthlete();
  }, [athleteId]);

  // Reload athletes when season filter changes
  useEffect(() => {
    const reloadAthletes = async () => {
      if (!athlete1Id && !athlete2Id) return;

      setLoading(true);
      try {
        const [stats1, stats2] = await Promise.all([
          athlete1Id ? getAthleteComparisonStats(athlete1Id, seasonFilter) : null,
          athlete2Id ? getAthleteComparisonStats(athlete2Id, seasonFilter) : null,
        ]);
        if (stats1) setAthlete1(stats1);
        if (stats2) setAthlete2(stats2);
        setSelectedEvent(''); // Reset selected event
      } catch (error) {
        console.error('Error reloading athletes:', error);
      } finally {
        setLoading(false);
      }
    };
    reloadAthletes();
  }, [seasonFilter]);
  const [headToHead, setHeadToHead] = useState<{
    athlete1Wins: number;
    athlete2Wins: number;
    ties: number;
    races: any[];
  } | null>(null);

  // Search for athletes
  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);
      try {
        const results = await searchAthletes(searchQuery, 50);
        setSearchResults(results as AthleteSearchResult[]);
      } catch (error) {
        console.error('Error searching athletes:', error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSelectAthlete = async (athleteSearchResult: AthleteSearchResult) => {
    setLoading(true);
    try {
      const stats = await getAthleteComparisonStats(athleteSearchResult.athlete_id, seasonFilter);

      if (stats) {
        if (showPicker === 1) {
          setAthlete1(stats);
          setAthlete1Id(athleteSearchResult.athlete_id);
        } else if (showPicker === 2) {
          setAthlete2(stats);
          setAthlete2Id(athleteSearchResult.athlete_id);
        }

        // Auto-select a common event if both athletes are selected
        if ((showPicker === 1 && athlete2) || (showPicker === 2 && athlete1)) {
          const otherAthlete = showPicker === 1 ? athlete2 : athlete1;
          const commonEvents = Object.keys(stats.eventStats).filter(
            event => otherAthlete && otherAthlete.eventStats[event]
          );
          if (commonEvents.length > 0 && !selectedEvent) {
            setSelectedEvent(commonEvents[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading athlete stats:', error);
    } finally {
      setLoading(false);
      setShowPicker(null);
      setSearchQuery('');
    }
  };

  const handleSwapAthletes = () => {
    const temp = athlete1;
    const tempId = athlete1Id;
    setAthlete1(athlete2);
    setAthlete1Id(athlete2Id);
    setAthlete2(temp);
    setAthlete2Id(tempId);
  };

  // Get common events between both athletes (excluding relays)
  const commonEvents = React.useMemo(() => {
    if (!athlete1 || !athlete2) return [];

    const events1 = Object.keys(athlete1.eventStats);
    const events2 = Object.keys(athlete2.eventStats);

    // Filter out relay events (4x100, 4x400, etc.)
    const isRelay = (event: string) => /\dx\d/i.test(event);

    return events1.filter(event => events2.includes(event) && !isRelay(event));
  }, [athlete1, athlete2]);

  // Auto-select first common event
  useEffect(() => {
    if (commonEvents.length > 0 && !selectedEvent) {
      setSelectedEvent(commonEvents[0]);
    }
  }, [commonEvents, selectedEvent]);

  // Fetch head-to-head data when both athletes and event are selected
  useEffect(() => {
    const fetchHeadToHead = async () => {
      if (athlete1 && athlete2 && selectedEvent) {
        try {
          const h2h = await getHeadToHead(athlete1.athlete_id, athlete2.athlete_id, selectedEvent, seasonFilter);
          setHeadToHead(h2h);
        } catch (error) {
          console.error('Error fetching head-to-head:', error);
          setHeadToHead(null);
        }
      } else {
        setHeadToHead(null);
      }
    };
    fetchHeadToHead();
  }, [athlete1, athlete2, selectedEvent, seasonFilter]);

  // Prepare comparison data for the selected event
  const comparisonData = React.useMemo(() => {
    if (!athlete1 || !athlete2 || !selectedEvent) return null;

    const stats1 = athlete1.eventStats[selectedEvent];
    const stats2 = athlete2.eventStats[selectedEvent];

    if (!stats1 || !stats2) return null;

    return {
      athlete1: {
        name: athlete1.full_name,
        school: athlete1.school_name,
        personalBest: stats1.personalBestRaw || 'N/A',
        personalBestSeason: stats1.personalBestSeason || null,
        average: stats1.averageRaw || 'N/A',
      },
      athlete2: {
        name: athlete2.full_name,
        school: athlete2.school_name,
        personalBest: stats2.personalBestRaw || 'N/A',
        personalBestSeason: stats2.personalBestSeason || null,
        average: stats2.averageRaw || 'N/A',
      },
      eventName: selectedEvent,
      headToHead: headToHead,
    };
  }, [athlete1, athlete2, selectedEvent, headToHead]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
          <Text style={styles.headerTitle}>Compare Athletes</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Season Filter */}
        <View style={styles.seasonFilterContainer}>
          {(['all', 'indoor', 'outdoor'] as SeasonFilter[]).map((season) => (
            <TouchableOpacity
              key={season}
              style={[
                styles.seasonFilterButton,
                seasonFilter === season && styles.seasonFilterButtonActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSeasonFilter(season);
              }}
            >
              <Text
                style={[
                  styles.seasonFilterText,
                  seasonFilter === season && styles.seasonFilterTextActive,
                ]}
              >
                {season === 'all' ? 'All' : season === 'indoor' ? 'Indoor' : 'Outdoor'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Athlete Selection */}
        <View style={styles.selectionContainer}>
          {/* Athlete 1 */}
          <TouchableOpacity
            style={styles.athleteSelector}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPicker(1);
            }}
          >
            {athlete1 ? (
              <>
                <View style={styles.athleteIcon}>
                  <Text style={styles.athleteInitials}>
                    {athlete1.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </Text>
                </View>
                <Text style={styles.athleteSelectorName} numberOfLines={2}>
                  {athlete1.full_name}
                </Text>
                <Text style={styles.athleteSelectorSchool} numberOfLines={1}>
                  {athlete1.school_name}
                </Text>
              </>
            ) : (
              <>
                <View style={styles.athleteIcon}>
                  <Ionicons name="add" size={32} color={colors.text.tertiary} />
                </View>
                <Text style={styles.athleteSelectorPlaceholder}>Select Athlete 1</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Swap Button */}
          <TouchableOpacity
            style={styles.swapButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleSwapAthletes();
            }}
            disabled={!athlete1 || !athlete2}
          >
            <Ionicons name="swap-horizontal" size={28} color={colors.text.white} />
          </TouchableOpacity>

          {/* Athlete 2 */}
          <TouchableOpacity
            style={styles.athleteSelector}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowPicker(2);
            }}
          >
            {athlete2 ? (
              <>
                <View style={styles.athleteIcon}>
                  <Text style={styles.athleteInitials}>
                    {athlete2.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </Text>
                </View>
                <Text style={styles.athleteSelectorName} numberOfLines={2}>
                  {athlete2.full_name}
                </Text>
                <Text style={styles.athleteSelectorSchool} numberOfLines={1}>
                  {athlete2.school_name}
                </Text>
              </>
            ) : (
              <>
                <View style={styles.athleteIcon}>
                  <Ionicons name="add" size={32} color={colors.text.tertiary} />
                </View>
                <Text style={styles.athleteSelectorPlaceholder}>Select Athlete 2</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Event Selector */}
        {commonEvents.length > 0 && (
          <View style={styles.eventSelectorContainer}>
            <Text style={styles.eventSelectorLabel}>Select Event to Compare:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventSelectorScroll}>
              {commonEvents.map((event, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.eventChip,
                    selectedEvent === event && styles.eventChipActive
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedEvent(event);
                  }}
                >
                  <Text style={[
                    styles.eventChipText,
                    selectedEvent === event && styles.eventChipTextActive
                  ]}>
                    {event}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Comparison Chart */}
        {comparisonData && (
          <View style={styles.chartContainer}>
            <AthleteComparisonChart
              athlete1={comparisonData.athlete1}
              athlete2={comparisonData.athlete2}
              eventName={comparisonData.eventName}
              headToHead={comparisonData.headToHead}
            />
          </View>
        )}

        {/* No common events message */}
        {athlete1 && athlete2 && commonEvents.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={64} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>
              These athletes don't have any events in common
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Athlete Picker Modal */}
      <Modal visible={showPicker !== null} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowPicker(null);
                setSearchQuery('');
              }}
            >
              <Ionicons name="close" size={28} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Select Athlete {showPicker}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={colors.text.tertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search athletes by name..."
                placeholderTextColor={colors.text.tertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Loading or Results */}
          {searching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary.trackOrange} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : searchQuery.length < 2 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={64} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>
                Type at least 2 characters to search
              </Text>
            </View>
          ) : searchResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="person-outline" size={64} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>
                No athletes found
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.athletesList}>
              {searchResults.map((athlete, i) => (
                <FadeInCard key={athlete.athlete_id} delay={i * 80}>
                  <TouchableOpacity
                    style={styles.athleteItem}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      handleSelectAthlete(athlete);
                    }}
                  >
                    <View style={styles.athleteItemIcon}>
                      <Text style={styles.athleteItemInitials}>
                        {athlete.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </Text>
                    </View>
                    <View style={styles.athleteItemInfo}>
                      <Text style={styles.athleteItemName}>{athlete.full_name}</Text>
                      <Text style={styles.athleteItemSchool}>
                        {athlete.school_name} • {athlete.division}
                      </Text>
                      {athlete.primary_events && (
                        <Text style={styles.athleteItemEvents} numberOfLines={1}>
                          {athlete.primary_events}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
                  </TouchableOpacity>
                </FadeInCard>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary.trackOrange} />
            <Text style={styles.loadingOverlayText}>Loading athlete data...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  seasonFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  seasonFilterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    alignItems: 'center',
  },
  seasonFilterButtonActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  seasonFilterText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  seasonFilterTextActive: {
    color: colors.text.white,
  },
  selectionContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  athleteSelector: {
    flex: 1,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 20,
    alignItems: 'center',
    minHeight: 160,
    justifyContent: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  athleteIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary.trackOrange,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  athleteInitials: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.white,
  },
  athleteSelectorName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  athleteSelectorSchool: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  athleteSelectorPlaceholder: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  swapButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.trackOrange,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  eventSelectorContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  eventSelectorLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 12,
  },
  eventSelectorScroll: {
    flexGrow: 0,
  },
  eventChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    marginRight: 8,
  },
  eventChipActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  eventChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  eventChipTextActive: {
    color: colors.text.white,
  },
  chartContainer: {
    paddingHorizontal: 20,
  },
  bottomSpacing: {
    height: 100,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 4,
    borderBottomColor: colors.borders.thick,
    backgroundColor: colors.backgrounds.white,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 16,
    textAlign: 'center',
  },
  athletesList: {
    flex: 1,
  },
  athleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    gap: 12,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  athleteItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.trackOrange,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  athleteItemInitials: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.white,
  },
  athleteItemInfo: {
    flex: 1,
    gap: 2,
  },
  athleteItemName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  athleteItemSchool: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  athleteItemEvents: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 32,
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  loadingOverlayText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    marginTop: 16,
  },
});
