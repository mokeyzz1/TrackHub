import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

// For server-side (scrapers, scripts)
export function createServerClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient<Database>(url, key);
}

// Type helpers - use these for type-safe queries
export type Tables = Database['public']['Tables'];
export type Athletes = Tables['athletes']['Row'];
export type Results = Tables['results']['Row'];
export type Meets = Tables['meets']['Row'];
export type Schools = Tables['schools']['Row'];
export type Teams = Tables['teams']['Row'];
export type AthletePRs = Tables['athlete_prs']['Row'];
export type RelayResults = Tables['relay_results']['Row'];
export type RelayAthletes = Tables['relay_athletes']['Row'];

// Insert types (for creating new records)
export type NewAthlete = Tables['athletes']['Insert'];
export type NewResult = Tables['results']['Insert'];
export type NewMeet = Tables['meets']['Insert'];

// Update types (for updating records)
export type UpdateAthlete = Tables['athletes']['Update'];
export type UpdateResult = Tables['results']['Update'];
