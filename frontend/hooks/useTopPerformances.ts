import { useState, useEffect } from 'react';
import { getTopPerformances } from '../services/database-supabase';

interface Performance {
  athlete_id: number;
  full_name: string;
  gender: string;
  event_name: string;
  mark_raw: string;
  date: string;
  meet_name: string;
  place: number;
  school_name: string;
  division: string;
}

export function useTopPerformances(limit: number = 10) {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadPerformances();
  }, [limit]);

  const loadPerformances = async () => {
    try {
      setLoading(true);
      const data = await getTopPerformances(limit) as Performance[];
      setPerformances(data);
      setError(null);
    } catch (err) {
      console.error('Error loading performances:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return { performances, loading, error, refetch: loadPerformances };
}
