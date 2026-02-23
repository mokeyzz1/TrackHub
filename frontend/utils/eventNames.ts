/**
 * Normalize track & field event names for consistent display
 * Handles variations like "200", "200m", "200.0", "200 Meter Dash", "200 Meters" -> "200m"
 */

const EVENT_MAPPINGS: Record<string, string> = {
  // Sprints - all variations (including space before m)
  '55': '55m',
  '55.0': '55m',
  '55m': '55m',
  '55 m': '55m',
  '55 meters': '55m',
  '55 meter dash': '55m',
  '60': '60m',
  '60.0': '60m',
  '60m': '60m',
  '60 m': '60m',
  '60 meters': '60m',
  '60 meter dash': '60m',
  '100': '100m',
  '100.0': '100m',
  '100m': '100m',
  '100 m': '100m',
  '100 meters': '100m',
  '100 meter dash': '100m',
  '200': '200m',
  '200.0': '200m',
  '200m': '200m',
  '200 m': '200m',
  '200 meters': '200m',
  '200 meter dash': '200m',
  '300': '300m',
  '300.0': '300m',
  '300m': '300m',
  '300 m': '300m',
  '300 meters': '300m',
  '300 meter dash': '300m',
  '400': '400m',
  '400.0': '400m',
  '400m': '400m',
  '400 m': '400m',
  '400 meters': '400m',
  '400 meter dash': '400m',

  // Middle distance - all variations (including space before m)
  '500': '500m',
  '500.0': '500m',
  '500m': '500m',
  '500 m': '500m',
  '500 meters': '500m',
  '600': '600m',
  '600.0': '600m',
  '600m': '600m',
  '600 m': '600m',
  '600 meters': '600m',
  '600y': '600y',
  '600 y': '600y',
  '800': '800m',
  '800.0': '800m',
  '800m': '800m',
  '800 m': '800m',
  '800 meters': '800m',
  '800 meter run': '800m',
  '1000': '1000m',
  '1000.0': '1000m',
  '1000m': '1000m',
  '1000 m': '1000m',
  '1000 meters': '1000m',
  '1000 meter run': '1000m',
  '1500': '1500m',
  '1500.0': '1500m',
  '1500m': '1500m',
  '1500 m': '1500m',
  '1500 meters': '1500m',
  '1500 meter run': '1500m',

  // Distance - all variations (including space before m)
  'mile': 'Mile',
  'mile run': 'Mile',
  '1 mile': 'Mile',
  '1 mile run': 'Mile',
  '3000': '3000m',
  '3000.0': '3000m',
  '3000m': '3000m',
  '3000 m': '3000m',
  '3000 meters': '3000m',
  '3000 meter run': '3000m',
  '3200': '3200m',
  '3200m': '3200m',
  '3200 m': '3200m',
  '5000': '5000m',
  '5000.0': '5000m',
  '5000m': '5000m',
  '5000 m': '5000m',
  '5000 meters': '5000m',
  '5000 meter run': '5000m',
  '5k': '5000m',
  '10000': '10,000m',
  '10000.0': '10,000m',
  '10,000': '10,000m',
  '10000m': '10,000m',
  '10000 m': '10,000m',
  '10000 meters': '10,000m',
  '10,000 meters': '10,000m',
  '10000 meter run': '10,000m',
  '10,000 meter run': '10,000m',
  '10k': '10,000m',

  // Hurdles - all variations including short forms
  '55h': '55m H',
  '55 hurdles': '55m H',
  '55 meter hurdles': '55m H',
  '55m hurdles': '55m H',
  '55m h': '55m H',
  '60h': '60m H',
  '60 hurdles': '60m H',
  '60 meter hurdles': '60m H',
  '60m hurdles': '60m H',
  '60m h': '60m H',
  '100h': '100m H',
  '100 hurdles': '100m H',
  '100 meter hurdles': '100m H',
  '100m hurdles': '100m H',
  '100m h': '100m H',
  '110h': '110m H',
  '110 hurdles': '110m H',
  '110 meter hurdles': '110m H',
  '110m hurdles': '110m H',
  '110m h': '110m H',
  '400h': '400m H',
  '400 hurdles': '400m H',
  '400 meter hurdles': '400m H',
  '400m hurdles': '400m H',
  '400m h': '400m H',

  // Steeplechase
  '3000s': '3000m SC',
  '3000 steeplechase': '3000m SC',
  '3000 meter steeplechase': '3000m SC',
  '3000m steeplechase': '3000m SC',
  '3000m sc': '3000m SC',
  'steeplechase': '3000m SC',
  'steeple': '3000m SC',
  'sc': '3000m SC',

  // Relays - all variations
  '4x100': '4x100m',
  '4x100m': '4x100m',
  '4x100 relay': '4x100m',
  '4x100 meter relay': '4x100m',
  '4x100m relay': '4x100m',
  '4x200': '4x200m',
  '4x200m': '4x200m',
  '4x200 relay': '4x200m',
  '4x200 meter relay': '4x200m',
  '4x200m relay': '4x200m',
  '4x400': '4x400m',
  '4x400m': '4x400m',
  '4x400 relay': '4x400m',
  '4x400 meter relay': '4x400m',
  '4x400m relay': '4x400m',
  '4x800': '4x800m',
  '4x800m': '4x800m',
  '4x800 relay': '4x800m',
  '4x800 meter relay': '4x800m',
  '4x800m relay': '4x800m',
  'dmr': 'DMR',
  'distance medley relay': 'DMR',
  'distance medley': 'DMR',
  'smr': 'SMR',
  'sprint medley relay': 'SMR',
  'sprint medley': 'SMR',

  // Field events - Jumps (use full names to match DB)
  'high jump': 'High Jump',
  'hj': 'High Jump',
  'long jump': 'Long Jump',
  'lj': 'Long Jump',
  'triple jump': 'Triple Jump',
  'tj': 'Triple Jump',
  'pole vault': 'Pole Vault',
  'pv': 'Pole Vault',

  // Field events - Throws (use full names to match DB)
  'shot put': 'Shot Put',
  'sp': 'Shot Put',
  'shot': 'Shot Put',
  'discus': 'Discus',
  'discus throw': 'Discus',
  'dt': 'Discus',
  'hammer': 'Hammer',
  'hammer throw': 'Hammer',
  'ht': 'Hammer',
  'javelin': 'Javelin',
  'javelin throw': 'Javelin',
  'jt': 'Javelin',
  'weight throw': 'Weight Throw',
  'weight': 'Weight Throw',
  'wt': 'Weight Throw',

  // Multi-events - all case variations
  'heptathlon': 'Heptathlon',
  'hep': 'Heptathlon',
  'decathlon': 'Decathlon',
  'dec': 'Decathlon',
  'pentathlon': 'Pentathlon',
  'pent': 'Pentathlon',

  // Cross Country - normalize to track equivalents when possible
  '4k': '4k XC',
  '4k (xc)': '4k XC',
  '5k (xc)': '5k XC',
  '6k': '6k XC',
  '6k (xc)': '6k XC',
  '8k': '8k XC',
  '8k (xc)': '8k XC',
  '10k (xc)': '10k XC',
};

