import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/useColorScheme';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { WelcomeScreen } from '../components/WelcomeScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';

const WELCOME_SEEN_KEY = '@track_meet_tracker_welcome_seen';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [showSplash, setShowSplash] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [checkingWelcome, setCheckingWelcome] = useState(true);

  useEffect(() => {
    // Check if user has seen welcome screen
    checkWelcomeStatus();
  }, []);

  useEffect(() => {
    // Show splash for 3 seconds (reduced from 8)
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  async function checkWelcomeStatus() {
    try {
      const seen = await AsyncStorage.getItem(WELCOME_SEEN_KEY);
      if (seen !== 'true') {
        setShowWelcome(true);
      }
    } catch (e) {
      // If error, just don't show welcome
    } finally {
      setCheckingWelcome(false);
    }
  }

  async function handleGetStarted() {
    try {
      await AsyncStorage.setItem(WELCOME_SEEN_KEY, 'true');
    } catch (e) {
      // Ignore storage errors
    }
    setShowWelcome(false);
  }

  if (showSplash || checkingWelcome) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: '#87CEEB',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Image
          source={require('../assets/images/splash-icon.png')}
          style={{ width: '85%', height: '85%' }}
          resizeMode="contain"
        />
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: '#87CEEB',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Text style={{ color: 'white' }}>Loading fonts...</Text>
      </View>
    );
  }

  if (showWelcome) {
    return <WelcomeScreen onGetStarted={handleGetStarted} />;
  }

  return (
    <ErrorBoundary>
      <FavoritesProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="athlete/[id]" />
            <Stack.Screen name="school/[id]" />
            <Stack.Screen name="event/[id]" />
            <Stack.Screen name="meet/[id]" />
            <Stack.Screen name="search" />
            <Stack.Screen name="compare-athletes" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </FavoritesProvider>
    </ErrorBoundary>
  );
}
