import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Text } from 'react-native-svg';

interface MedalIconProps {
  place: 1 | 2 | 3;
  size?: number;
}

export const MedalIcon: React.FC<MedalIconProps> = ({ place, size = 48 }) => {
  const getColors = () => {
    switch (place) {
      case 1:
        return {
          gradient1: '#FFD700',
          gradient2: '#FFA500',
          ribbon: '#C41E3A',
          number: '#000000',
        };
      case 2:
        return {
          gradient1: '#E8E8E8',
          gradient2: '#C0C0C0',
          ribbon: '#4169E1',
          number: '#000000',
        };
      case 3:
        return {
          gradient1: '#CD7F32',
          gradient2: '#8B4513',
          ribbon: '#228B22',
          number: '#FFFFFF',
        };
    }
  };

  const colors = getColors();

  return (
    <Svg width={size} height={size * 1.3} viewBox="0 0 48 62" fill="none">
      <Defs>
        <LinearGradient id={`medalGradient${place}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={colors.gradient1} />
          <Stop offset="100%" stopColor={colors.gradient2} />
        </LinearGradient>
      </Defs>

      {/* Ribbon */}
      <Path
        d="M14 2 L14 18 L24 24 L34 18 L34 2 L24 8 Z"
        fill={colors.ribbon}
        stroke="#000000"
        strokeWidth="2"
      />

      {/* Medal Circle */}
      <Circle
        cx="24"
        cy="38"
        r="20"
        fill={`url(#medalGradient${place})`}
        stroke="#000000"
        strokeWidth="3"
      />

      {/* Inner Circle Detail */}
      <Circle
        cx="24"
        cy="38"
        r="16"
        fill="none"
        stroke="#000000"
        strokeWidth="1.5"
        opacity="0.3"
      />

      {/* Place Number */}
      <Text
        x="24"
        y="45"
        fontSize="20"
        fontWeight="900"
        fill={colors.number}
        textAnchor="middle"
        fontFamily="system-ui, -apple-system"
      >
        {place}
      </Text>

      {/* Star accent for 1st place */}
      {place === 1 && (
        <Path
          d="M24 27 L25 30 L28 30 L26 32 L27 35 L24 33 L21 35 L22 32 L20 30 L23 30 Z"
          fill="#FFFFFF"
          opacity="0.6"
        />
      )}
    </Svg>
  );
};
