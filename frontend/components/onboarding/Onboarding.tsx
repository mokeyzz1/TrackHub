import React, { useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import AppIntroSlider from 'react-native-app-intro-slider';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../../design-system';

const { width } = Dimensions.get('window');

interface Slide {
  key: string;
  title: string;
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
  backgroundColor: string;
  gradient: string[];
}

const slides: Slide[] = [
  {
    key: '1',
    title: 'Welcome to Track Hub',
    text: 'Your one-stop hub for college track & field performances, rankings, and live results',
    icon: 'flag',
    backgroundColor: '#FF6B35',
    gradient: ['#FF6B35', '#FF8F66'],
  },
  {
    key: '2',
    title: 'Track Top Performances',
    text: 'Discover record-breaking performances, season bests, and trending athletes from across the nation',
    icon: 'trophy',
    backgroundColor: '#4A90E2',
    gradient: ['#4A90E2', '#6BA3E8'],
  },
  {
    key: '3',
    title: 'Follow Your Favorites',
    text: 'Search for athletes, schools, and events. Get instant access to stats, rankings, and upcoming meets',
    icon: 'star',
    backgroundColor: '#10B981',
    gradient: ['#10B981', '#34D399'],
  },
];

interface OnboardingProps {
  onDone: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onDone }) => {
  const sliderRef = useRef<AppIntroSlider>(null);

  const renderItem = ({ item }: { item: Slide }) => {
    return (
      <View style={styles.slide}>
        <LinearGradient
          colors={item.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        >
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name={item.icon} size={80} color={item.backgroundColor} />
            </View>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.text}>{item.text}</Text>
          </View>
        </LinearGradient>
      </View>
    );
  };

  const renderNextButton = () => {
    return (
      <View style={styles.button}>
        <Text style={styles.buttonText}>Next</Text>
        <Ionicons name="arrow-forward" size={20} color={colors.text.white} />
      </View>
    );
  };

  const renderDoneButton = () => {
    return (
      <View style={[styles.button, styles.doneButton]}>
        <Text style={styles.buttonText}>Get Started</Text>
        <Ionicons name="checkmark" size={20} color={colors.text.white} />
      </View>
    );
  };

  const renderSkipButton = () => {
    return (
      <TouchableOpacity onPress={onDone} style={styles.skipButton}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    );
  };

  return (
    <AppIntroSlider
      ref={sliderRef}
      data={slides}
      renderItem={renderItem}
      renderNextButton={renderNextButton}
      renderDoneButton={renderDoneButton}
      renderSkipButton={renderSkipButton}
      onDone={onDone}
      showSkipButton
      dotStyle={styles.dot}
      activeDotStyle={styles.activeDot}
    />
  );
};

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    width,
  },
  gradientBackground: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 100,
    paddingBottom: 80,
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  iconCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.backgrounds.white,
    borderWidth: 6,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  content: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.white,
    textAlign: 'center',
    textShadowColor: colors.borders.thick,
    textShadowOffset: { width: 3, height: 3 },
    textShadowRadius: 0,
  },
  text: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.white,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.borders.thick,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: spacing.radiusLg,
    borderWidth: 3,
    borderColor: colors.text.white,
  },
  doneButton: {
    backgroundColor: colors.primary.finishYellow,
    borderColor: colors.borders.thick,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.white,
  },
  skipButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.white,
  },
  dot: {
    backgroundColor: 'rgba(255,255,255,0.4)',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: colors.text.white,
    width: 24,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
});
