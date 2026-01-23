import { useState, useEffect } from 'react';
import { getAthleteDetails, getAthletePerformances } from '../services/database-supabase';

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
  full_name: string;
  gender: string;
  event_name: string;
  mark_raw: string;
  mark_seconds?: number;
  date: string;
  meet_name: string;
  meet_location?: string;
  place: number;
  round?: string;
  school_name: string;
  division?: string;
  state?: string;
}

export function useAthleteDetails(athleteId: number) {
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadAthleteData();
  }, [athleteId]);

  const loadAthleteData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [athleteData, performanceData] = await Promise.all([
        getAthleteDetails(athleteId),
        getAthletePerformances(athleteId, 50)
      ]);

      setAthlete(athleteData as Athlete);
      setPerformances(performanceData as Performance[]);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return { athlete, performances, loading, error, refetch: loadAthleteData };
}
