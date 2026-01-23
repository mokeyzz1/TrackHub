import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { colors } from '../../design-system/colors';
import { supabase } from '../../lib/supabase';

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
  const { id } = useLocalSearchParams();
  const [meet, setMeet] = useState<Meet | null>(null);
  const [relatedMeets, setRelatedMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);

  useEffect(() => {
    fetchMeet();
    fetchRelatedMeets();
  }, [id]);

  async function fetchMeet() {
    try {
      setLoading(true);
      setError(null);

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

  if (error || !meet) {
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

  const meetStatus = getMeetStatus(meet);
  const shortDate = formatShortDate(meet.date);

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
            <Text style={styles.meetName}>{meet.name}</Text>

            {/* Date Display */}
            <View style={styles.dateContainer}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{shortDate.day}</Text>
                <Text style={styles.dateMonth}>{shortDate.month}</Text>
              </View>
              <View style={styles.dateDetails}>
                <Text style={styles.dateFull}>{formatDate(meet.date)}</Text>
                {meet.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location" size={14} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.locationText}>{meet.location}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Level & Season Badges */}
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
          </LinearGradient>
        </View>

        {/* Live Results Button - Main Action */}
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
              <Text style={styles.modalTitle} numberOfLines={1}>{meet.name}</Text>
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
            {meet.meet_url && (
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
