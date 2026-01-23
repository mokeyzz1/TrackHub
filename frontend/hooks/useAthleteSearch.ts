import { useState, useCallback } from 'react';
import { searchAthletes } from '../services/database-supabase';

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

export function useAthleteSearch() {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(async (searchTerm: string, limit: number = 20) => {
    if (!searchTerm || searchTerm.length < 2) {
      setAthletes([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await searchAthletes(searchTerm, limit);
      setAthletes(results as Athlete[]);
    } catch (err) {
      console.error('Error searching athletes:', err);
      setError(err as Error);
      setAthletes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setAthletes([]);
    setError(null);
  }, []);

  return { athletes, loading, error, search, clear };
}
