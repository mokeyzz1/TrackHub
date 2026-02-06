/**
 * World Athletics Scoring Calculator
 * Uses official 2025 coefficients to convert performances to points
 * Formula: points = a*x² + b*x + c
 */

import coefficients from '../data/wa-coefficients-2025.json';

// Event name mappings (our DB names -> WA coefficient names)
// DB has mixed formats: "100", "100m", "100 Meters", etc.
const EVENT_MAPPINGS: Record<string, string> = {
  // Sprints
  "60": "60m",
  "60m": "60m",
  "60 Meters": "60m",
  "100": "100m",
  "100m": "100m",
  "100 Meters": "100m",
  "200": "200m",
  "200m": "200m",
  "200 Meters": "200m",
  "300": "300m",
  "300m": "300m",
  "300 Meters": "300m",
  "400": "400m",
  "400m": "400m",
  "400 Meters": "400m",

  // Middle Distance
  "500": "500m",
  "500m": "500m",
  "500 Meters": "500m",
  "600": "600m",
  "600m": "600m",
  "600 Meters": "600m",
  "800": "800m",
  "800m": "800m",
  "800 Meters": "800m",
  "1000": "1000m",
  "1000m": "1000m",
  "1000 Meters": "1000m",
  "1500": "1500m",
  "1500m": "1500m",
  "1500 Meters": "1500m",
  "Mile": "Mile",
  "1 Mile": "Mile",
  "1 Mile Run": "Mile",

  // Distance
  "3000": "3000m",
  "3000m": "3000m",
  "3000 Meters": "3000m",
  "3000 Meter Run": "3000m",
  "3000 Meter Run INVITE": "3000m",
  "3000 Meter Run NAVY": "3000m",
  "3000 Meter Run WHITE": "3000m",
  "5000": "5000m",
  "5000m": "5000m",
  "5000 Meters": "5000m",
  "5000 Meter Run": "5000m",
  "10000": "10000m",
  "10,000": "10000m",
  "10000m": "10000m",
  "10,000 Meters": "10000m",
  "10000 Meters": "10000m",

  // Hurdles
  "55H": "55mH",
  "55 Hurdles": "55mH",
  "60H": "60mH",
  "60mH": "60mH",
  "60 Hurdles": "60mH",
  "60 Meter Hurdles": "60mH",
  "100H": "100mH",
  "100mH": "100mH",
  "100 Hurdles": "100mH",
  "100 Meter Hurdles": "100mH",
  "110H": "110mH",
  "110mH": "110mH",
  "110 Hurdles": "110mH",
  "110 Meter Hurdles": "110mH",
  "400H": "400mH",
  "400mH": "400mH",
  "400 Hurdles": "400mH",
  "400 Meter Hurdles": "400mH",

  // Field - Jumps
  "High Jump": "HJ",
  "HJ": "HJ",
  "Pole Vault": "PV",
  "PV": "PV",
  "Long Jump": "LJ",
  "LJ": "LJ",
  "Triple Jump": "TJ",
  "TJ": "TJ",

  // Field - Throws
  "Shot Put": "SP",
  "SP": "SP",
  "Discus": "DT",
  "Discus Throw": "DT",
  "DT": "DT",
  "Hammer": "HT",
  "Hammer Throw": "HT",
  "HT": "HT",
  "Javelin": "JT",
  "Javelin Throw": "JT",
  "JT": "JT",
  "Weight Throw": "WT",
  "WT": "WT",
};

// Field events where higher is better (distance in meters or cm)
const FIELD_EVENTS = ['HJ', 'PV', 'LJ', 'TJ', 'SP', 'DT', 'HT', 'JT', 'WT'];

/**
 * Parse a mark string to numeric value
 * Track events: returns seconds
 * Field events: returns meters (or cm for jumps)
 */
