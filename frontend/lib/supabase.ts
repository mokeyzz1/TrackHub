import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://hunbahsnaeeztmzqpnrl.supabase.co'
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bmJhaHNuYWVlenRtenFwbnJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2MTI5MjEsImV4cCI6MjA4MDE4ODkyMX0.dLjVdd5cnjwFMJkFP2a2xho4GWm1mgqvJK2JVDzqfnw'

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
})

// Database types (we'll generate these after schema setup)
export type Database = {
  public: {
    Tables: {
      schools: any
      athletes: any
      results: any
      meets: any
      teams: any
      conferences: any
      // Will be auto-generated later
    }
  }
}
