import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../design-system/colors';

export interface FilterOptions {
  gender?: 'all' | 'men' | 'women' | 'mixed';
  eventType?: string[];
  division?: string[];
  conference?: string[];
  sortBy?: 'time' | 'date' | 'name' | 'rank';
  sortOrder?: 'asc' | 'desc';
  qualifyingOnly?: boolean;
}

interface AdvancedFilterProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FilterOptions) => void;
  initialFilters?: FilterOptions;
  showEventTypeFilter?: boolean;
  showDivisionFilter?: boolean;
  showConferenceFilter?: boolean;
  showSortOptions?: boolean;
}

export const AdvancedFilter: React.FC<AdvancedFilterProps> = ({
  visible,
  onClose,
  onApply,
  initialFilters = {},
  showEventTypeFilter = true,
  showDivisionFilter = true,
  showConferenceFilter = true,
  showSortOptions = true,
}) => {
  const [filters, setFilters] = useState<FilterOptions>(initialFilters);

  const eventTypes = ['Sprints', 'Distance', 'Hurdles', 'Jumps', 'Throws', 'Multi'];
  const divisions = ['D1', 'D2', 'D3', 'NAIA', 'NJCAA'];
  const conferences = ['Pac-12', 'Big Ten', 'SEC', 'ACC', 'Big 12', 'Ivy League'];

  const handleReset = () => {
    setFilters({});
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const toggleArrayFilter = (key: keyof FilterOptions, value: string) => {
    const currentArray = (filters[key] as string[]) || [];
    const newArray = currentArray.includes(value)
      ? currentArray.filter((item) => item !== value)
      : [...currentArray, value];

    setFilters({ ...filters, [key]: newArray.length > 0 ? newArray : undefined });
  };

  const isArrayFilterSelected = (key: keyof FilterOptions, value: string): boolean => {
    const currentArray = (filters[key] as string[]) || [];
    return currentArray.includes(value);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity onPress={handleReset}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Gender Filter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gender</Text>
            <View style={styles.optionsGrid}>
              {['all', 'men', 'women', 'mixed'].map((gender) => (
                <TouchableOpacity
                  key={gender}
                  style={[
                    styles.optionChip,
                    filters.gender === gender && styles.optionChipSelected,
                  ]}
                  onPress={() => setFilters({ ...filters, gender: gender as any })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      filters.gender === gender && styles.optionTextSelected,
                    ]}
                  >
                    {gender.charAt(0).toUpperCase() + gender.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Event Type Filter */}
          {showEventTypeFilter && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Event Type</Text>
              <View style={styles.optionsGrid}>
                {eventTypes.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.optionChip,
                      isArrayFilterSelected('eventType', type) && styles.optionChipSelected,
                    ]}
                    onPress={() => toggleArrayFilter('eventType', type)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isArrayFilterSelected('eventType', type) && styles.optionTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Division Filter */}
          {showDivisionFilter && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Division</Text>
              <View style={styles.optionsGrid}>
                {divisions.map((div) => (
                  <TouchableOpacity
                    key={div}
                    style={[
                      styles.optionChip,
                      isArrayFilterSelected('division', div) && styles.optionChipSelected,
                    ]}
                    onPress={() => toggleArrayFilter('division', div)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isArrayFilterSelected('division', div) && styles.optionTextSelected,
                      ]}
                    >
                      {div}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Conference Filter */}
          {showConferenceFilter && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Conference</Text>
              <View style={styles.optionsGrid}>
                {conferences.map((conf) => (
                  <TouchableOpacity
                    key={conf}
                    style={[
                      styles.optionChip,
                      isArrayFilterSelected('conference', conf) && styles.optionChipSelected,
                    ]}
                    onPress={() => toggleArrayFilter('conference', conf)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isArrayFilterSelected('conference', conf) && styles.optionTextSelected,
                      ]}
                    >
                      {conf}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Qualifying Only Toggle */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() =>
                setFilters({ ...filters, qualifyingOnly: !filters.qualifyingOnly })
              }
            >
              <View>
                <Text style={styles.toggleTitle}>Qualifying Times Only</Text>
                <Text style={styles.toggleSubtitle}>Show only nationally qualifying marks</Text>
              </View>
              <View
                style={[
                  styles.toggleSwitch,
                  filters.qualifyingOnly && styles.toggleSwitchActive,
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    filters.qualifyingOnly && styles.toggleKnobActive,
                  ]}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Sort Options */}
          {showSortOptions && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sort By</Text>
              <View style={styles.optionsGrid}>
                {['time', 'date', 'name', 'rank'].map((sort) => (
                  <TouchableOpacity
                    key={sort}
                    style={[
                      styles.optionChip,
                      filters.sortBy === sort && styles.optionChipSelected,
                    ]}
                    onPress={() => setFilters({ ...filters, sortBy: sort as any })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        filters.sortBy === sort && styles.optionTextSelected,
                      ]}
                    >
                      {sort.charAt(0).toUpperCase() + sort.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {filters.sortBy && (
                <View style={styles.sortOrderRow}>
                  <TouchableOpacity
                    style={[
                      styles.sortOrderButton,
                      filters.sortOrder === 'asc' && styles.sortOrderButtonActive,
                    ]}
                    onPress={() => setFilters({ ...filters, sortOrder: 'asc' })}
                  >
                    <Ionicons
                      name="arrow-up"
                      size={20}
                      color={
                        filters.sortOrder === 'asc' ? colors.text.white : colors.text.primary
                      }
                    />
                    <Text
                      style={[
                        styles.sortOrderText,
                        filters.sortOrder === 'asc' && styles.sortOrderTextActive,
                      ]}
                    >
                      Ascending
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.sortOrderButton,
                      filters.sortOrder === 'desc' && styles.sortOrderButtonActive,
                    ]}
                    onPress={() => setFilters({ ...filters, sortOrder: 'desc' })}
                  >
                    <Ionicons
                      name="arrow-down"
                      size={20}
                      color={
                        filters.sortOrder === 'desc' ? colors.text.white : colors.text.primary
                      }
                    />
                    <Text
                      style={[
                        styles.sortOrderText,
                        filters.sortOrder === 'desc' && styles.sortOrderTextActive,
                      ]}
                    >
                      Descending
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={styles.bottomSpacing} />
        </ScrollView>

        {/* Apply Button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply Filters</Text>
            <Ionicons name="checkmark" size={24} color={colors.text.white} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 4,
    borderBottomColor: colors.borders.thick,
    backgroundColor: colors.backgrounds.white,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
  },
  resetText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.primary.trackOrange,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 12,
    textShadowColor: colors.backgrounds.white,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  optionChipSelected: {
    backgroundColor: colors.primary.trackOrange,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
  },
  optionTextSelected: {
    color: colors.text.white,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 16,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  toggleSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  toggleSwitch: {
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 3,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: colors.performance.newPR,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.text.primary,
  },
  toggleKnobActive: {
    backgroundColor: colors.text.white,
    alignSelf: 'flex-end',
  },
  sortOrderRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  sortOrderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  sortOrderButtonActive: {
    backgroundColor: colors.primary.trackOrange,
  },
  sortOrderText: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.primary,
  },
  sortOrderTextActive: {
    color: colors.text.white,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 4,
    borderTopColor: colors.borders.thick,
    backgroundColor: colors.backgrounds.white,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    paddingVertical: 16,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  applyButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.white,
  },
  bottomSpacing: {
    height: 40,
  },
});
