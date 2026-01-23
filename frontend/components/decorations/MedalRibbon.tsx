import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../design-system/colors';

interface MedalRibbonProps {
  place: 1 | 2 | 3;
  size?: 'small' | 'medium' | 'large';
}

export const MedalRibbon: React.FC<MedalRibbonProps> = ({ place, size = 'medium' }) => {
  const getMedalColor = () => {
    switch (place) {
      case 1:
        return '#FFD700'; // Gold
      case 2:
        return '#C0C0C0'; // Silver
      case 3:
        return '#CD7F32'; // Bronze
      default:
        return colors.text.tertiary;
    }
  };

  const getSizes = () => {
    switch (size) {
      case 'small':
        return { circle: 32, text: 16, ribbon: 16 };
      case 'large':
        return { circle: 56, text: 28, ribbon: 28 };
      default:
        return { circle: 44, text: 20, ribbon: 22 };
    }
  };

  const sizes = getSizes();
  const medalColor = getMedalColor();

  return (
    <View style={styles.container}>
      {/* Ribbon */}
      <View style={[styles.ribbon, { width: sizes.ribbon, height: sizes.ribbon * 1.5 }]}>
        <View
          style={[
            styles.ribbonLeft,
            {
              borderLeftWidth: sizes.ribbon / 2,
              borderRightWidth: sizes.ribbon / 2,
              borderBottomWidth: sizes.ribbon,
              borderBottomColor: medalColor,
            },
          ]}
        />
        <View
          style={[
            styles.ribbonRight,
            {
              borderLeftWidth: sizes.ribbon / 2,
              borderRightWidth: sizes.ribbon / 2,
              borderBottomWidth: sizes.ribbon,
              borderBottomColor: medalColor,
            },
          ]}
        />
      </View>

      {/* Medal Circle */}
      <View
        style={[
          styles.medal,
          {
            width: sizes.circle,
            height: sizes.circle,
            borderRadius: sizes.circle / 2,
            backgroundColor: medalColor,
          },
        ]}
      >
        <Text style={[styles.placeText, { fontSize: sizes.text }]}>{place}</Text>
      </View>

      {/* Medal Border/Shine */}
      <View
        style={[
          styles.medalShine,
          {
            width: sizes.circle - 6,
            height: sizes.circle - 6,
            borderRadius: (sizes.circle - 6) / 2,
            top: 3,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbon: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: -8,
    zIndex: 0,
  },
  ribbonLeft: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginRight: 1,
  },
  ribbonRight: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginLeft: 1,
  },
  medal: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.borders.thick,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 0,
    zIndex: 1,
  },
  medalShine: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomColor: 'transparent',
    borderRightColor: 'transparent',
  },
  placeText: {
    fontWeight: '900',
    color: colors.text.primary,
    textShadowColor: 'rgba(255, 255, 255, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
});
