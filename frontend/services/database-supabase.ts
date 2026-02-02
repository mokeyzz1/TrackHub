import { supabase } from '../lib/supabase';

/**
 * Supabase Database Service
 *
 * This is the Supabase version of database.ts
 * Key differences from SQLite:
 * - No need to initialize/open database
 * - Uses .from().select() instead of SQL strings
 * - Automatic type safety with TypeScript
 * - Built-in pagination, filtering
 * - Real-time subscriptions available
 */

// Get top performances for the home screen (from live_results)
export async function getTopPerformances(limit: number = 10) {
  // Query live_results for final results with athlete info
  const { data, error } = await supabase
    .from('live_results')
    .select(`
      athlete_id,
      event_name,
      mark_raw,
      date,
      meet_name,
      place,
      team_name,
      participant_name,
      is_final,
      athletes (
        full_name,
        gender,
        school_id,
        schools (
          official_name,
          division
        )
      )
    `)
    .eq('is_final', true)
    .not('athlete_id', 'is', null)
    .lte('place', 3)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching top performances:', error);
    throw error;
  }

  // Transform to expected format
  return data?.map(r => ({
    athlete_id: r.athlete_id,
    full_name: r.athletes?.full_name || r.participant_name,
    gender: r.athletes?.gender || 'M',
    event_name: r.event_name,
    mark_raw: r.mark_raw,
    date: r.date,
    meet_name: r.meet_name,
    place: r.place,
    school_name: r.athletes?.schools?.official_name || r.team_name,
    division: r.athletes?.schools?.division,
  })) || [];
}

// Get performances by event
export async function getPerformancesByEvent(eventName: string, limit: number = 20) {
  const { data, error } = await supabase
    .from('results')
    .select(`
      event_name,
      mark_raw,
      mark_seconds,
      date,
      meet_name,
      place,
      athletes (
        full_name,
        gender
      ),
      teams (
        schools (
          official_name,
          division
        )
      )
    `)
    .eq('event_name', eventName)
    .gte('date', '2024-01-01')
    .order('mark_seconds', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching performances by event:', error);
    throw error;
  }

  return data?.map(r => ({
    full_name: r.athletes?.full_name,
    gender: r.athletes?.gender,
    event_name: r.event_name,
    mark_raw: r.mark_raw,
    mark_seconds: r.mark_seconds,
    date: r.date,
    meet_name: r.meet_name,
    place: r.place,
    school_name: r.teams?.schools?.official_name,
    division: r.teams?.schools?.division,
  })) || [];
}

// Search athletes
export async function searchAthletes(searchTerm: string, limit: number = 20) {
  // Split search term into words and search for each
  const words = searchTerm.trim().split(/\s+/).filter(w => w.length > 0);

  let query = supabase
    .from('athletes')
    .select(`
      athlete_id,
      full_name,
      gender,
      class_year,
      primary_events,
      schools (
        official_name,
        division
      )
    `)
    .eq('is_active', true)
    .not('full_name', 'is', null)
    .neq('full_name', '')
    .neq('full_name', ',');

  // Add ilike filter for each word (all words must match)
  for (const word of words) {
    query = query.ilike('full_name', `%${word}%`);
  }

  const { data, error } = await query
    .order('full_name')
    .limit(limit);

  if (error) {
    console.error('Error searching athletes:', error);
    throw error;
  }

  return data?.map(a => ({
    athlete_id: a.athlete_id,
    full_name: a.full_name,
    gender: a.gender,
    class_year: a.class_year,
    primary_events: a.primary_events,
    school_name: a.schools?.official_name,
    division: a.schools?.division,
  })) || [];
}

