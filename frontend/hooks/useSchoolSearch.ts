import { useState, useCallback } from 'react';
import { searchSchools } from '../services/database-supabase';

export interface School {
  school_id: number;
  official_name: string;
  short_name?: string;
  city?: string;
  state?: string;
  division?: string;
  region_name?: string;
  conference_name?: string;
  conference_abbrev?: string;
}

export function useSchoolSearch() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(async (searchTerm: string, limit: number = 20) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSchools([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await searchSchools(searchTerm, limit);
      setSchools(results as School[]);
    } catch (err) {
      console.error('Error searching schools:', err);
      setError(err as Error);
      setSchools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setSchools([]);
    setError(null);
  }, []);

  return { schools, loading, error, search, clear };
}
