import { useState, useEffect } from 'react';
import { getAthleteDetails, getAthletePerformances, getAthletePRs, getAthleteRelays } from '../services/database-supabase';

export interface Athlete {
  athlete_id: number;
  full_name: string;
  first_name?: string;
  last_name?: string;
  gender: string;
  class_year?: string;
  grad_year?: number;
  primary_events?: string;
  hometown?: string;
  high_school?: string;
  school_id?: number;
  school_name?: string;
  division?: string;
  city?: string;
  state?: string;
}

export interface Performance {
  result_id: number;
  athlete_id: number;
  full_name?: string;
  gender?: string;
  event_name: string;
  mark_raw: string;
  mark_seconds?: number;
  date: string;
  meet_name: string;
  meet_location?: string;
  place: number;
  round?: string;
  school_name?: string;
  division?: string;
  state?: string;
  competed_for_school?: string;
}

export interface PersonalRecord {
  id: number;
  athlete_id: number;
  event_name: string;
  mark_raw: string;
  mark_seconds?: number;
  mark_meters?: number;
  set_at?: string;
  meet_name?: string;
  season: string;
  season_indicator?: 'I' | 'O' | null;
}

export interface RelayParticipation {
  relay_result_id: number;
  event_name: string;
  mark_raw: string;
  place: number;
  round?: string;
  meet_name: string;
  date: string;
  leg_order: number;
  school_name?: string;
  teammates: string[];
}

export function useAthleteDetails(athleteId: number) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [relayParticipations, setRelayParticipations] = useState<RelayParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadAthleteData();
  }, [athleteId]);

  const loadAthleteData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [athleteData, performanceData, prData, relayData] = await Promise.all([
        getAthleteDetails(athleteId),
        getAthletePerformances(athleteId, 100),
        getAthletePRs(athleteId),
        getAthleteRelays(athleteId, 50)
      ]);

      setAthlete(athleteData as Athlete);
      setPerformances(performanceData as Performance[]);
      setPersonalRecords(prData as PersonalRecord[]);
      setRelayParticipations(relayData as RelayParticipation[]);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return { athlete, performances, personalRecords, relayParticipations, loading, error, refetch: loadAthleteData };
}
