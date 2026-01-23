// Track Hub Design System - Typography
export const typography = {
  // Font Families (modern 2025 stack)
  fonts: {
    primary: 'Inter',          // Clean, modern, great for data
    display: 'Poppins',        // Bold headers, fun but professional
    mono: 'SF Mono',           // Times, numbers, technical data
  },

  // Font Sizes (fluid scale)
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 20,
    '3xl': 24,
    '4xl': 28,
    '5xl': 32,
    '6xl': 40,
    '7xl': 48,
  },

  // Font Weights
  weights: {
    thin: '100',
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    black: '900',
  },

  // Text Styles (pre-made combinations)
  styles: {
    // Headers
    heroTitle: {
      fontFamily: 'Poppins',
      fontSize: 32,
      fontWeight: '700',
      lineHeight: 40,
    },
    sectionHeader: {
      fontFamily: 'Poppins',
      fontSize: 24,
      fontWeight: '600',
      lineHeight: 30,
    },
    cardTitle: {
      fontFamily: 'Inter',
      fontSize: 18,
      fontWeight: '600',
      lineHeight: 24,
    },

    // Body text
    bodyLarge: {
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 24,
    },
    body: {
      fontFamily: 'Inter',
      fontSize: 14,
      fontWeight: '400',
      lineHeight: 20,
    },
    bodySmall: {
      fontFamily: 'Inter',
      fontSize: 12,
      fontWeight: '400',
      lineHeight: 16,
    },

    // Special text
    athleteName: {
      fontFamily: 'Poppins',
      fontSize: 16,
      fontWeight: '600',
      lineHeight: 20,
    },
    performanceTime: {
      fontFamily: 'SF Mono',
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 20,
    },
    statNumber: {
      fontFamily: 'Poppins',
      fontSize: 24,
      fontWeight: '700',
      lineHeight: 28,
    },

    // Labels and captions
    label: {
      fontFamily: 'Inter',
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    caption: {
      fontFamily: 'Inter',
      fontSize: 10,
      fontWeight: '400',
      lineHeight: 12,
    },
  },
};

// Usage:
// style={typography.styles.heroTitle}
