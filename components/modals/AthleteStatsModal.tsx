import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../design-system/colors';
import { Performance } from '../../hooks/useAthleteDetails';
import { SeasonProgressionChart } from '../charts/SeasonProgressionChart';

const { width, height } = Dimensions.get('window');

interface AthleteStatsModalProps {
  visible: boolean;
  onClose: () => void;
  athleteName: string;
  performances: Performance[];
}

type TabType = 'personal-bests' | 'season-bests' | 'results' | 'progression';

export function AthleteStatsModal({
  visible,
  onClose,
  athleteName,
  performances,
}: AthleteStatsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('personal-bests');
  const [selectedEvent, setSelectedEvent] = useState<string>('');
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  // Helper to determine if an event is a field event (higher is better)
  const isFieldEvent = (eventName: string) => {
    const fieldEvents = ['shot put', 'discus', 'javelin', 'hammer', 'long jump', 'triple jump', 'high jump', 'pole vault'];
    return fieldEvents.some(fe => eventName.toLowerCase().includes(fe));
  };

  // Helper to determine if an event should show dual units (meters + feet/inches)
  const isJumpEvent = (eventName: string) => {
    const fieldEvents = ['long jump', 'triple jump', 'high jump', 'pole vault', 'shot put', 'discus', 'javelin', 'hammer'];
    return fieldEvents.some(fe => eventName.toLowerCase().includes(fe));
  };

  // Convert meters to feet and inches
  const metersToFeetInches = (meters: number) => {
    const totalInches = meters * 39.3701; // 1 meter = 39.3701 inches
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}' ${inches.toFixed(1)}"`;
  };

  // Format field event mark with dual units
  const formatFieldEventMark = (markRaw: string, eventName: string) => {
    if (!isJumpEvent(eventName)) {
      return markRaw; // Return original for non-jump events
    }

    // Extract meters from mark (e.g., "7.25m" -> 7.25)
    const metersMatch = markRaw.match(/^(\d+\.?\d*)m?$/i);
    if (metersMatch) {
      const meters = parseFloat(metersMatch[1]);
      const feetInches = metersToFeetInches(meters);
      return {
        metric: `${meters.toFixed(2)}m`,
        imperial: feetInches
      };
    }

    return markRaw; // Return original if can't parse
  };

  // Parse mark_raw to get a comparable numeric value
  const parseMarkToNumber = (markRaw: string, eventName: string): number | null => {
    if (!markRaw || markRaw === 'DNF' || markRaw === 'DNS' || markRaw === 'DQ') {
      return null;
    }

    const isField = isFieldEvent(eventName);

    if (isField) {
      // Field events: parse distances like "7.12m", "15.23", "45-6.5" (feet-inches)
      // Remove 'm' and convert to number
      const cleaned = markRaw.replace(/m$/i, '').trim();

      // Handle feet-inches format (e.g., "45-6.5")
      if (cleaned.includes('-')) {
        const [feet, inches] = cleaned.split('-').map(parseFloat);
        return feet + (inches / 12); // Convert to total feet
      }

      return parseFloat(cleaned);
    } else {
      // Running events: parse times like "10.52", "3:55.38", "32:09.2"
      const parts = markRaw.split(':');

      if (parts.length === 1) {
        // Simple seconds: "10.52"
        return parseFloat(parts[0]);
      } else if (parts.length === 2) {
        // Minutes:seconds: "3:55.38"
        const minutes = parseFloat(parts[0]);
        const seconds = parseFloat(parts[1]);
        return minutes * 60 + seconds;
      } else if (parts.length === 3) {
        // Hours:minutes:seconds: "1:05:32.1"
        const hours = parseFloat(parts[0]);
        const minutes = parseFloat(parts[1]);
        const seconds = parseFloat(parts[2]);
        return hours * 3600 + minutes * 60 + seconds;
      }
    }

    return null;
  };

  // Calculate Personal Bests (all-time best per event)
  const personalBests = useMemo(() => {
    const eventBests = new Map<string, Performance>();
    performances.forEach(perf => {
      const existing = eventBests.get(perf.event_name);

      if (!existing) {
        eventBests.set(perf.event_name, perf);
      } else {
        const isField = isFieldEvent(perf.event_name);
        const perfValue = parseMarkToNumber(perf.mark_raw, perf.event_name);
        const existingValue = parseMarkToNumber(existing.mark_raw, existing.event_name);

        if (perfValue !== null && existingValue !== null) {
          // For field events, higher is better
          // For running events, lower is better
          if (isField) {
            if (perfValue > existingValue) {
              eventBests.set(perf.event_name, perf);
            }
          } else {
            if (perfValue < existingValue) {
              eventBests.set(perf.event_name, perf);
            }
          }
        } else if (perfValue !== null && existingValue === null) {
          // Replace invalid existing with valid new
          eventBests.set(perf.event_name, perf);
        }
      }
    });
    return Array.from(eventBests.values()).sort((a, b) => a.event_name.localeCompare(b.event_name));
  }, [performances]);

  // Get available seasons from performance data
  const availableSeasons = useMemo(() => {
    const seasons = new Set<string>();
    performances.forEach(p => {
      const date = new Date(p.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      // Determine which season this performance belongs to
      const seasonStartYear = month >= 8 ? year : year - 1;
      const seasonEndYear = seasonStartYear + 1;
      seasons.add(`${seasonStartYear}-${seasonEndYear}`);
    });
    return Array.from(seasons).sort().reverse(); // Most recent first
  }, [performances]);

  // Set default selected season
  React.useEffect(() => {
    if (availableSeasons.length > 0 && !selectedSeason) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [availableSeasons, selectedSeason]);

  // Calculate Season Bests (for selected season)
  const seasonBests = useMemo(() => {
    if (!selectedSeason) return [];

    const [startYear, endYear] = selectedSeason.split('-').map(Number);
    const seasonStart = new Date(`${startYear}-09-01`);
    const seasonEnd = new Date(`${endYear}-08-31`);
    const seasonPerfs = performances.filter(p => {
      const date = new Date(p.date);
      return date >= seasonStart && date <= seasonEnd;
    });

    const eventBests = new Map<string, Performance>();
    seasonPerfs.forEach(perf => {
      const existing = eventBests.get(perf.event_name);

      if (!existing) {
        eventBests.set(perf.event_name, perf);
      } else {
        const isField = isFieldEvent(perf.event_name);
        const perfValue = parseMarkToNumber(perf.mark_raw, perf.event_name);
        const existingValue = parseMarkToNumber(existing.mark_raw, existing.event_name);

        if (perfValue !== null && existingValue !== null) {
          if (isField) {
            if (perfValue > existingValue) {
              eventBests.set(perf.event_name, perf);
            }
          } else {
            if (perfValue < existingValue) {
              eventBests.set(perf.event_name, perf);
            }
          }
        } else if (perfValue !== null && existingValue === null) {
          eventBests.set(perf.event_name, perf);
        }
      }
    });
    return Array.from(eventBests.values()).sort((a, b) => a.event_name.localeCompare(b.event_name));
  }, [performances, selectedSeason]);

  // All results sorted by date
  const allResults = useMemo(() => {
    return [...performances].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [performances]);

  // Progression data (showing improvement over time for each event)
  const progressionData = useMemo(() => {
    const eventProgressions = new Map<string, Performance[]>();

    performances.forEach(perf => {
      if (!eventProgressions.has(perf.event_name)) {
        eventProgressions.set(perf.event_name, []);
      }
      eventProgressions.get(perf.event_name)!.push(perf);
    });

    // Sort each event's performances by date and calculate improvements
    const progressions = Array.from(eventProgressions.entries()).map(([eventName, perfs]) => {
      const sortedPerfs = perfs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const isField = isFieldEvent(eventName);

      let improvements = 0;
      let bestMark: number | null = null;

      sortedPerfs.forEach(perf => {
        const perfValue = parseMarkToNumber(perf.mark_raw, eventName);

        if (perfValue !== null) {
          if (bestMark === null) {
            // First valid mark
            bestMark = perfValue;
          } else {
            // Check if this is an improvement
            if (isField) {
              // Field event: higher is better
              if (perfValue > bestMark) {
                improvements++;
                bestMark = perfValue;
              }
            } else {
              // Running event: lower is better
              if (perfValue < bestMark) {
                improvements++;
                bestMark = perfValue;
              }
            }
          }
        }
      });

      // Find current best
      const currentBest = sortedPerfs.reduce((best, curr) => {
        if (!best) return curr;

        const currValue = parseMarkToNumber(curr.mark_raw, eventName);
        const bestValue = parseMarkToNumber(best.mark_raw, eventName);

        if (currValue === null) return best;
        if (bestValue === null) return curr;

        if (isField) {
          return currValue > bestValue ? curr : best;
        } else {
          return currValue < bestValue ? curr : best;
        }
      }, sortedPerfs[0]);

      return {
        eventName,
        attempts: sortedPerfs.length,
        improvements,
        currentBest,
      };
    });

    return progressions.sort((a, b) => b.improvements - a.improvements);
  }, [performances]);

  // Get list of available events
  const availableEvents = useMemo(() => {
    const events = new Set(performances.map(p => p.event_name));
    return Array.from(events).sort();
  }, [performances]);

  // Set default selected event when modal opens or performances change
  React.useEffect(() => {
    if (availableEvents.length > 0 && !selectedEvent) {
      setSelectedEvent(availableEvents[0]);
    }
  }, [availableEvents, selectedEvent]);

  const handleTabPress = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const renderPersonalBests = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.contentTitle}>Personal Records</Text>
      <Text style={styles.contentSubtitle}>All-time best performance for each event</Text>

      {personalBests.map((pb, index) => (
        <View key={index} style={styles.statCard}>
          <View style={styles.statHeader}>
            <Text style={styles.eventName}>{pb.event_name}</Text>
            <View style={styles.prBadge}>
              <Ionicons name="trophy" size={14} color={colors.text.white} />
              <Text style={styles.prBadgeText}>PR</Text>
            </View>
          </View>
          <View style={styles.markContainer}>
            {(() => {
              const formattedMark = formatFieldEventMark(pb.mark_raw, pb.event_name);
              if (typeof formattedMark === 'object') {
                return (
                  <>
                    <Text style={styles.markValue}>{formattedMark.metric}</Text>
                    <Text style={styles.markValueSecondary}>{formattedMark.imperial}</Text>
                  </>
                );
              }
              return <Text style={styles.markValue}>{pb.mark_raw}</Text>;
            })()}
          </View>
          <Text style={styles.statDetails}>
            {pb.meet_name}
          </Text>
          <Text style={styles.statDate}>
            {new Date(pb.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderSeasonBests = () => {
    return (
      <View style={styles.contentContainer}>
        <Text style={styles.contentTitle}>Season Bests</Text>
        <Text style={styles.contentSubtitle}>View past seasons</Text>

        {/* Season Selector */}
        <View style={styles.eventSelectorContainer}>
          <Text style={styles.eventSelectorLabel}>Select Season:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventSelectorScroll}>
            {availableSeasons.map((season, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.eventSelectorChip,
                  selectedSeason === season && styles.eventSelectorChipActive
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedSeason(season);
                }}
              >
                <Text style={[
                  styles.eventSelectorText,
                  selectedSeason === season && styles.eventSelectorTextActive
                ]}>
                  {season}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.contentSubtitle}>{seasonBests.length} events in {selectedSeason}</Text>

      {seasonBests.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>No performances this season yet</Text>
        </View>
      ) : (
        seasonBests.map((sb, index) => (
          <View key={index} style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.eventName}>{sb.event_name}</Text>
              <View style={styles.sbBadge}>
                <Text style={styles.sbBadgeText}>SB</Text>
              </View>
            </View>
            <View style={styles.markContainer}>
              {(() => {
                const formattedMark = formatFieldEventMark(sb.mark_raw, sb.event_name);
                if (typeof formattedMark === 'object') {
                  return (
                    <>
                      <Text style={styles.markValue}>{formattedMark.metric}</Text>
                      <Text style={styles.markValueSecondary}>{formattedMark.imperial}</Text>
                    </>
                  );
                }
                return <Text style={styles.markValue}>{sb.mark_raw}</Text>;
              })()}
            </View>
            <Text style={styles.statDetails}>{sb.meet_name}</Text>
            <Text style={styles.statDate}>
              {new Date(sb.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        ))
      )}
      </View>
    );
  };

  const renderResults = () => (
    <View style={styles.contentContainer}>
      <Text style={styles.contentTitle}>All Results</Text>
      <Text style={styles.contentSubtitle}>{allResults.length} total performances</Text>

      {allResults.map((result, index) => (
        <View key={index} style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View style={styles.resultLeft}>
              <Text style={styles.resultMeet}>{result.meet_name}</Text>
              <Text style={styles.resultEvent}>{result.event_name}</Text>
            </View>
            <View style={styles.placeBadge}>
              <Text style={styles.placeText}>{result.place}</Text>
              <Text style={styles.placeSuffix}>
                {result.place === 1 ? 'st' : result.place === 2 ? 'nd' : result.place === 3 ? 'rd' : 'th'}
              </Text>
            </View>
          </View>
          {(() => {
            const formattedMark = formatFieldEventMark(result.mark_raw, result.event_name);
            const isLongMark = typeof formattedMark === 'object' || (result.mark_raw && result.mark_raw.length > 8);

            return isLongMark ? (
              // Stack layout for long marks (field events or long times)
              <View style={styles.resultBottomStacked}>
                <View style={styles.resultMarkContainer}>
                  {typeof formattedMark === 'object' ? (
                    <>
                      <Text style={styles.resultMarkCompact}>{formattedMark.metric}</Text>
                      <Text style={styles.resultMarkSecondaryCompact}>{formattedMark.imperial}</Text>
                    </>
                  ) : (
                    <Text style={styles.resultMarkCompact}>{result.mark_raw}</Text>
                  )}
                </View>
                <Text style={styles.resultDateStacked}>
                  {new Date(result.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            ) : (
              // Horizontal layout for short marks
              <View style={styles.resultBottom}>
                <Text style={styles.resultMark}>{result.mark_raw}</Text>
                <Text style={styles.resultDate}>
                  {new Date(result.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            );
          })()}
        </View>
      ))}
    </View>
  );

  const renderProgression = () => {
    // Get performances for selected event
    const eventPerformances = performances
      .filter(p => p.event_name === selectedEvent)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    console.log('Progression debug:', {
      selectedEvent,
      totalPerformances: performances.length,
      eventPerformances: eventPerformances.length,
      samplePerformance: eventPerformances[0]
    });

    // Prepare data for chart - use parsed time from mark_raw if mark_seconds is not available
    const chartData = eventPerformances.map((p, idx, arr) => {
      const time = p.mark_seconds || parseMarkToNumber(p.mark_raw, selectedEvent) || 0;
      const validTimes = arr.slice(0, idx + 1).map(x => x.mark_seconds || parseMarkToNumber(x.mark_raw, selectedEvent)).filter(t => t && t > 0);
      const bestSoFar = validTimes.length > 0 ? Math.min(...validTimes) : time;
      
      return {
        date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        time: time,
        displayTime: p.mark_raw,
        meet: p.meet_name,
        isPR: time === bestSoFar && time > 0
      };
    }).filter(d => d.time > 0);

    return (
      <View style={styles.contentContainer}>
        <Text style={styles.contentTitle}>Progression</Text>
        <Text style={styles.contentSubtitle}>All-time progression by event</Text>

        {/* Event Selector */}
        <View style={styles.eventSelectorContainer}>
          <Text style={styles.eventSelectorLabel}>Select Event:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventSelectorScroll}>
            {availableEvents.map((event, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.eventSelectorChip,
                  selectedEvent === event && styles.eventSelectorChipActive
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedEvent(event);
                }}
              >
                <Text style={[
                  styles.eventSelectorText,
                  selectedEvent === event && styles.eventSelectorTextActive
                ]}>
                  {event}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Season Progression Chart */}
        {chartData.length > 0 ? (
          <SeasonProgressionChart
            data={chartData}
            eventName={selectedEvent}
          />
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyText}>No performances for {selectedEvent}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'personal-bests':
        return renderPersonalBests();
      case 'season-bests':
        return renderSeasonBests();
      case 'results':
        return renderResults();
      case 'progression':
        return renderProgression();
      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={colors.gradients.trackHero as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={colors.text.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Detailed Stats</Text>
            <View style={styles.placeholder} />
          </View>
          <Text style={styles.athleteNameText}>{athleteName}</Text>
        </LinearGradient>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'personal-bests' && styles.tabActive]}
              onPress={() => handleTabPress('personal-bests')}
            >
              <Ionicons
                name="trophy"
                size={18}
                color={activeTab === 'personal-bests' ? colors.text.white : colors.text.tertiary}
              />
              <Text style={[styles.tabText, activeTab === 'personal-bests' && styles.tabTextActive]}>
                Personal Records
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'season-bests' && styles.tabActive]}
              onPress={() => handleTabPress('season-bests')}
            >
              <Ionicons
                name="calendar"
                size={18}
                color={activeTab === 'season-bests' ? colors.text.white : colors.text.tertiary}
              />
              <Text style={[styles.tabText, activeTab === 'season-bests' && styles.tabTextActive]}>
                Season Bests
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'results' && styles.tabActive]}
              onPress={() => handleTabPress('results')}
            >
              <Ionicons
                name="list"
                size={18}
                color={activeTab === 'results' ? colors.text.white : colors.text.tertiary}
              />
              <Text style={[styles.tabText, activeTab === 'results' && styles.tabTextActive]}>
                Results
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'progression' && styles.tabActive]}
              onPress={() => handleTabPress('progression')}
            >
              <Ionicons
                name="trending-up"
                size={18}
                color={activeTab === 'progression' ? colors.text.white : colors.text.tertiary}
              />
              <Text style={[styles.tabText, activeTab === 'progression' && styles.tabTextActive]}>
                Progression
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Content */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {renderContent()}
          <View style={styles.bottomSpacing} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: colors.text.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.white,
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  placeholder: {
    width: 40,
  },
  athleteNameText: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.white,
    textAlign: 'center',
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  tabContainer: {
    backgroundColor: colors.backgrounds.white,
    borderBottomWidth: 4,
    borderBottomColor: colors.borders.thick,
  },
  tabScroll: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    backgroundColor: colors.backgrounds.white,
  },
  tabActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.tertiary,
  },
  tabTextActive: {
    color: colors.text.white,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  contentTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
    textShadowColor: colors.backgrounds.white,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  contentSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    marginBottom: 12,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    flex: 1,
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
  },
  sbBadge: {
    backgroundColor: colors.primary.athleticGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  sbBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
  },
  markContainer: {
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  markValue: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  markValueSecondary: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.secondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  statDetails: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  statDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
  },
  resultCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 16,
    marginBottom: 12,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  resultLeft: {
    flex: 1,
    marginRight: 12,
  },
  resultMeet: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  resultEvent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
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
  resultBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  resultMarkContainer: {
    alignItems: 'flex-start',
  },
  resultMark: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  resultMarkSecondary: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  resultDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
  },
  progressionCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    marginBottom: 12,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  progressionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  improvementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary.athleticGreen,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  improvementText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
  },
  progressionStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressionStatItem: {
    alignItems: 'center',
  },
  progressionStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  progressionStatValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
  },
  progressionDate: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.tertiary,
    marginTop: 12,
  },
  bottomSpacing: {
    height: 40,
  },
  eventSelectorContainer: {
    marginBottom: 20,
  },
  eventSelectorLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 12,
  },
  eventSelectorScroll: {
    flexGrow: 0,
  },
  eventSelectorChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    marginRight: 8,
  },
  eventSelectorChipActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  eventSelectorText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  eventSelectorTextActive: {
    color: colors.text.white,
  },
  resultBottomStacked: {
    flexDirection: 'column',
    gap: 8,
  },
  resultMarkCompact: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  resultMarkSecondaryCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    fontFamily: 'Courier',
  },
  resultDateStacked: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.muted,
  },
});
