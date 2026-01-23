import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useLiveEvent } from '@/hooks/useLiveResults';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

export default function LiveEventScreen() {
  const { eventId, meetUrl, eventName } = useLocalSearchParams<{
    eventId: string;
    meetUrl: string;
    eventName: string;
  }>();

  const { results, loading, lastUpdated, refresh } = useLiveEvent(
    meetUrl || '',
    eventName || ''
  );

  const handleBack = () => {
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <ThemedView style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.tint} />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.liveContainer}>
            <View style={styles.liveDot} />
            <ThemedText style={styles.liveText}>LIVE</ThemedText>
          </View>

          <ThemedText type="subtitle" numberOfLines={2}>
            {eventName}
          </ThemedText>

          {lastUpdated && (
            <ThemedText style={styles.timestamp}>
              Updated {lastUpdated.toLocaleTimeString()}
            </ThemedText>
          )}
        </View>
      </ThemedView>

      {/* Results */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
      >
        {loading && results.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <ThemedText style={styles.loadingText}>Loading live results...</ThemedText>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color={Colors.light.icon} />
            <ThemedText type="subtitle" style={styles.emptyTitle}>
              Waiting for results
            </ThemedText>
            <ThemedText style={styles.emptyDescription}>
              Results will appear here as they come in
            </ThemedText>
          </View>
        ) : (
          <View style={styles.resultsContainer}>
            {results.map((result, index) => (
              <View
                key={result.live_result_id}
                style={[
                  styles.resultCard,
                  index < 3 && styles.podiumCard,
                ]}
              >
                <View
                  style={[
                    styles.placeContainer,
                    index === 0 && styles.firstPlace,
                    index === 1 && styles.secondPlace,
                    index === 2 && styles.thirdPlace,
                  ]}
                >
                  <ThemedText style={styles.place}>
                    {result.place || '-'}
                  </ThemedText>
                </View>

                <View style={styles.resultInfo}>
                  <ThemedText style={styles.participantName} numberOfLines={2}>
                    {result.participant_name}
                  </ThemedText>

                  <View style={styles.timeRow}>
                    <ThemedText style={styles.time}>
                      {result.mark_raw}
                    </ThemedText>

                    {result.splits && result.splits.length > 0 && (
                      <View style={styles.splitsContainer}>
                        {result.splits.map((split, i) => (
                          <Text key={i} style={styles.split}>
                            {split}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Ionicons name="sync" size={16} color={Colors.light.icon} />
        <ThemedText style={styles.footerText}>
          Auto-refreshing every 20 seconds
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
    marginBottom: 8,
  },
  headerContent: {
    gap: 8,
  },
  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
  },
  liveText: {
    color: '#ff3b30',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  timestamp: {
    fontSize: 12,
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  loadingText: {
    marginTop: 12,
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 80,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    textAlign: 'center',
    opacity: 0.6,
  },
  resultsContainer: {
    padding: 16,
  },
  resultCard: {
    flexDirection: 'row',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  podiumCard: {
    borderWidth: 2,
  },
  placeContainer: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
  },
  firstPlace: {
    backgroundColor: '#FFD700',
  },
  secondPlace: {
    backgroundColor: '#C0C0C0',
  },
  thirdPlace: {
    backgroundColor: '#CD7F32',
  },
  place: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  resultInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  timeRow: {
    gap: 8,
  },
  time: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.light.tint,
  },
  splitsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  split: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerText: {
    fontSize: 12,
    opacity: 0.5,
  },
});
