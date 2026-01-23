import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import meetData from '../../backend/meet_59182_complete.json';

type EventTab = 'results' | 'startLists' | 'entries' | 'splits';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<EventTab>('results');

  const event = meetData.events.find((e) => e.eventId === id);

  if (!event) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Event not found</Text>
      </SafeAreaView>
    );
  }

  const hasResults = event.results?.rs && event.results.rs.length > 0;
  const hasStartLists = event.heats?.it && event.heats.it.length > 0;
  const hasEntries = event.entries?.es && event.entries.es.length > 0;
  const hasSplits = event.splits?.spr && event.splits.spr.length > 0;

  // Group heats by heat number
  const heatsByNumber: { [key: number]: any[] } = {};
  if (hasStartLists) {
    event.heats!.it.forEach((entry: any) => {
      if (!heatsByNumber[entry.hn]) {
        heatsByNumber[entry.hn] = [];
      }
      heatsByNumber[entry.hn].push(entry);
    });
  }

  const renderResults = () => {
    if (!hasResults) {
      return <Text style={styles.noDataText}>No results available yet</Text>;
    }

    return (
      <View style={styles.tableContainer}>
        {/* Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerText, styles.placeCol]}>Pl</Text>
          <Text style={[styles.headerText, styles.athleteCol]}>Athlete</Text>
          <Text style={[styles.headerText, styles.teamCol]}>Team</Text>
          <Text style={[styles.headerText, styles.markCol]}>Mark</Text>
        </View>

        {/* Rows */}
        {event.results!.rs.map((result: any, index: number) => (
          <View
            key={index}
            style={[
              styles.tableRow,
              index % 2 === 0 && styles.tableRowEven
            ]}
          >
            <Text style={[styles.cellText, styles.placeCol, styles.placeText]}>{result.p}</Text>
            <Text style={[styles.cellText, styles.athleteCol]} numberOfLines={1}>{result.an}</Text>
            <Text style={[styles.cellText, styles.teamCol, styles.teamText]} numberOfLines={1}>{result.tn}</Text>
            <View style={styles.markCol}>
              <Text style={[styles.cellText, styles.markText]}>{result.m}</Text>
              {result.w && <Text style={styles.windText}>{result.w}</Text>}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderStartLists = () => {
    if (!hasStartLists) {
      return <Text style={styles.noDataText}>No start lists available</Text>;
    }

    const heatNumbers = Object.keys(heatsByNumber).sort((a, b) => Number(a) - Number(b));

    return (
      <ScrollView style={styles.scrollContent}>
        {heatNumbers.map((heatNum) => {
          const heatEntries = heatsByNumber[Number(heatNum)].sort(
            (a, b) => (a.hli || 0) - (b.hli || 0)
          );

          return (
            <View key={heatNum} style={styles.heatSection}>
              <Text style={styles.heatTitle}>Heat {heatNum}</Text>

              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.headerText, styles.laneCol]}>Ln</Text>
                <Text style={[styles.headerText, styles.athleteCol]}>Athlete</Text>
                <Text style={[styles.headerText, styles.teamCol]}>Team</Text>
                <Text style={[styles.headerText, styles.yearCol]}>Yr</Text>
              </View>

              {/* Rows */}
              {heatEntries.map((entry: any, index: number) => (
                <View
                  key={index}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 && styles.tableRowEven
                  ]}
                >
                  <Text style={[styles.cellText, styles.laneCol, styles.laneText]}>{entry.hli || '?'}</Text>
                  <Text style={[styles.cellText, styles.athleteCol]} numberOfLines={1}>{entry.a.n}</Text>
                  <Text style={[styles.cellText, styles.teamCol, styles.teamText]} numberOfLines={1}>{entry.a.t.f}</Text>
                  <Text style={[styles.cellText, styles.yearCol, styles.yearText]}>{entry.a.y || '-'}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderEntries = () => {
    if (!hasEntries) {
      return <Text style={styles.noDataText}>No entries available</Text>;
    }

    return (
      <View style={styles.tableContainer}>
        {/* Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerText, styles.athleteCol]}>Athlete</Text>
          <Text style={[styles.headerText, styles.teamCol]}>Team</Text>
          <Text style={[styles.headerText, styles.seedCol]}>Seed</Text>
        </View>

        {/* Rows */}
        {event.entries!.es.map((entry: any, index: number) => (
          <View
            key={index}
            style={[
              styles.tableRow,
              index % 2 === 0 && styles.tableRowEven
            ]}
          >
            <Text style={[styles.cellText, styles.athleteCol]} numberOfLines={1}>{entry.an}</Text>
            <Text style={[styles.cellText, styles.teamCol, styles.teamText]} numberOfLines={1}>{entry.tn}</Text>
            <Text style={[styles.cellText, styles.seedCol, styles.seedText]}>{entry.sm || '-'}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderSplits = () => {
    if (!hasSplits) {
      return <Text style={styles.noDataText}>No splits available for this event</Text>;
    }

    const splitDistances = event.splits!.spr[0]?.s?.map((s: any) => s.n) || [];

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.splitsTableContainer}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.placeCol]}>Pl</Text>
            <Text style={[styles.headerText, styles.athleteColWide]}>Athlete</Text>
            {splitDistances.map((dist: string, idx: number) => (
              <Text key={idx} style={[styles.headerText, styles.splitCol]}>{dist}m</Text>
            ))}
            <Text style={[styles.headerText, styles.splitCol, styles.finalCol]}>Final</Text>
          </View>

          {/* Rows */}
          {event.splits!.spr.map((splitResult: any, index: number) => (
            <View
              key={index}
              style={[
                styles.tableRow,
                index % 2 === 0 && styles.tableRowEven
              ]}
            >
              <Text style={[styles.cellText, styles.placeCol, styles.placeText]}>{splitResult.r.p}</Text>
              <Text style={[styles.cellText, styles.athleteColWide]} numberOfLines={1}>{splitResult.r.an}</Text>
              {splitResult.s.map((split: any, idx: number) => (
                <Text key={idx} style={[styles.cellText, styles.splitCol]}>{split.t}</Text>
              ))}
              <Text style={[styles.cellText, styles.splitCol, styles.finalText]}>{splitResult.r.m}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: event.name,
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView style={styles.container}>
        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'results' && styles.activeTabButton]}
            onPress={() => setActiveTab('results')}
            disabled={!hasResults}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'results' && styles.activeTabButtonText,
                !hasResults && styles.disabledTabText,
              ]}
            >
              Results
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'startLists' && styles.activeTabButton]}
            onPress={() => setActiveTab('startLists')}
            disabled={!hasStartLists}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'startLists' && styles.activeTabButtonText,
                !hasStartLists && styles.disabledTabText,
              ]}
            >
              Start Lists
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'entries' && styles.activeTabButton]}
            onPress={() => setActiveTab('entries')}
            disabled={!hasEntries}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'entries' && styles.activeTabButtonText,
                !hasEntries && styles.disabledTabText,
              ]}
            >
              Entries
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'splits' && styles.activeTabButton]}
            onPress={() => setActiveTab('splits')}
            disabled={!hasSplits}
          >
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'splits' && styles.activeTabButtonText,
                !hasSplits && styles.disabledTabText,
              ]}
            >
              Splits
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <ScrollView style={styles.scrollView}>
          {activeTab === 'results' && renderResults()}
          {activeTab === 'startLists' && renderStartLists()}
          {activeTab === 'entries' && renderEntries()}
          {activeTab === 'splits' && renderSplits()}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#007AFF',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  activeTabButtonText: {
    color: '#007AFF',
  },
  disabledTabText: {
    color: '#ccc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  noDataText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
    fontStyle: 'italic',
  },

  // Table Styles
  tableContainer: {
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 2,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#fafafa',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 14,
    color: '#1a1a1a',
  },

  // Column Widths
  placeCol: {
    width: 35,
  },
  laneCol: {
    width: 35,
  },
  athleteCol: {
    flex: 2,
  },
  athleteColWide: {
    width: 140,
  },
  teamCol: {
    flex: 1.5,
  },
  markCol: {
    width: 70,
    alignItems: 'flex-end',
  },
  yearCol: {
    width: 35,
    alignItems: 'center',
  },
  seedCol: {
    width: 70,
    alignItems: 'flex-end',
  },
  splitCol: {
    width: 65,
    alignItems: 'flex-end',
  },
  finalCol: {
    width: 75,
  },

  // Text Styles
  placeText: {
    fontWeight: '700',
    color: '#007AFF',
  },
  laneText: {
    fontWeight: '600',
    color: '#666',
  },
  teamText: {
    fontSize: 13,
    color: '#666',
  },
  yearText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  markText: {
    fontWeight: '700',
  },
  windText: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  seedText: {
    fontWeight: '600',
    color: '#007AFF',
  },
  finalText: {
    fontWeight: '700',
    color: '#007AFF',
  },

  // Heat Section
  heatSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heatTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },

  // Splits Table
  splitsTableContainer: {
    backgroundColor: '#fff',
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