// Search schools
export async function searchSchools(searchTerm: string, limit: number = 20) {
  const { data, error } = await supabase
    .from('schools')
    .select('school_id, official_name, short_name, city, state, division')
    .eq('is_active', true)
    .or(`official_name.ilike.%${searchTerm}%,short_name.ilike.%${searchTerm}%`)
    .order('official_name')
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Get school by ID
export async function getSchoolById(schoolId: number) {
  console.log('getSchoolById called with:', schoolId);
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('school_id', schoolId)
    .single();

  console.log('getSchoolById result:', { data, error });
  if (error) {
    console.error('getSchoolById error:', error);
    return null;
  }
  return data;
}

// Get athletes for a school
export async function getSchoolAthletes(schoolId: number, limit: number = 10) {
  const { data, error } = await supabase
    .from('athletes')
    .select('athlete_id, full_name, gender, class_year, primary_events')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Get athlete details
export async function getAthleteDetails(athleteId: number) {
  const { data, error } = await supabase
    .from('athletes')
    .select(`
      *,
      schools (
        official_name,
        division,
        city,
        state
      )
    `)
    .eq('athlete_id', athleteId)
    .single();

  if (error) {
    console.error('Error fetching athlete details:', error);
    return null;
  }

  // Transform to match SQLite format
  return data ? {
    ...data,
    school_name: data.schools?.official_name,
    division: data.schools?.division,
    city: data.schools?.city,
    state: data.schools?.state,
  } : null;
}

// Get athlete's recent performances (excludes PR-only records)
export async function getAthletePerformances(athleteId: number, limit: number = 20) {
  const { data, error } = await supabase
    .from('results')
    .select(`
      result_id,
      athlete_id,
      event_name,
      mark_raw,
      mark_seconds,
      date,
      meet_name,
      place,
      round,
      is_pr
    `)
    .eq('athlete_id', athleteId)
    .not('date', 'is', null)
    .gte('date', '2000-01-01')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching athlete performances:', error);
    throw error;
  }

  return data || [];
}

// Get athlete's personal records (PRs)
export async function getAthletePRs(athleteId: number) {
  const { data, error } = await supabase
    .from('athlete_prs')
    .select(`
      id,
      athlete_id,
      event_name,
      mark_raw,
      mark_seconds,
      mark_meters,
      set_at,
      meet_name,
      season
    `)
    .eq('athlete_id', athleteId)
    .eq('season', 'all')
    .order('event_name');

  if (error) {
    console.error('Error fetching athlete PRs:', error);
    throw error;
  }

  return data || [];
}

// Get all athletes with pagination
export async function getAthletes(options: {
  limit?: number;
  offset?: number;
  gender?: string;
  division?: string;
} = {}) {
  const { limit = 50, offset = 0, gender, division } = options;

  let query = supabase
    .from('athletes')
    .select(`
      athlete_id,
      full_name,
      gender,
      class_year,
      primary_events,
      schools (
        official_name,
        division,
        state
      )
    `, { count: 'exact' })
    .eq('is_active', true)
    .not('full_name', 'is', null)
    .neq('full_name', '')
    .neq('full_name', ',');

  if (gender) {
    query = query.eq('gender', gender);
  }

  if (division) {
    query = query.eq('schools.division', division);
  }

  query = query
    .order('full_name')
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching athletes:', error);
    throw error;
  }

  return {
    data: data?.map(a => {
      const school = a.schools as any;
      return {
        athlete_id: a.athlete_id,
        full_name: a.full_name,
        gender: a.gender,
        class_year: a.class_year,
        primary_events: a.primary_events,
        school_name: school?.official_name,
        division: school?.division,
        state: school?.state,
      };
    }) || [],
    pagination: { limit, offset, count: count || 0 },
  };
}

// Get all schools with pagination
export async function getSchools(options: {
  limit?: number;
  offset?: number;
  division?: string;
} = {}) {
  const { limit = 50, offset = 0, division } = options;

  let query = supabase
    .from('schools')
    .select(`
      school_id,
      official_name,
      short_name,
      city,
      state,
      division,
      regions (
        region_name
      ),
      conferences (
        name,
        abbreviation
      )
    `, { count: 'exact' })
    .eq('is_active', true);

  if (division) {
    query = query.eq('division', division);
  }

  query = query
    .order('official_name')
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching schools:', error);
    throw error;
  }

  return {
    data: data?.map(s => {
      const region = s.regions as any;
      const conference = s.conferences as any;
      return {
        school_id: s.school_id,
        official_name: s.official_name,
        short_name: s.short_name,
        city: s.city,
        state: s.state,
        division: s.division,
        region_name: region?.region_name,
        conference_name: conference?.name,
        conference_abbrev: conference?.abbreviation,
      };
    }) || [],
    pagination: { limit, offset, count: count || 0 },
  };
}

