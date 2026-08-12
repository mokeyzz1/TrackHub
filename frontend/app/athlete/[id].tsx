import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { colors } from '../../design-system/colors';
import { SportsPerformanceCard } from '../../components/ui/SportsPerformanceCard';
import { useFavorites } from '../../contexts/FavoritesContext';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { useAthleteDetails } from '../../hooks/useAthleteDetails';
import { AthleteStatsModal } from '../../components/modals/AthleteStatsModal';
import { AthleteShareCard } from '../../components/share/AthleteShareCard';
import { normalizeEventName, canonicalEventName } from '../../utils/eventNames';

// Helper to check if a date is from Dec 2025+ (clean data from new scraper)
function isCleanDataSeason(dateString: string): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed, so December = 11
  return year > 2025 || (year === 2025 && month >= 11);
}

// Shorten round names for display: "Finals" -> "F", "Preliminaries" -> "P", "Heat 3" -> "H3"
function shortenRound(round: string | null | undefined): string {
  if (!round) return '';
  const r = round.toLowerCase();
  if (r === 'f' || r === 'finals') return 'F';
  if (r === 'p' || r === 'preliminaries') return 'P';
  if (r.startsWith('heat ')) return 'H' + round.replace(/heat /i, '');
  return round;
}

export default function AthleteDetailScreen() {
  const { id } = useLocalSearchParams();
  const athleteId = parseInt(id as string, 10);
  const isValidId = !isNaN(athleteId) && athleteId > 0;
  const { addFavorite, removeFavorite, isFavorite } = useFavorites();
  // Pass -1 for invalid IDs to prevent NaN from reaching the database
  const { athlete, performances, personalRecords, relayParticipations, loading, error } = useAthleteDetails(isValidId ? athleteId : -1);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [seasonDropdownVisible, setSeasonDropdownVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const shareCardRef = useRef<View>(null);

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

    const uniqueEvents = new Set(filteredPerformances.map(p => canonicalEventName(p)));
    const uniqueMeets = new Set(filteredPerformances.map(p => p.meet_name));
    const wins = filteredPerformances.filter(p => p.place === 1).length;

    return {
      events: uniqueEvents.size,
      meets: uniqueMeets.size,
      wins,
    };
  }, [filteredPerformances]);

  // Personal records come directly from the database (is_pr = true)

  // Group results by meet - uses filtered performances
  // Deduplicate: "Heat 3" and "Preliminaries" with same time are the same performance
  // Combine multi-day meets (same meet name, consecutive dates)
  const meetResults = useMemo(() => {
    // Group performances by meet name only (not date) to combine multi-day meets
    const grouped = new Map<string, {
      meetName: string;
      startDate: string;
      endDate: string;
      competedForSchool?: string;
      events: typeof filteredPerformances;
    }>();

    // Priority for rounds: Finals > Preliminaries > Heat X
    // Handles both old ("F", "P") and new ("Finals", "Preliminaries") naming
    const getRoundPriority = (round: string | null | undefined): number => {
      if (!round) return 0;
      const r = round.toLowerCase();
      if (r === 'f' || r.includes('final')) return 3;
      if (r === 'p' || r.includes('prelim')) return 2;
      if (r.includes('heat')) return 1;
      return 0;
    };

    [...filteredPerformances]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(perf => {
        // Group by meet name only
        const meetKey = perf.meet_name;
        if (!grouped.has(meetKey)) {
          grouped.set(meetKey, {
            meetName: perf.meet_name,
            startDate: perf.date,
            endDate: perf.date,
            competedForSchool: perf.competed_for_school,
            events: [],
          });
        }
        const meet = grouped.get(meetKey)!;
        // Update date range
        if (perf.date < meet.startDate) meet.startDate = perf.date;
        if (perf.date > meet.endDate) meet.endDate = perf.date;
        meet.events.push(perf);
      });

    // Deduplicate events within each meet
    // Same event + same time = same performance, keep the one with higher round priority
    for (const meet of grouped.values()) {
      const deduped = new Map<string, typeof filteredPerformances[0]>();

      for (const event of meet.events) {
        // Key: normalized event_name + mark_raw (same event, same time = same performance)
        // Normalize to catch variations like "Men's 200 Meters" vs "200 Meters"
        const key = `${canonicalEventName(event)}|${event.mark_raw}`;
        const existing = deduped.get(key);

        if (!existing) {
          deduped.set(key, event);
        } else {
          // Keep the one with higher round priority (Finals > Preliminaries > Heat)
          if (getRoundPriority(event.round) > getRoundPriority(existing.round)) {
            deduped.set(key, event);
          }
        }
      }

      meet.events = Array.from(deduped.values());
    }

    // Convert to array, sort by most recent, and limit to 10 meets
    return Array.from(grouped.values())
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())
      .slice(0, 10);
  }, [filteredPerformances]);

  // Filter relays by selected season and group by meet
  const relayResults = useMemo(() => {
    let filtered = relayParticipations;
    if (selectedSeason) {
      filtered = relayParticipations.filter(r => new Date(r.date).getFullYear().toString() === selectedSeason);
    }

    // Group by meet
    const grouped = new Map<string, {
      meetName: string;
      date: string;
      relays: typeof filtered;
    }>();

    [...filtered]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(relay => {
        const key = `${relay.meet_name}|${relay.date}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            meetName: relay.meet_name,
            date: relay.date,
            relays: [],
          });
        }
        grouped.get(key)!.relays.push(relay);
      });

    return Array.from(grouped.values()).slice(0, 10);
  }, [relayParticipations, selectedSeason]);

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
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShareModalVisible(true);
              }}
            >
              <Ionicons name="share-outline" size={24} color={colors.primary.trackOrange} />
            </TouchableOpacity>
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
              <Text style={styles.avatarInitials}>
                {athlete.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </Text>
            </View>
            <Text style={styles.athleteName}>{athlete.full_name}</Text>
            <View style={styles.athleteMeta}>
              <TouchableOpacity
                style={styles.metaBadge}
                onPress={() => {
                  if (athlete.school_id) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/school/${athlete.school_id}`);
                  }
                }}
                activeOpacity={athlete.school_id ? 0.7 : 1}
              >
                <Ionicons name="school" size={14} color={colors.text.white} />
                <Text style={styles.metaText}>{athlete.school_name || 'Unknown School'}</Text>
                {athlete.school_id && (
                  <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
                )}
              </TouchableOpacity>
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

        {/* Meet Results - Grouped by Meet */}
        {meetResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Meets ({meetResults.length})</Text>
            {meetResults.map((meet, meetIndex) => (
              <FadeInCard key={`${meet.meetName}-${meet.startDate}`} delay={meetIndex * 100}>
                <View style={styles.meetCard}>
                  {/* Meet Header */}
                  <View style={styles.meetCardHeader}>
                    <Text style={styles.meetCardTitle}>{meet.meetName}</Text>
                    <View style={styles.meetCardMeta}>
                      <Text style={styles.meetCardDate}>
                        {meet.startDate === meet.endDate
                          ? new Date(meet.startDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : `${new Date(meet.startDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric'
                            })} - ${new Date(meet.endDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}`
                        }
                      </Text>
                      {meet.competedForSchool && (
                        <View style={styles.schoolTag}>
                          <Ionicons name="school" size={12} color={colors.text.tertiary} />
                          <Text style={styles.schoolTagText}>{meet.competedForSchool}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Events List */}
                  <View style={styles.meetEventsList}>
                    {meet.events.map((event, eventIndex) => {
                      const canViewResults = isCleanDataSeason(meet.endDate);

                      if (canViewResults) {
                        return (
                          <TouchableOpacity
                            key={`${event.event_name}-${event.round}-${eventIndex}`}
                            style={[
                              styles.meetEventRow,
                              eventIndex === meet.events.length - 1 && styles.meetEventRowLast
                            ]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              router.push({
                                pathname: '/event-results',
                                params: {
                                  meetName: meet.meetName,
                                  eventName: event.event_name,
                                  date: event.date.split('T')[0],
                                  gender: athlete?.gender || '',
                                },
                              });
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.meetEventInfo}>
                              <View style={styles.meetEventNameRow}>
                                <Text style={styles.meetEventName}>{canonicalEventName(event)}</Text>
                                {event.round && (
                                  <View style={styles.roundTag}>
                                    <Text style={styles.roundTagText}>{shortenRound(event.round)}</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.meetEventMark}>{event.mark_raw}</Text>
                            </View>
                            <View style={styles.meetEventRight}>
                              <View style={styles.placeBadgeSmall}>
                                <Text style={styles.placeTextSmall}>{event.place}</Text>
                                <Text style={styles.placeSuffixSmall}>
                                  {event.place === 1 ? 'st' : event.place === 2 ? 'nd' : event.place === 3 ? 'rd' : 'th'}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={colors.text.tertiary} />
                            </View>
                          </TouchableOpacity>
                        );
                      }

                      // Non-clickable row for older data
                      return (
                        <View
                          key={`${event.event_name}-${event.round}-${eventIndex}`}
                          style={[
                            styles.meetEventRow,
                            styles.meetEventRowDisabled,
                            eventIndex === meet.events.length - 1 && styles.meetEventRowLast
                          ]}
                        >
                          <View style={styles.meetEventInfo}>
                            <View style={styles.meetEventNameRow}>
                              <Text style={[styles.meetEventName, styles.meetEventNameDisabled]}>{canonicalEventName(event)}</Text>
                              {event.round && (
                                <View style={styles.roundTag}>
                                  <Text style={styles.roundTagText}>{shortenRound(event.round)}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.meetEventMark, styles.meetEventMarkDisabled]}>{event.mark_raw}</Text>
                          </View>
                          <View style={styles.meetEventRight}>
                            <View style={styles.placeBadgeSmall}>
                              <Text style={styles.placeTextSmall}>{event.place}</Text>
                              <Text style={styles.placeSuffixSmall}>
                                {event.place === 1 ? 'st' : event.place === 2 ? 'nd' : event.place === 3 ? 'rd' : 'th'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </FadeInCard>
            ))}
          </View>
        )}

        {/* Relay Participations */}
        {relayResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Relay Results ({relayResults.length})</Text>
            {relayResults.map((meet, meetIndex) => (
              <FadeInCard key={`relay-${meet.meetName}-${meet.date}`} delay={meetIndex * 100}>
                <View style={styles.meetCard}>
                  {/* Meet Header */}
                  <View style={styles.meetCardHeader}>
                    <Text style={styles.meetCardTitle}>{meet.meetName}</Text>
                    <Text style={styles.meetCardDate}>
                      {new Date(meet.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </Text>
                  </View>

                  {/* Relays List */}
                  <View style={styles.meetEventsList}>
                    {meet.relays.map((relay, relayIndex) => (
                      <View
                        key={`${relay.event_name}-${relay.round}-${relayIndex}`}
                        style={[
                          styles.meetEventRow,
                          relayIndex === meet.relays.length - 1 && styles.meetEventRowLast
                        ]}
                      >
                        <View style={styles.meetEventInfo}>
                          <View style={styles.meetEventNameRow}>
                            <Text style={styles.meetEventName}>{canonicalEventName(relay)}</Text>
                            <View style={styles.legTag}>
                              <Text style={styles.legTagText}>Leg {relay.leg_order}</Text>
                            </View>
                            {relay.round && (
                              <View style={styles.roundTag}>
                                <Text style={styles.roundTagText}>{shortenRound(relay.round)}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.meetEventMark}>{relay.mark_raw}</Text>
                          {relay.teammates.length > 0 && (
                            <Text style={styles.teammatesText}>
                              with {relay.teammates.slice(0, 3).join(', ')}
                            </Text>
                          )}
                        </View>
                        <View style={styles.meetEventRight}>
                          <View style={styles.placeBadgeSmall}>
                            <Text style={styles.placeTextSmall}>{relay.place}</Text>
                            <Text style={styles.placeSuffixSmall}>
                              {relay.place === 1 ? 'st' : relay.place === 2 ? 'nd' : relay.place === 3 ? 'rd' : 'th'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </FadeInCard>
            ))}
          </View>
        )}

        {/* No data message */}
        {filteredPerformances.length === 0 && relayResults.length === 0 && (
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

      {/* Share Modal */}
      <Modal
        visible={shareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.shareModalOverlay}>
          <View style={styles.shareModalContent}>
            <AthleteShareCard
              ref={shareCardRef}
              athleteName={athlete?.full_name || 'Athlete'}
              schoolName={athlete?.school_name || 'Unknown School'}
              division={athlete?.division}
              prs={personalRecords.map(pr => ({
                event_name: pr.event_name, // already canonical from getAthletePRs
                mark_raw: pr.mark_raw
              }))}
            />
            <View style={styles.shareButtonsRow}>
              <TouchableOpacity
                style={styles.shareActionButton}
                onPress={async () => {
                  try {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const uri = await captureRef(shareCardRef, {
                      format: 'png',
                      quality: 1,
                    });
                    await Sharing.shareAsync(uri, {
                      mimeType: 'image/png',
                      dialogTitle: `Share ${athlete?.full_name}'s Profile`,
                    });
                  } catch (error) {
                    Alert.alert('Error', 'Could not share image');
                  }
                }}
              >
                <Ionicons name="share-social" size={20} color={colors.text.white} />
                <Text style={styles.shareActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShareModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
  avatarInitials: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text.white,
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
  // Meet Card - Grouped results by meet
  meetCard: {
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    overflow: 'hidden',
  },
  meetCardHeader: {
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.thick,
  },
  meetCardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  meetCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  meetCardDate: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  schoolTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borders.medium,
  },
  schoolTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  meetEventsList: {
    paddingVertical: 4,
  },
  meetEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
  },
  meetEventRowLast: {
    borderBottomWidth: 0,
  },
  meetEventRowDisabled: {
    opacity: 0.6,
  },
  meetEventNameDisabled: {
    color: colors.text.tertiary,
  },
  meetEventMarkDisabled: {
    color: colors.text.tertiary,
  },
  meetEventInfo: {
    flex: 1,
  },
  meetEventNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  meetEventName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  meetEventMark: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
  },
  meetEventRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  placeTextSmall: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  placeSuffixSmall: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.secondary,
    marginLeft: 1,
  },

  // Legacy result card styles (kept for reference)
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
  resultContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLeft: {
    flex: 1,
  },
  resultEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  resultEvent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  roundTag: {
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borders.medium,
  },
  roundTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  legTag: {
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borders.thick,
  },
  legTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.white,
  },
  teammatesText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
    marginTop: 4,
    fontStyle: 'italic',
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
  // Header buttons (share + follow)
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareButton: {
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
  // Share modal styles
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  shareModalContent: {
    alignItems: 'center',
    gap: 20,
  },
  shareButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  shareActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  shareActionText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.white,
  },
  cancelButton: {
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
});
