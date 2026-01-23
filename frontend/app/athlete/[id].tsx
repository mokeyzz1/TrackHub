import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../design-system/colors';
import { SportsPerformanceCard } from '../../components/ui/SportsPerformanceCard';
import { useFavorites } from '../../contexts/FavoritesContext';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { useAthleteDetails } from '../../hooks/useAthleteDetails';
import { AthleteStatsModal } from '../../components/modals/AthleteStatsModal';

export default function AthleteDetailScreen() {
  const { id } = useLocalSearchParams();
  const athleteId = parseInt(id as string);
  const { addFavorite, removeFavorite, isFavorite } = useFavorites();
  const { athlete, performances, loading, error } = useAthleteDetails(athleteId);
  const [statsModalVisible, setStatsModalVisible] = useState(false);

  // Calculate stats from performances
  const stats = useMemo(() => {
    if (!performances.length) return { events: 0, meets: 0, wins: 0 };

    const uniqueEvents = new Set(performances.map(p => p.event_name));
    const uniqueMeets = new Set(performances.map(p => p.meet_name));
    const wins = performances.filter(p => p.place === 1).length;

    return {
      events: uniqueEvents.size,
      meets: uniqueMeets.size,
      wins,
    };
  }, [performances]);

  // Get personal bests (best mark per event)
  const personalBests = useMemo(() => {
    if (!performances.length) return [];

    const eventBests = new Map();
    performances.forEach(perf => {
      const existing = eventBests.get(perf.event_name);
      if (!existing || (perf.mark_seconds && (!existing.mark_seconds || perf.mark_seconds < existing.mark_seconds))) {
        eventBests.set(perf.event_name, perf);
      }
    });

    return Array.from(eventBests.values()).slice(0, 5);
  }, [performances]);

  // Get recent results (last 10)
  const recentResults = useMemo(() => {
    return performances
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [performances]);

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

  if (error || !athlete) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Ionicons name="person-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.errorText}>Failed to load athlete</Text>
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
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>
                  {athlete.class_year || 'N/A'} • {athlete.division || 'N/A'}
                </Text>
              </View>
              {athlete.hometown && (
                <View style={styles.metaBadge}>
                  <Ionicons name="location" size={14} color={colors.text.white} />
                  <Text style={styles.metaText}>{athlete.hometown}</Text>
                </View>
              )}
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
        {performances.length === 0 && (
          <View style={styles.section}>
            <View style={styles.errorContainer}>
              <Ionicons name="podium-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.errorText}>No performance data available</Text>
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
        performances={performances}
      />
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
});
