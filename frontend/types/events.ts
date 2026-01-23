// Track Hub - Event Definitions

export const TRACK_EVENTS = {
  // Sprints
  '60m': { name: '60m', category: 'sprints', indoor: true, outdoor: false, unit: 'time' },
  '100m': { name: '100m', category: 'sprints', indoor: false, outdoor: true, unit: 'time' },
  '200m': { name: '200m', category: 'sprints', indoor: true, outdoor: true, unit: 'time' },
  '400m': { name: '400m', category: 'sprints', indoor: true, outdoor: true, unit: 'time' },
  
  // Hurdles
  '60mH': { name: '60m Hurdles', category: 'hurdles', indoor: true, outdoor: false, unit: 'time' },
  '100mH': { name: '100m Hurdles', category: 'hurdles', indoor: false, outdoor: true, unit: 'time' },
  '110mH': { name: '110m Hurdles', category: 'hurdles', indoor: false, outdoor: true, unit: 'time' },
  '400mH': { name: '400m Hurdles', category: 'hurdles', indoor: false, outdoor: true, unit: 'time' },
  
  // Middle Distance
  '800m': { name: '800m', category: 'middle-distance', indoor: true, outdoor: true, unit: 'time' },
  '1000m': { name: '1000m', category: 'middle-distance', indoor: true, outdoor: false, unit: 'time' },
  '1500m': { name: '1500m', category: 'middle-distance', indoor: true, outdoor: true, unit: 'time' },
  'Mile': { name: 'Mile', category: 'middle-distance', indoor: true, outdoor: true, unit: 'time' },
  
  // Distance
  '3000m': { name: '3000m', category: 'distance', indoor: true, outdoor: true, unit: 'time' },
  '5000m': { name: '5000m', category: 'distance', indoor: true, outdoor: true, unit: 'time' },
  '10000m': { name: '10000m', category: 'distance', indoor: false, outdoor: true, unit: 'time' },
  '3000mSC': { name: '3000m Steeplechase', category: 'distance', indoor: false, outdoor: true, unit: 'time' },
  
  // Relays
  '4x100m': { name: '4x100m Relay', category: 'sprints', indoor: false, outdoor: true, unit: 'time' },
  '4x200m': { name: '4x200m Relay', category: 'sprints', indoor: true, outdoor: false, unit: 'time' },
  '4x400m': { name: '4x400m Relay', category: 'sprints', indoor: true, outdoor: true, unit: 'time' },
  '4x800m': { name: '4x800m Relay', category: 'middle-distance', indoor: true, outdoor: true, unit: 'time' },
  'DMR': { name: 'Distance Medley Relay', category: 'distance', indoor: true, outdoor: true, unit: 'time' },
  'SMR': { name: 'Sprint Medley Relay', category: 'sprints', indoor: true, outdoor: false, unit: 'time' },
  
  // Jumps
  'HJ': { name: 'High Jump', category: 'jumps', indoor: true, outdoor: true, unit: 'height' },
  'PV': { name: 'Pole Vault', category: 'jumps', indoor: true, outdoor: true, unit: 'height' },
  'LJ': { name: 'Long Jump', category: 'jumps', indoor: true, outdoor: true, unit: 'distance' },
  'TJ': { name: 'Triple Jump', category: 'jumps', indoor: true, outdoor: true, unit: 'distance' },
  
  // Throws
  'SP': { name: 'Shot Put', category: 'throws', indoor: true, outdoor: true, unit: 'distance' },
  'DT': { name: 'Discus Throw', category: 'throws', indoor: false, outdoor: true, unit: 'distance' },
  'HT': { name: 'Hammer Throw', category: 'throws', indoor: false, outdoor: true, unit: 'distance' },
  'JT': { name: 'Javelin Throw', category: 'throws', indoor: false, outdoor: true, unit: 'distance' },
  'WT': { name: 'Weight Throw', category: 'throws', indoor: true, outdoor: false, unit: 'distance' },
  
  // Multi-events
  'Pentathlon': { name: 'Pentathlon', category: 'multi', indoor: true, outdoor: false, unit: 'points' },
  'Heptathlon': { name: 'Heptathlon', category: 'multi', indoor: false, outdoor: true, unit: 'points' },
  'Decathlon': { name: 'Decathlon', category: 'multi', indoor: false, outdoor: true, unit: 'points' }
} as const;

export const DIVISIONS = {
  'NCAA_D1': { name: 'NCAA Division I', level: 'college' },
  'NCAA_D2': { name: 'NCAA Division II', level: 'college' },
  'NCAA_D3': { name: 'NCAA Division III', level: 'college' },
  'NAIA': { name: 'NAIA', level: 'college' },
  'NJCAA': { name: 'NJCAA', level: 'college' },
  'HIGH_SCHOOL': { name: 'High School', level: 'high-school' }
} as const;

export const EVENT_CATEGORIES = [
  'sprints',
  'middle-distance', 
  'distance',
  'hurdles',
  'jumps',
  'throws',
  'multi'
] as const;

// Helper functions for event data
export function getEventsByCategory(category: string) {
  return Object.entries(TRACK_EVENTS)
    .filter(([_, event]) => event.category === category)
    .map(([key, event]) => ({ id: key, ...event }));
}

export function getIndoorEvents() {
  return Object.entries(TRACK_EVENTS)
    .filter(([_, event]) => event.indoor)
    .map(([key, event]) => ({ id: key, ...event }));
}

export function getOutdoorEvents() {
  return Object.entries(TRACK_EVENTS)
    .filter(([_, event]) => event.outdoor)
    .map(([key, event]) => ({ id: key, ...event }));
}

export function parseTimeToSeconds(timeString: string): number {
  // Handle formats like "10.50", "1:15.23", "4:15.23"
  const parts = timeString.split(':');
  
  if (parts.length === 1) {
    // Just seconds: "10.50"
    return parseFloat(parts[0]);
  } else if (parts.length === 2) {
    // Minutes:seconds: "1:15.23"
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    // Hours:minutes:seconds: "2:15:30.50"
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  
  return 0;
}

export function parseDistanceToMeters(distanceString: string): number {
  // Handle formats like "7.25m", "65.50m", "2.10m", "5.50"
  const numStr = distanceString.replace(/[^0-9.]/g, '');
  return parseFloat(numStr);
}

export function formatTime(seconds: number): string {
  if (seconds < 60) {
    return seconds.toFixed(2);
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
  }
}

export function formatDistance(meters: number, unit: 'distance' | 'height' = 'distance'): string {
  if (unit === 'height' && meters < 10) {
    return `${meters.toFixed(2)}m`;
  }
  return `${meters.toFixed(2)}m`;
}
