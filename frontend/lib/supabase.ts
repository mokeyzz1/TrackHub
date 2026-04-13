import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})

// Re-export the Database type for use elsewhere
export type { Database }

// Type helpers for common tables
export type Tables = Database['public']['Tables']
export type Athletes = Tables['athletes']['Row']
export type Results = Tables['results']['Row']
export type Meets = Tables['meets']['Row']
export type Schools = Tables['schools']['Row']
export type Teams = Tables['teams']['Row']
export type AthletePRs = Tables['athlete_prs']['Row']
