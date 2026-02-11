import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../design-system/colors';
import { FadeInCard } from '../../components/animations/FadeInCard';
import { getSchoolById, getSchoolAthletesBySeason, getSchoolMeets } from '../../services/database-supabase';

interface School {
  school_id: number;
  official_name: string;
  short_name: string | null;
  city: string | null;
  state: string | null;
  division: string | null;
  conference: string | null;
}

interface Athlete {
  athlete_id: number;
  full_name: string;
  gender: string | null;
  class_year: string | null;
  primary_events: string | null;
}

interface Meet {
  meet_id: number;
  meet_name: string;
  date: string;
}

export default function SchoolDetailScreen() {
  const { id } = useLocalSearchParams();
  const schoolId = parseInt(id as string, 10);
  const isValidId = !isNaN(schoolId) && schoolId > 0;

  const [school, setSchool] = useState<School | null>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>('2025-26');
  const [activeDropdown, setActiveDropdown] = useState<'season' | 'gender' | 'class' | null>(null);
  const [activeTab, setActiveTab] = useState<'athletes' | 'meets'>('athletes');

  const classYears = ['FR', 'SO', 'JR', 'SR'];
  const seasons = ['2025-26', '2024-25', '2023-24', '2022-23'];
  const genders = [{ value: 'M', label: 'Men' }, { value: 'F', label: 'Women' }];

  // Filter athletes by class year and gender
  const filteredAthletes = useMemo(() => {
    let result = athletes;
    if (selectedClass) {
      result = result.filter(a => a.class_year === selectedClass);
    }
    if (selectedGender) {
      result = result.filter(a => a.gender === selectedGender);
    }
    return result;
  }, [athletes, selectedClass, selectedGender]);

  useEffect(() => {
    if (!isValidId) {
      setError('Invalid school ID');
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [schoolData, athletesData, meetsData] = await Promise.all([
          getSchoolById(schoolId),
          getSchoolAthletesBySeason(schoolId, selectedSeason, 500),
          getSchoolMeets(schoolId, 50),
        ]);
        setSchool(schoolData);
        setAthletes(athletesData);
        setMeets(meetsData);
      } catch (err) {
        setError('School not found');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [schoolId, isValidId, selectedSeason]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary.trackOrange} />
          <Text style={styles.loadingText}>Loading school...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !school) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centerContainer}>
          <Ionicons name="school-outline" size={64} color={colors.text.tertiary} />
          <Text style={styles.errorText}>{error || 'School not found'}</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const location = [school.city, school.state].filter(Boolean).join(', ');

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
            colors={['#4A90D9', '#7B68EE'] as any}
            style={styles.heroGradient}
          >
            <View style={styles.schoolIcon}>
              <Ionicons name="school" size={40} color={colors.text.white} />
            </View>
            <Text style={styles.schoolName}>{school.official_name}</Text>
            <View style={styles.metaRow}>
              {school.division && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaText}>{school.division}</Text>
                </View>
              )}
              {school.conference && (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaText}>{school.conference}</Text>
                </View>
              )}
            </View>
            {location && (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.locationText}>{location}</Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* Tab Control */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'athletes' && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('athletes');
            }}
          >
            <Ionicons
              name="people"
              size={18}
              color={activeTab === 'athletes' ? colors.text.white : colors.text.primary}
            />
            <Text style={[styles.tabText, activeTab === 'athletes' && styles.tabTextActive]}>
              Athletes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'meets' && styles.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('meets');
            }}
          >
            <Ionicons
              name="trophy"
              size={18}
              color={activeTab === 'meets' ? colors.text.white : colors.text.primary}
            />
            <Text style={[styles.tabText, activeTab === 'meets' && styles.tabTextActive]}>
              Meets
            </Text>
          </TouchableOpacity>
        </View>

        {/* Filter Dropdowns - only show for athletes tab */}
        {activeTab === 'athletes' && (
          <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.dropdown, selectedSeason && styles.dropdownActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveDropdown('season');
            }}
          >
            <Text style={[styles.dropdownText, selectedSeason && styles.dropdownTextActive]}>
              {selectedSeason || 'Season'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={selectedSeason ? colors.text.white : colors.text.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dropdown, selectedGender && styles.dropdownActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveDropdown('gender');
            }}
          >
            <Text style={[styles.dropdownText, selectedGender && styles.dropdownTextActive]}>
              {selectedGender === 'M' ? 'Men' : selectedGender === 'F' ? 'Women' : 'Gender'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={selectedGender ? colors.text.white : colors.text.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dropdown, selectedClass && styles.dropdownActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveDropdown('class');
            }}
          >
            <Text style={[styles.dropdownText, selectedClass && styles.dropdownTextActive]}>
              {selectedClass || 'Class'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={selectedClass ? colors.text.white : colors.text.primary} />
          </TouchableOpacity>
          </View>
        )}

        {/* Dropdown Modal */}
        <Modal
          visible={activeDropdown !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveDropdown(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setActiveDropdown(null)}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {activeDropdown === 'season' ? 'Select Season' : activeDropdown === 'gender' ? 'Select Gender' : 'Select Class'}
              </Text>

              {/* All option to clear - not for season since it's required */}
              {activeDropdown !== 'season' && (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (activeDropdown === 'gender') setSelectedGender(null);
                    if (activeDropdown === 'class') setSelectedClass(null);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>All</Text>
                  {((activeDropdown === 'gender' && !selectedGender) ||
                    (activeDropdown === 'class' && !selectedClass)) && (
                    <Ionicons name="checkmark" size={20} color={colors.primary.trackOrange} />
                  )}
                </TouchableOpacity>
              )}

              {/* Options */}
              {activeDropdown === 'season' && seasons.map((season) => (
                <TouchableOpacity
                  key={season}
                  style={styles.modalOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedSeason(season);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{season}</Text>
                  {selectedSeason === season && <Ionicons name="checkmark" size={20} color={colors.primary.trackOrange} />}
                </TouchableOpacity>
              ))}

              {activeDropdown === 'gender' && genders.map((g) => (
                <TouchableOpacity
                  key={g.value}
                  style={styles.modalOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedGender(g.value);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{g.label}</Text>
                  {selectedGender === g.value && <Ionicons name="checkmark" size={20} color={colors.primary.trackOrange} />}
                </TouchableOpacity>
              ))}

              {activeDropdown === 'class' && classYears.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={styles.modalOption}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedClass(year);
                    setActiveDropdown(null);
                  }}
                >
                  <Text style={styles.modalOptionText}>{year}</Text>
                  {selectedClass === year && <Ionicons name="checkmark" size={20} color={colors.primary.trackOrange} />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Meets Tab */}
        {activeTab === 'meets' && meets.length > 0 && (
          <View style={styles.section}>
            {meets.map((meet, i) => (
              <FadeInCard key={meet.meet_id} delay={i * 50}>
                <TouchableOpacity
                  style={styles.meetCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/meet/${meet.meet_id}`);
                  }}
                >
                  <View style={styles.meetIcon}>
                    <Ionicons name="trophy" size={20} color={colors.primary.trackOrange} />
                  </View>
                  <View style={styles.meetInfo}>
                    <Text style={styles.meetName} numberOfLines={1}>{meet.meet_name}</Text>
                    <Text style={styles.meetDate}>{meet.date}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
                </TouchableOpacity>
              </FadeInCard>
            ))}
          </View>
        )}

        {/* Meets empty state */}
        {activeTab === 'meets' && meets.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="trophy-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>No meets found for this school</Text>
          </View>
        )}

        {/* Athletes Tab */}
        {activeTab === 'athletes' && filteredAthletes.length > 0 && (
          <View style={styles.section}>
            {filteredAthletes.map((athlete, i) => (
              <FadeInCard key={athlete.athlete_id} delay={i * 100}>
                <TouchableOpacity
                  style={styles.athleteCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/athlete/${athlete.athlete_id}`);
                  }}
                >
                  <View style={styles.athleteIcon}>
                    <Text style={styles.athleteInitials}>
                      {athlete.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </Text>
                  </View>
                  <View style={styles.athleteInfo}>
                    <Text style={styles.athleteName}>{athlete.full_name}</Text>
                    <Text style={styles.athleteMeta}>
                      {[athlete.class_year, athlete.gender === 'M' ? 'Men' : athlete.gender === 'F' ? 'Women' : null]
                        .filter(Boolean)
                        .join(' • ')}
                    </Text>
                    {athlete.primary_events && (
                      <Text style={styles.athleteEvents} numberOfLines={1}>
                        {athlete.primary_events}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={24} color={colors.text.tertiary} />
                </TouchableOpacity>
              </FadeInCard>
            ))}
          </View>
        )}

        {activeTab === 'athletes' && filteredAthletes.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>
              {selectedClass || selectedGender
                ? 'No athletes match the selected filters'
                : `No athletes competed in ${selectedSeason}`}
            </Text>
          </View>
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
  centerContainer: {
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
  schoolIcon: {
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
  schoolName: {
    fontSize: 24,
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
    marginBottom: 8,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.backgrounds.white,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  tabActive: {
    backgroundColor: colors.primary.trackOrange,
    borderColor: colors.borders.thick,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  tabTextActive: {
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
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 20,
  },
  dropdown: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgrounds.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  dropdownActive: {
    backgroundColor: colors.primary.trackOrange,
    borderColor: colors.primary.trackOrange,
  },
  dropdownText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  dropdownTextActive: {
    color: colors.text.white,
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
    width: '100%',
    maxWidth: 300,
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
    marginBottom: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
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
  athleteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    gap: 12,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  athleteIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  athleteInitials: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary.trackOrange,
  },
  athleteInfo: {
    flex: 1,
  },
  athleteName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  athleteMeta: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 2,
  },
  athleteEvents: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    marginTop: 2,
  },
  meetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    gap: 10,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  meetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meetInfo: {
    flex: 1,
  },
  meetName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  meetDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 12,
    textAlign: 'center',
  },
  bottomSpacing: {
    height: 100,
  },
});
