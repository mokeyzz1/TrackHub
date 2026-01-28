import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../design-system/colors';
import { SportsPerformanceCard } from '../../components/ui/SportsPerformanceCard';
import { useFavorites } from '../../contexts/FavoritesContext';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { useAthleteDetails } from '../../hooks/useAthleteDetails';
import { AthleteStatsModal } from '../../components/modals/AthleteStatsModal';

export default function AthleteDetailScreen() {
  const { id } = useLocalSearchParams();
  const athleteId = parseInt(id as string, 10);
  const isValidId = !isNaN(athleteId) && athleteId > 0;
  const { addFavorite, removeFavorite, isFavorite } = useFavorites();
  // Pass -1 for invalid IDs to prevent NaN from reaching the database
  const { athlete, performances, personalRecords, loading, error } = useAthleteDetails(isValidId ? athleteId : -1);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [seasonDropdownVisible, setSeasonDropdownVisible] = useState(false);

  // Get available seasons (years) from performances
  const availableSeasons = useMemo(() => {
    if (!performances.length) return [];
    const years = new Set(performances.map(p => new Date(p.date).getFullYear().toString()));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)); // Most recent first
  }, [performances]);

  // Filter performances by selected season
  const filteredPerformances = useMemo(() => {
    if (!selectedSeason) return performances;
    return performances.filter(p => new Date(p.date).getFullYear().toString() === selectedSeason);
  }, [performances, selectedSeason]);

  // Calculate stats from filtered performances
  const stats = useMemo(() => {
    if (!filteredPerformances.length) return { events: 0, meets: 0, wins: 0 };

    const uniqueEvents = new Set(filteredPerformances.map(p => p.event_name));
    const uniqueMeets = new Set(filteredPerformances.map(p => p.meet_name));
    const wins = filteredPerformances.filter(p => p.place === 1).length;

    return {
      events: uniqueEvents.size,
      meets: uniqueMeets.size,
      wins,
    };
  }, [filteredPerformances]);

  // Personal records come directly from the database (is_pr = true)

  // Get recent results (last 10) - uses filtered performances
  const recentResults = useMemo(() => {
    return [...filteredPerformances]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [filteredPerformances]);

  const isFollowing = athlete ? isFavorite(athlete.athlete_id.toString(), 'athlete') : false;

  const handleFollowToggle = () => {
    if (!athlete) return;

    Haptics.impactAsync(
      isFollowing ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );
    if (isFollowing) {
      removeFavorite(athlete.athlete_id.toString(), 'athlete');
    } else {
      addFavorite({
        id: athlete.athlete_id.toString(),
        type: 'athlete',
        name: athlete.full_name,
        metadata: { school: athlete.school_name },
      });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary.trackOrange} />
          <Text style={styles.loadingText}>Loading athlete...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isValidId || error || !athlete) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Ionicons name="person-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.errorText}>
            {!isValidId ? 'Invalid athlete ID' : 'Failed to load athlete'}
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header with Back Button */}
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
          <Text style={styles.headerTitle}>Athlete Profile</Text>
          <TouchableOpacity
            style={[styles.followButton, isFollowing && styles.followButtonActive]}
            onPress={handleFollowToggle}
          >
            <Ionicons
              name={isFollowing ? "heart" : "heart-outline"}
              size={24}
              color={isFollowing ? colors.text.white : colors.primary.trackOrange}
            />
          </TouchableOpacity>
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={colors.gradients.trackHero as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.athleteAvatar}>
              <Ionicons name="person" size={48} color={colors.text.white} />
            </View>
            <Text style={styles.athleteName}>{athlete.full_name}</Text>
            <View style={styles.athleteMeta}>
              <View style={styles.metaBadge}>
                <Ionicons name="school" size={14} color={colors.text.white} />
                <Text style={styles.metaText}>{athlete.school_name || 'Unknown School'}</Text>
              </View>
              {(athlete.city || athlete.state) && (
                <View style={styles.metaBadge}>
                  <Ionicons name="location" size={14} color={colors.text.white} />
                  <Text style={styles.metaText}>
                    {[athlete.city, athlete.state].filter(Boolean).join(', ')}
                  </Text>
                </View>
              )}
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>
                  {[athlete.class_year, athlete.division].filter(Boolean).join(' • ') || 'N/A'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.events}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.meets}</Text>
            <Text style={styles.statLabel}>Meets</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>
        </View>

        {/* Detailed Stats Button */}
        <View style={styles.statsButtonContainer}>
          <TouchableOpacity
            style={styles.statsButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStatsModalVisible(true);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.statsButtonIcon}>
              <Ionicons name="stats-chart" size={24} color={colors.primary.trackOrange} />
            </View>
            <View style={styles.statsButtonContent}>
              <Text style={styles.statsButtonTitle}>Detailed Stats</Text>
              <Text style={styles.statsButtonSubtitle}>Personal Records, Season Bests & Progression</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* Compare Athletes Button */}
        <View style={styles.compareButtonContainer}>
          <TouchableOpacity
            style={styles.compareButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(`/compare-athletes?athleteId=${id}`);
            }}
            activeOpacity={0.85}
          >
            <View style={styles.compareButtonIcon}>
              <Ionicons name="git-compare" size={24} color={colors.primary.trackOrange} />
            </View>
            <View style={styles.compareButtonContent}>
              <Text style={styles.compareButtonTitle}>Compare Athletes</Text>
              <Text style={styles.compareButtonSubtitle}>See how athletes stack up</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* Season Filter */}
        {availableSeasons.length > 0 && (
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={styles.filterDropdown}
              onPress={() => setSeasonDropdownVisible(true)}
            >
              <Text style={styles.filterDropdownText}>
                {selectedSeason ? `${selectedSeason} Season` : 'All Seasons'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Results */}
        {recentResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Results ({recentResults.length})</Text>
            {recentResults.map((result, i) => (
              <FadeInCard key={i} delay={i * 100}>
                <View style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultMeet}>{result.meet_name}</Text>
                    <View style={styles.placeBadge}>
                      <Text style={styles.placeText}>{result.place}</Text>
                      <Text style={styles.placeSuffix}>
                        {result.place === 1 ? 'st' : result.place === 2 ? 'nd' : result.place === 3 ? 'rd' : 'th'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.resultEvent}>{result.event_name}</Text>
                  <Text style={styles.resultTime}>{result.mark_raw}</Text>
                  <Text style={styles.pbWhen}>{new Date(result.date).toLocaleDateString()}</Text>
                </View>
              </FadeInCard>
            ))}
          </View>
        )}

        {/* No data message */}
        {filteredPerformances.length === 0 && (
          <View style={styles.section}>
            <View style={styles.errorContainer}>
              <Ionicons name="podium-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.errorText}>
                {selectedSeason ? `No results for ${selectedSeason} season` : 'No performance data available'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* Stats Modal */}
      <AthleteStatsModal
        visible={statsModalVisible}
        onClose={() => setStatsModalVisible(false)}
        athleteName={athlete?.full_name || 'Athlete'}
        performances={filteredPerformances}
        personalRecords={personalRecords}
      />

      {/* Season Filter Modal */}
      <Modal
        visible={seasonDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSeasonDropdownVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSeasonDropdownVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Season</Text>
            <TouchableOpacity
              style={[styles.modalOption, !selectedSeason && styles.modalOptionSelected]}
              onPress={() => {
                setSelectedSeason(null);
                setSeasonDropdownVisible(false);
              }}
            >
              <Text style={[styles.modalOptionText, !selectedSeason && styles.modalOptionTextSelected]}>
                All Seasons
              </Text>
              {!selectedSeason && <Ionicons name="checkmark" size={20} color={colors.primary.trackOrange} />}
            </TouchableOpacity>
            {availableSeasons.map(season => (
              <TouchableOpacity
                key={season}
                style={[styles.modalOption, selectedSeason === season && styles.modalOptionSelected]}
                onPress={() => {
                  setSelectedSeason(season);
                  setSeasonDropdownVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, selectedSeason === season && styles.modalOptionTextSelected]}>
                  {season} Season
                </Text>
                {selectedSeason === season && <Ionicons name="checkmark" size={20} color={colors.primary.trackOrange} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  followButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.primary.trackOrange,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  followButtonActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  chartSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  heroGradient: {
    padding: 32,
    alignItems: 'center',
  },
  athleteAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: colors.text.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  athleteName: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.white,
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  athleteMeta: {
    gap: 8,
    alignItems: 'center',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.text.white,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.white,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 16,
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.tertiary,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
    paddingHorizontal: 20,
    marginBottom: 16,
    textShadowColor: colors.backgrounds.white,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  pbCard: {
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 18,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  pbHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pbEvent: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.tertiary,
  },
  recordBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  recordBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
  },
  pbTime: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
    marginBottom: 4,
  },
  pbWhen: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.muted,
  },
  performancesList: {
    paddingHorizontal: 20,
  },
  resultCard: {
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultMeet: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    flex: 1,
  },
  placeBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  placeText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.white,
  },
  placeSuffix: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.white,
    marginLeft: 2,
  },
  resultEvent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginBottom: 6,
  },
  resultTime: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  statsButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  statsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    gap: 14,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  statsButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsButtonContent: {
    flex: 1,
  },
  statsButtonTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  statsButtonSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  compareButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  compareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    gap: 14,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  compareButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareButtonContent: {
    flex: 1,
  },
  compareButtonTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  compareButtonSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  bottomSpacing: {
    height: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.white,
  },
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  filterDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  filterDropdownText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  modalOptionSelected: {
    backgroundColor: colors.backgrounds.cream,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  modalOptionTextSelected: {
    fontWeight: '800',
    color: colors.text.primary,
  },
});
