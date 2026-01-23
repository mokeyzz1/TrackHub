import { MotiView } from 'moti';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../design-system/colors';

interface PulsingBadgeProps {
  text: string;
  color?: string;
}

export const PulsingBadge: React.FC<PulsingBadgeProps> = ({
  text,
  color = '#FF1B8D',
}) => {
  return (
    <View style={styles.container}>
      {/* Outer glow ring with Moti */}
      <MotiView
        from={{ opacity: 0.2, scale: 1 }}
        animate={{ opacity: 0.5, scale: 1.3 }}
        transition={{
          type: 'timing',
          duration: 1000,
          loop: true,
        }}
        style={[styles.glowRing, { backgroundColor: color }]}
      />

      {/* Main badge with Moti pulse */}
      <MotiView
        from={{ scale: 1 }}
        animate={{ scale: 1.1 }}
        transition={{
          type: 'timing',
          duration: 800,
          loop: true,
        }}
        style={[styles.badge, { backgroundColor: color }]}
      >
        <View style={styles.dot} />
        <Text style={styles.text}>{text}</Text>
      </MotiView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    position: 'absolute',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.borders.thick,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.text.white,
    borderWidth: 1,
    borderColor: colors.borders.thick,
  },
  text: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text.white,
    letterSpacing: 1,
  },
});