// Normalize event names for comparison (e.g., "400.0" -> "400", "200.0" -> "200")
function normalizeEventName(eventName: string): string {
  if (!eventName) return eventName;
  // Remove trailing .0 (e.g., "400.0" -> "400")
  let normalized = eventName.replace(/\.0$/, '');
  // Normalize case for common events
  normalized = normalized.trim();
  return normalized;
}

// Determine season from date (indoor: Jan-Mar, outdoor: Apr-Jun)
export type SeasonFilter = 'all' | 'indoor' | 'outdoor';

function getSeasonFromDate(dateStr: string | null): 'indoor' | 'outdoor' | 'other' {
  if (!dateStr) return 'other';
  const date = new Date(dateStr);
  const month = date.getMonth() + 1; // 1-12

  if (month >= 1 && month <= 3) return 'indoor';  // Jan-Mar
  if (month >= 4 && month <= 6) return 'outdoor'; // Apr-Jun
  if (month === 12) return 'indoor'; // December = early indoor
  return 'other'; // July-Nov = XC or off-season
}

function filterResultsBySeason(results: any[], seasonFilter: SeasonFilter): any[] {
  if (seasonFilter === 'all') return results;
  return results.filter(r => {
    const season = getSeasonFromDate(r.date);
    return season === seasonFilter;
  });
}

// Parse mark_raw time string to seconds (e.g., "47.71" -> 47.71, "1:52.34" -> 112.34)
function parseTimeToSeconds(markRaw: string | null): number | null {
  if (!markRaw) return null;

  // Remove any trailing notes like "(4.4)" for wind
  const cleaned = markRaw.split('(')[0].trim();

  // Handle MM:SS.xx format
  if (cleaned.includes(':')) {
    const parts = cleaned.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseFloat(parts[1]);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        return minutes * 60 + seconds;
      }
    }
  }

  // Handle SS.xx format
  const seconds = parseFloat(cleaned);
  if (!isNaN(seconds)) {
    return seconds;
  }

  return null;
}

// Format seconds back to time string
function formatSecondsToTime(seconds: number): string {
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  }
  return seconds.toFixed(2);
}

// Get athlete stats for comparison
export async function getAthleteComparisonStats(athleteId: number, seasonFilter: SeasonFilter = 'all') {
  // Get athlete basic info
  const { data: athlete, error: athleteError } = await supabase
    .from('athletes')
    .select(`
      athlete_id,
      full_name,
      gender,
      schools (
        official_name,
        division
      )
    `)
    .eq('athlete_id', athleteId)
    .single();

  if (athleteError || !athlete) {
    console.error('Error fetching athlete:', athleteError);
    return null;
  }

  // Get PRs directly (where is_pr = true)
  const { data: allPrs, error: prError } = await supabase
    .from('results')
    .select('event_name, mark_raw, meet_name, date')
    .eq('athlete_id', athleteId)
    .eq('is_pr', true)
    .gte('date', '2000-01-01');

  if (prError) {
    console.error('Error fetching PRs:', prError);
  }

  // Get all results for meet count, wins, and head-to-head data
  const { data: rawResults, error: resultsError } = await supabase
    .from('results')
    .select('event_name, place, meet_name, date, mark_raw')
    .eq('athlete_id', athleteId)
    .gte('date', '2000-01-01');

  if (resultsError) {
    console.error('Error fetching results:', resultsError);
  }

  // Filter by season
  const prs = filterResultsBySeason(allPrs || [], seasonFilter);
  const allResults = filterResultsBySeason(rawResults || [], seasonFilter);

  // Build event stats from PRs and results (with normalized event names)
  const eventStats: Record<string, any> = {};

  // Add PRs
  prs.forEach((pr: any) => {
    const eventName = normalizeEventName(pr.event_name);
    if (!eventStats[eventName]) {
      eventStats[eventName] = {
        personalBestRaw: null,
        raceCount: 0,
        totalSeconds: 0,
        averageRaw: null,
      };
    }
    // Only set PR if we don't have one yet (prefer first/best)
    if (!eventStats[eventName].personalBestRaw) {
      eventStats[eventName].personalBestRaw = pr.mark_raw;
    }
  });

  // Count races and calculate average per event
  allResults.forEach((result: any) => {
    const eventName = normalizeEventName(result.event_name);
    if (!eventStats[eventName]) {
      eventStats[eventName] = {
        personalBestRaw: null,
        raceCount: 0,
        totalSeconds: 0,
        averageRaw: null,
      };
    }

    // Parse time and add to total for average calculation
    const seconds = parseTimeToSeconds(result.mark_raw);
    if (seconds !== null) {
      eventStats[eventName].raceCount++;
      eventStats[eventName].totalSeconds += seconds;
    }
  });

  // Calculate average for each event
  Object.keys(eventStats).forEach(eventName => {
    const stats = eventStats[eventName];
    if (stats.raceCount > 0 && stats.totalSeconds > 0) {
      const avgSeconds = stats.totalSeconds / stats.raceCount;
      stats.averageRaw = formatSecondsToTime(avgSeconds);
    }
  });

  const school = athlete.schools as any;
  return {
    athlete_id: athlete.athlete_id,
    full_name: athlete.full_name,
    gender: athlete.gender,
    school_name: school?.official_name,
    division: school?.division,
    eventStats,
    // Include raw results for head-to-head calculation
    allResults: allResults || [],
  };
}

