import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const CACHE_KEY = 'top_performances_cache_v8';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface Performance {
  athlete_id: number;
  full_name: string;
  gender: string;
  event_name: string;
  mark_raw: string;
  date: string;
  meet_name: string;
  meet_id: number | null;
  place: number;
  school_name: string;
  division: string;
  waPoints: number;
}

// Get the competition week (Fri-Tue) for a given date
// If weeksAgo = 0 and today is Wed-Thu, show last week's results
// If weeksAgo = 0 and today is Fri-Tue, show current week (in progress)
function getCompetitionWeekDates(weeksAgo: number = 0): { start: string; end: string } {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, 4 = Thursday

  // Find the most recent Monday (end of competition week)
  let endDate = new Date(today);
  if (dayOfWeek === 1) {
    // Today is Monday - use today as end
  } else if (dayOfWeek >= 4 || dayOfWeek === 0) {
    // Thu, Fri, Sat, Sun - competition week in progress, use next Monday
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    endDate.setDate(today.getDate() + daysUntilMonday);
  } else {
    // Tue, Wed - use last Monday
    const daysSinceMonday = dayOfWeek - 1;
    endDate.setDate(today.getDate() - daysSinceMonday);
  }

  // Go back additional weeks if requested
  endDate.setDate(endDate.getDate() - (weeksAgo * 7));

  // Start date is Thursday (4 days before Monday)
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 4);

  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0]
  };
}

export function useTopPerformances(limit: number = 10, division?: string, weeksAgo: number = 0, gender?: string) {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadWithCache();
  }, [limit, division, weeksAgo, gender]);

  const loadWithCache = async () => {
    try {
      const cacheKey = `${CACHE_KEY}_week${weeksAgo}_${division || 'all'}_${gender || 'all'}`;
      const cached = await AsyncStorage.getItem(cacheKey);

      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION && data.length > 0) {
          console.log('[TopPerformances] Using cache:', data.length, 'results');
          setPerformances(data.slice(0, limit));
          setLoading(false);
          return;
        }
      }

      await fetchFreshData();
    } catch (err) {
      console.error('[TopPerformances] Cache error:', err);
      await fetchFreshData();
    }
  };

  const fetchFreshData = async () => {
    try {
      setLoading(true);
      console.log('[TopPerformances] Fetching fresh data...');

      // Get competition week dates (Fri-Sun)
      const { start: startDateStr, end: endDateStr } = getCompetitionWeekDates(weeksAgo);
      console.log('[TopPerformances] Competition week:', startDateStr, 'to', endDateStr);

      // Single database call - WA scoring done in Postgres
      const { data, error: fetchError } = await supabase.rpc('get_top_performances', {
        p_start_date: startDateStr,
        p_end_date: endDateStr,
        p_division: division === 'all' ? null : division,
        p_gender: gender === 'all' ? null : gender,
        p_limit: Math.max(limit, 100) // Get at least 100 for caching
      });

      if (fetchError) throw fetchError;

      console.log('[TopPerformances] Got', data?.length || 0, 'ranked results from DB');

      // Map to Performance interface (data already scored and deduped by DB)
      const performances: Performance[] = (data || []).map((r: any) => ({
        athlete_id: r.athlete_id,
        full_name: r.full_name || 'Unknown',
        gender: r.gender || 'M',
        event_name: r.event_name,
        mark_raw: r.mark_raw,
        date: r.date,
        meet_name: r.meet_name,
        meet_id: r.meet_id,
        place: r.place,
        school_name: r.school_name || 'Unknown',
        division: r.division || 'Unknown',
        waPoints: r.wa_points || 0,
      }));

      console.log('[TopPerformances] Top 5:', performances.slice(0, 5).map(p => `${p.waPoints} - ${p.full_name} - ${p.event_name}`));

      // Cache the results
      const cacheKey = `${CACHE_KEY}_week${weeksAgo}_${division || 'all'}_${gender || 'all'}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        data: performances,
        timestamp: Date.now()
      }));

      setPerformances(performances.slice(0, limit));
      setError(null);
    } catch (err) {
      console.error('[TopPerformances] ERROR:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  return { performances, loading, error, refetch: fetchFreshData };
}
