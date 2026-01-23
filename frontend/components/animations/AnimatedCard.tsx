import * as Haptics from 'expo-haptics';
import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleSheet } from 'react-native';

interface AnimatedCardProps extends PressableProps {
  children: React.ReactNode;
  scaleAmount?: number;
  hapticFeedback?: boolean;
}

export const AnimatedCard: React.FC<AnimatedCardProps> = ({
  children,
  scaleAmount = 0.97,
  hapticFeedback = true,
  onPress,
  ...props
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    // Add haptic feedback on press
    if (hapticFeedback) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    Animated.spring(scaleAnim, {
      toValue: scaleAmount,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 10,
    }).start();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      {...props}
    >
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};
