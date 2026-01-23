import * as Haptics from 'expo-haptics';
import { TouchableOpacity, type TouchableOpacityProps } from 'react-native';

export type HapticTabProps = TouchableOpacityProps & {
  onPress?: () => void;
};

export function HapticTab({ onPress, ...rest }: HapticTabProps) {
  const handlePress = () => {
    // Provide haptic feedback on tab press
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return <TouchableOpacity onPress={handlePress} {...rest} />;
}
