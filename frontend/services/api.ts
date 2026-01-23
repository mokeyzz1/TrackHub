// Track Hub API Client
const API_BASE_URL = 'http://10.0.0.64:3000/api';

interface ApiResponse<T> {
  data?: T;
  count?: number;
  pagination?: {
    limit: number;
    offset: number;
    count: number;
  };
  error?: string;
}

export interface Performance {
  result_id: number;
  athlete_id: number;
  full_name: string;
  gender: string;
  event_name: string;
  mark_raw: string;
  mark_seconds?: number;
  date: string;
  meet_name: string;
  meet_location?: string;
  place: number;
  round?: string;
  school_name: string;
  division: string;
  state?: string;
}

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

// Generic fetch wrapper
async function apiFetch<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}

// Get NCAA Championship performances (for homepage)
export async function getNcaaPerformances(limit: number = 10): Promise<Performance[]> {
  const response = await apiFetch<ApiResponse<Performance[]>>(`/performances/ncaa?limit=${limit}`);
  return response.data || [];
}

// Get performances with pagination
export async function getPerformances(options: {
  limit?: number;
  offset?: number;
  event?: string;
  gender?: string;
} = {}): Promise<{ data: Performance[]; pagination: any }> {
  const params = new URLSearchParams();

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.event) params.append('event', options.event);
  if (options.gender) params.append('gender', options.gender);

  const response = await apiFetch<ApiResponse<Performance[]>>(`/performances?${params}`);

  return {
    data: response.data || [],
    pagination: response.pagination || { limit: 20, offset: 0, count: 0 },
  };
}

// Search athletes
export async function searchAthletes(searchTerm: string, limit: number = 20): Promise<Athlete[]> {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  const response = await apiFetch<ApiResponse<Athlete[]>>(`/athletes/search?q=${encodeURIComponent(searchTerm)}&limit=${limit}`);
  return response.data || [];
}

// Get athlete details
export async function getAthleteDetails(athleteId: number): Promise<Athlete> {
  return await apiFetch<Athlete>(`/athletes/${athleteId}`);
}

// Get athlete performances
export async function getAthletePerformances(athleteId: number, limit: number = 20): Promise<Performance[]> {
  const response = await apiFetch<ApiResponse<Performance[]>>(`/athletes/${athleteId}/performances?limit=${limit}`);
  return response.data || [];
}

// Get all athletes with pagination
export async function getAthletes(options: {
  limit?: number;
  offset?: number;
  gender?: string;
  division?: string;
} = {}): Promise<{ data: Athlete[]; pagination: any }> {
  const params = new URLSearchParams();

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.gender) params.append('gender', options.gender);
  if (options.division) params.append('division', options.division);

  const response = await apiFetch<ApiResponse<Athlete[]>>(`/athletes?${params}`);

  return {
    data: response.data || [],
    pagination: response.pagination || { limit: 50, offset: 0, count: 0 },
  };
}

// Get all schools with pagination
export async function getSchools(options: {
  limit?: number;
  offset?: number;
  division?: string;
} = {}): Promise<{ data: School[]; pagination: any }> {
  const params = new URLSearchParams();

  if (options.limit) params.append('limit', options.limit.toString());
  if (options.offset) params.append('offset', options.offset.toString());
  if (options.division) params.append('division', options.division);

  const response = await apiFetch<ApiResponse<School[]>>(`/schools?${params}`);

  return {
    data: response.data || [],
    pagination: response.pagination || { limit: 50, offset: 0, count: 0 },
  };
}

// Search schools
export async function searchSchools(searchTerm: string, limit: number = 20): Promise<School[]> {
  if (!searchTerm || searchTerm.length < 2) {
    return [];
  }

  const response = await apiFetch<ApiResponse<School[]>>(`/schools/search?q=${encodeURIComponent(searchTerm)}&limit=${limit}`);
  return response.data || [];
}

// Get school details
export async function getSchoolDetails(schoolId: number): Promise<School> {
  return await apiFetch<School>(`/schools/${schoolId}`);
}

// Get available events
export async function getEvents(): Promise<string[]> {
  const response = await apiFetch<ApiResponse<string[]>>('/events');
  return response.data || [];
}