// Get head-to-head comparison between two athletes
export async function getHeadToHead(athleteId1: number, athleteId2: number, eventName: string, seasonFilter: SeasonFilter = 'all') {
  // Get all results for both athletes - include round to match same race
  const { data: rawResults1, error: error1 } = await supabase
    .from('results')
    .select('meet_name, date, place, mark_raw, event_name, round')
    .eq('athlete_id', athleteId1)
    .gte('date', '2000-01-01');

  const { data: rawResults2, error: error2 } = await supabase
    .from('results')
    .select('meet_name, date, place, mark_raw, event_name, round')
    .eq('athlete_id', athleteId2)
    .gte('date', '2000-01-01');

  if (error1 || error2) {
    console.error('Error fetching head-to-head:', error1 || error2);
    return { athlete1Wins: 0, athlete2Wins: 0, ties: 0, races: [] };
  }

  // Filter by normalized event name and season
  const allResults1 = filterResultsBySeason(rawResults1 || [], seasonFilter);
  const allResults2 = filterResultsBySeason(rawResults2 || [], seasonFilter);

  const results1 = allResults1.filter(r => normalizeEventName(r.event_name) === eventName);
  const results2 = allResults2.filter(r => normalizeEventName(r.event_name) === eventName);

  // Find common races (where both athletes competed in SAME RACE)
  // Match by meet_name + date + round (same heat/final)
  const meetResults1 = new Map(results1.map(r => [`${r.meet_name}_${r.date}_${r.round || ''}`, r]));
  const commonRaces: any[] = [];
  let athlete1Wins = 0;
  let athlete2Wins = 0;
  let ties = 0;

  results2.forEach(r2 => {
    const key = `${r2.meet_name}_${r2.date}_${r2.round || ''}`;
    const r1 = meetResults1.get(key);
    if (r1) {
      // Both competed in the SAME RACE (same meet + date + round)
      const race = {
        meet_name: r1.meet_name,
        date: r1.date,
        round: r1.round,
        athlete1_place: r1.place,
        athlete2_place: r2.place,
        athlete1_mark: r1.mark_raw,
        athlete2_mark: r2.mark_raw,
      };
      commonRaces.push(race);

      if (r1.place < r2.place) {
        athlete1Wins++;
      } else if (r2.place < r1.place) {
        athlete2Wins++;
      } else {
        ties++;
      }
    }
  });

  // Sort by date descending (most recent first)
  commonRaces.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    athlete1Wins,
    athlete2Wins,
    ties,
    races: commonRaces,
  };
}

