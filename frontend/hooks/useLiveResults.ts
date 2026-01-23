import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface LiveResult {
  live_result_id: number;
  meet_url: string;
  meet_name: string | null;
  event_name: string;
  participant_name: string;
  place: number | null;
  mark_raw: string;
  mark_seconds: number | null;
  splits: string[] | null;
  scraped_at: string;
  date: string | null;
  round: string;
  is_processed: boolean;
  athlete_id: number | null;
  team_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface GroupedResults {
  eventName: string;
  gender: 'M' | 'F' | 'Mixed';
  eventType: 'track' | 'field';
  results: LiveResult[];
}

function parseGenderFromEvent(eventName: string): 'M' | 'F' | 'Mixed' {
  const normalized = eventName.toLowerCase();
  if (normalized.includes('boys') || normalized.includes("men's") || normalized.includes('men')) {
    return 'M';
  }
  if (normalized.includes('girls') || normalized.includes("women's") || normalized.includes('women')) {
    return 'F';
  }
  return 'Mixed';
}

function parseEventType(eventName: string): 'track' | 'field' {
  const normalized = eventName.toLowerCase();
  // Field events
  const fieldEvents = ['shot put', 'discus', 'javelin', 'hammer', 'high jump', 'long jump', 'triple jump', 'pole vault'];
  if (fieldEvents.some(event => normalized.includes(event))) {
    return 'field';
  }
  // Everything else is track (including hurdles, relays, distances)
  return 'track';
}

function groupResultsByEvent(results: LiveResult[]): GroupedResults[] {
  const eventMap = new Map<string, LiveResult[]>();

  // Group by event name
  results.forEach(result => {
    if (!eventMap.has(result.event_name)) {
      eventMap.set(result.event_name, []);
    }
    eventMap.get(result.event_name)!.push(result);
  });

  // Convert to array with metadata
  const grouped: GroupedResults[] = [];
  eventMap.forEach((eventResults, eventName) => {
    grouped.push({
      eventName,
      gender: parseGenderFromEvent(eventName),
      eventType: parseEventType(eventName),
      results: eventResults
    });
  });

  return grouped;
}

export interface LiveMeet {
  meet_name: string;
  meet_url: string;
  event_count: number;
  last_updated: string;
}

export function useLiveResults(meetUrl?: string) {
  const [results, setResults] = useState<LiveResult[]>([]);
  const [groupedResults, setGroupedResults] = useState<GroupedResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchLiveResults();

    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchLiveResults();
    }, 10000);

    return () => clearInterval(interval);
  }, [meetUrl]);

  const fetchLiveResults = async () => {
    try {
      let query = supabase
        .from('live_results')
        .select('*')
        .order('event_name', { ascending: true })
        .order('place', { ascending: true });

      if (meetUrl) {
        query = query.eq('meet_url', meetUrl);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        console.error('Error fetching live results:', queryError);
        setError(queryError.message);
        return;
      }

      const resultsData = data || [];
      setResults(resultsData);

      // Group results by event
      const grouped = groupResultsByEvent(resultsData);
      setGroupedResults(grouped);

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return {
    results,
    groupedResults,
    loading,
    error,
    lastUpdated,
    refresh: fetchLiveResults,
  };
}

export function useLiveMeets() {
  const [meets, setMeets] = useState<LiveMeet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLiveMeets();

    // Auto-refresh every 60 seconds
    const interval = setInterval(() => {
      fetchLiveMeets();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchLiveMeets = async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('live_results')
        .select('meet_name, meet_url, event_name, scraped_at')
        .order('scraped_at', { ascending: false });

      if (queryError) {
        console.error('Error fetching live meets:', queryError);
        setError(queryError.message);
        return;
      }

      if (!data) {
        setMeets([]);
        return;
      }

      // Group by meet
      const meetMap = new Map<string, LiveMeet>();

      data.forEach(result => {
        const existing = meetMap.get(result.meet_url);

        if (existing) {
          existing.event_count++;
          if (new Date(result.scraped_at) > new Date(existing.last_updated)) {
            existing.last_updated = result.scraped_at;
          }
        } else {
          meetMap.set(result.meet_url, {
            meet_name: result.meet_name,
            meet_url: result.meet_url,
            event_count: 1,
            last_updated: result.scraped_at,
          });
        }
      });

      // Convert to array and sort by most recent
      const meetsArray = Array.from(meetMap.values()).sort(
        (a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()
      );

      setMeets(meetsArray);
      setError(null);
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return {
    meets,
    loading,
    error,
    refresh: fetchLiveMeets,
  };
}

export function useLiveEvent(meetUrl: string, eventName: string) {
  const [results, setResults] = useState<LiveResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!meetUrl || !eventName) {
      setLoading(false);
      return;
    }

    fetchEventResults();

    // Auto-refresh every 20 seconds for individual events
    const interval = setInterval(() => {
      fetchEventResults();
    }, 20000);

    return () => clearInterval(interval);
  }, [meetUrl, eventName]);

  const fetchEventResults = async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('live_results')
        .select('*')
        .eq('meet_url', meetUrl)
        .eq('event_name', eventName)
        .order('place', { ascending: true });

      if (queryError) {
        console.error('Error fetching event results:', queryError);
        setError(queryError.message);
        return;
      }

      setResults(data || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return {
    results,
    loading,
    error,
    lastUpdated,
    refresh: fetchEventResults,
  };
}
