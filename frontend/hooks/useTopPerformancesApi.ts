import { useState, useEffect } from 'react';
import { getNcaaPerformances, Performance } from '../services/api';

export function useTopPerformancesApi(limit: number = 10) {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadPerformances();
  }, [limit]);

  const loadPerformances = async () => {
    try {
      setLoading(true);
      const data = await getNcaaPerformances(limit);
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
