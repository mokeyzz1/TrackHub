// Web stub for moti/framer-motion
import React from 'react';
import { View } from 'react-native';

// Create a simple View wrapper that ignores animation props
export const MotiView = ({ children, animate, from, transition, style, ...props }) => {
  return React.createElement(View, { style, ...props }, children);
};

// Export other common moti exports as no-ops
export const MotiText = ({ children, animate, from, transition, style, ...props }) => {
  return React.createElement('div', { style, ...props }, children);
};

export const AnimatePresence = ({ children }) => children;

export const motion = {
  div: (props) => React.createElement('div', props),
  span: (props) => React.createElement('span', props),
};

export default {
  MotiView,
  MotiText,
  AnimatePresence,
  motion,
};