export function parseMark(mark: string, eventName: string): number | null {
  if (!mark) return null;

  const cleaned = mark.trim().replace(/[^\d:.m]/g, '');

  // Check if field event (distance)
  const waEvent = EVENT_MAPPINGS[eventName?.trim()];
  if (waEvent && FIELD_EVENTS.includes(waEvent)) {
    // Field event - parse as meters (coefficients expect meters for all field events)

    // Check for feet-inches format: 24' 10.5" or 6' 0.75"
    const ftInMatch = mark.match(/(\d+)'\s*(\d+(?:\.\d+)?)"?/);
    if (ftInMatch) {
      const feet = parseFloat(ftInMatch[1]);
      const inches = parseFloat(ftInMatch[2]);
      const meters = (feet * 12 + inches) * 0.0254; // Convert to meters
      return meters;
    }

    // Check for meters format: 18.07m or just 18.07
    const mMatch = mark.match(/([\d.]+)\s*m?/);
    if (mMatch) {
      return parseFloat(mMatch[1]);
    }
    return null;
  }

  // Track event - parse as time
  // Format: "10.45" or "1:45.67" or "4:32.10" or "1:02:34.56"

  // Hours:minutes:seconds
  const hmsMatch = cleaned.match(/^(\d+):(\d{2}):(\d{2}\.?\d*)$/);
  if (hmsMatch) {
    return parseInt(hmsMatch[1]) * 3600 + parseInt(hmsMatch[2]) * 60 + parseFloat(hmsMatch[3]);
  }

  // Minutes:seconds
  const msMatch = cleaned.match(/^(\d+):(\d{2}\.?\d*)$/);
  if (msMatch) {
    return parseInt(msMatch[1]) * 60 + parseFloat(msMatch[2]);
  }

  // Seconds only
  const sMatch = cleaned.match(/^(\d+\.?\d*)$/);
  if (sMatch) {
    return parseFloat(sMatch[1]);
  }

  return null;
}

/**
 * Calculate World Athletics points for a performance
 */
export function calculateWAPoints(
  mark: string,
  eventName: string,
  gender: 'M' | 'F'
): number | null {
  const waEvent = EVENT_MAPPINGS[eventName?.trim()];
  if (!waEvent) {
    // Don't log - too noisy for multi-events like Pentathlon, Heptathlon
    return null;
  }

  const genderKey = gender === 'M' ? 'men' : 'women';
  const eventCoeffs = (coefficients as any)[genderKey]?.[waEvent];

  if (!eventCoeffs) {
    console.log(`No coefficients for ${genderKey} ${waEvent}`);
    return null;
  }

  const [a, b, c] = eventCoeffs;
  const x = parseMark(mark, eventName);

  if (x === null) {
    console.log(`Could not parse mark: ${mark}`);
    return null;
  }

  // Sanity check: filter out impossible marks
  // Track events: validate reasonable time ranges
  if (!FIELD_EVENTS.includes(waEvent)) {
    // Track event - x is time in seconds
    const minTimes: Record<string, number> = {
      '60m': 6.0, '100m': 9.0, '200m': 19.0, '300m': 30.0, '400m': 43.0,
      '500m': 58.0, '600m': 72.0, '800m': 100.0, '1000m': 130.0, '1500m': 200.0,
      'Mile': 220.0, '3000m': 450.0, '5000m': 750.0, '10000m': 1560.0,
      '55mH': 6.5, '60mH': 7.0, '100mH': 11.0, '110mH': 12.0, '400mH': 45.0,
    };
    const maxTimes: Record<string, number> = {
      '60m': 12.0, '100m': 18.0, '200m': 35.0, '300m': 55.0, '400m': 75.0,
      '500m': 100.0, '600m': 120.0, '800m': 180.0, '1000m': 240.0, '1500m': 360.0,
      'Mile': 400.0, '3000m': 720.0, '5000m': 1200.0, '10000m': 2400.0,
      '55mH': 12.0, '60mH': 12.0, '100mH': 20.0, '110mH': 22.0, '400mH': 90.0,
    };
    if (minTimes[waEvent] && (x < minTimes[waEvent] || x > maxTimes[waEvent])) {
      return null; // Invalid time
    }
  }

  // Formula: points = a*x² + b*x + c
  const points = a * x * x + b * x + c;

  // Round to nearest integer, min 0
  return Math.max(0, Math.round(points));
}

/**
 * Get top performances sorted by WA points
 */
export function rankByWAPoints(
  performances: Array<{
    mark_raw: string;
    event_name: string;
    gender: string;
    [key: string]: any;
  }>
): Array<{ waPoints: number; [key: string]: any }> {
  return performances
    .map(perf => {
      const waPoints = calculateWAPoints(
        perf.mark_raw,
        perf.event_name,
        perf.gender as 'M' | 'F'
      );
      return { ...perf, waPoints: waPoints || 0 };
    })
    .filter(p => p.waPoints > 0)
    .sort((a, b) => b.waPoints - a.waPoints);
}