// Add email to waitlist
export async function addToWaitlist(email: string, feature: string = 'community') {
  const { data, error } = await supabase
    .from('waitlist')
    .insert({
      email: email.toLowerCase().trim(),
      feature,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    // Check if duplicate email
    if (error.code === '23505') {
      return { success: true, alreadyExists: true };
    }
    throw error;
  }

  return { success: true, alreadyExists: false, data };
}

// ============================================
// MEET RESULTS
// ============================================

// Get meet by ID
export async function getMeetById(meetId: number) {
  const { data, error } = await supabase
    .from('meets')
    .select('*')
    .eq('meet_id', meetId)
    .single();

  if (error) {
    console.error('Error fetching meet:', error);
    return null;
  }
  return data;
}

// Get meet by name and date
export async function getMeetByName(meetName: string, date?: string) {
  let query = supabase
    .from('meets')
    .select('*')
    .eq('name', meetName);

  if (date) {
    query = query.eq('date', date);
  }

  const { data, error } = await query.limit(1).single();

  if (error) {
    console.error('Error fetching meet by name:', error);
    return null;
  }
  return data;
}

// Get all events at a specific meet
export async function getEventsByMeet(meetName: string, date: string) {
  const { data, error } = await supabase
    .from('results')
    .select('event_name')
    .eq('meet_name', meetName)
    .eq('date', date)
    .not('event_name', 'is', null);

  if (error) {
    console.error('Error fetching events by meet:', error);
    throw error;
  }

  // Get unique event names and sort them
  const uniqueEvents = [...new Set(data?.map(r => r.event_name))].sort();
  return uniqueEvents;
}

// Get events by meet organized by gender
export async function getEventsByMeetWithGender(meetName: string, date: string) {
  const { data, error } = await supabase
    .from('results')
    .select(`
      event_name,
      athletes (
        gender
      )
    `)
    .eq('meet_name', meetName)
    .eq('date', date)
    .not('event_name', 'is', null);

  if (error) {
    console.error('Error fetching events by meet with gender:', error);
    throw error;
  }

  // Organize events by gender
  const mensEvents = new Set<string>();
  const womensEvents = new Set<string>();

  data?.forEach(r => {
    const gender = (r.athletes as any)?.gender;
    if (gender === 'M') {
      mensEvents.add(r.event_name);
    } else if (gender === 'F') {
      womensEvents.add(r.event_name);
    }
  });

  return {
    mens: [...mensEvents].sort(),
    womens: [...womensEvents].sort(),
  };
}

// Get all results for a specific event at a meet
// Returns ALL rounds (Finals, Prelims, Heats) for the full event view
// gender parameter filters to only show M or F results (since event names don't include gender)
export async function getEventResults(meetName: string, eventName: string, date: string, gender?: string) {
  const { data, error } = await supabase
    .from('results')
    .select(`
      result_id,
      athlete_id,
      mark_raw,
      mark_seconds,
      place,
      round,
      wind,
      athletes (
        full_name,
        gender,
        class_year,
        school_id,
        schools (
          official_name,
          short_name
        )
      )
    `)
    .eq('meet_name', meetName)
    .eq('event_name', eventName)
    .eq('date', date)
    .order('round', { ascending: true })
    .order('place', { ascending: true });

  if (error) {
    console.error('Error fetching event results:', error);
    throw error;
  }

  // Transform and filter by gender (client-side since event names don't include gender)
  let results = data?.map(r => {
    const athlete = r.athletes as any;
    const school = athlete?.schools as any;
    return {
      result_id: r.result_id,
      athlete_id: r.athlete_id,
      athlete_name: athlete?.full_name || 'Unknown',
      gender: athlete?.gender,
      class_year: athlete?.class_year || '',
      school_name: school?.official_name || school?.short_name || 'Unknown',
      mark_raw: r.mark_raw,
      mark_seconds: r.mark_seconds,
      place: r.place,
      round: r.round || 'Results',
      wind: r.wind,
    };
  }) || [];

  // Filter by gender if provided
  if (gender) {
    results = results.filter(r => r.gender === gender);
  }

  return results;
}

// Get count of results per event at a meet (for displaying athlete counts)
export async function getEventCountsByMeet(meetName: string, date: string) {
  const { data, error } = await supabase
    .from('results')
    .select('event_name')
    .eq('meet_name', meetName)
    .eq('date', date)
    .not('event_name', 'is', null);

  if (error) {
    console.error('Error fetching event counts:', error);
    throw error;
  }

  // Count results per event
  const counts: Record<string, number> = {};
  data?.forEach(r => {
    counts[r.event_name] = (counts[r.event_name] || 0) + 1;
  });
  return counts;
}
