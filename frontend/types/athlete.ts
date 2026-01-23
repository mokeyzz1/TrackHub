// Track Hub - Athlete Profile Data Structure

export interface Athlete {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  school: School;
  division: Division;
  year: string; // "FR", "SO", "JR", "SR", "GR"
  gender: "M" | "F";
  events: Event[];
  personalRecords: PersonalRecord[];
  meetHistory: MeetResult[];
  profileImage?: string;
  bio?: string;
  hometown?: string;
  height?: string;
  weight?: string;
  major?: string;
  coach?: string;
  lastUpdated: string; // ISO date
  isActive: boolean;
  socialMedia?: SocialMedia;
  rankings: Ranking[];
}

export interface School {
  id: string;
  name: string;
  abbreviation: string;
  division: Division;
  conference?: string;
  state: string;
  city: string;
  colors?: string[];
  logo?: string;
}

export interface Division {
  id: string;
  name: string; // "NCAA Division I", "NCAA Division II", "NCAA Division III", "NAIA", "JUCO", "High School"
  level: "college" | "high-school" | "professional";
}

export interface Event {
  id: string;
  name: string;
  category: "sprints" | "middle-distance" | "distance" | "hurdles" | "jumps" | "throws" | "multi";
  unit: "time" | "distance" | "height" | "points";
  indoor: boolean;
  outdoor: boolean;
  gender: "M" | "F" | "both";
}

export interface PersonalRecord {
  event: Event;
  mark: string; // "10.50", "4:15.23", "7.25m", "65.50m"
  markSeconds?: number; // For sorting time events
  markMeters?: number; // For sorting distance/height events
  markPoints?: number; // For multi-events
  wind?: string; // "+1.5", "-0.2" for outdoor events
  venue: string;
  meetName: string;
  meetDate: string; // ISO date
  season: string; // "2024 Indoor", "2023 Outdoor"
  verified: boolean;
  rank?: {
    national?: number;
    regional?: number;
    conference?: number;
    school?: number;
  };
}

export interface MeetResult {
  meetId: string;
  meetName: string;
  meetDate: string; // ISO date
  venue: string;
  events: EventResult[];
  overallPerformance?: {
    medals: number;
    personalRecords: number;
    seasonBests: number;
  };
}

export interface EventResult {
  event: Event;
  mark: string;
  wind?: string;
  place: number;
  totalCompetitors: number;
  heat?: number;
  lane?: number;
  round?: "prelim" | "semi" | "final";
  isPersonalRecord: boolean;
  isSeasonBest: boolean;
  points?: number; // For scored meets
}

export interface Ranking {
  event: Event;
  rank: number;
  scope: "national" | "regional" | "conference" | "state";
  division: Division;
  season: string;
  lastUpdated: string; // ISO date
}

export interface SocialMedia {
  instagram?: string;
  twitter?: string;
  tiktok?: string;
}

// Search and Filter Types
export interface AthleteSearchFilters {
  name?: string;
  school?: string;
  division?: string;
  event?: string;
  state?: string;
  conference?: string;
  year?: string;
  gender?: "M" | "F";
  isActive?: boolean;
}

export interface AthleteSearchResult {
  athlete: Athlete;
  relevanceScore: number;
  matchedFields: string[];
}

// Leaderboard Types
export interface Leaderboard {
  event: Event;
  division: Division;
  season: string;
  scope: "national" | "regional" | "conference" | "state";
  entries: LeaderboardEntry[];
  lastUpdated: string;
}

export interface LeaderboardEntry {
  rank: number;
  athlete: Athlete;
  mark: string;
  markValue: number; // For sorting
  wind?: string;
  meetName: string;
  meetDate: string;
  venue: string;
}
