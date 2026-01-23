import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '../../design-system/spacing';

interface GridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  gap?: keyof typeof spacing;
  style?: ViewStyle;
}

/**
 * Grid component for creating responsive multi-column layouts
 */
export const Grid: React.FC<GridProps> = ({
  children,
  columns = 2,
  gap = 'md',
  style,
}) => {
  return (
    <View style={[styles.grid, { gap: spacing[gap] }, style]}>
      {React.Children.map(children, (child) => (
        <View style={[styles.gridItem, { width: `${100 / columns - 2}%` }]}>
          {child}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  gridItem: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
