import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '../../design-system/spacing';

interface ContainerProps {
  children: React.ReactNode;
  padding?: keyof typeof spacing;
  style?: ViewStyle;
}

/**
 * Container component for consistent horizontal padding
 * Use this for screen-level content containers
 */
export const Container: React.FC<ContainerProps> = ({
  children,
  padding = 'screen',
  style,
}) => {
  return (
    <View style={[styles.container, { paddingHorizontal: spacing[padding] }, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
