import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { colors } from '../../design-system/colors';
import { supabase } from '../../lib/supabase';
import { getEventsByMeetWithGender } from '../../services/database-supabase';

// Helper to check if a date is from Dec 2025+ (clean data from new scraper)
function isCleanDataSeason(dateString: string): boolean {
  if (!dateString) return false;
  const [year, month] = dateString.split('T')[0].split('-').map(Number);
  return year > 2025 || (year === 2025 && month >= 12);
}

interface Meet {
  meet_id: number;
  name: string;
  date: string;
  location: string;
  meet_url: string | null;
  status: string;
  level: string;
  season: string;
}

export default function MeetDetailScreen() {
  const { id, meetName: paramMeetName, meetDate: paramMeetDate } = useLocalSearchParams<{
    id: string;
    meetName?: string;
    meetDate?: string;
  }>();
  const [meet, setMeet] = useState<Meet | null>(null);
  const [relatedMeets, setRelatedMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);

  // For meets not in database, use params directly
  const [fallbackMeetName, setFallbackMeetName] = useState<string | null>(null);
  const [fallbackMeetDate, setFallbackMeetDate] = useState<string | null>(null);

  // Events data for past meets
  const [mensEvents, setMensEvents] = useState<string[]>([]);
  const [womensEvents, setWomensEvents] = useState<string[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedGender, setSelectedGender] = useState<'M' | 'F'>('M');

  // Check if id is a valid number (not 'fallback')
  const isValidId = id && !isNaN(Number(id));

  useEffect(() => {
    fetchMeet();
    if (isValidId) {
      fetchRelatedMeets();
    }
  }, [id, paramMeetName, paramMeetDate]);

  async function fetchMeet() {
    try {
      setLoading(true);
      setError(null);

      // If we have meetName param (for meets not in database), use fallback mode
      if (paramMeetName) {
        setFallbackMeetName(paramMeetName);
        setFallbackMeetDate(paramMeetDate || null);
        setMeet(null);
        setLoading(false);
        return;
      }

      // Skip database query if id is not a valid number
      if (!isValidId) {
        setError('Invalid meet ID');
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('meets')
        .select('*')
        .eq('meet_id', id)
        .single();

      if (fetchError) throw fetchError;

      setMeet(data);
    } catch (err) {
      console.error('Error fetching meet:', err);
      setError('Meet not found');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRelatedMeets() {
    if (!isValidId) return;

    try {
      // Get today's date as YYYY-MM-DD string (local timezone)
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Get upcoming meets (today or later), excluding current meet
      const { data, error: fetchError } = await supabase
        .from('meets')
        .select('*')
        .neq('meet_id', id)
        .gte('date', todayStr)
        .order('date', { ascending: true })
        .limit(10);

      if (fetchError) throw fetchError;

      setRelatedMeets(data || []);
    } catch (err) {
      console.error('Error fetching related meets:', err);
    }
  }

  // Fetch events when meet is loaded and is a past meet, or in fallback mode
  useEffect(() => {
    if (meet) {
      const status = getMeetStatus(meet);
      if (status === 'past') {
        fetchMeetEvents();
      }
    } else if (fallbackMeetName && fallbackMeetDate) {
      // Fallback mode - fetch events using meetName directly
      fetchMeetEvents();
    }
  }, [meet, fallbackMeetName, fallbackMeetDate]);

  async function fetchMeetEvents() {
    const name = meet?.name || fallbackMeetName;
    const dateStr = meet?.date?.split('T')[0] || fallbackMeetDate;
    const meetId = meet?.meet_id;

    if (!name || !dateStr) return;

    try {
      setEventsLoading(true);

      const eventsData = await getEventsByMeetWithGender(name, dateStr, meetId);

      setMensEvents(sortEvents(eventsData.mens));
      setWomensEvents(sortEvents(eventsData.womens));
    } catch (err) {
      console.error('Error fetching meet events:', err);
    } finally {
      setEventsLoading(false);
    }
  }

  // Sort events in proper track order
  function sortEvents(events: string[]): string[] {
    // Helper to get sort order from event name
    function getEventOrder(eventName: string): number {
      const e = eventName.toUpperCase().trim();

      // Sprints
      if (e === '60' || e === '60M' || e === '60 METERS') return 1;
      if (e === '100' || e === '100M' || e === '100 METERS') return 2;
      if (e === '200' || e === '200M' || e === '200 METERS') return 3;
      if (e === '400' || e === '400M' || e === '400 METERS') return 4;

      // Middle Distance
      if (e === '600' || e === '600M' || e === '600 METERS' || e.includes('600 YARD')) return 10;
      if (e === '800' || e === '800M' || e === '800 METERS') return 11;
      if (e === '1000' || e === '1000M' || e === '1000 METERS') return 12;
      if (e === '1500' || e === '1500M' || e === '1500 METERS') return 13;
      if (e === 'MILE' || e === '1 MILE') return 14;

      // Distance
      if (e === '3000' || e === '3000M' || e === '3000 METERS') return 20;
      if (e.includes('STEEPLE') || e === '3000SC' || e === '3000S') return 21;
      if (e === '5000' || e === '5000M' || e === '5000 METERS' || e === '5K') return 22;
      if (e === '10000' || e === '10000M' || e === '10000 METERS' || e === '10K') return 23;

      // Hurdles
      if (e === '60H' || e === '60 HURDLES' || e === '60M HURDLES' || e === '60 METER HURDLES') return 30;
      if (e === '100H' || e === '100 HURDLES' || e === '100M HURDLES' || e === '100 METER HURDLES') return 31;
      if (e === '110H' || e === '110 HURDLES' || e === '110M HURDLES' || e === '110 METER HURDLES') return 32;
      if (e === '400H' || e === '400 HURDLES' || e === '400M HURDLES' || e === '400 METER HURDLES') return 33;

      // Relays
      if (e.includes('4X100') || e.includes('4 X 100')) return 40;
      if (e.includes('4X200') || e.includes('4 X 200')) return 41;
      if (e.includes('4X400') || e.includes('4 X 400')) return 42;
      if (e.includes('4X800') || e.includes('4 X 800')) return 43;
      if (e === 'DMR' || e.includes('DISTANCE MEDLEY')) return 44;
      if (e === 'SMR' || e.includes('SPRINT MEDLEY')) return 45;

      // Field Events - Jumps
      if (e === 'HJ' || e === 'HIGH JUMP' || e.includes('HIGH JUMP')) return 50;
      if (e === 'PV' || e === 'POLE VAULT' || e.includes('POLE VAULT')) return 51;
      if (e === 'LJ' || e === 'LONG JUMP') return 52;
      if (e === 'TJ' || e === 'TRIPLE JUMP') return 53;

      // Field Events - Throws
      if (e === 'SP' || e === 'SHOT PUT') return 60;
      if (e === 'DT' || e === 'DISCUS') return 61;
      if (e === 'HT' || e === 'HAMMER' || e === 'HAMMER THROW') return 62;
      if (e === 'JT' || e === 'JAVELIN') return 63;
      if (e === 'WT' || e === 'WEIGHT THROW') return 64;

      // Multi-Events
      if (e === 'HEPT' || e === 'HEPTATHLON') return 70;
      if (e === 'DEC' || e === 'DECATHLON') return 71;
      if (e === 'PENT' || e === 'PENTATHLON') return 72;

      return 100; // Unknown events at end
    }

    return [...events].sort((a, b) => {
      const aOrder = getEventOrder(a);
      const bOrder = getEventOrder(b);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.localeCompare(b);
    });
  }

  // Format event name for display (e.g., "100" → "100 Meters", "110H" → "110 Meter Hurdles")
  function formatEventName(event: string): string {
    const e = event.toUpperCase().trim();

    // Track events (distance only)
    if (/^\d+$/.test(e)) {
      return `${e} Meters`;
    }
    if (/^\d+M$/.test(e)) {
      return `${e.slice(0, -1)} Meters`;
    }

    // Hurdles
    if (/^\d+H$/.test(e)) {
      return `${e.slice(0, -1)} Meter Hurdles`;
    }
    if (/^\d+M HURDLES$/.test(e)) {
      return `${e.replace('M HURDLES', '')} Meter Hurdles`;
    }

    // Relays
    if (/^4X\d+$/.test(e)) {
      return `4x${e.slice(2)} Meter Relay`;
    }
    if (/^4X\d+M$/.test(e)) {
      return `4x${e.slice(2, -1)} Meter Relay`;
    }

    // Steeplechase
    if (e === '3000SC' || e === '3000S' || e === '3K STEEPLE') {
      return '3000 Meter Steeplechase';
    }
    if (e === 'STEEPLE') {
      return 'Steeplechase';
    }

    // Field events
    const fieldEvents: Record<string, string> = {
      'HJ': 'High Jump',
      'HIGH JUMP': 'High Jump',
      'PV': 'Pole Vault',
      'POLE VAULT': 'Pole Vault',
      'LJ': 'Long Jump',
      'LONG JUMP': 'Long Jump',
      'TJ': 'Triple Jump',
      'TRIPLE JUMP': 'Triple Jump',
      'SP': 'Shot Put',
      'SHOT PUT': 'Shot Put',
      'DT': 'Discus',
      'DISCUS': 'Discus',
      'HT': 'Hammer Throw',
      'HAMMER': 'Hammer Throw',
      'HAMMER THROW': 'Hammer Throw',
      'JT': 'Javelin',
      'JAVELIN': 'Javelin',
      'WT': 'Weight Throw',
      'WEIGHT THROW': 'Weight Throw',
    };

    if (fieldEvents[e]) {
      return fieldEvents[e];
    }

    // Multi-events
    const multiEvents: Record<string, string> = {
      'HEPT': 'Heptathlon',
      'HEPTATHLON': 'Heptathlon',
      'DEC': 'Decathlon',
      'DECATHLON': 'Decathlon',
      'PENT': 'Pentathlon',
      'PENTATHLON': 'Pentathlon',
    };

    if (multiEvents[e]) {
      return multiEvents[e];
    }

    // Other
    if (e === 'DMR' || e === 'DISTANCE MEDLEY') {
      return 'Distance Medley Relay';
    }
    if (e === 'SMR' || e === 'SPRINT MEDLEY') {
      return 'Sprint Medley Relay';
    }
    if (e === 'MILE' || e === '1 MILE') {
      return 'Mile';
    }

    // Return original if no match
    return event;
  }

  function formatDate(dateString: string) {
    // Parse date string directly to avoid timezone issues
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    const date = new Date(year, month - 1, day); // Create date in local timezone
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatShortDate(dateString: string) {
    // Parse date string directly to avoid timezone issues
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return {
      day: day,
      month: monthNames[month - 1],
      year: year
    };
  }

  function getMeetStatus(meet: Meet) {
    // Get today's date as YYYY-MM-DD string (local timezone)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Meet date from database (already YYYY-MM-DD format)
    const meetDateStr = meet.date.split('T')[0]; // Handle if it has time component

    if (meetDateStr === todayStr) {
      // Today's meet - check if it has a timing link
      if (meet.meet_url) {
        return 'live'; // Today + has URL = live
      }
      return 'today'; // Today but no URL yet
    } else if (meetDateStr > todayStr) {
      return 'upcoming';
    } else {
      return 'past';
    }
  }

  function getGradientColors(status: string): readonly [string, string] {
    switch (status) {
      case 'live':
        return ['#FF1B8D', '#FF6B35'] as const; // Pink/orange for live
      case 'today':
        return ['#10B981', '#059669'] as const; // Green for today (not live yet)
      case 'upcoming':
        return ['#4A90D9', '#7B68EE'] as const; // Blue/purple for upcoming
      default:
        return ['#6B7280', '#4B5563'] as const; // Gray for past
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary.trackOrange} />
          <Text style={styles.loadingText}>Loading meet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Fallback mode - show simplified view when meet not in database but we have name/date
  const isFallbackMode = !meet && fallbackMeetName && fallbackMeetDate;

  if (error && !isFallbackMode) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.errorText}>Meet not found</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const meetStatus = meet ? getMeetStatus(meet) : 'past';
  const shortDate = meet ? formatShortDate(meet.date) : (fallbackMeetDate ? formatShortDate(fallbackMeetDate) : { day: '', month: '', year: 0 });
  const displayName = meet?.name || fallbackMeetName || '';
  const displayDate = meet?.date || fallbackMeetDate || '';

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
          <Text style={styles.headerTitle}>Meet Details</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Hero Card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={getGradientColors(meetStatus)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Status Badge */}
            <View style={styles.statusBadge}>
              {meetStatus === 'live' && (
                <>
                  <View style={styles.liveDot} />
                  <Text style={styles.statusText}>LIVE NOW</Text>
                </>
              )}
              {meetStatus === 'today' && (
                <>
                  <Ionicons name="today" size={12} color={colors.text.white} />
                  <Text style={styles.statusText}>TODAY</Text>
                </>
              )}
              {meetStatus === 'upcoming' && (
                <>
                  <Ionicons name="calendar" size={12} color={colors.text.white} />
                  <Text style={styles.statusText}>UPCOMING</Text>
                </>
              )}
              {meetStatus === 'past' && (
                <>
                  <Ionicons name="checkmark-circle" size={12} color={colors.text.white} />
                  <Text style={styles.statusText}>COMPLETED</Text>
                </>
              )}
            </View>

            {/* Meet Name */}
            <Text style={styles.meetName}>{displayName}</Text>

            {/* Date Display */}
            <View style={styles.dateContainer}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{shortDate.day}</Text>
                <Text style={styles.dateMonth}>{shortDate.month}</Text>
              </View>
              <View style={styles.dateDetails}>
                <Text style={styles.dateFull}>{displayDate ? formatDate(displayDate) : ''}</Text>
                {meet?.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.locationText}>{meet.location}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Level & Season Badges - only show if we have meet data */}
            {meet && (
              <View style={styles.heroBadgesRow}>
                <View style={styles.heroBadge}>
                  <Ionicons name="school" size={14} color={colors.text.white} />
                  <Text style={styles.heroBadgeText}>{meet.level || 'College'}</Text>
                </View>
                <View style={styles.heroBadge}>
                  <MaterialCommunityIcons
                    name={meet.season === 'Outdoor' ? 'weather-sunny' : 'home-variant'}
                    size={14}
                    color={colors.text.white}
                  />
                  <Text style={styles.heroBadgeText}>{meet.season || 'Indoor'}</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Live Results Button - Main Action (only for meets in database) */}
        {meet && (
        <View style={styles.resultsSection}>
          {meet.meet_url ? (
            <TouchableOpacity
              style={styles.liveResultsButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowWebView(true);
              }}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={['#FF6B35', '#FF8C42']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.liveButtonGradient}
              >
                <View style={styles.liveButtonContent}>
                  <View style={styles.liveIconContainer}>
                    <Ionicons name="play" size={28} color={colors.text.white} />
                  </View>
                  <View style={styles.liveTextContainer}>
                    <Text style={styles.liveButtonTitle}>
                      {meetStatus === 'live' ? 'View Live Results' : 'View Results'}
                    </Text>
                    <Text style={styles.liveButtonSubtitle}>
                      {meetStatus === 'live' ? 'Watch in real-time' : 'See event results'}
                    </Text>
                  </View>
                  <View style={styles.liveArrow}>
                    <Ionicons name="arrow-forward" size={20} color={colors.text.white} />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.noResultsCard}>
              <View style={styles.noResultsIcon}>
                <Ionicons
                  name={meetStatus === 'upcoming' ? 'calendar-outline' : 'time-outline'}
                  size={32}
                  color={colors.text.tertiary}
                />
              </View>
              <Text style={styles.noResultsTitle}>
                {meetStatus === 'upcoming' ? 'Coming Soon' : 'Results Pending'}
              </Text>
              <Text style={styles.noResultsSubtitle}>
                {meetStatus === 'upcoming'
                  ? 'Results will be available once the meet begins'
                  : 'Check back soon for results'
                }
              </Text>
            </View>
          )}
        </View>
        )}

        {/* Events Section - For past meets with results in our database */}
        {(meetStatus === 'past' || isFallbackMode) && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Events</Text>

            {eventsLoading ? (
              <View style={styles.eventsLoadingContainer}>
                <ActivityIndicator size="small" color={colors.primary.trackOrange} />
                <Text style={styles.eventsLoadingText}>Loading events...</Text>
              </View>
            ) : (mensEvents.length > 0 || womensEvents.length > 0) ? (
              <>
                {/* Gender Toggle */}
                <View style={styles.genderToggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.genderToggleButton,
                      selectedGender === 'M' && styles.genderToggleButtonActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedGender('M');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.genderToggleText,
                      selectedGender === 'M' && styles.genderToggleTextActive,
                    ]}>
                      Men's ({mensEvents.length})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.genderToggleButton,
                      selectedGender === 'F' && styles.genderToggleButtonActive,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedGender('F');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.genderToggleText,
                      selectedGender === 'F' && styles.genderToggleTextActive,
                    ]}>
                      Women's ({womensEvents.length})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Events List */}
                <View style={styles.eventsList}>
                  {(selectedGender === 'M' ? mensEvents : womensEvents).map((eventName, index) => {
                    const eventsList = selectedGender === 'M' ? mensEvents : womensEvents;
                    const canViewResults = isCleanDataSeason(displayDate);

                    if (canViewResults) {
                      return (
                        <TouchableOpacity
                          key={eventName}
                          style={[
                            styles.eventCard,
                            index === eventsList.length - 1 && styles.eventCardLast
                          ]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push({
                              pathname: '/event-results',
                              params: {
                                meetName: displayName,
                                eventName: eventName,
                                date: displayDate.split('T')[0],
                                gender: selectedGender,
                                meetId: meet?.meet_id?.toString(),
                              },
                            });
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.eventIconContainer}>
                            <Ionicons name="trophy-outline" size={20} color={colors.primary.trackOrange} />
                          </View>
                          <View style={styles.eventInfo}>
                            <Text style={styles.eventName}>{formatEventName(eventName)}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                        </TouchableOpacity>
                      );
                    }

                    // Non-clickable for older data
                    return (
                      <View
                        key={eventName}
                        style={[
                          styles.eventCard,
                          styles.eventCardDisabled,
                          index === eventsList.length - 1 && styles.eventCardLast
                        ]}
                      >
                        <View style={[styles.eventIconContainer, styles.eventIconDisabled]}>
                          <Ionicons name="trophy-outline" size={20} color={colors.text.tertiary} />
                        </View>
                        <View style={styles.eventInfo}>
                          <Text style={[styles.eventName, styles.eventNameDisabled]}>{formatEventName(eventName)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <View style={styles.noEventsCard}>
                <Ionicons name="document-outline" size={32} color={colors.text.tertiary} />
                <Text style={styles.noEventsText}>No results in database</Text>
              </View>
            )}
          </View>
        )}

        {/* Related Meets Section */}
        {relatedMeets.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={[styles.sectionTitle, { paddingHorizontal: 16 }]}>More Meets</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.relatedScrollContent}
            >
              {relatedMeets.map((relatedMeet) => {
                const relatedStatus = getMeetStatus(relatedMeet);
                const relatedShortDate = formatShortDate(relatedMeet.date);
                return (
                  <TouchableOpacity
                    key={relatedMeet.meet_id}
                    style={styles.relatedCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/meet/${relatedMeet.meet_id}`);
                    }}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={getGradientColors(relatedStatus)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.relatedGradient}
                    >
                      {/* Mini status badge */}
                      {relatedStatus === 'live' && (
                        <View style={styles.relatedStatusBadge}>
                          <View style={styles.miniLiveDot} />
                          <Text style={styles.relatedStatusText}>LIVE</Text>
                        </View>
                      )}

                      {/* Date */}
                      <View style={styles.relatedDateBox}>
                        <Text style={styles.relatedDateDay}>{relatedShortDate.day}</Text>
                        <Text style={styles.relatedDateMonth}>{relatedShortDate.month}</Text>
                      </View>

                      {/* Meet name */}
                      <Text style={styles.relatedMeetName} numberOfLines={2}>
                        {relatedMeet.name}
                      </Text>

                      {/* Level/Season badge */}
                      <View style={styles.relatedBadge}>
                        <Text style={styles.relatedBadgeText}>
                          {relatedMeet.level || 'College'} {relatedMeet.season || 'Indoor'}
                        </Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* WebView Modal */}
      <Modal
        visible={showWebView}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWebView(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowWebView(false);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <Text style={styles.modalTitle} numberOfLines={1}>{meet?.name || displayName}</Text>
              <Text style={styles.modalSubtitle}>Live Results</Text>
            </View>
            <View style={styles.headerPlaceholder} />
          </View>

          {/* WebView */}
          <View style={styles.webViewContainer}>
            {webViewLoading && (
              <View style={styles.webViewLoading}>
                <ActivityIndicator size="large" color={colors.primary.trackOrange} />
                <Text style={styles.loadingText}>Loading results...</Text>
              </View>
            )}
            {meet?.meet_url && (
              <WebView
                source={{ uri: meet.meet_url }}
                style={styles.webView}
                onLoadStart={() => setWebViewLoading(true)}
                onLoadEnd={() => setWebViewLoading(false)}
                javaScriptEnabled={true}
                domStorageEnabled={true}
              />
            )}
          </View>
        </SafeAreaView>
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.secondary,
  },
  goBackButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 12,
  },
  goBackText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgrounds.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
  },
  headerPlaceholder: {
    width: 44,
  },

  // Hero Card
  heroCard: {
    marginHorizontal: 16,
    marginTop: 8,
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
    padding: 24,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.white,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 1,
  },
  meetName: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text.white,
    marginBottom: 20,
    lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dateBox: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
    lineHeight: 28,
  },
  dateMonth: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
  dateDetails: {
    flex: 1,
  },
  dateFull: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.white,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  heroBadgesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.white,
  },

  // Section Title
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 16,
  },

  // Results Section
  resultsSection: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  liveResultsButton: {
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  liveButtonGradient: {
    padding: 20,
  },
  liveButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  liveIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTextContainer: {
    flex: 1,
  },
  liveButtonTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.white,
    marginBottom: 4,
  },
  liveButtonSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  liveArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // No Results Card
  noResultsCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
  },
  noResultsIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.backgrounds.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  noResultsSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  bottomSpacing: {
    height: 40,
  },

  // Events Section
  eventsSection: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  eventsLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  eventsLoadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  genderToggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    marginBottom: 16,
    overflow: 'hidden',
  },
  genderToggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderToggleButtonActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  genderToggleText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.tertiary,
  },
  genderToggleTextActive: {
    color: colors.text.white,
  },
  eventsList: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.medium,
  },
  eventCardLast: {
    borderBottomWidth: 0,
  },
  eventCardDisabled: {
    opacity: 0.5,
  },
  eventIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.backgrounds.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  eventIconDisabled: {
    backgroundColor: colors.borders.light,
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  eventNameDisabled: {
    color: colors.text.tertiary,
  },
  noEventsCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  noEventsText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },

  // Related Meets Section
  relatedSection: {
    marginTop: 24,
  },
  relatedScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  relatedCard: {
    width: 180,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  relatedGradient: {
    padding: 16,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  relatedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  miniLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.white,
  },
  relatedStatusText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 0.5,
  },
  relatedDateBox: {
    width: 52,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  relatedDateDay: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    lineHeight: 22,
  },
  relatedDateMonth: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  relatedMeetName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.white,
    lineHeight: 18,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  relatedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  relatedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.white,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.backgrounds.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.thick,
    backgroundColor: colors.backgrounds.white,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.cream,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  modalTitleContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  webViewContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgrounds.white,
    zIndex: 10,
  },
});
