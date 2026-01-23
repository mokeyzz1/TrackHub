// Supabase Database Service
// Re-exports all functions from the Supabase implementation
export * from './database-supabase';

// No longer needed - Supabase handles connection
export async function initDatabase() {
  return true;
}
