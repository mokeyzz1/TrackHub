import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../design-system/colors';

export const RacingStripes: React.FC = () => {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5, 6].map((lane) => (
        <View key={lane} style={styles.lane}>
          <View style={styles.dashContainer}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((dash) => (
              <View key={dash} style={styles.dash} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    opacity: 0.15,
    transform: [{ skewY: '-5deg' }],
  },
  lane: {
    height: 30,
    borderBottomWidth: 2,
    borderBottomColor: colors.borders.thick,
    justifyContent: 'center',
  },
  dashContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  dash: {
    width: 30,
    height: 3,
    backgroundColor: colors.borders.thick,
  },
});
