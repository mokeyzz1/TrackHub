import { useState, useEffect } from 'react';
import { getSchools } from '../services/database-supabase';

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

export function useSchools(limit: number = 50, division?: string) {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadSchools();
  }, [offset, division]);

  const loadSchools = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getSchools({ limit, offset, division });

      if (offset === 0) {
        setSchools(response.data as School[]);
      } else {
        setSchools(prev => [...prev, ...(response.data as School[])]);
      }

      setHasMore(response.data.length === limit);
    } catch (err) {
      console.error('Error loading schools:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      setOffset(prev => prev + limit);
    }
  };

  const refresh = () => {
    setOffset(0);
    setSchools([]);
  };

  return { schools, loading, error, loadMore, refresh, hasMore };
}
