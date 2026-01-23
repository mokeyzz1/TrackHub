import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../design-system/colors';
import { SportsPerformanceCard } from '../../components/ui/SportsPerformanceCard';
import { FadeInCard } from '../../components/animations/FadeInCard';

export default function SchoolDetailScreen() {
  const { id } = useLocalSearchParams();

  const school = {
    name: 'University of Oregon',
    division: 'D1',
    conference: 'Pac-12',
    location: 'Eugene, OR',
    rank: 1,
    topAthletes: [
      { name: 'Sarah Johnson', event: "Women's 800m", time: '2:02.15', badge: 'SR' as const },
      { name: 'Marcus Thompson', event: "Men's 400m", time: '45.89', badge: 'PR' as const },
    ],
    recentMeets: [
      { meet: 'NCAA Championships', finish: '1st', points: 124 },
      { meet: 'Pac-12 Championships', finish: '1st', points: 156 },
    ],
  };

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
          <Text style={styles.headerTitle}>School Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={colors.gradients.goldMedal as any}
            style={styles.heroGradient}
          >
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>#{school.rank}</Text>
            </View>
            <Text style={styles.schoolName}>{school.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>{school.division}</Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaText}>{school.conference}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>45</Text>
            <Text style={styles.statLabel}>Athletes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>8</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>12</Text>
            <Text style={styles.statLabel}>Titles</Text>
          </View>
        </View>

        {/* Top Athletes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Athletes</Text>
          <View style={styles.athletesList}>
            {school.topAthletes.map((athlete, i) => (
              <FadeInCard key={i} delay={i * 100}>
                <SportsPerformanceCard
                  rank={i + 1}
                  athleteName={athlete.name}
                  schoolName={school.name}
                  event={athlete.event}
                  time={athlete.time}
                  badge={athlete.badge}
                  onPress={() => router.push('/athlete/1')}
                />
              </FadeInCard>
            ))}
          </View>
        </View>

        {/* Recent Meets */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Meets</Text>
          {school.recentMeets.map((meet, i) => (
            <FadeInCard key={i} delay={i * 100}>
              <View style={styles.meetCard}>
                <View style={styles.meetHeader}>
                  <Text style={styles.meetName}>{meet.meet}</Text>
                  <View style={styles.finishBadge}>
                    <Text style={styles.finishText}>{meet.finish}</Text>
                  </View>
                </View>
                <Text style={styles.meetPoints}>{meet.points} Points</Text>
              </View>
            </FadeInCard>
          ))}
        </View>

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
  rankBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: colors.text.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  rankText: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.white,
  },
  schoolName: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.white,
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.text.white,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '900',
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
  athletesList: {
    paddingHorizontal: 20,
  },
  meetCard: {
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
  meetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  meetName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    flex: 1,
  },
  finishBadge: {
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  finishText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.white,
  },
  meetPoints: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
  },
  bottomSpacing: {
    height: 100,
  },
});
