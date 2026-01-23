import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MedalIcon } from './MedalIcon';
import { TrophyIcon } from './TrophyIcon';
import { AnimatedMedal } from './AnimatedMedal';
import { colors } from '../../design-system/colors';
import { spacing } from '../../design-system/spacing';

export const IconShowcase: React.FC = () => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Medal Icons</Text>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <MedalIcon place={1} size={64} />
          <Text style={styles.label}>Gold</Text>
        </View>
        <View style={styles.iconBox}>
          <MedalIcon place={2} size={64} />
          <Text style={styles.label}>Silver</Text>
        </View>
        <View style={styles.iconBox}>
          <MedalIcon place={3} size={64} />
          <Text style={styles.label}>Bronze</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Trophy Icons</Text>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <TrophyIcon color="gold" size={64} />
          <Text style={styles.label}>Gold</Text>
        </View>
        <View style={styles.iconBox}>
          <TrophyIcon color="silver" size={64} />
          <Text style={styles.label}>Silver</Text>
        </View>
        <View style={styles.iconBox}>
          <TrophyIcon color="bronze" size={64} />
          <Text style={styles.label}>Bronze</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Animated Medals</Text>
      <View style={styles.row}>
        <View style={styles.iconBox}>
          <AnimatedMedal place={1} size={64} delay={0} />
          <Text style={styles.label}>Animated Gold</Text>
        </View>
        <View style={styles.iconBox}>
          <AnimatedMedal place={2} size={64} delay={200} />
          <Text style={styles.label}>Animated Silver</Text>
        </View>
        <View style={styles.iconBox}>
          <AnimatedMedal place={3} size={64} delay={400} />
          <Text style={styles.label}>Animated Bronze</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Different Sizes</Text>
      <View style={styles.row}>
        <MedalIcon place={1} size={32} />
        <MedalIcon place={1} size={48} />
        <MedalIcon place={1} size={64} />
        <MedalIcon place={1} size={80} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  iconBox: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgrounds.white,
    padding: spacing.lg,
    borderRadius: spacing.radiusMd,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
});
