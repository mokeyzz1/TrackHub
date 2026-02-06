import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../../design-system/colors';

// Shimmer animation for skeleton loading
function ShimmerBox({ style }: { style?: any }) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.shimmerBox,
        style,
        { opacity },
      ]}
    />
  );
}

export function MeetCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <ShimmerBox style={styles.titleBox} />
        <ShimmerBox style={styles.dateBox} />
      </View>
      <View style={styles.metaRow}>
        <ShimmerBox style={styles.locationBox} />
      </View>
      <View style={styles.detailsRow}>
        <ShimmerBox style={styles.detailBox} />
        <ShimmerBox style={styles.detailBox} />
      </View>
    </View>
  );
}

export function MeetListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <MeetCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: 18,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: 18,
    marginBottom: 14,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  shimmerBox: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  titleBox: {
    width: '65%',
    height: 20,
    borderRadius: 10,
  },
  dateBox: {
    width: 70,
    height: 24,
    borderRadius: 10,
  },
  metaRow: {
    marginBottom: 12,
  },
  locationBox: {
    width: '45%',
    height: 14,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: colors.borders.light,
  },
  detailBox: {
    width: 80,
    height: 16,
  },
});
