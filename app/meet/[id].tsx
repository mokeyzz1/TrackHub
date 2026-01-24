import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Sample data from meet 59182
import meetData from "../../backend/meet_59182_complete.json";

type Tab = "all" | "men" | "women" | "running" | "field";

export default function MeetDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("all");

  // Filter events based on active tab
  const filteredEvents = meetData.events.filter((event) => {
    if (activeTab === "all") return true;
    if (activeTab === "men") return event.results?.g === "Male";
    if (activeTab === "women") return event.results?.g === "Female";
    if (activeTab === "running") {
      const name = event.name.toLowerCase();
      return (
        name.includes("m ") || name.includes("mile") || name.includes("relay")
      );
    }
    if (activeTab === "field") {
      const name = event.name.toLowerCase();
      return (
        name.includes("throw") ||
        name.includes("jump") ||
        name.includes("vault")
      );
    }
    return true;
  });

  const getEventIcon = (eventName: string) => {
    const name = eventName.toLowerCase();
    if (
      name.includes("throw") ||
      name.includes("shot") ||
      name.includes("weight")
    )
      return "💪";
    if (name.includes("jump") || name.includes("vault")) return "🦘";
    if (name.includes("hurdle")) return "🏃‍♂️";
    return "🏃";
  };

  const getHeatCount = (event: any) => {
    if (!event.heats?.it) return 0;
    const heats = new Set(event.heats.it.map((entry: any) => entry.hn));
    return heats.size;
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Meet Details",
          headerBackTitle: "Back",
        }}
      />
      <SafeAreaView style={styles.container}>
        {/* Meet Header */}
        <View style={styles.header}>
          <Text style={styles.meetTitle}>Concordia Early Bird</Text>
          <Text style={styles.meetSubtitle}>
            Dec 13-14, 2024 • Concordia University
          </Text>
          <Text style={styles.meetInfo}>📍 Indoor Track</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statText}>{meetData.totalEvents} Events</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        </View>

        {/* Filter Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabsContent}
        >
          <TouchableOpacity
            style={[styles.tab, activeTab === "all" && styles.activeTab]}
            onPress={() => setActiveTab("all")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "all" && styles.activeTabText,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "men" && styles.activeTab]}
            onPress={() => setActiveTab("men")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "men" && styles.activeTabText,
              ]}
            >
              Men
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "women" && styles.activeTab]}
            onPress={() => setActiveTab("women")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "women" && styles.activeTabText,
              ]}
            >
              Women
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "running" && styles.activeTab]}
            onPress={() => setActiveTab("running")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "running" && styles.activeTabText,
              ]}
            >
              Running
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "field" && styles.activeTab]}
            onPress={() => setActiveTab("field")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "field" && styles.activeTabText,
              ]}
            >
              Field
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Events List */}
        <ScrollView style={styles.eventsList}>
          {filteredEvents.map((event, index) => {
            const heatCount = getHeatCount(event);
            const entryCount = event.entries?.es?.length || 0;
            const resultCount = event.results?.rs?.length || 0;
            const hasSplits = event.splits?.spr && event.splits.spr.length > 0;

            return (
              <View key={event.eventId || index} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <View style={styles.eventTitleRow}>
                    <Text style={styles.eventIcon}>
                      {getEventIcon(event.name)}
                    </Text>
                    <View style={styles.eventTitleContainer}>
                      <Text style={styles.eventName}>{event.name}</Text>
                      {heatCount > 0 && (
                        <Text style={styles.eventSubtext}>
                          {heatCount} {heatCount === 1 ? "Heat" : "Heats"}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </View>

                <View style={styles.eventStats}>
                  {entryCount > 0 && (
                    <Text style={styles.statBadge}>{entryCount} entries</Text>
                  )}
                  {resultCount > 0 && (
                    <Text style={styles.statBadge}>{resultCount} results</Text>
                  )}
                </View>

                <View style={styles.eventActions}>
                  {heatCount > 0 && (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionText}>⚡ Start Lists</Text>
                    </View>
                  )}
                  {hasSplits && (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionText}>📊 Splits</Text>
                    </View>
                  )}
                  {resultCount > 0 && (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionText}>🏆 Results</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    backgroundColor: "#fff",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  meetTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  meetSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  meetInfo: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  liveBadge: {
    backgroundColor: "#ff4444",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  tabsContainer: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  tabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    marginRight: 8,
  },
  activeTab: {
    backgroundColor: "#007AFF",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  activeTabText: {
    color: "#fff",
  },
  eventsList: {
    flex: 1,
  },
  eventCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventHeader: {
    marginBottom: 12,
  },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eventIcon: {
    fontSize: 24,
  },
  eventTitleContainer: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  eventSubtext: {
    fontSize: 12,
    color: "#666",
  },
  chevron: {
    fontSize: 24,
    color: "#ccc",
  },
  eventStats: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statBadge: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  eventActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionBadge: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionText: {
    fontSize: 12,
    color: "#1976d2",
    fontWeight: "600",
  },
});