export function normalizeEventName(eventName: string): string {
  if (!eventName) return eventName;

  // Preserve indoor/outdoor indicator if present
  const seasonMatch = eventName.match(/\s*\((I|O)\)$/);
  const seasonSuffix = seasonMatch ? ` (${seasonMatch[1]})` : '';
  const baseName = eventName.replace(/\s*\((I|O)\)$/, '');

  let lower = baseName.toLowerCase().trim();

  // Remove common suffixes that don't belong in event names
  lower = lower
    .replace(/\s+invitational$/i, '')
    .replace(/\s+inv\.?$/i, '')
    .replace(/\s+championship$/i, '')
    .replace(/\s+prelim(inary|s)?$/i, '')
    .replace(/\s+final(s)?$/i, '')
    .replace(/\s+heat\s*\d*$/i, '')
    .trim();

  // Normalize "400 M" or "400 m" to "400m" (remove space before m)
  lower = lower.replace(/^(\d+)\s+m$/i, '$1m');

  // Check direct mapping first
  if (EVENT_MAPPINGS[lower]) {
    return EVENT_MAPPINGS[lower] + seasonSuffix;
  }

  // If already in short format (ends with 'm' and is a number), normalize to standard form
  if (/^\d+m$/.test(lower)) {
    // Return the canonical form from mapping if exists, otherwise use lowercase
    const canonical = EVENT_MAPPINGS[lower];
    return (canonical || lower) + seasonSuffix;
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
