import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '../../design-system/spacing';

interface StackProps {
  children: React.ReactNode;
  gap?: keyof typeof spacing;
  horizontal?: boolean;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justify?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  style?: ViewStyle;
}

/**
 * Stack component for consistent spacing between elements
 * Automatically handles both vertical and horizontal stacks
 */
export const Stack: React.FC<StackProps> = ({
  children,
  gap = 'md',
  horizontal = false,
  align,
  justify,
  style,
}) => {
  return (
    <View
      style={[
        styles.stack,
        {
          flexDirection: horizontal ? 'row' : 'column',
          gap: spacing[gap],
          alignItems: align,
          justifyContent: justify,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  stack: {
    width: '100%',
  },
});
