import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hunbahsnaeeztmzqpnrl.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bmJhaHNuYWVlenRtenFwbnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTI5MjEsImV4cCI6MjA4MDE4ODkyMX0.dLjVdd5cnjwFMJkFP2a2xho4GWm1mgqvJK2JVDzqfnw'

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
