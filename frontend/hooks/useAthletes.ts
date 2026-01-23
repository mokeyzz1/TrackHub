import { useState, useEffect } from 'react';
import { getAthletes } from '../services/database-supabase';

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

export function useAthletes(limit: number = 50, gender?: string, division?: string) {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Reset when filter changes
  useEffect(() => {
    setOffset(0);
    setAthletes([]);
  }, [gender, division]);

  useEffect(() => {
    loadAthletes();
  }, [offset, gender, division]);

  const loadAthletes = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await getAthletes({ limit, offset, gender, division });

      if (offset === 0) {
        setAthletes(response.data as Athlete[]);
      } else {
        setAthletes(prev => [...prev, ...(response.data as Athlete[])]);
      }

      setTotalCount(response.pagination.count);
      setHasMore(response.data.length === limit);
    } catch (err) {
      console.error('Error loading athletes:', err);
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
    setAthletes([]);
  };

  return { athletes, loading, error, loadMore, refresh, hasMore, totalCount };
}
