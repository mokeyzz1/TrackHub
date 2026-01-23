import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!')
  console.error('EXPO_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING')
  console.error('EXPO_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'MISSING')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Enable auth for user features later
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
