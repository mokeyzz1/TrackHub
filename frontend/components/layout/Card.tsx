import React from 'react';
import { View, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing, shadows } from '../../design-system';

interface CardProps {
  children: React.ReactNode;
  padding?: keyof typeof spacing;
  shadow?: 'hard' | 'soft' | 'none';
  shadowSize?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outlined' | 'filled';
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Card component with consistent styling
 * Supports press interactions with haptic feedback
 */
export const Card: React.FC<CardProps> = ({
  children,
  padding = 'cardPadding',
  shadow = 'hard',
  shadowSize = 'md',
  variant = 'default',
  onPress,
  style,
}) => {
  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  const cardStyle = [
    styles.card,
    {
      padding: spacing[padding],
      borderRadius: spacing.radiusMd,
    },
    shadow !== 'none' && shadows[shadow][shadowSize],
    variant === 'outlined' && styles.outlined,
    variant === 'filled' && styles.filled,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyle}>{children}</View>;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgrounds.white,
    borderWidth: 4,
    borderColor: colors.borders.thick,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
  filled: {
    backgroundColor: colors.backgrounds.cream,
    borderWidth: 3,
    borderColor: colors.borders.thick,
  },
});
