import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../design-system/colors';
import { FadeInCard } from '../components/animations/FadeInCard';
import { AnimatedCard } from '../components/animations/AnimatedCard';
import { useAthleteSearch } from '../hooks/useAthleteSearch';
import { useSchoolSearch } from '../hooks/useSchoolSearch';

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const { athletes, loading: athletesLoading, search: searchAthletes } = useAthleteSearch();
  const { schools, loading: schoolsLoading, search: searchSchools } = useSchoolSearch();

  const loading = athletesLoading || schoolsLoading;

  // Trigger search when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchAthletes(searchQuery, 10);
        searchSchools(searchQuery, 10);
      }
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [searchQuery, searchAthletes, searchSchools]);

  const recentSearches = ['Sarah Johnson', 'Oregon State', "Women's 800m", 'Pac-12'];
  const popularSearches = ['NCAA Championships', 'Top 100m Sprinters', 'D1 Rankings'];

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
          <Text style={styles.title}>Search</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={24} color={colors.text.tertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Athletes, schools, events..."
              placeholderTextColor={colors.text.muted}
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

        {/* Search Results or Recent Searches */}
        {searchQuery.length >= 2 ? (
          <>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary.trackOrange} />
                <Text style={styles.loadingText}>Searching...</Text>
              </View>
            ) : (
              <>
                {/* Athletes Results */}
                {athletes.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Athletes</Text>
                    {athletes.map((athlete, i) => (
                      <FadeInCard key={athlete.athlete_id} delay={i * 50}>
                        <AnimatedCard
                          style={styles.searchItem}
                          onPress={() => router.push(`/athlete/${athlete.athlete_id}`)}
                        >
                          <View style={styles.searchItemIcon}>
                            <Ionicons name="person" size={20} color={colors.primary.trackOrange} />
                          </View>
                          <View style={styles.searchItemContent}>
                            <Text style={styles.searchItemText}>{athlete.full_name}</Text>
                            <Text style={styles.searchItemSubtext}>
                              {athlete.school_name} • {athlete.class_year || 'N/A'}
                            </Text>
                          </View>
                          <Ionicons name="arrow-forward" size={18} color={colors.text.muted} />
                        </AnimatedCard>
                      </FadeInCard>
                    ))}
                  </View>
                )}

                {/* Schools Results */}
                {schools.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Schools</Text>
                    {schools.map((school, i) => (
                      <FadeInCard key={school.school_id} delay={i * 50}>
                        <AnimatedCard
                          style={styles.searchItem}
                          onPress={() => router.push(`/school/${school.school_id}`)}
                        >
                          <View style={styles.searchItemIcon}>
                            <Ionicons name="school" size={20} color={colors.primary.finishYellow} />
                          </View>
                          <View style={styles.searchItemContent}>
                            <Text style={styles.searchItemText}>{school.official_name}</Text>
                            <Text style={styles.searchItemSubtext}>
                              {school.city ? `${school.city}, ` : ''}{school.state} • {school.division}
                            </Text>
                          </View>
                          <Ionicons name="arrow-forward" size={18} color={colors.text.muted} />
                        </AnimatedCard>
                      </FadeInCard>
                    ))}
                  </View>
                )}

                {/* No Results */}
                {athletes.length === 0 && schools.length === 0 && (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="search-outline" size={48} color={colors.text.tertiary} />
                    <Text style={styles.emptyText}>No results found</Text>
                    <Text style={styles.emptySubtext}>Try a different search term</Text>
                  </View>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Searches</Text>
              {recentSearches.map((search, i) => (
                <FadeInCard key={i} delay={i * 80}>
                  <AnimatedCard style={styles.searchItem}>
                    <View style={styles.searchItemIcon}>
                      <Ionicons name="time" size={20} color={colors.text.tertiary} />
                    </View>
                    <View style={styles.searchItemContent}>
                      <Text style={styles.searchItemText}>{search}</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={18} color={colors.text.muted} />
                  </AnimatedCard>
                </FadeInCard>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Popular Searches</Text>
              <View style={styles.popularGrid}>
                {popularSearches.map((search, i) => (
                  <FadeInCard key={i} delay={i * 100}>
                    <TouchableOpacity
                      style={styles.popularChip}
                      onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trending-up" size={16} color={colors.primary.trackOrange} />
                      <Text style={styles.popularText}>{search}</Text>
                    </TouchableOpacity>
                  </FadeInCard>
                ))}
              </View>
            </View>
          </>
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
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 56,
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '600',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    paddingHorizontal: 20,
    marginBottom: 16,
    textShadowColor: colors.backgrounds.white,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  searchItemIcon: {
    marginRight: 12,
  },
  searchItemContent: {
    flex: 1,
  },
  searchItemText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  searchItemSubtext: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.tertiary,
    marginTop: 2,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  popularGrid: {
    paddingHorizontal: 20,
    gap: 10,
  },
  popularChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  popularText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
  },
  bottomSpacing: {
    height: 100,
  },
});
