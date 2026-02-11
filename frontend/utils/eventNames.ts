/**
 * Normalize track & field event names for consistent display
 * Handles variations like "200", "200m", "200 Meter Dash", "200 Meters" -> "200m"
 */

const EVENT_MAPPINGS: Record<string, string> = {
  // Sprints
  '55': '55m',
  '55 meters': '55m',
  '55 meter dash': '55m',
  '60': '60m',
  '60 meters': '60m',
  '60 meter dash': '60m',
  '100': '100m',
  '100 meters': '100m',
  '100 meter dash': '100m',
  '200': '200m',
  '200 meters': '200m',
  '200 meter dash': '200m',
  '300': '300m',
  '300 meters': '300m',
  '300 meter dash': '300m',
  '400': '400m',
  '400 meters': '400m',
  '400 meter dash': '400m',

  // Middle distance
  '600': '600m',
  '600 meters': '600m',
  '800': '800m',
  '800 meters': '800m',
  '800 meter run': '800m',
  '1000': '1000m',
  '1000 meters': '1000m',
  '1000 meter run': '1000m',
  '1500': '1500m',
  '1500 meters': '1500m',
  '1500 meter run': '1500m',

  // Distance
  'mile': 'Mile',
  'mile run': 'Mile',
  '1 mile': 'Mile',
  '1 mile run': 'Mile',
  '3000': '3000m',
  '3000 meters': '3000m',
  '3000 meter run': '3000m',
  '5000': '5000m',
  '5000 meters': '5000m',
  '5000 meter run': '5000m',
  '10000': '10,000m',
  '10,000': '10,000m',
  '10000 meters': '10,000m',
  '10,000 meters': '10,000m',
  '10000 meter run': '10,000m',
  '10,000 meter run': '10,000m',

  // Hurdles
  '55 hurdles': '55m H',
  '55 meter hurdles': '55m H',
  '55m hurdles': '55m H',
  '60 hurdles': '60m H',
  '60 meter hurdles': '60m H',
  '60m hurdles': '60m H',
  '100 hurdles': '100m H',
  '100 meter hurdles': '100m H',
  '100m hurdles': '100m H',
  '110 hurdles': '110m H',
  '110 meter hurdles': '110m H',
  '110m hurdles': '110m H',
  '400 hurdles': '400m H',
  '400 meter hurdles': '400m H',
  '400m hurdles': '400m H',

  // Steeplechase
  '3000 steeplechase': '3000m SC',
  '3000 meter steeplechase': '3000m SC',
  '3000m steeplechase': '3000m SC',
  'steeplechase': '3000m SC',

  // Relays
  '4x100': '4x100m',
  '4x100 relay': '4x100m',
  '4x100 meter relay': '4x100m',
  '4x100m relay': '4x100m',
  '4x200': '4x200m',
  '4x200 relay': '4x200m',
  '4x200 meter relay': '4x200m',
  '4x200m relay': '4x200m',
  '4x400': '4x400m',
  '4x400 relay': '4x400m',
  '4x400 meter relay': '4x400m',
  '4x400m relay': '4x400m',
  '4x800': '4x800m',
  '4x800 relay': '4x800m',
  '4x800 meter relay': '4x800m',
  '4x800m relay': '4x800m',
  'dmr': 'DMR',
  'distance medley relay': 'DMR',
  'smr': 'SMR',
  'sprint medley relay': 'SMR',

  // Field events - Jumps
  'high jump': 'HJ',
  'hj': 'HJ',
  'long jump': 'LJ',
  'lj': 'LJ',
  'triple jump': 'TJ',
  'tj': 'TJ',
  'pole vault': 'PV',
  'pv': 'PV',

  // Field events - Throws
  'shot put': 'SP',
  'sp': 'SP',
  'discus': 'Discus',
  'discus throw': 'Discus',
  'hammer': 'Hammer',
  'hammer throw': 'Hammer',
  'javelin': 'Javelin',
  'javelin throw': 'Javelin',
  'weight throw': 'Weight',
  'weight': 'Weight',

  // Multi-events
  'heptathlon': 'Heptathlon',
  'decathlon': 'Decathlon',
  'pentathlon': 'Pentathlon',
};

export function normalizeEventName(eventName: string): string {
  if (!eventName) return eventName;

  // Preserve indoor/outdoor indicator if present
  const seasonMatch = eventName.match(/\s*\((I|O)\)$/);
  const seasonSuffix = seasonMatch ? ` (${seasonMatch[1]})` : '';
  const baseName = eventName.replace(/\s*\((I|O)\)$/, '');

  const lower = baseName.toLowerCase().trim();

  // Check direct mapping first
  if (EVENT_MAPPINGS[lower]) {
    return EVENT_MAPPINGS[lower] + seasonSuffix;
  }

  // If already in short format (ends with 'm' and is a number), return as-is
  if (/^\d+m$/.test(lower)) {
    return baseName + seasonSuffix;
  }

  // Try to extract just the number/distance for common patterns
  // e.g., "Men's 200 Meter Dash" -> check "200 meter dash"
  const withoutGender = lower.replace(/^(men'?s?|women'?s?)\s+/i, '');
  if (EVENT_MAPPINGS[withoutGender]) {
    return EVENT_MAPPINGS[withoutGender] + seasonSuffix;
  }

  // Return original if no mapping found
  return eventName;
}
