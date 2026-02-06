import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedCard } from '../../components/animations/AnimatedCard';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { RacingStripes } from '../../components/decorations/RacingStripes';
import { SparkleTrophy } from '../../components/decorations/SparkleTrophy';
import { HintTooltip } from '../../components/hints/HintTooltip';
import { Onboarding } from '../../components/onboarding/Onboarding';
import { SportsPerformanceCard } from '../../components/ui/SportsPerformanceCard';
import { colors } from '../../design-system/colors';
import { spacing } from '../../design-system/spacing';
import { useFirstTimeHint } from '../../hooks/useFirstTimeHint';
import { useTopPerformances } from '../../hooks/useTopPerformances';
import { useMeets, useLatestResults } from '../../hooks/useMeets';

export default function HomeScreen() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [divisionFilter, setDivisionFilter] = useState<string>('all');
  const [showDivisionPicker, setShowDivisionPicker] = useState(false);
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const searchHint = useFirstTimeHint('search_button', 2000);
  const { performances, loading, error, refetch: refetchPerformances } = useTopPerformances(15, divisionFilter, weeksAgo);
  const { meets: upcomingMeets, loading: loadingMeets, refresh: refreshMeets } = useMeets('upcoming');
  const { meets: latestResults, loading: loadingLatest } = useLatestResults(5);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchPerformances(), refreshMeets()]);
    } catch (err) {
      // Silently handle refresh errors - data will show cached state
    } finally {
      setRefreshing(false);
    }
  };

  // Get unique trending athletes (athletes with multiple top performances)
  const trendingAthletes = performances.reduce((acc: any[], perf) => {
    const existing = acc.find(a => a.athlete_id === perf.athlete_id);
    if (!existing && acc.length < 4) {
      acc.push({
        athlete_id: perf.athlete_id,
        full_name: perf.full_name,
        school_name: perf.school_name,
        event_name: perf.event_name,
        mark_raw: perf.mark_raw,
        gender: perf.gender,
      });
    }
    return acc;
  }, []);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Onboarding Modal */}
      <Modal visible={showOnboarding} animationType="slide">
        <Onboarding onDone={() => setShowOnboarding(false)} />
      </Modal>

      {/* Division Picker Modal */}
      <Modal visible={showDivisionPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDivisionPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Select Division</Text>
            {[
              { value: 'all', label: 'All Divisions' },
              { value: 'D1', label: 'NCAA Division I' },
              { value: 'D2', label: 'NCAA Division II' },
              { value: 'D3', label: 'NCAA Division III' },
              { value: 'NAIA', label: 'NAIA' },
              { value: 'JUCO', label: 'JUCO / NJCAA' },
            ].map((div) => (
              <TouchableOpacity
                key={div.value}
                style={[
                  styles.pickerOption,
                  divisionFilter === div.value && styles.pickerOptionActive
                ]}
                onPress={() => {
                  setDivisionFilter(div.value);
                  setShowDivisionPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerOptionText,
                  divisionFilter === div.value && styles.pickerOptionTextActive
                ]}>
                  {div.label}
                </Text>
                {divisionFilter === div.value && (
                  <Ionicons name="checkmark" size={18} color={colors.primary.trackOrange} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Week Picker Modal */}
      <Modal visible={showWeekPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowWeekPicker(false)}
        >
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerTitle}>Select Week</Text>
            {[
              { value: 0, label: 'This Week' },
              { value: 1, label: 'Last Week' },
              { value: 2, label: '2 Weeks Ago' },
              { value: 3, label: '3 Weeks Ago' },
              { value: 4, label: '4 Weeks Ago' },
            ].map((week) => (
              <TouchableOpacity
                key={week.value}
                style={[
                  styles.pickerOption,
                  weeksAgo === week.value && styles.pickerOptionActive
                ]}
                onPress={() => {
                  setWeeksAgo(week.value);
                  setShowWeekPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerOptionText,
                  weeksAgo === week.value && styles.pickerOptionTextActive
                ]}>
                  {week.label}
                </Text>
                {weeksAgo === week.value && (
                  <Ionicons name="checkmark" size={18} color={colors.primary.trackOrange} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Racing Stripes Background */}
      <RacingStripes />

      <ScrollView
        style={styles.content}
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
        {/* Search Hint */}
        <HintTooltip
          visible={searchHint.showHint}
          text="Tap here to search for athletes, schools, or events"
          position="top"
          onDismiss={searchHint.dismissHint}
          arrowPosition="right"
        />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.trackText}>Track</Text>
            <Text style={styles.hubText}>Hub</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.enhancedSearchButton}
              onPress={() => router.push('/search')}
            >
              <LinearGradient
                colors={['#FFFFFF', '#F0F0F0']}
                style={styles.searchButtonGradient}
              >
                <Ionicons name="search" size={20} color="#FF1B8D" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Welcome Card */}
        <AnimatedCard
          style={styles.featuredCard}
          onPress={() => setShowOnboarding(true)}
        >
          <LinearGradient
            colors={['#FF6B35', '#FF8F66']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredGradient}
          >
            <View style={styles.featuredBadge}>
              <Ionicons name="sparkles" size={12} color="#FFFFFF" />
              <Text style={styles.featuredBadgeText}>WELCOME</Text>
            </View>
            <Text style={styles.featuredTitle}>Your Hub for College Track & Field</Text>
            <Text style={styles.featuredSubtitle}>Discover top performances, upcoming meets, and trending athletes all in one place</Text>
            <View style={styles.featuredBottom}>
              <TouchableOpacity
                style={styles.getStartedButton}
                onPress={() => setShowOnboarding(true)}
              >
                <Text style={styles.getStartedText}>Get Started</Text>
                <Ionicons name="arrow-forward" size={20} color="#000000" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </AnimatedCard>

        {/* Upcoming Meets */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Meets</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/meets')}>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {loadingMeets ? (
              <ActivityIndicator size="small" color={colors.primary.trackOrange} />
            ) : upcomingMeets.length === 0 ? (
              <View style={styles.upcomingCard}>
                <Text style={styles.upcomingName}>No upcoming meets</Text>
              </View>
            ) : (
              upcomingMeets.slice(0, 5).map((meet) => (
                <AnimatedCard
                  key={meet.meet_id}
                  style={styles.upcomingCard}
                  onPress={() => router.push(`/meet/${meet.meet_id}`)}
                >
                  <View style={styles.upcomingInfo}>
                    <Text style={styles.upcomingName} numberOfLines={2}>{meet.name}</Text>
                    <View style={styles.upcomingLocation}>
                      <Ionicons name="calendar" size={14} color="#FF6B35" />
                      <Text style={styles.upcomingLocationText}>
                        {new Date(meet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </View>
                    {meet.location && (
                      <View style={styles.upcomingLocation}>
                        <Ionicons name="location" size={14} color="#FF6B35" />
                        <Text style={styles.upcomingLocationText} numberOfLines={1}>{meet.location}</Text>
                      </View>
                    )}
                  </View>
                </AnimatedCard>
              ))
            )}
          </ScrollView>
        </View>

        {/* Top Performances */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderColumn}>
            <Text style={styles.sectionTitle}>Top Performances</Text>
            <View style={styles.filterRow}>
              {/* Week Dropdown */}
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => setShowWeekPicker(true)}
              >
                <Text style={styles.filterDropdownText}>
                  {weeksAgo === 0 ? 'This Week' :
                   weeksAgo === 1 ? 'Last Week' :
                   `${weeksAgo}W Ago`}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.text.secondary} />
              </TouchableOpacity>
              {/* Division Dropdown */}
              <TouchableOpacity
                style={styles.filterDropdown}
                onPress={() => setShowDivisionPicker(true)}
              >
                <Text style={styles.filterDropdownText}>
                  {divisionFilter === 'all' ? 'All' :
                   divisionFilter === 'D1' ? 'DI' :
                   divisionFilter === 'D2' ? 'DII' :
                   divisionFilter === 'D3' ? 'DIII' : divisionFilter}
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.performancesList}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary.trackOrange} />
            ) : error ? (
              <Text style={styles.errorText}>Error loading performances</Text>
            ) : performances.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="trophy-outline" size={48} color={colors.text.tertiary} />
                <Text style={styles.emptyStateText}>No results yet this week</Text>
                <Text style={styles.emptyStateSubtext}>Check back after weekend meets!</Text>
              </View>
            ) : (
              performances.slice(0, 5).map((perf, i) => (
                <SportsPerformanceCard
                  key={i}
                  rank={i + 1}
                  athleteName={perf.full_name}
                  schoolName={perf.school_name || 'Unknown'}
                  event={`${perf.gender === 'F' ? "Women's" : "Men's"} ${perf.event_name}`}
                  time={perf.mark_raw}
                  date={perf.date}
                  waPoints={perf.waPoints}
                  onPress={() => router.push(`/athlete/${perf.athlete_id}`)}
                />
              ))
            )}
          </View>
        </View>

        {/* Latest Results */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Latest Results</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/meets')}>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScroll}
          >
            {(() => {
              if (loadingLatest) {
                return <ActivityIndicator size="small" color={colors.primary.trackOrange} />;
              }

              if (latestResults.length === 0) {
                return (
                  <View style={styles.latestResultCard}>
                    <View>
                      <Text style={styles.latestResultMeet}>No results yet</Text>
                    </View>
                    <Text style={styles.latestResultLocationText}>Check back after weekend meets!</Text>
                  </View>
                );
              }

              return latestResults.map((meet, i) => (
                <FadeInCard key={meet.meet_id} delay={i * 100}>
                  <AnimatedCard
                    style={styles.latestResultCard}
                    onPress={() => router.push(`/meet/${meet.meet_id}`)}
                  >
                    <View>
                      <View style={styles.latestResultBadge}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.performance.newPR} />
                        <Text style={styles.latestResultBadgeText}>RESULTS</Text>
                      </View>
                      <Text style={styles.latestResultMeet} numberOfLines={2}>{meet.name}</Text>
                    </View>
                    <View style={styles.latestResultBottom}>
                      <View style={styles.latestResultDate}>
                        <Ionicons name="calendar" size={12} color={colors.primary.trackOrange} />
                        <Text style={styles.latestResultDateText}>
                          {new Date(meet.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      {meet.location && (
                        <View style={styles.latestResultLocation}>
                          <Ionicons name="location" size={12} color={colors.text.tertiary} />
                          <Text style={styles.latestResultLocationText} numberOfLines={1}>{meet.location}</Text>
                        </View>
                      )}
                    </View>
                  </AnimatedCard>
                </FadeInCard>
              ));
            })()}
          </ScrollView>
        </View>

        {/* Trending Athletes - Hidden for now */}

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
  content: {
    flex: 1,
  },
  performancesList: {
    paddingHorizontal: spacing.screen,
    gap: spacing.sm, // Compact spacing between cards
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    paddingVertical: spacing.headerPadding,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: -2,
    marginLeft: -8,
  },
  textGradient: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  logoImage: {
    width: 200,
    height: 60,
  },
  trackText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFE55C',
    fontFamily: 'System',
    textShadowColor: '#B8860B',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },
  hubText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFE55C',
    fontFamily: 'System',
    marginRight: 8,
    textShadowColor: '#B8860B',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },
  liveContainer: {
    marginLeft: 4,
  },
  liveGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FF69B4',
    borderWidth: 3,
    borderColor: '#000000',
  },
  liveText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  // Demo Meet Card Styles
  demoMeetCard: {
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  demoGradient: {
    padding: 20,
  },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: 12,
  },
  demoBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  demoTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  demoSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  demoStats: {
    flexDirection: 'row',
    gap: 12,
  },
  demoStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  demoStatText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  enhancedSearchButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  searchButtonGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgrounds.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  // Featured Card
  featuredCard: {
    marginHorizontal: spacing.screen,
    marginBottom: spacing.sectionGap,
    borderRadius: spacing.radiusXl,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#000000',
  },
  featuredGradient: {
    padding: spacing.xxl,
    backgroundColor: '#FFD700',
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF69B4',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.cardMargin,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radiusLg,
    gap: spacing.xs,
    marginBottom: spacing.cardMargin,
    borderWidth: 3,
    borderColor: '#000000',
  },
  featuredBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  featuredTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#000000',
    marginBottom: spacing.sm,
    lineHeight: 32,
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  featuredSubtitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: spacing.lg,
  },
  featuredBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  featuredTime: {
    fontSize: 36,
    fontWeight: '900',
    color: '#000000',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  featuredLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
    marginTop: 4,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.semantic.error,
    textAlign: 'center',
    padding: spacing.lg,
  },
  featuredMeetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.radiusMd,
    borderWidth: 3,
    borderColor: '#000000',
  },
  featuredMeet: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
  },
  welcomeStats: {
    flexDirection: 'row',
    gap: spacing.lg,
    width: '100%',
  },
  welcomeStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingVertical: spacing.md,
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: '#000000',
  },
  welcomeStatNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  welcomeStatLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    borderRadius: spacing.radiusLg,
    borderWidth: 3,
    borderColor: '#000000',
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  getStartedText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
  },
  // Section
  section: {
    marginBottom: spacing.sectionGap,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.screen,
    marginBottom: spacing.lg,
  },
  sectionHeaderColumn: {
    paddingHorizontal: spacing.screen,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000000',
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  seeAll: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FF69B4',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    borderStyle: 'dashed',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.secondary,
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
    marginTop: 4,
  },
  // Horizontal Scroll
  horizontalScroll: {
    paddingHorizontal: spacing.screen,
    gap: spacing.md,
  },
  // Filter Dropdown
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  filterDropdownText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  // Division Picker Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerContainer: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: spacing.radiusLg,
    padding: spacing.lg,
    width: '80%',
    maxWidth: 300,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.radiusSm,
  },
  pickerOptionActive: {
    backgroundColor: colors.backgrounds.cream,
  },
  pickerOptionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  pickerOptionTextActive: {
    color: colors.primary.trackOrange,
    fontWeight: '900',
  },
  // Upcoming Meets
  upcomingCard: {
    width: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: spacing.radiusLg,
    padding: spacing.cardPadding,
    borderWidth: 4,
    borderColor: '#000000',
  },
  upcomingInfo: {
    gap: spacing.sm,
  },
  upcomingName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 22,
  },
  upcomingLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  upcomingLocationText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF69B4',
  },
  // Performance Cards
  performanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: spacing.screen,
    marginBottom: spacing.cardMargin,
    padding: spacing.lg,
    borderRadius: spacing.radiusLg,
    borderWidth: 4,
    borderColor: '#000000',
  },
  performanceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  rankBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#000000',
  },
  rankText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000000',
  },
  performanceInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  athleteName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#000000',
  },
  schoolName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF69B4',
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 2,
  },
  eventName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666666',
  },
  performanceRight: {
    alignItems: 'flex-end',
  },
  performanceTime: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  // Result Cards
  resultCard: {
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: spacing.screen,
    marginBottom: spacing.cardMargin,
    padding: spacing.lg,
    borderRadius: spacing.radiusMd,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    alignItems: 'center',
  },
  resultHeader: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  resultEventInfo: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resultEvent: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
  },
  resultMeet: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  resultDetails: {
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultWinner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resultWinnerName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  resultDate: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'right',
  },
  resultMark: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  // Trending Athletes
  trendingCard: {
    width: 150,
    backgroundColor: colors.backgrounds.white,
    borderRadius: spacing.radiusMd,
    padding: spacing.lg,
    flexDirection: 'column',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    gap: spacing.sm,
  },
  trendingAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  trendingContent: {
    flex: 1,
    gap: spacing.xs,
  },
  trendingName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    width: '100%',
  },
  trendingSchool: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    textAlign: 'center',
    width: '100%',
  },
  trendingDivider: {
    width: 40,
    height: 2,
    backgroundColor: colors.borders.thick,
    marginVertical: spacing.sm,
  },
  trendingBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  trendingEvent: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    textAlign: 'center',
    width: '100%',
  },
  trendingStat: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
    textAlign: 'center',
  },
  bottomSpacing: {
    height: spacing.bottomSpacing,
  },
  // Latest Results Cards
  latestResultCard: {
    width: 180,
    minHeight: 130,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    justifyContent: 'space-between',
  },
  latestResultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  latestResultBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.performance.newPR,
    letterSpacing: 0.5,
  },
  latestResultMeet: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
    lineHeight: 18,
    flex: 1,
  },
  latestResultBottom: {
    marginTop: 10,
  },
  latestResultDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  latestResultDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary.trackOrange,
  },
  latestResultLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  latestResultLocationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
});
