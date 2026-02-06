import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { calculateWAPoints } from '../utils/waScoring';

const CACHE_KEY = 'top_performances_cache_v5';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Division mapping for filtering
const DIVISION_MAP: Record<string, string[]> = {
  'D1': ['DI', 'D1', 'Division I', 'NCAA Division I'],
  'D2': ['DII', 'D2', 'Division II', 'NCAA Division II'],
  'D3': ['DIII', 'D3', 'Division III', 'NCAA Division III'],
  'NAIA': ['NAIA'],
  'JUCO': ['JUCO', 'NJCAA'],
};

interface Performance {
  athlete_id: number;
  full_name: string;
  gender: string;
  event_name: string;
  mark_raw: string;
  date: string;
  meet_name: string;
  meet_id: number;
  place: number;
  school_name: string;
  division: string;
  waPoints: number;
}

export function useTopPerformances(limit: number = 10, division?: string, weeksAgo: number = 0) {
  const [performances, setPerformances] = useState<Performance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadWithCache();
  }, [limit, division, weeksAgo]);

  const loadWithCache = async () => {
    try {
      // Try to load from cache first (include weeksAgo in key)
      const cacheKey = `${CACHE_KEY}_week${weeksAgo}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const isValid = Date.now() - timestamp < CACHE_DURATION;

        if (isValid && data.length > 0) {
          const filtered = filterByDivision(data, division);
          // Only use cache if we have enough results for this division
          if (filtered.length >= limit || division === 'all') {
            console.log('[TopPerformances] Loaded from cache, filtered:', filtered.length);
            setPerformances(filtered.slice(0, limit));
            setLoading(false);
            return;
          }
          console.log('[TopPerformances] Cache insufficient for division, refetching...');
        }
      }

      // No valid cache or insufficient for this division, fetch fresh data
      await fetchFreshData();
    } catch (err) {
      console.error('[TopPerformances] Cache error:', err);
      await fetchFreshData();
    }
  };

  const filterByDivision = (allPerformances: Performance[], div?: string): Performance[] => {
    if (!div || div === 'all') return allPerformances;
    const matchValues = DIVISION_MAP[div] || [div];
    return allPerformances.filter((p: Performance) =>
      matchValues.some(v => p.division?.toUpperCase() === v.toUpperCase())
    );
  };

  const fetchFreshData = async () => {
    try {
      setLoading(true);
      console.log('[TopPerformances] Fetching fresh data...');

      // Calculate date range based on weeksAgo
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - (weeksAgo * 7));
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      console.log('[TopPerformances] Date range:', startDateStr, 'to', endDateStr);

      // Fetch in parallel batches to speed up
      const pageSize = 1000;
      const batchSize = 3; // 3 parallel requests at a time
      const maxBatches = 15; // Up to 45k results
      let allData: any[] = [];

      for (let batch = 0; batch < maxBatches; batch++) {
        const promises = [];
        for (let i = 0; i < batchSize; i++) {
          const page = batch * batchSize + i;
          promises.push(
            supabase
              .from('results')
              .select(`
                athlete_id,
                event_name,
                mark_raw,
                date,
                meet_name,
                meet_id,
                place,
                athletes!inner (
                  full_name,
                  gender,
                  school_id,
                  schools!inner (
                    official_name,
                    division
                  )
                )
              `)
              .gte('date', startDateStr)
              .lte('date', endDateStr)
              .not('mark_raw', 'is', null)
              .range(page * pageSize, (page + 1) * pageSize - 1)
          );
        }

        const results = await Promise.all(promises);
        let gotData = false;
        for (const { data, error: fetchError } of results) {
          if (fetchError) throw fetchError;
          if (data && data.length > 0) {
            allData = allData.concat(data);
            gotData = true;
          }
        }
        console.log('[TopPerformances] Batch', batch + 1, '- total:', allData.length);
        if (!gotData) break;
      }

      console.log('[TopPerformances] Fetched:', allData.length, 'results');

      // Calculate WA points
      const withPoints = allData
        .map((r: any) => {
          const gender = r.athletes?.gender || 'M';
          const waPoints = calculateWAPoints(r.mark_raw, r.event_name, gender);
          return {
            athlete_id: r.athlete_id,
            full_name: r.athletes?.full_name || 'Unknown',
            gender,
            event_name: r.event_name,
            mark_raw: r.mark_raw,
            date: r.date,
            meet_name: r.meet_name,
            meet_id: r.meet_id,
            place: r.place,
            school_name: r.athletes?.schools?.official_name || 'Unknown',
            division: r.athletes?.schools?.division || 'Unknown',
            waPoints: waPoints || 0,
          };
        })
        .filter((p: Performance) => p.waPoints > 0);

      // Sort by WA points first
      const sorted = withPoints.sort((a: Performance, b: Performance) => b.waPoints - a.waPoints);

      // Dedupe to show only ONE result per athlete (their best)
      const seen = new Set();
      const deduped = sorted.filter((p: Performance) => {
        if (seen.has(p.athlete_id)) return false;
        seen.add(p.athlete_id);
        return true;
      });

      // Cache top 50 UNIQUE athletes per division
      const toCache: Performance[] = [];
      const divisions = ['all', 'D1', 'D2', 'D3', 'NAIA', 'JUCO'];
      for (const div of divisions) {
        const divResults = div === 'all' ? deduped : filterByDivision(deduped, div);
        toCache.push(...divResults.slice(0, 50));
      }
      // Dedupe the cache across divisions
      const cacheSet = new Set();
      const dedupedCache = toCache.filter(p => {
        if (cacheSet.has(p.athlete_id)) return false;
        cacheSet.add(p.athlete_id);
        return true;
      });
      const cacheKey = `${CACHE_KEY}_week${weeksAgo}`;
      await AsyncStorage.setItem(cacheKey, JSON.stringify({
        data: dedupedCache,
        timestamp: Date.now()
      }));

      console.log('[TopPerformances] Cached', dedupedCache.length, 'unique athletes across all divisions');
      console.log('[TopPerformances] Top 5 overall:', deduped.slice(0, 5).map(p => `${p.waPoints} - ${p.full_name} - ${p.event_name}`));

      // Log top D2 specifically
      const d2Results = filterByDivision(deduped, 'D2');
      console.log('[TopPerformances] Top 5 D2:', d2Results.slice(0, 5).map(p => `${p.waPoints} - ${p.full_name} - ${p.event_name} - ${p.school_name}`));

      // Filter deduped results by division
      const filtered = filterByDivision(deduped, division);
      setPerformances(filtered.slice(0, limit));
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
