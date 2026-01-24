import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../design-system/colors';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export function WelcomeScreen({ onGetStarted }: WelcomeScreenProps) {
  return (
    <LinearGradient
      colors={['#87CEEB', '#B0E0E6']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Logo/Icon */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="run-fast" size={64} color={colors.primary.trackOrange} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Track Meet Tracker</Text>
        <Text style={styles.subtitle}>Your gateway to college track & field</Text>

        {/* Features */}
        <View style={styles.featuresContainer}>
          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="flash" size={24} color={colors.primary.trackOrange} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Live Results</Text>
              <Text style={styles.featureDesc}>Watch meets unfold in real-time</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="people" size={24} color={colors.primary.laneBlue} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Track Athletes</Text>
              <Text style={styles.featureDesc}>Follow your favorite runners</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureIcon}>
              <Ionicons name="calendar" size={24} color={colors.primary.duffPink} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>Upcoming Meets</Text>
              <Text style={styles.featureDesc}>Never miss an event</Text>
            </View>
          </View>
        </View>

        {/* Get Started Button */}
        <TouchableOpacity
          style={styles.button}
          onPress={onGetStarted}
          activeOpacity={0.9}
        >
          <Text style={styles.buttonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={24} color={colors.text.white} />
        </TouchableOpacity>

      </SafeAreaView>
    </LinearGradient>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.backgrounds.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  featuresContainer: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 40,
    gap: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgrounds.white,
    padding: 16,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.backgrounds.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary.trackOrange,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 30,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    gap: 12,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.white,
  },
});
