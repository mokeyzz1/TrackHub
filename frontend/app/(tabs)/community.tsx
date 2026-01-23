import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../design-system/colors';
import { addToWaitlist } from '../../services/database';

export default function CommunityScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!isValidEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    setError(null);

    try {
      const result = await addToWaitlist(email, 'community');
      setSubmitted(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError('Something went wrong. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Community</Text>
          <Text style={styles.subtitle}>Connect with the track & field community</Text>
        </View>

        {/* Coming Soon Hero */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={['#7B68EE', '#9B59B6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.comingSoonBadge}>
              <Ionicons name="construct" size={12} color={colors.text.white} />
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>

            <View style={styles.heroIconContainer}>
              <MaterialCommunityIcons name="account-group" size={64} color={colors.text.white} />
            </View>

            <Text style={styles.heroTitle}>Community Hub</Text>
            <Text style={styles.heroSubtitle}>
              We're building something special for the track & field community
            </Text>
          </LinearGradient>
        </View>

        {/* Waitlist Signup - Moved up right after hero */}
        <View style={styles.waitlistCard}>
          {submitted ? (
            <>
              <View style={styles.successIcon}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              </View>
              <Text style={styles.successTitle}>You're on the list!</Text>
              <Text style={styles.successText}>
                We'll notify you when Community Hub launches. Thanks for your interest!
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="mail" size={32} color={colors.primary.trackOrange} />
              <Text style={styles.waitlistTitle}>Get Notified</Text>
              <Text style={styles.waitlistText}>
                Be the first to know when Community Hub launches
              </Text>

              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.emailInput}
                  placeholder="Enter your email"
                  placeholderTextColor={colors.text.muted}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    setError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.text.white} />
                  ) : (
                    <Ionicons name="arrow-forward" size={20} color={colors.text.white} />
                  )}
                </TouchableOpacity>
              </View>

              {error && (
                <Text style={styles.errorText}>{error}</Text>
              )}
            </>
          )}
        </View>

        {/* Features Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What's Coming</Text>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#FFE5E5' }]}>
              <Ionicons name="chatbubbles" size={28} color="#FF6B6B" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Live Chat Rooms</Text>
              <Text style={styles.featureDesc}>
                Join conversations during meets, discuss events in real-time
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#E5F3FF' }]}>
              <Ionicons name="people" size={28} color="#4A90D9" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Local Groups</Text>
              <Text style={styles.featureDesc}>
                Connect with runners in your area, find training partners
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#FFF3E5' }]}>
              <Ionicons name="trophy" size={28} color={colors.primary.trackOrange} />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>PR Celebrations</Text>
              <Text style={styles.featureDesc}>
                Share your achievements, celebrate with the community
              </Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={[styles.featureIcon, { backgroundColor: '#E5FFE5' }]}>
              <MaterialCommunityIcons name="message-text" size={28} color="#10B981" />
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>Discussion Forums</Text>
              <Text style={styles.featureDesc}>
                Training tips, gear reviews, meet previews and more
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgrounds.skyBlue,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  // Hero Card
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    overflow: 'hidden',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 5, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  heroGradient: {
    padding: 32,
    alignItems: 'center',
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  comingSoonText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 1,
  },
  heroIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Waitlist Card
  waitlistCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 24,
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  waitlistTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginTop: 10,
    marginBottom: 6,
  },
  waitlistText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  emailInput: {
    flex: 1,
    height: 50,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  submitButton: {
    width: 50,
    height: 50,
    backgroundColor: colors.primary.trackOrange,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B6B',
  },

  // Success State
  successIcon: {
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.tertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Features Section
  section: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 16,
  },
  featureCard: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.tertiary,
    lineHeight: 18,
  },

  bottomSpacing: {
    height: 40,
  },
});
