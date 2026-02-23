import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

export interface Meet {
  meet_id: number;
  name: string;
  date: string;
  end_date: string | null;
  location: string;
  meet_url: string | null;
  status: 'upcoming' | 'live' | 'completed';
  level: string;
  season: string;
  created_at: string;
  updated_at: string;
}

// Memory cache for instant tab switching
const cache: Record<string, Meet[]> = {};
let allTabsLoaded = false;
let loadingPromise: Promise<void> | null = null;

const STORAGE_KEY = '@meets_all';
const COLUMNS = 'meet_id,name,date,end_date,location,meet_url,status,level,season,created_at,updated_at';

function getToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getFirstOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// Load all tabs from storage or server
async function loadAllTabs(): Promise<void> {
  if (allTabsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const today = getToday();

    // Try loading from AsyncStorage first
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { upcoming, past, live, timestamp } = JSON.parse(stored);
        // Use cache if less than 5 minutes old
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          cache['upcoming'] = upcoming || [];
          cache['past'] = past || [];
          cache['live'] = live || [];
          allTabsLoaded = true;
          // Refresh in background
          fetchAllFromServer(today);
          return;
        }
      }
    } catch (e) {
      // Ignore storage errors
    }

    // Fetch from server
    await fetchAllFromServer(today);
  })();

  return loadingPromise;
}

async function fetchAllFromServer(today: string) {
  try {
    // Only load current month for past meets (faster load)
    const firstOfMonth = getFirstOfMonth();

    // Fetch all 3 tabs in parallel
    // For multi-day meets, use end_date to determine if still live or past
    const [upcomingRes, pastRes, liveRes] = await Promise.all([
      // Upcoming: hasn't started yet
      supabase.from('meets').select(COLUMNS)
        .gt('date', today)
        .order('date', { ascending: true })
        .limit(200),
      // Past: single-day before today OR multi-day that ended before today
      supabase.from('meets').select(COLUMNS)
        .or(`and(date.lt.${today},end_date.is.null),end_date.lt.${today}`)
        .gte('date', firstOfMonth)
        .order('date', { ascending: false })
        .limit(100),
      // Live: single-day today OR multi-day spanning today
      supabase.from('meets').select(COLUMNS)
        .or(`and(date.eq.${today},end_date.is.null),and(date.lte.${today},end_date.gte.${today})`)
        .not('meet_url', 'is', null)
    ]);

    cache['upcoming'] = upcomingRes.data || [];
    cache['past'] = pastRes.data || [];
    cache['live'] = liveRes.data || [];
    allTabsLoaded = true;

    // Save to AsyncStorage
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      upcoming: cache['upcoming'],
      past: cache['past'],
      live: cache['live'],
      timestamp: Date.now()
    })).catch(() => {});
  } catch (e) {
    console.error('Error fetching meets:', e);
  }
}

export function useMeets(filter?: 'upcoming' | 'live' | 'past') {
  const cacheKey = filter || 'upcoming';
  const [meets, setMeets] = useState<Meet[]>(cache[cacheKey] || []);
  const [loading, setLoading] = useState(!cache[cacheKey]?.length);
  const [error, setError] = useState<Error | null>(null);
  const lastFilter = useRef(filter);

  // Instantly switch to cached data when filter changes
  if (filter !== lastFilter.current) {
    lastFilter.current = filter;
    if (cache[cacheKey]?.length) {
      setMeets(cache[cacheKey]);
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function load() {
      // If we have cached data, show it immediately
      if (cache[cacheKey]?.length) {
        setMeets(cache[cacheKey]);
        setLoading(false);
        return;
      }

      // Load all tabs
      setLoading(true);
      await loadAllTabs();

      if (mounted && cache[cacheKey]) {
        setMeets(cache[cacheKey]);
        setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [filter]);

  function refresh() {
    allTabsLoaded = false;
    loadingPromise = null;
    cache['upcoming'] = [];
    cache['past'] = [];
    cache['live'] = [];
    setLoading(true);
    loadAllTabs().then(() => {
      setMeets(cache[cacheKey] || []);
      setLoading(false);
    });
  }

  // Search past meets (including older months)
  async function searchPastMeets(query: string): Promise<Meet[]> {
    if (!query || query.length < 2) return [];

    const today = getToday();
    const { data } = await supabase
      .from('meets')
      .select(COLUMNS)
      .or(`and(date.lt.${today},end_date.is.null),end_date.lt.${today}`)
      .ilike('name', `%${query}%`)
      .order('date', { ascending: false })
      .limit(50);

    return data || [];
  }

  return { meets, loading, error, refresh, searchPastMeets };
}

// Get meets from last weekend (Sat-Sun) with results
export function useLatestResults(limit: number = 5) {
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Calculate last weekend's Saturday and Sunday
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

      // Days since last Saturday
      const daysSinceSat = dayOfWeek === 6 ? 7 : dayOfWeek + 1;
      const lastSaturday = new Date(today);
      lastSaturday.setDate(today.getDate() - daysSinceSat);

      const lastSunday = new Date(lastSaturday);
      lastSunday.setDate(lastSaturday.getDate() + 1);

      const satStr = lastSaturday.toISOString().split('T')[0];
      const sunStr = lastSunday.toISOString().split('T')[0];

      console.log('Last weekend:', satStr, 'to', sunStr);

      const { data } = await supabase
        .from('meets')
        .select(COLUMNS)
        .gte('date', satStr)
        .lte('date', sunStr)
        .not('meet_url', 'is', null)
        .order('date', { ascending: false })
        .limit(limit);

      setMeets(data || []);
      setLoading(false);
    }
    load();
  }, [limit]);

  return { meets, loading };
}
