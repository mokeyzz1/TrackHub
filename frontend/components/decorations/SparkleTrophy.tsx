import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../../design-system/colors';

interface SparkleTrophyProps {
  size?: number;
  color?: string;
}

export const SparkleTrophy: React.FC<SparkleTrophyProps> = ({
  size = 24,
  color = colors.primary.finishYellow
}) => {
  const sparkle1 = useRef(new Animated.Value(0)).current;
  const sparkle2 = useRef(new Animated.Value(0)).current;
  const sparkle3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createSparkleAnimation = (sparkle: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(sparkle, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(sparkle, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
    };

    Animated.parallel([
      createSparkleAnimation(sparkle1, 0),
      createSparkleAnimation(sparkle2, 200),
      createSparkleAnimation(sparkle3, 400),
    ]).start();
  }, [sparkle1, sparkle2, sparkle3]);

  const sparkleStyle = (sparkle: Animated.Value, position: any) => ({
    position: 'absolute' as const,
    ...position,
    opacity: sparkle,
    transform: [
      {
        scale: sparkle.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
        }),
      },
    ],
  });

  return (
    <View style={styles.container}>
      <Ionicons name="trophy" size={size} color={color} />

      {/* Sparkles */}
      <Animated.View style={sparkleStyle(sparkle1, { top: -4, right: -4 })}>
        <View style={[styles.sparkle, { backgroundColor: color }]} />
      </Animated.View>

      <Animated.View style={sparkleStyle(sparkle2, { top: 2, left: -4 })}>
        <View style={[styles.sparkle, { backgroundColor: color }]} />
      </Animated.View>

      <Animated.View style={sparkleStyle(sparkle3, { bottom: 0, right: -2 })}>
        <View style={[styles.sparkle, { backgroundColor: color }]} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  sparkle: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.borders.thick,
  },
});
