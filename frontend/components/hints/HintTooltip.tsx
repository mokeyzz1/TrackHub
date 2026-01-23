import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import { MotiView } from 'moti';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing } from '../../design-system';

const { width } = Dimensions.get('window');

interface HintTooltipProps {
  visible: boolean;
  text: string;
  position?: 'top' | 'bottom' | 'center';
  onDismiss: () => void;
  arrowPosition?: 'left' | 'center' | 'right';
}

export const HintTooltip: React.FC<HintTooltipProps> = ({
  visible,
  text,
  position = 'bottom',
  onDismiss,
  arrowPosition = 'right',
}) => {
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [visible]);

  if (!visible) return null;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDismiss();
  };

  // Different gradient colors based on position for variety
  const gradientColors = position === 'center'
    ? ['#FF6B35', '#F59E0B', '#FBBF24'] // Orange-yellow gradient
    : position === 'top'
    ? ['#8B5CF6', '#A78BFA', '#C4B5FD'] // Purple gradient
    : ['#10B981', '#34D399', '#6EE7B7']; // Green gradient

  return (
    <MotiView
      from={{
        opacity: 0,
        scale: 0.5,
        translateY: position === 'bottom' ? -20 : position === 'top' ? 20 : 0,
        rotate: '-5deg'
      }}
      animate={{
        opacity: 1,
        scale: 1,
        translateY: 0,
        rotate: '0deg'
      }}
      exit={{
        opacity: 0,
        scale: 0.8,
        translateY: position === 'bottom' ? 20 : position === 'top' ? -20 : 0,
      }}
      transition={{
        type: 'spring',
        damping: 12,
        stiffness: 200,
        mass: 0.8,
        delay: 500
      }}
      style={[
        styles.container,
        position === 'top' && styles.positionTop,
        position === 'bottom' && styles.positionBottom,
        position === 'center' && styles.positionCenter,
      ]}
    >
      {/* Pulsing glow background - now behind */}
      <MotiView
        from={{ scale: 0.95, opacity: 0.6 }}
        animate={{ scale: 1.05, opacity: 0.2 }}
        transition={{
          type: 'timing',
          duration: 1500,
          loop: true,
          repeatReverse: true,
        }}
        style={styles.pulseGlow}
      />

      {/* Arrow */}
      {position !== 'center' && (
        <View
          style={[
            styles.arrow,
            position === 'top' ? styles.arrowBottom : styles.arrowTop,
            arrowPosition === 'left' && styles.arrowLeft,
            arrowPosition === 'center' && styles.arrowCenter,
            arrowPosition === 'right' && styles.arrowRight,
          ]}
        />
      )}

      {/* Tooltip Content with Gradient */}
      <TouchableOpacity
        onPress={handleDismiss}
        activeOpacity={0.85}
        style={styles.tooltipWrapper}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tooltip}
        >
          {/* Animated icon */}
          <MotiView
            from={{ rotate: '0deg', scale: 1 }}
            animate={{ rotate: '360deg', scale: 1.1 }}
            transition={{
              type: 'timing',
              duration: 2000,
              loop: true,
              repeatReverse: false,
            }}
          >
            <Ionicons name="bulb" size={28} color={colors.primary.finishYellow} />
          </MotiView>

          <View style={styles.content}>
            <Text style={styles.text}>{text}</Text>
          </View>

          {/* Animated close button */}
          <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
            <MotiView
              from={{ scale: 1 }}
              animate={{ scale: 1.1 }}
              transition={{
                type: 'timing',
                duration: 800,
                loop: true,
                repeatReverse: true,
              }}
            >
              <Ionicons name="close-circle" size={26} color={colors.text.white} />
            </MotiView>
          </TouchableOpacity>
        </LinearGradient>
      </TouchableOpacity>

      {/* Shimmer effect */}
      <MotiView
        from={{ translateX: -200 }}
        animate={{ translateX: 200 }}
        transition={{
          type: 'timing',
          duration: 2000,
          loop: true,
          delay: 1000,
        }}
        style={styles.shimmer}
      />
    </MotiView>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
    maxWidth: width - spacing.screen * 2,
    alignSelf: 'center',
  },
  positionTop: {
    top: 100,
    left: spacing.screen,
    right: spacing.screen,
  },
  positionBottom: {
    top: 140,
    left: spacing.screen,
    right: spacing.screen,
  },
  positionCenter: {
    top: '40%',
    left: spacing.screen,
    right: spacing.screen,
  },
  tooltipWrapper: {
    borderRadius: spacing.radiusLg,
    overflow: 'hidden',
  },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: spacing.radiusLg,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 10,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text.white,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 1001,
  },
  arrowTop: {
    top: -16,
    borderBottomWidth: 16,
    borderBottomColor: colors.borders.thick,
  },
  arrowBottom: {
    bottom: -16,
    borderTopWidth: 16,
    borderTopColor: colors.borders.thick,
  },
  arrowLeft: {
    left: spacing.xl,
  },
  arrowCenter: {
    left: '50%',
    marginLeft: -16,
  },
  arrowRight: {
    right: spacing.xl,
  },
  pulseGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary.finishYellow,
    borderRadius: spacing.radiusLg,
    zIndex: -1,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transform: [{ skewX: '-20deg' }],
    zIndex: 10,
  },
});
