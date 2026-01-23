import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../design-system/colors';

interface PRRecord {
  date: string;
  time: number; // in seconds
  displayTime: string;
  meet: string;
  event: string;
}

interface PRHistoryChartProps {
  data: PRRecord[];
  athleteName: string;
}

export const PRHistoryChart: React.FC<PRHistoryChartProps> = ({ data, athleteName }) => {
  if (data.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No PR history yet</Text>
      </View>
    );
  }

  // Group by event
  const eventGroups = data.reduce((acc, record) => {
    if (!acc[record.event]) {
      acc[record.event] = [];
    }
    acc[record.event].push(record);
    return acc;
  }, {} as Record<string, PRRecord[]>);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PR Timeline</Text>
        <Text style={styles.subtitle}>{athleteName}</Text>
      </View>

      <View style={styles.timeline}>
        {Object.entries(eventGroups).map(([event, records], eventIndex) => {
          // Sort by date (oldest first)
          const sortedRecords = [...records].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );

          return (
            <View key={eventIndex} style={styles.eventSection}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventName}>{event}</Text>
                <View style={styles.eventBadge}>
                  <Text style={styles.eventBadgeText}>{sortedRecords.length} PRs</Text>
                </View>
              </View>

              <View style={styles.recordsTimeline}>
                {sortedRecords.map((record, index) => {
                  const isLatest = index === sortedRecords.length - 1;
                  const improvement =
                    index > 0
                      ? sortedRecords[index - 1].time - record.time
                      : null;

                  return (
                    <View key={index} style={styles.recordRow}>
                      {/* Timeline connector */}
                      <View style={styles.timelineConnector}>
                        <View
                          style={[
                            styles.timelineDot,
                            isLatest && styles.timelineDotLatest,
                          ]}
                        />
                        {index < sortedRecords.length - 1 && (
                          <View style={styles.timelineLine} />
                        )}
                      </View>

                      {/* Record card */}
                      <View
                        style={[
                          styles.recordCard,
                          isLatest && styles.recordCardLatest,
                        ]}
                      >
                        <View style={styles.recordHeader}>
                          <Text style={styles.recordTime}>{record.displayTime}</Text>
                          {improvement !== null && improvement > 0 && (
                            <View style={styles.improvementBadge}>
                              <Text style={styles.improvementText}>
                                -{improvement.toFixed(2)}s
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.recordMeet}>{record.meet}</Text>
                        <Text style={styles.recordDate}>{record.date}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* Summary stats */}
      <View style={styles.summaryStats}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total PRs</Text>
          <Text style={styles.statValue}>{data.length}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Events</Text>
          <Text style={styles.statValue}>{Object.keys(eventGroups).length}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Latest PR</Text>
          <Text style={styles.statValue}>
            {(() => {
              const latest = [...data].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              )[0];
              return new Date(latest.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
            })()}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 20,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  header: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.light,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  timeline: {
    gap: 24,
  },
  eventSection: {
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  eventBadge: {
    backgroundColor: colors.primary.trackOrange,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.text.white,
  },
  recordsTimeline: {
    gap: 16,
  },
  recordRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineConnector: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.primary.trackOrange,
  },
  timelineDotLatest: {
    backgroundColor: colors.performance.newPR,
    borderColor: colors.performance.newPR,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  timelineLine: {
    width: 3,
    flex: 1,
    backgroundColor: colors.primary.trackOrange,
    marginTop: 4,
  },
  recordCard: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 12,
  },
  recordCardLatest: {
    backgroundColor: colors.performance.newPR,
    borderWidth: 3,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recordTime: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  improvementBadge: {
    backgroundColor: colors.performance.improvement,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  improvementText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.text.white,
  },
  recordMeet: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 2,
  },
  recordDate: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: colors.borders.light,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    padding: 12,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.text.tertiary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary.trackOrange,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
});
