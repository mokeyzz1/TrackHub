import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../design-system/colors';

interface PR {
  event_name: string;
  mark_raw: string;
}

interface AthleteShareCardProps {
  athleteName: string;
  schoolName: string;
  division?: string;
  prs: PR[];
}

export const AthleteShareCard = forwardRef<View, AthleteShareCardProps>(
  ({ athleteName, schoolName, division, prs }, ref) => {
    // Get initials
    const initials = athleteName.split(' ').map(n => n[0]).slice(0, 2).join('');

    // Take top 5 PRs
    const topPRs = prs.slice(0, 5);

    return (
      <View ref={ref} style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={colors.gradients.trackHero as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <View style={styles.brandRow}>
            <Ionicons name="trophy" size={20} color={colors.text.white} />
            <Text style={styles.brandText}>TRACKHUB</Text>
          </View>
        </LinearGradient>

        {/* Athlete Info */}
        <View style={styles.athleteSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <Text style={styles.athleteName}>{athleteName}</Text>
          <Text style={styles.schoolName}>{schoolName}</Text>
          {division && <Text style={styles.division}>{division}</Text>}
        </View>

        {/* PRs */}
        <View style={styles.prsSection}>
          <Text style={styles.prsTitle}>Personal Records</Text>
          {topPRs.map((pr, index) => (
            <View key={index} style={styles.prRow}>
              <View style={styles.prEvent}>
                <Ionicons name="flash" size={14} color={colors.primary.trackOrange} />
                <Text style={styles.prEventText}>{pr.event_name}</Text>
              </View>
              <Text style={styles.prMark}>{pr.mark_raw}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Download TrackHub</Text>
          <Text style={styles.footerUrl}>trackhub.app</Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: 350,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
  },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brandText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 2,
  },
  athleteSection: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: colors.borders.light,
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.primary.trackOrange,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  initials: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.white,
  },
  athleteName: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
  },
  schoolName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
    marginTop: 4,
  },
  division: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary.trackOrange,
    marginTop: 4,
  },
  prsSection: {
    padding: 16,
  },
  prsTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  prRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    marginBottom: 8,
  },
  prEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prEventText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
  },
  prMark: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
  },
  footer: {
    backgroundColor: colors.borders.thick,
    paddingVertical: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.white,
  },
  footerUrl: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary.finishYellow,
    marginTop: 2,
  },
});
