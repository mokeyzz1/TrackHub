import React, { useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { colors } from '../../design-system/colors';
import { SportsPerformanceCard } from '../../components/ui/SportsPerformanceCard';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { useAthleteSearch } from '../../hooks/useAthleteSearch';
import { useAthletes } from '../../hooks/useAthletes';

// Map filter names to database values
function getFilterParams(filter: string): { gender?: string; division?: string } {
  switch (filter) {
    case 'Men':
      return { gender: 'M' };
    case 'Women':
      return { gender: 'F' };
    case 'D1':
      return { division: 'DI' };
    case 'D2':
      return { division: 'DII' };
    case 'D3':
      return { division: 'DIII' };
    default:
      return {};
  }
}

export default function AthletesScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  // Get filter params based on selected filter
  const filterParams = getFilterParams(selectedFilter);

  // Load athletes with filter
  const { athletes: allAthletes, loading: loadingAll, error: errorAll, loadMore, hasMore, totalCount, refresh } = useAthletes(50, filterParams.gender, filterParams.division);

  const onRefresh = async () => {
    setRefreshing(true);
    refresh();
    // Give it a moment to reload
    setTimeout(() => setRefreshing(false), 1000);
  };

  // Search athletes when query is entered
  const { athletes: searchResults, loading: loadingSearch, error: errorSearch, search } = useAthleteSearch();

  // Use search results if searching, otherwise show all athletes
  const isSearching = searchQuery.length >= 2;
  const athletes = isSearching ? searchResults : allAthletes;
  const loading = isSearching ? loadingSearch : loadingAll;
  const error = isSearching ? errorSearch : errorAll;

  // Trigger search when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        search(searchQuery, 50);
      }
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  const filters = ['All', 'Men', 'Women', 'D1', 'D2', 'D3'];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
          <Text style={styles.title}>Athletes</Text>
          <Text style={styles.subtitle}>Track the best performers</Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search athletes..."
              placeholderTextColor={colors.text.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterChip, selectedFilter === filter && styles.filterChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedFilter(filter);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>
                {filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Athletes</Text>
          <Text style={styles.countText}>{isSearching ? athletes.length : totalCount.toLocaleString()} athletes</Text>
        </View>

        {/* Athletes List using new SportsPerformanceCard */}
        <View style={styles.athletesList}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary.trackOrange} />
              <Text style={styles.loadingText}>{isSearching ? 'Searching...' : 'Loading athletes...'}</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Error loading athletes</Text>
            </View>
          ) : athletes.length === 0 && isSearching ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="person-outline" size={48} color={colors.text.tertiary} />
              <Text style={styles.emptyText}>No athletes found</Text>
              <Text style={styles.emptySubtext}>Try a different search term</Text>
            </View>
          ) : (
            <>
              {athletes.map((athlete, index) => (
                <FadeInCard key={athlete.athlete_id} delay={Math.min(index * 20, 1000)}>
                  <SportsPerformanceCard
                    athleteName={athlete.full_name}
                    schoolName={athlete.school_name || 'Unknown School'}
                    event={`${athlete.gender === 'F' ? "Women's" : "Men's"} Track & Field`}
                    time={athlete.division || ''}
                    onPress={() => router.push(`/athlete/${athlete.athlete_id}`)}
                  />
                </FadeInCard>
              ))}
              {!isSearching && hasMore && !loading && (
                <TouchableOpacity
                  style={styles.loadMoreButton}
                  onPress={loadMore}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loadMoreText}>Load More Athletes</Text>
                  <Ionicons name="arrow-down" size={20} color={colors.primary.trackOrange} />
                </TouchableOpacity>
              )}
            </>
          )}
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
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    // Hard shadow (cartoon style)
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 52,
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  filterScroll: {
    marginBottom: 24,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 10,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  filterChipActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  filterText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
  },
  filterTextActive: {
    color: colors.text.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
    textShadowColor: colors.backgrounds.white,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  countText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary.trackOrange,
  },
  athletesList: {
    paddingHorizontal: 20,
  },
  bottomSpacing: {
    height: 100,
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
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.semantic.error,
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
  loadMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgrounds.white,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    marginTop: 16,
    gap: 8,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  loadMoreText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary.trackOrange,
  },
});
