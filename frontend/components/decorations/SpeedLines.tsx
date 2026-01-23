import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../../design-system/colors';

interface SpeedLinesProps {
  direction?: 'right' | 'left';
  color?: string;
}

export const SpeedLines: React.FC<SpeedLinesProps> = ({
  direction = 'right',
  color = colors.primary.trackOrange,
}) => {
  const line1 = useRef(new Animated.Value(0)).current;
  const line2 = useRef(new Animated.Value(0)).current;
  const line3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createLineAnimation = (line: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(line, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.delay(200),
          Animated.timing(line, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    Animated.parallel([
      createLineAnimation(line1, 0),
      createLineAnimation(line2, 100),
      createLineAnimation(line3, 200),
    ]).start();
  }, [line1, line2, line3]);

  const lineAnimatedStyle = (line: Animated.Value, offset: number) => ({
    opacity: line,
    transform: [
      {
        translateX: line.interpolate({
          inputRange: [0, 1],
          outputRange: direction === 'right' ? [0, 40] : [0, -40],
        }),
      },
      {
        scaleX: line.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 1, 0],
        }),
      },
    ],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.line, { backgroundColor: color, top: 0 }, lineAnimatedStyle(line1, 0)]} />
      <Animated.View style={[styles.line, { backgroundColor: color, top: 6 }, lineAnimatedStyle(line2, 6)]} />
      <Animated.View style={[styles.line, { backgroundColor: color, top: 12 }, lineAnimatedStyle(line3, 12)]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 18,
    justifyContent: 'center',
    position: 'relative',
  },
  line: {
    position: 'absolute',
    width: 30,
    height: 3,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.borders.thick,
  },
});
