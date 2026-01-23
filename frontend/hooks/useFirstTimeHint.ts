import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HINT_PREFIX = '@hint_seen_';

export const useFirstTimeHint = (hintKey: string, delay: number = 1000) => {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    checkIfFirstTime();
  }, []);

  const checkIfFirstTime = async () => {
    try {
      const seen = await AsyncStorage.getItem(HINT_PREFIX + hintKey);
      if (!seen) {
        // Show hint after delay
        setTimeout(() => {
          setShowHint(true);
        }, delay);
      }
    } catch (error) {
      console.error('Error checking hint:', error);
    }
  };

  const dismissHint = async () => {
    try {
      await AsyncStorage.setItem(HINT_PREFIX + hintKey, 'true');
      setShowHint(false);
    } catch (error) {
      console.error('Error saving hint dismissal:', error);
    }
  };

  const resetHint = async () => {
    try {
      await AsyncStorage.removeItem(HINT_PREFIX + hintKey);
      setShowHint(false);
    } catch (error) {
      console.error('Error resetting hint:', error);
    }
  };

  return { showHint, dismissHint, resetHint };
};
