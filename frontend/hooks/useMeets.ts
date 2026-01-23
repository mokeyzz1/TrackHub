import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Meet {
  meet_id: number;
  name: string;
  date: string;
  location: string;
  meet_url: string | null;
  status: 'upcoming' | 'live' | 'completed';
  level: string;
  season: string;
  created_at: string;
  updated_at: string;
}

export function useMeets(filter?: 'upcoming' | 'live' | 'past') {
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchMeets();
  }, [filter]);

  async function fetchMeets() {
    try {
      setLoading(true);
      setError(null);

      // Get today's date in YYYY-MM-DD format (local timezone)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      let query = supabase.from('meets').select('*');

      // Filter by date-based logic (automatic detection)
      if (filter === 'upcoming') {
        // Upcoming: date > today (strictly future meets)
        query = query
          .gt('date', today)
          .order('date', { ascending: true });
      } else if (filter === 'past') {
        // Past: date < today
        query = query
          .lt('date', today)
          .order('date', { ascending: false });
      } else if (filter === 'live') {
        // Live: date is today AND has a meet_url (timing link)
        query = query
          .eq('date', today)
          .not('meet_url', 'is', null)
          .order('date', { ascending: true });
      } else {
        // No filter - return all meets
        query = query.order('date', { ascending: false });
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setMeets(data || []);
    } catch (err) {
      console.error('Error fetching meets:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    fetchMeets();
  }

  return {
    meets,
    loading,
    error,
    refresh
  };
}
