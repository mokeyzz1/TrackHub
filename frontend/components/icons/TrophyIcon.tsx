import React from 'react';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

interface TrophyIconProps {
  size?: number;
  color?: 'gold' | 'silver' | 'bronze';
}

export const TrophyIcon: React.FC<TrophyIconProps> = ({ size = 48, color = 'gold' }) => {
  const getColors = () => {
    switch (color) {
      case 'gold':
        return { gradient1: '#FFD700', gradient2: '#FFA500' };
      case 'silver':
        return { gradient1: '#E8E8E8', gradient2: '#C0C0C0' };
      case 'bronze':
        return { gradient1: '#CD7F32', gradient2: '#8B4513' };
    }
  };

  const colors = getColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        <LinearGradient id={`trophyGradient${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={colors.gradient1} />
          <Stop offset="100%" stopColor={colors.gradient2} />
        </LinearGradient>
      </Defs>

      {/* Trophy base */}
      <Rect
        x="16"
        y="38"
        width="16"
        height="4"
        rx="2"
        fill={`url(#trophyGradient${color})`}
        stroke="#000000"
        strokeWidth="2"
      />

      {/* Trophy stem */}
      <Rect
        x="22"
        y="32"
        width="4"
        height="6"
        fill={`url(#trophyGradient${color})`}
        stroke="#000000"
        strokeWidth="2"
      />

      {/* Trophy cup */}
      <Path
        d="M12 12 L12 18 C12 22 16 26 24 26 C32 26 36 22 36 18 L36 12 L12 12 Z"
        fill={`url(#trophyGradient${color})`}
        stroke="#000000"
        strokeWidth="2.5"
      />

      {/* Left handle */}
      <Path
        d="M12 14 L8 14 C6 14 6 16 6 18 C6 20 8 22 10 22 L12 22"
        fill="none"
        stroke="#000000"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Right handle */}
      <Path
        d="M36 14 L40 14 C42 14 42 16 42 18 C42 20 40 22 38 22 L36 22"
        fill="none"
        stroke="#000000"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Cup rim */}
      <Path
        d="M12 12 L36 12"
        stroke="#000000"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Shine/highlight */}
      <Path
        d="M16 16 C16 16 18 20 22 20"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </Svg>
  );
};
