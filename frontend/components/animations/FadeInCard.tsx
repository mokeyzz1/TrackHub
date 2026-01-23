import { MotiView } from 'moti';
import React from 'react';
import { ViewStyle } from 'react-native';

interface FadeInCardProps {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}

export const FadeInCard: React.FC<FadeInCardProps> = ({
  children,
  delay = 0,
  style,
}) => {
  return (
    <MotiView
      from={{
        opacity: 0,
        translateY: 20,
      }}
      animate={{
        opacity: 1,
        translateY: 0,
      }}
      transition={{
        type: 'timing',
        duration: 600,
        delay,
      }}
      style={style}
    >
      {children}
    </MotiView>
  );
};
