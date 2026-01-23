// Track Hub Design System - Colors
// Sports-First + Simpson Vibe

export const colors = {
  // Background Colors (Bright & Energetic like a track meet!)
  backgrounds: {
    skyBlue: '#87CEEB',        // Main background - track meet sky
    sunshine: '#FFE97F',       // Alternate bright background
    white: '#FFFFFF',          // Card backgrounds
    cream: '#FFFEF0',          // Subtle card variation
  },

  // Primary Track Colors (BOLD Simpson style)
  primary: {
    trackOrange: '#FF6B35',    // Starting blocks orange - PRIMARY ACTION
    finishYellow: '#FFD700',   // Finish line yellow - GOLD MEDALS
    laneBlue: '#4A90E2',       // Lane marker blue - INFO/LINKS
    duffPink: '#FF69B4',       // Hot pink - LIVE/ALERTS/BADGES
  },

  // Text Colors (HIGH CONTRAST for sports data readability)
  text: {
    primary: '#000000',        // Black - main text, times, names (MAX READABILITY)
    secondary: '#1E293B',      // Dark gray - supporting info
    tertiary: '#475569',       // Medium gray - labels
    white: '#FFFFFF',          // White - on dark/colored backgrounds
    muted: '#64748B',          // Muted gray - timestamps, metadata
  },

  // Performance Colors (Clear visual feedback)
  performance: {
    newPR: '#00C853',          // Bright green - PERSONAL RECORD
    schoolRecord: '#9C27B0',   // Purple - SCHOOL RECORD
    seasonBest: '#2196F3',     // Blue - SEASON BEST
    improvement: '#00BCD4',    // Cyan - IMPROVEMENT
    nationalQual: '#FF9800',   // Orange - QUALIFIED
  },

  // Division Colors (Strong, distinguishable)
  division: {
    d1: '#DC2626',             // Red for D1
    d2: '#2563EB',             // Blue for D2
    d3: '#7C3AED',             // Purple for D3
    naia: '#059669',           // Green for NAIA
    njcaa: '#FF6B35',          // Orange for NJCAA
  },

  // Border & Accent (Simpson cartoon style)
  borders: {
    thick: '#000000',          // 3-4px black borders EVERYWHERE
    medium: '#1E293B',         // 2px borders
    light: 'rgba(0,0,0,0.1)',  // Subtle inner borders
  },

  // Semantic Colors
  semantic: {
    success: '#00C853',
    warning: '#FF9800',
    error: '#DC2626',
    info: '#2196F3',
  },

  // Gradients (for cards and features)
  gradients: {
    trackHero: ['#FF6B35', '#FF8F66'],           // Orange gradient
    goldMedal: ['#FFD700', '#FFA500'],           // Gold gradient
    performance: ['#00C853', '#00BCD4'],         // Green to cyan
    division: ['#9C27B0', '#E91E63'],            // Purple to pink
    sky: ['#87CEEB', '#B0E0E6'],                 // Sky gradient
  }
};

// Usage examples:
// backgroundColor: colors.primary.trackOrange
// Linear gradient: colors.gradients.trackHero
