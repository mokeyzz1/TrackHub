import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

export type IconSymbolProps = SymbolViewProps & {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function IconSymbol({ size = 24, style, ...rest }: IconSymbolProps) {
  return (
    <SymbolView
      size={size}
      style={[{ width: size, height: size }, style]}
      {...rest}
    />
  );
}
