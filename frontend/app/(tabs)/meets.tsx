import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../design-system/colors';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { AnimatedCard } from '../../components/animations/AnimatedCard';
import { HintTooltip } from '../../components/hints/HintTooltip';
import { useFirstTimeHint } from '../../hooks/useFirstTimeHint';
import { useMeets } from '../../hooks/useMeets';
import { MeetListSkeleton } from '../../components/ui/MeetCardSkeleton';

export default function MeetsScreen() {
  const [selectedTab, setSelectedTab] = useState<'live' | 'upcoming' | 'past'>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [sortByTab, setSortByTab] = useState<Record<'live' | 'upcoming' | 'past', 'date' | 'alpha'>>({
    live: 'date',
    upcoming: 'date',
    past: 'date',
  });
  const sortBy = sortByTab[selectedTab];
  const setSortBy = (value: 'date' | 'alpha') => setSortByTab(prev => ({ ...prev, [selectedTab]: value }));
  const meetsHint = useFirstTimeHint('meets_tab', 1500);

  const { meets, loading, refresh, searchPastMeets } = useMeets(selectedTab);

  // Search older meets when on Past tab
  React.useEffect(() => {
    if (selectedTab === 'past' && searchQuery.length >= 2) {
      setIsSearching(true);
      const timer = setTimeout(async () => {
        const results = await searchPastMeets(searchQuery);
        setSearchResults(results);
        setIsSearching(false);
      }, 300); // Debounce
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [searchQuery, selectedTab]);

  // Filter and sort meets
  const filteredMeets = useMemo(() => {
    // For Past tab with search, use database search results (includes older months)
    if (selectedTab === 'past' && searchQuery.length >= 2 && searchResults.length > 0) {
      let result = [...searchResults];
      if (sortBy === 'alpha') {
        result.sort((a, b) => a.name.localeCompare(b.name));
      }
      return result;
    }

    let result = [...meets];

    // Filter by search query (for current month / non-past tabs)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(meet =>
        meet.name.toLowerCase().includes(query) ||
        (meet.location && meet.location.toLowerCase().includes(query))
      );
    }

    // Sort by name if alphabetical is selected
    if (sortBy === 'alpha') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }
    // Date sorting is already handled by the API

    return result;
  }, [meets, searchQuery, sortBy, selectedTab, searchResults]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  function formatDate(dateString: string, endDateString?: string) {
    // Parse date string directly to avoid timezone issues
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // If no end date or same as start date, show single date
    if (!endDateString || endDateString.split('T')[0] === dateString.split('T')[0]) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Multi-day meet - show range
    const [endYear, endMonth, endDay] = endDateString.split('T')[0].split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    // Same month: "Feb 20-21, 2026"
    if (month === endMonth && year === endYear) {
      return `${date.toLocaleDateString('en-US', { month: 'short' })} ${day}-${endDay}, ${year}`;
    }

    // Different months: "Feb 28 - Mar 1, 2026"
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${endYear}`;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Meets Hint */}
      <HintTooltip
        visible={meetsHint.showHint}
        text="Browse live, upcoming, and past meets. Tap any meet to see detailed results!"
        position="top"
        onDismiss={meetsHint.dismissHint}
        arrowPosition="center"
      />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary.trackOrange}
            colors={[colors.primary.trackOrange]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Meets</Text>
          <Text style={styles.subtitle}>Track meet schedules & results</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'live' && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedTab('live');
            }}
            activeOpacity={0.7}
          >
            <View style={styles.tabContent}>
              {selectedTab === 'live' && (
                <View style={styles.liveDot} />
              )}
              <Text style={[styles.tabText, selectedTab === 'live' && styles.tabTextActive]}>
                Live
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'upcoming' && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedTab('upcoming');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, selectedTab === 'upcoming' && styles.tabTextActive]}>
              Upcoming
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'past' && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedTab('past');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, selectedTab === 'past' && styles.tabTextActive]}>
              Past
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar and Sort Toggle */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputWrapper}>
            <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search meets..."
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.sortButton, sortBy === 'alpha' && styles.sortButtonActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSortBy(sortBy === 'date' ? 'alpha' : 'date');
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={sortBy === 'alpha' ? 'text' : 'calendar'}
              size={18}
              color={sortBy === 'alpha' ? colors.text.white : colors.text.primary}
            />
            <Text style={[styles.sortButtonText, sortBy === 'alpha' && styles.sortButtonTextActive]}>
              {sortBy === 'alpha' ? 'A-Z' : 'Date'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Live Meets */}
        {selectedTab === 'live' && (
          <View style={styles.section}>
            {loading && filteredMeets.length === 0 ? (
              <MeetListSkeleton count={3} />
            ) : filteredMeets.length > 0 ? (
              filteredMeets.map((meet, index) => (
                <FadeInCard key={meet.meet_id} delay={index * 150}>
                  <AnimatedCard
                    style={styles.liveMeetCard}
                    onPress={() => router.push(`/meet/${meet.meet_id}`)}
                  >
                  <LinearGradient
                    colors={['#FF1B8D', '#FF6B35'] as any}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.liveGradient}
                  >
                    <View style={styles.liveBadge}>
                      <View style={styles.liveIndicator} />
                      <Text style={styles.liveText}>LIVE NOW</Text>
                    </View>

                    <Text style={styles.meetName}>{meet.name}</Text>

                    <View style={styles.meetMeta}>
                      {meet.location && (
                        <View style={styles.metaItem}>
                          <Ionicons name="location" size={14} color={colors.text.white} />
                          <Text style={styles.metaText}>{meet.location}</Text>
                        </View>
                      )}
                      <View style={styles.metaItem}>
                        <Ionicons name="calendar" size={14} color={colors.text.white} />
                        <Text style={styles.metaText}>{formatDate(meet.date, meet.end_date)}</Text>
                      </View>
                    </View>

                    <View style={styles.meetDetails}>
                      <View style={styles.meetDetailItem}>
                        <Ionicons name="school" size={16} color={colors.text.white} />
                        <Text style={styles.meetDetailText}>{meet.level}</Text>
                      </View>
                      <View style={styles.meetDetailItem}>
                        <Ionicons name="snow" size={16} color={colors.text.white} />
                        <Text style={styles.meetDetailText}>{meet.season}</Text>
                      </View>
                    </View>
                  </LinearGradient>
                  </AnimatedCard>
                </FadeInCard>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name={searchQuery ? "search-outline" : "time-outline"} size={64} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>{searchQuery ? 'No matches found' : 'No live meets right now'}</Text>
                <Text style={styles.emptySubtext}>{searchQuery ? 'Try a different search term' : 'Check back during meet season!'}</Text>
              </View>
            )}
          </View>
        )}

        {/* Upcoming Meets */}
        {selectedTab === 'upcoming' && (
          <View style={styles.section}>
            {loading && filteredMeets.length === 0 ? (
              <MeetListSkeleton count={5} />
            ) : filteredMeets.length > 0 ? (
              filteredMeets.map((meet, index) => (
                <FadeInCard key={meet.meet_id} delay={index * 120}>
                  <AnimatedCard
                    style={styles.upcomingMeetCard}
                    onPress={() => router.push(`/meet/${meet.meet_id}`)}
                  >
                  <View style={styles.upcomingHeader}>
                    <View style={styles.upcomingLeft}>
                      <Text style={styles.upcomingName}>{meet.name}</Text>
                      {meet.location && (
                        <View style={styles.upcomingMeta}>
                          <Ionicons name="location" size={14} color={colors.text.tertiary} />
                          <Text style={styles.upcomingLocation}>{meet.location}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.upcomingDetails}>
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar" size={18} color={colors.primary.trackOrange} />
                      <Text style={styles.detailText}>{formatDate(meet.date, meet.end_date)}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="school" size={18} color={colors.primary.trackOrange} />
                      <Text style={styles.detailText}>{meet.level}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Ionicons name="snow" size={18} color={colors.primary.trackOrange} />
                      <Text style={styles.detailText}>{meet.season}</Text>
                    </View>
                  </View>
                  </AnimatedCard>
                </FadeInCard>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name={searchQuery ? "search-outline" : "calendar-outline"} size={64} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>{searchQuery ? 'No matches found' : 'No upcoming meets'}</Text>
                <Text style={styles.emptySubtext}>{searchQuery ? 'Try a different search term' : 'Check back soon for new meets!'}</Text>
              </View>
            )}
          </View>
        )}

        {/* Past Meets */}
        {selectedTab === 'past' && (
          <View style={styles.section}>
            {/* Show hint about searching older meets */}
            {!searchQuery && (
              <View style={styles.searchHint}>
                <Ionicons name="information-circle-outline" size={16} color={colors.text.tertiary} />
                <Text style={styles.searchHintText}>Showing this month. Search to find older meets.</Text>
              </View>
            )}
            {(loading || isSearching) && filteredMeets.length === 0 ? (
              <MeetListSkeleton count={5} />
            ) : filteredMeets.length > 0 ? (
              filteredMeets.map((meet, index) => (
                <FadeInCard key={meet.meet_id} delay={index * 120}>
                  <AnimatedCard
                    style={styles.pastMeetCard}
                    onPress={() => router.push(`/meet/${meet.meet_id}`)}
                  >
                  <View style={styles.pastHeader}>
                    <Text style={styles.pastName}>{meet.name}</Text>
                    <View style={styles.pastDate}>
                      <Text style={styles.pastDateText}>{formatDate(meet.date, meet.end_date)}</Text>
                    </View>
                  </View>

                  {meet.location && (
                    <View style={styles.pastMeta}>
                      <Ionicons name="location" size={14} color={colors.text.tertiary} />
                      <Text style={styles.pastLocation}>{meet.location}</Text>
                    </View>
                  )}

                  <View style={styles.pastDetails}>
                    <View style={styles.pastDetailItem}>
                      <Ionicons name="school" size={16} color={colors.text.secondary} />
                      <Text style={styles.pastDetailText}>{meet.level}</Text>
                    </View>
                    <View style={styles.pastDetailItem}>
                      <Ionicons name="snow" size={16} color={colors.text.secondary} />
                      <Text style={styles.pastDetailText}>{meet.season}</Text>
                    </View>
                  </View>

                  {meet.meet_url && (
                    <View style={styles.resultsAvailableBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.performance.newPR} />
                      <Text style={styles.resultsAvailableText}>Results Available</Text>
                    </View>
                  )}
                  </AnimatedCard>
                </FadeInCard>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name={searchQuery ? "search-outline" : "trophy-outline"} size={64} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>{searchQuery ? 'No matches found' : 'No past meets'}</Text>
                <Text style={styles.emptySubtext}>{searchQuery ? 'Try a different search term' : 'Completed meets will appear here'}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.primary.finishYellow,
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    paddingHorizontal: 14,
    height: 48,
  },
  sortButtonActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  sortButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  sortButtonTextActive: {
    color: colors.text.white,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.white,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
  },
  tabTextActive: {
    color: colors.text.white,
  },
  section: {
    paddingHorizontal: 20,
  },
  // Live Meet Cards
  liveMeetCard: {
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  liveGradient: {
    padding: 20,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.text.white,
    marginBottom: 12,
  },
  liveIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.text.white,
  },
  liveText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 1,
  },
  meetName: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.white,
    marginBottom: 12,
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  meetMeta: {
    gap: 8,
    marginBottom: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.white,
  },
  currentEventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  currentEventLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 0.5,
  },
  currentEventText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.white,
  },
  teamsCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.white,
  },
  // Upcoming Meet Cards
  upcomingMeetCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  upcomingLeft: {
    flex: 1,
  },
  upcomingName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 6,
  },
  upcomingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  upcomingLocation: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  divisionBadge: {
    backgroundColor: colors.division.d1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  divisionText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.white,
  },
  upcomingDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: colors.borders.light,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  // Past Meet Cards
  pastMeetCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  pastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  pastName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
  },
  pastDate: {
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  pastDateText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text.tertiary,
  },
  pastMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  pastLocation: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  pastWinner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    marginBottom: 10,
  },
  winnerText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
  },
  highlightsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  highlightsText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.performance.newPR,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 6,
  },
  bottomSpacing: {
    height: 100,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.secondary,
    marginTop: 16,
  },
  liveLinkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.performance.newPR,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  liveLinkText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 0.5,
  },
  // Live meet details
  meetDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  meetDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  meetDetailText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.white,
  },
  // Past meet details
  pastDetails: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: colors.borders.light,
    marginBottom: 12,
  },
  pastDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pastDetailText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  resultsAvailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  resultsAvailableText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.performance.newPR,
  },
  searchHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  searchHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
});
