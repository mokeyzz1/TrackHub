/**
 * Standardized spacing system for consistent layout throughout the app
 */

export const spacing = {
  // Base unit: 4px
  xs: 4,    // Extra small - tight gaps
  sm: 8,    // Small - compact spacing
  md: 12,   // Medium - standard spacing
  lg: 16,   // Large - comfortable spacing
  xl: 20,   // Extra large - section padding
  xxl: 24,  // 2X large - card padding
  xxxl: 32, // 3X large - section margins

  // Specific use cases
  screen: 20,       // Screen horizontal padding
  cardPadding: 18,  // Standard card internal padding
  cardMargin: 12,   // Space between cards in a list
  sectionGap: 32,   // Space between sections
  headerPadding: 20, // Header padding
  bottomSpacing: 100, // Bottom spacing for scrollable content

  // Gaps
  gapXs: 4,
  gapSm: 8,
  gapMd: 12,
  gapLg: 16,

  // Border radius
  radiusSm: 12,
  radiusMd: 16,
  radiusLg: 20,
  radiusXl: 24,
  radiusRound: 999, // For pill shapes
} as const;

export type Spacing = typeof spacing;
