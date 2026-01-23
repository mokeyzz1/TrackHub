import { useEffect, useState } from 'react';
import { Text } from 'react-native';

export function HelloWave() {
  const [wave, setWave] = useState('👋');

  useEffect(() => {
    const interval = setInterval(() => {
      setWave(prev => prev === '👋' ? '🤚' : '👋');
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return <Text style={{ fontSize: 28 }}>{wave}</Text>;
}
