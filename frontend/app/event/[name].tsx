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

export default function EventDetailScreen() {
  const { name } = useLocalSearchParams();

  const event = {
    name: "Women's 800m",
    worldRecord: '1:53.28',
    wrHolder: 'Jarmila Kratochvílová',
    collegiateRecord: '1:59.10',
    crHolder: 'Raevyn Rogers',
    topPerformers: [
      { name: 'Sarah Johnson', school: 'Oregon State', time: '2:02.15', badge: 'SR' as const, rank: 1 },
      { name: 'Emma Davis', school: 'UCLA', time: '2:03.45', badge: 'PR' as const, rank: 2 },
      { name: 'Lisa Martinez', school: 'Stanford', time: '2:04.12', badge: 'SB' as const, rank: 3 },
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
          <Text style={styles.headerTitle}>Event Leaderboard</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#4A90E2', '#64B5F6'] as any}
            style={styles.heroGradient}
          >
            <View style={styles.eventIcon}>
              <Ionicons name="speedometer" size={40} color={colors.text.white} />
            </View>
            <Text style={styles.eventName}>{event.name}</Text>
          </LinearGradient>
        </View>

        {/* Records */}
        <View style={styles.recordsRow}>
          <View style={styles.recordCard}>
            <View style={styles.recordBadge}>
              <Ionicons name="globe" size={20} color={colors.text.white} />
            </View>
            <Text style={styles.recordLabel}>World Record</Text>
            <Text style={styles.recordTime}>{event.worldRecord}</Text>
            <Text style={styles.recordHolder}>{event.wrHolder}</Text>
          </View>
          <View style={styles.recordCard}>
            <View style={styles.recordBadge}>
              <Ionicons name="school" size={20} color={colors.text.white} />
            </View>
            <Text style={styles.recordLabel}>Collegiate Record</Text>
            <Text style={styles.recordTime}>{event.collegiateRecord}</Text>
            <Text style={styles.recordHolder}>{event.crHolder}</Text>
          </View>
        </View>

        {/* Leaderboard */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performers</Text>
          <View style={styles.leaderboardList}>
            {event.topPerformers.map((performer, i) => (
              <FadeInCard key={i} delay={i * 100}>
                <SportsPerformanceCard
                  rank={performer.rank}
                  athleteName={performer.name}
                  schoolName={performer.school}
                  event={event.name}
                  time={performer.time}
                  badge={performer.badge}
                  onPress={() => router.push('/athlete/1')}
                />
              </FadeInCard>
            ))}
          </View>
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
    padding: 40,
    alignItems: 'center',
  },
  eventIcon: {
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
  eventName: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.white,
    textAlign: 'center',
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  recordsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  recordCard: {
    flex: 1,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 16,
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  recordBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary.duffPink,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  recordLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  recordTime: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
    marginBottom: 6,
  },
  recordHolder: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textAlign: 'center',
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
  leaderboardList: {
    paddingHorizontal: 20,
  },
  bottomSpacing: {
    height: 100,
  },
});
