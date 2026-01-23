// Track Hub - Meet Data Structure
import { Athlete, Division, Event, EventResult, School } from './athlete';

export interface Meet {
  id: string;
  name: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  venue: Venue;
  division: Division;
  meetType: MeetType;
  status: "upcoming" | "live" | "completed" | "cancelled";
  events: MeetEvent[];
  teams: Team[];
  totalAthletes: number;
  results?: MeetResults;
  liveResults?: boolean;
  entryList?: EntryList;
  meetInfo?: MeetInfo;
  sources: DataSource[];
  lastUpdated: string; // ISO date
}

export interface Venue {
  name: string;
  city: string;
  state: string;
  country: string;
  indoor: boolean;
  trackType?: "mondo" | "tartan" | "other";
  altitude?: number; // meters above sea level
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface MeetType {
  category: "invitational" | "conference" | "regional" | "national" | "dual" | "triangular" | "qualifier";
  scored: boolean;
  championship: boolean;
  level: "high-school" | "college" | "professional" | "open";
}

export interface MeetEvent {
  event: Event;
  startTime?: string; // ISO datetime
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
  rounds: EventRound[];
  fieldEventInfo?: FieldEventInfo;
}

export interface EventRound {
  round: "prelim" | "semi" | "final" | "trials";
  startTime?: string;
  heats?: Heat[];
  results?: EventResult[];
  qualifying?: {
    automatic: number; // Number of automatic qualifiers
    time?: string; // Qualifying time
    mark?: string; // Qualifying mark
  };
}

export interface Heat {
  heatNumber: number;
  athletes: AthleteEntry[];
  wind?: string;
  temperature?: number;
  completed: boolean;
}

export interface AthleteEntry {
  athlete: Athlete;
  seedMark: string;
  seedRank: number;
  lane?: number;
  flight?: number; // For field events
  bib?: string;
  result?: EventResult;
}

export interface FieldEventInfo {
  flights: number;
  attempts: number; // 3 or 6 typically
  runway?: {
    length: number;
    surface: string;
  };
  implement?: {
    weight: string;
    brand?: string;
  };
}

export interface MeetResults {
  teamScores?: TeamScore[];
  individualResults: EventResult[];
  records?: Record[];
  highlights?: string[];
  photos?: string[];
  videos?: string[];
}

export interface TeamScore {
  team: Team;
  totalPoints: number;
  menPoints?: number;
  womenPoints?: number;
  rank: number;
  scoring: ScoringEvent[];
}

export interface ScoringEvent {
  event: Event;
  athlete: Athlete;
  place: number;
  points: number;
  mark: string;
}

export interface Team {
  id: string;
  school: School;
  coaches: Coach[];
  athletes: Athlete[];
  entries?: AthleteEntry[];
}

export interface Coach {
  name: string;
  title: string; // "Head Coach", "Assistant Coach", "Throws Coach", etc.
  email?: string;
  phone?: string;
}

export interface Record {
  type: "meet" | "facility" | "conference" | "regional" | "national" | "world";
  event: Event;
  previousRecord?: {
    mark: string;
    holder: string;
    date: string;
  };
  newRecord: {
    mark: string;
    athlete: Athlete;
    date: string;
  };
}

export interface EntryList {
  events: EventEntries[];
  totalAthletes: number;
  totalTeams: number;
  entryDeadline: string;
  lastUpdated: string;
}

export interface EventEntries {
  event: Event;
  entries: AthleteEntry[];
  topSeeds: AthleteEntry[];
}

export interface MeetInfo {
  entryFee?: number;
  registrationLink?: string;
  hotelInfo?: string;
  parkingInfo?: string;
  facilityInfo?: string;
  weather?: WeatherInfo;
  livestream?: string;
  timing?: TimingCompany;
}

export interface WeatherInfo {
  temperature?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: string;
  conditions?: string;
  forecast?: string;
}

export interface TimingCompany {
  name: string;
  website?: string;
  liveResultsLink?: string;
}

export interface DataSource {
  name: string; // "USTFCCCA", "TFRRS", "Athletic.net", "MileSplit"
  url: string;
  lastScraped: string;
  reliability: number; // 0-1 score
  dataTypes: string[]; // ["entries", "results", "live", "records"]
}

// Search and Filter Types for Meets
export interface MeetSearchFilters {
  name?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  state?: string;
  division?: string;
  meetType?: string;
  status?: string;
  indoor?: boolean;
  events?: string[];
}

export interface LiveMeetUpdate {
  meetId: string;
  eventId: string;
  type: "result" | "record" | "heat-assignment" | "schedule-change";
  data: any;
  timestamp: string;
}
