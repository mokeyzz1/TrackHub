import React from 'react';
import { MotiView } from 'moti';
import { MedalIcon } from './MedalIcon';

interface AnimatedMedalProps {
  place: 1 | 2 | 3;
  size?: number;
  delay?: number;
}

export const AnimatedMedal: React.FC<AnimatedMedalProps> = ({
  place,
  size = 48,
  delay = 0,
}) => {
  return (
    <MotiView
      from={{
        opacity: 0,
        scale: 0,
        rotate: '-180deg',
      }}
      animate={{
        opacity: 1,
        scale: 1,
        rotate: '0deg',
      }}
      transition={{
        type: 'spring',
        damping: 12,
        stiffness: 100,
        delay,
      }}
    >
      <MotiView
        from={{ scale: 1 }}
        animate={{ scale: 1 }}
        transition={{
          type: 'timing',
          duration: 2000,
          loop: true,
          repeatReverse: false,
        }}
        style={{
          shadowColor: place === 1 ? '#FFD700' : place === 2 ? '#C0C0C0' : '#CD7F32',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        }}
      >
        <MedalIcon place={place} size={size} />
      </MotiView>
    </MotiView>
  );
};
