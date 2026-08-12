import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState, useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../design-system/colors';
import { Performance, PersonalRecord } from '../../hooks/useAthleteDetails';
import { SeasonProgressionChart } from '../charts/SeasonProgressionChart';
import { normalizeEventName, canonicalEventName } from '../../utils/eventNames';

const { width, height } = Dimensions.get('window');

interface AthleteStatsModalProps {
  visible: boolean;
  onClose: () => void;
  athleteName: string;
  performances: Performance[];
  personalRecords?: PersonalRecord[];
}

type TabType = 'personal-bests' | 'season-bests' | 'results' | 'progression';

export function AthleteStatsModal({
  visible,
  onClose,
  athleteName,
  performances,
  personalRecords = [],
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
    if (!markRaw || markRaw === 'DNF' || markRaw === 'DNS' || markRaw === 'DQ' || markRaw === 'NT' || markRaw === 'FS' || markRaw === 'FOUL' || markRaw === 'NH' || markRaw === 'NM') {
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
        const result = feet + (inches / 12); // Convert to total feet
        return isNaN(result) ? null : result;
      }

      const result = parseFloat(cleaned);
      return isNaN(result) ? null : result;
    } else {
      // Running events: parse times like "10.52", "3:55.38", "32:09.2"
      const parts = markRaw.split(':');

      if (parts.length === 1) {
        // Simple seconds: "10.52"
        const result = parseFloat(parts[0]);
        return isNaN(result) ? null : result;
      } else if (parts.length === 2) {
        // Minutes:seconds: "3:55.38"
        const minutes = parseFloat(parts[0]);
        const seconds = parseFloat(parts[1]);
        const result = minutes * 60 + seconds;
        return isNaN(result) ? null : result;
      } else if (parts.length === 3) {
        // Hours:minutes:seconds: "1:05:32.1"
        const hours = parseFloat(parts[0]);
        const minutes = parseFloat(parts[1]);
        const seconds = parseFloat(parts[2]);
        const result = hours * 3600 + minutes * 60 + seconds;
        return isNaN(result) ? null : result;
      }
    }

    return null;
  };

  // Check if event is a relay (team event - exclude from PRs)
  const isRelayEvent = (eventName: string): boolean => {
    const lower = eventName.toLowerCase();
    return /\d\s*x\s*\d/i.test(lower) || // 4x100, 4 x 100, etc.
      lower.includes('relay') ||
      lower === 'dmr' ||
      lower === 'smr' ||
      lower.includes('distance medley') ||
      lower.includes('sprint medley');
  };

  // Use actual personal records from database, sorted by event name (excluding relays)
  const sortedPersonalRecords = useMemo(() => {
    return [...personalRecords]
      .filter(pr => !isRelayEvent(pr.event_name))
      .sort((a, b) => a.event_name.localeCompare(b.event_name));
  }, [personalRecords]);

  // Get academic track season from date (e.g., "2025-26")
  // Season runs from September of year 1 through August of year 2
  // e.g., September 2025 - August 2026 = "2025-26"
  const getTrackSeason = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();

    if (month >= 9) {
      // Sep-Dec = start of new season (year to year+1)
      return `${year}-${(year + 1).toString().slice(-2)}`;
    } else {
      // Jan-Aug = end of season (year-1 to year)
      return `${year - 1}-${year.toString().slice(-2)}`;
    }
  };

  // Get available track seasons from performance data
  const availableSeasons = useMemo(() => {
    const seasons = new Set<string>();
    performances.forEach(p => {
      const season = getTrackSeason(p.date);
      if (season) {
        seasons.add(season);
      }
    });
    // Sort: most recent first
    return Array.from(seasons).sort().reverse();
  }, [performances]);

  // Set default selected season
  React.useEffect(() => {
    if (availableSeasons.length > 0 && !selectedSeason) {
      setSelectedSeason(availableSeasons[0]);
    }
  }, [availableSeasons, selectedSeason]);

  // Calculate Season Bests for selected track season
  const seasonBests = useMemo(() => {
    if (!selectedSeason || !performances.length) return [];

    // Filter to only performances from the selected track season
    const seasonPerfs = performances.filter(p => {
      const season = getTrackSeason(p.date);
      return season === selectedSeason;
    });

    // Find best mark per event (skip invalid marks like NT, DNF, etc.)
    // Use normalized event names as keys to handle variations like "200 Meters" vs "Men's 200 Meters"
    const eventBests = new Map<string, Performance>();
    seasonPerfs.forEach(perf => {
      // Skip relay events
      if (isRelayEvent(perf.event_name)) return;

      const perfValue = parseMarkToNumber(perf.mark_raw, perf.event_name);

      // Skip results with invalid/unparseable marks
      if (perfValue === null) return;

      // group by the DB canonical event so one event yields exactly one season best
      const normalizedName = canonicalEventName(perf);
      const existing = eventBests.get(normalizedName);

      if (!existing) {
        eventBests.set(normalizedName, perf);
      } else {
        const isField = isFieldEvent(perf.event_name);
        const existingValue = parseMarkToNumber(existing.mark_raw, existing.event_name);

        if (existingValue !== null) {
          if (isField) {
            // Field events: higher is better (furthest/highest)
            if (perfValue > existingValue) {
              eventBests.set(normalizedName, perf);
            }
          } else {
            // Running events: lower is better (fastest)
            if (perfValue < existingValue) {
              eventBests.set(normalizedName, perf);
            }
          }
        } else {
          // Existing has invalid mark, replace with valid one
          eventBests.set(normalizedName, perf);
        }
      }
    });
    return Array.from(eventBests.values()).sort((a, b) =>
      normalizeEventName(a.event_name).localeCompare(normalizeEventName(b.event_name))
    );
  }, [performances, selectedSeason]);

  // All results grouped by meet and sorted by date
  const groupedResults = useMemo(() => {
    const grouped = new Map<string, {
      meetName: string;
      startDate: string;
      endDate: string;
      events: Performance[];
    }>();

    [...performances]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(perf => {
        const meetKey = perf.meet_name;
        if (!grouped.has(meetKey)) {
          grouped.set(meetKey, {
            meetName: perf.meet_name,
            startDate: perf.date,
            endDate: perf.date,
            events: [],
          });
        }
        const meet = grouped.get(meetKey)!;
        if (perf.date < meet.startDate) meet.startDate = perf.date;
        if (perf.date > meet.endDate) meet.endDate = perf.date;
        meet.events.push(perf);
      });

    return Array.from(grouped.values())
      .sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
  }, [performances]);

  // Progression data (showing improvement over time for each event)
  const progressionData = useMemo(() => {
    // Use normalized event names as keys to handle variations
    const eventProgressions = new Map<string, Performance[]>();

    performances.forEach(perf => {
      // Skip relay events
      if (isRelayEvent(perf.event_name)) return;

      const normalizedName = normalizeEventName(perf.event_name);
      if (!eventProgressions.has(normalizedName)) {
        eventProgressions.set(normalizedName, []);
      }
      eventProgressions.get(normalizedName)!.push(perf);
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

  // Get list of available events (normalized, excluding relays)
  const availableEvents = useMemo(() => {
    const events = new Set(
      performances
        .filter(p => !isRelayEvent(p.event_name))
        .map(p => normalizeEventName(p.event_name))
    );
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
      <Text style={styles.contentSubtitle}>{sortedPersonalRecords.length} events</Text>

      {sortedPersonalRecords.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trophy-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>No personal records available</Text>
        </View>
      ) : (
        sortedPersonalRecords.map((pr, index) => (
          <View key={index} style={styles.statCard}>
            <View style={styles.statHeader}>
              <View style={styles.eventNameContainer}>
                <Text style={styles.eventName}>{normalizeEventName(pr.event_name)}</Text>
                {pr.season_indicator && (
                  <View style={[styles.seasonBadge, pr.season_indicator === 'I' ? styles.seasonBadgeIndoor : styles.seasonBadgeOutdoor]}>
                    <Text style={styles.seasonBadgeText}>{pr.season_indicator}</Text>
                  </View>
                )}
              </View>
              <View style={styles.prBadge}>
                <Ionicons name="trophy" size={14} color={colors.text.white} />
                <Text style={styles.prBadgeText}>PR</Text>
              </View>
            </View>
            <View style={styles.markContainer}>
              {(() => {
                const formattedMark = formatFieldEventMark(pr.mark_raw, pr.event_name);
                if (typeof formattedMark === 'object') {
                  return (
                    <>
                      <Text style={styles.markValue}>{formattedMark.metric}</Text>
                      <Text style={styles.markValueSecondary}>{formattedMark.imperial}</Text>
                    </>
                  );
                }
                return <Text style={styles.markValue}>{pr.mark_raw}</Text>;
              })()}
            </View>
          </View>
        ))
      )}
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

        <Text style={styles.contentSubtitle}>{seasonBests.length} events in {selectedSeason} season</Text>

      {seasonBests.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={48} color={colors.text.tertiary} />
          <Text style={styles.emptyText}>No performances this season yet</Text>
        </View>
      ) : (
        seasonBests.map((sb, index) => (
          <View key={index} style={styles.statCard}>
            <View style={styles.statHeader}>
              <Text style={styles.eventName}>{normalizeEventName(sb.event_name)}</Text>
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
      <Text style={styles.contentSubtitle}>{groupedResults.length} meets</Text>

      {groupedResults.map((meet, meetIndex) => (
        <View key={meetIndex} style={styles.meetCard}>
          {/* Meet Header */}
          <View style={styles.meetHeader}>
            <Text style={styles.meetName}>{meet.meetName}</Text>
            <Text style={styles.meetDate}>
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
          </View>

          {/* Events List */}
          <View style={styles.eventsList}>
            {meet.events.map((event, eventIndex) => (
              <View
                key={eventIndex}
                style={[
                  styles.eventRow,
                  eventIndex === meet.events.length - 1 && styles.eventRowLast
                ]}
              >
                <View style={styles.eventInfo}>
                  <Text style={styles.eventNameText}>{normalizeEventName(event.event_name)}</Text>
                  <Text style={styles.eventMark}>{event.mark_raw}</Text>
                </View>
                <View style={styles.placeBadgeSmall}>
                  <Text style={styles.placeTextSmall}>{event.place}</Text>
                  <Text style={styles.placeSuffixSmall}>
                    {event.place === 1 ? 'st' : event.place === 2 ? 'nd' : event.place === 3 ? 'rd' : 'th'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const renderProgression = () => {
    // Get performances for selected event (compare normalized names)
    const eventPerformances = performances
      .filter(p => normalizeEventName(p.event_name) === selectedEvent)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Prepare data for chart - use parsed time from mark_raw if mark_seconds is not available
    const chartData = eventPerformances.map((p, idx, arr) => {
      const time = p.mark_seconds || parseMarkToNumber(p.mark_raw, selectedEvent) || 0;
      const validTimes = arr.slice(0, idx + 1).map(x => x.mark_seconds || parseMarkToNumber(x.mark_raw, selectedEvent)).filter((t): t is number => t !== null && t > 0);
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
  eventNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  seasonBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  seasonBadgeIndoor: {
    backgroundColor: '#6366F1', // Indigo for indoor
  },
  seasonBadgeOutdoor: {
    backgroundColor: '#10B981', // Green for outdoor
  },
  seasonBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.text.white,
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
    backgroundColor: colors.semantic.success,
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
    backgroundColor: colors.semantic.success,
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
  // Meet card styles (grouped results)
  meetCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    marginBottom: 16,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    overflow: 'hidden',
  },
  meetHeader: {
    backgroundColor: colors.backgrounds.cream,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.thick,
  },
  meetName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  meetDate: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  eventsList: {
    paddingVertical: 4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
  },
  eventRowLast: {
    borderBottomWidth: 0,
  },
  eventInfo: {
    flex: 1,
  },
  eventNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 4,
  },
  eventMark: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
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
});
