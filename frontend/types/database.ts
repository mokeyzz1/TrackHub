export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      athlete_prs: {
        Row: {
          athlete_id: number
          created_at: string | null
          event_name: string
          id: number
          mark_meters: number | null
          mark_raw: string
          mark_seconds: number | null
          meet_name: string | null
          season: string | null
          set_at: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_id: number
          created_at?: string | null
          event_name: string
          id?: number
          mark_meters?: number | null
          mark_raw: string
          mark_seconds?: number | null
          meet_name?: string | null
          season?: string | null
          set_at?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: number
          created_at?: string | null
          event_name?: string
          id?: number
          mark_meters?: number | null
          mark_raw?: string
          mark_seconds?: number | null
          meet_name?: string | null
          season?: string | null
          set_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_prs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
        ]
      }
      athlete_team_seasons: {
        Row: {
          athlete_id: number
          ats_id: number
          created_at: string | null
          is_redshirt: boolean | null
          jersey_number: string | null
          season_code: string
          status: string | null
          team_id: number
          year_in_school: string | null
        }
        Insert: {
          athlete_id: number
          ats_id?: number
          created_at?: string | null
          is_redshirt?: boolean | null
          jersey_number?: string | null
          season_code: string
          status?: string | null
          team_id: number
          year_in_school?: string | null
        }
        Update: {
          athlete_id?: number
          ats_id?: number
          created_at?: string | null
          is_redshirt?: boolean | null
          jersey_number?: string | null
          season_code?: string
          status?: string | null
          team_id?: number
          year_in_school?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athlete_team_seasons_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "athlete_team_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "athlete_team_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      athletes: {
        Row: {
          athlete_id: number
          athletic_net_url: string | null
          bio: string | null
          class_year: string | null
          created_at: string | null
          first_name: string | null
          full_name: string
          gender: string | null
          grad_year: number | null
          high_school: string | null
          hometown: string | null
          is_active: boolean | null
          last_name: string | null
          primary_events: string | null
          profile_image_url: string | null
          school_id: number
          tfrrs_athlete_id: string | null
          tfrrs_profile_url: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_id?: number
          athletic_net_url?: string | null
          bio?: string | null
          class_year?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name: string
          gender?: string | null
          grad_year?: number | null
          high_school?: string | null
          hometown?: string | null
          is_active?: boolean | null
          last_name?: string | null
          primary_events?: string | null
          profile_image_url?: string | null
          school_id: number
          tfrrs_athlete_id?: string | null
          tfrrs_profile_url?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: number
          athletic_net_url?: string | null
          bio?: string | null
          class_year?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string
          gender?: string | null
          grad_year?: number | null
          high_school?: string | null
          hometown?: string | null
          is_active?: boolean | null
          last_name?: string | null
          primary_events?: string | null
          profile_image_url?: string | null
          school_id?: number
          tfrrs_athlete_id?: string | null
          tfrrs_profile_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "athletes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools_full"
            referencedColumns: ["school_id"]
          },
        ]
      }
      conference_memberships: {
        Row: {
          conference_id: number
          created_at: string | null
          end_year: number | null
          membership_id: number
          school_id: number
          start_year: number | null
        }
        Insert: {
          conference_id: number
          created_at?: string | null
          end_year?: number | null
          membership_id?: number
          school_id: number
          start_year?: number | null
        }
        Update: {
          conference_id?: number
          created_at?: string | null
          end_year?: number | null
          membership_id?: number
          school_id?: number
          start_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conference_memberships_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["conference_id"]
          },
          {
            foreignKeyName: "conference_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "conference_memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools_full"
            referencedColumns: ["school_id"]
          },
        ]
      }
      conferences: {
        Row: {
          abbreviation: string | null
          conference_id: number
          created_at: string | null
          division: string | null
          name: string
          region: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          abbreviation?: string | null
          conference_id?: number
          created_at?: string | null
          division?: string | null
          name: string
          region?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          abbreviation?: string | null
          conference_id?: number
          created_at?: string | null
          division?: string | null
          name?: string
          region?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      event_entries: {
        Row: {
          athlete_name: string
          created_at: string | null
          entry_id: number
          event_id: number | null
          heat_number: number | null
          lane_number: number | null
          seed_mark: string | null
          seed_time: string | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_name: string
          created_at?: string | null
          entry_id?: number
          event_id?: number | null
          heat_number?: number | null
          lane_number?: number | null
          seed_mark?: string | null
          seed_time?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_name?: string
          created_at?: string | null
          entry_id?: number
          event_id?: number | null
          heat_number?: number | null
          lane_number?: number | null
          seed_mark?: string | null
          seed_time?: string | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_entries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      events: {
        Row: {
          actual_start_time: string | null
          created_at: string
          event_id: number
          event_name: string
          event_type: string | null
          gender: string | null
          meet_id: number
          scheduled_time: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          actual_start_time?: string | null
          created_at?: string
          event_id?: number
          event_name: string
          event_type?: string | null
          gender?: string | null
          meet_id: number
          scheduled_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          actual_start_time?: string | null
          created_at?: string
          event_id?: number
          event_name?: string
          event_type?: string | null
          gender?: string | null
          meet_id?: number
          scheduled_time?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_meet_id_fkey"
            columns: ["meet_id"]
            isOneToOne: false
            referencedRelation: "meets"
            referencedColumns: ["meet_id"]
          },
        ]
      }
      external_ids: {
        Row: {
          athlete_id: number | null
          conference_id: number | null
          created_at: string | null
          external_id: number
          external_key: string | null
          external_name: string | null
          external_url: string | null
          school_id: number | null
          source: string
          team_id: number | null
          updated_at: string | null
          verified: boolean | null
        }
        Insert: {
          athlete_id?: number | null
          conference_id?: number | null
          created_at?: string | null
          external_id?: number
          external_key?: string | null
          external_name?: string | null
          external_url?: string | null
          school_id?: number | null
          source: string
          team_id?: number | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Update: {
          athlete_id?: number | null
          conference_id?: number | null
          created_at?: string | null
          external_id?: number
          external_key?: string | null
          external_name?: string | null
          external_url?: string | null
          school_id?: number | null
          source?: string
          team_id?: number | null
          updated_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "external_ids_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "external_ids_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["conference_id"]
          },
          {
            foreignKeyName: "external_ids_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "external_ids_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools_full"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "external_ids_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "external_ids_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      live_results: {
        Row: {
          athlete_id: number | null
          created_at: string | null
          date: string | null
          entry_id: number | null
          event_name: string
          is_final: boolean | null
          is_processed: boolean | null
          live_result_id: number
          mark_raw: string
          mark_seconds: number | null
          meet_id: number | null
          meet_name: string | null
          meet_url: string
          participant_name: string
          place: number | null
          result_type: string | null
          round: string | null
          scraped_at: string
          splits: string[] | null
          team_id: number | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_id?: number | null
          created_at?: string | null
          date?: string | null
          entry_id?: number | null
          event_name: string
          is_final?: boolean | null
          is_processed?: boolean | null
          live_result_id?: number
          mark_raw: string
          mark_seconds?: number | null
          meet_id?: number | null
          meet_name?: string | null
          meet_url: string
          participant_name: string
          place?: number | null
          result_type?: string | null
          round?: string | null
          scraped_at: string
          splits?: string[] | null
          team_id?: number | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: number | null
          created_at?: string | null
          date?: string | null
          entry_id?: number | null
          event_name?: string
          is_final?: boolean | null
          is_processed?: boolean | null
          live_result_id?: number
          mark_raw?: string
          mark_seconds?: number | null
          meet_id?: number | null
          meet_name?: string | null
          meet_url?: string
          participant_name?: string
          place?: number | null
          result_type?: string | null
          round?: string | null
          scraped_at?: string
          splits?: string[] | null
          team_id?: number | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "live_results_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "meet_entries"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "live_results_meet_id_fkey"
            columns: ["meet_id"]
            isOneToOne: false
            referencedRelation: "meets"
            referencedColumns: ["meet_id"]
          },
          {
            foreignKeyName: "live_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "live_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      meet_entries: {
        Row: {
          athlete_id: number | null
          athlete_name: string
          created_at: string | null
          entry_id: number
          event_name: string
          heat: number | null
          lane: number | null
          match_confidence: number | null
          meet_id: number | null
          scraped_at: string
          seed_mark: string | null
          seed_time: string | null
          team_id: number | null
          team_name: string | null
          updated_at: string | null
        }
        Insert: {
          athlete_id?: number | null
          athlete_name: string
          created_at?: string | null
          entry_id?: number
          event_name: string
          heat?: number | null
          lane?: number | null
          match_confidence?: number | null
          meet_id?: number | null
          scraped_at?: string
          seed_mark?: string | null
          seed_time?: string | null
          team_id?: number | null
          team_name?: string | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: number | null
          athlete_name?: string
          created_at?: string | null
          entry_id?: number
          event_name?: string
          heat?: number | null
          lane?: number | null
          match_confidence?: number | null
          meet_id?: number | null
          scraped_at?: string
          seed_mark?: string | null
          seed_time?: string | null
          team_id?: number | null
          team_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meet_entries_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "meet_entries_meet_id_fkey"
            columns: ["meet_id"]
            isOneToOne: false
            referencedRelation: "meets"
            referencedColumns: ["meet_id"]
          },
          {
            foreignKeyName: "meet_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "meet_entries_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      meets: {
        Row: {
          created_at: string
          date: string
          level: string | null
          location: string | null
          meet_id: number
          meet_url: string | null
          name: string
          season: string | null
          source_url: string | null
          status: string | null
          tfrrs_meet_id: string | null
          timing_platform: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          level?: string | null
          location?: string | null
          meet_id?: number
          meet_url?: string | null
          name: string
          season?: string | null
          source_url?: string | null
          status?: string | null
          tfrrs_meet_id?: string | null
          timing_platform?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          level?: string | null
          location?: string | null
          meet_id?: number
          meet_url?: string | null
          name?: string
          season?: string | null
          source_url?: string | null
          status?: string | null
          tfrrs_meet_id?: string | null
          timing_platform?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          created_at: string | null
          region_id: number
          region_name: string
        }
        Insert: {
          created_at?: string | null
          region_id?: number
          region_name: string
        }
        Update: {
          created_at?: string | null
          region_id?: number
          region_name?: string
        }
        Relationships: []
      }
      relay_athletes: {
        Row: {
          athlete_id: number | null
          athlete_name: string | null
          created_at: string | null
          leg_order: number | null
          relay_athlete_id: number
          relay_result_id: number | null
          tfrrs_athlete_id: string | null
        }
        Insert: {
          athlete_id?: number | null
          athlete_name?: string | null
          created_at?: string | null
          leg_order?: number | null
          relay_athlete_id?: number
          relay_result_id?: number | null
          tfrrs_athlete_id?: string | null
        }
        Update: {
          athlete_id?: number | null
          athlete_name?: string | null
          created_at?: string | null
          leg_order?: number | null
          relay_athlete_id?: number
          relay_result_id?: number | null
          tfrrs_athlete_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relay_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "relay_athletes_relay_result_id_fkey"
            columns: ["relay_result_id"]
            isOneToOne: false
            referencedRelation: "relay_results"
            referencedColumns: ["relay_result_id"]
          },
        ]
      }
      relay_results: {
        Row: {
          created_at: string | null
          date: string | null
          event_id: number | null
          event_name: string
          event_type_id: number | null
          mark_raw: string | null
          mark_seconds: number | null
          meet_id: number | null
          meet_name: string | null
          place: number | null
          relay_result_id: number
          round: string | null
          team_id: number | null
        }
        Insert: {
          created_at?: string | null
          date?: string | null
          event_id?: number | null
          event_name: string
          event_type_id?: number | null
          mark_raw?: string | null
          mark_seconds?: number | null
          meet_id?: number | null
          meet_name?: string | null
          place?: number | null
          relay_result_id?: number
          round?: string | null
          team_id?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string | null
          event_id?: number | null
          event_name?: string
          event_type_id?: number | null
          mark_raw?: string | null
          mark_seconds?: number | null
          meet_id?: number | null
          meet_name?: string | null
          place?: number | null
          relay_result_id?: number
          round?: string | null
          team_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "relay_results_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["event_type_id"]
          },
          {
            foreignKeyName: "relay_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "relay_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      event_types: {
        Row: {
          category: string | null
          code: string
          environment_scope: string | null
          event_type_id: number
          measure: string | null
        }
        Insert: {
          category?: string | null
          code: string
          environment_scope?: string | null
          event_type_id?: number
          measure?: string | null
        }
        Update: {
          category?: string | null
          code?: string
          environment_scope?: string | null
          event_type_id?: number
          measure?: string | null
        }
        Relationships: []
      }
      results: {
        Row: {
          athlete_id: number
          created_at: string | null
          date: string | null
          event_id: number | null
          event_name: string
          event_type_id: number | null
          is_pr: boolean | null
          is_season_best: boolean | null
          mark_feet: string | null
          mark_meters: number | null
          mark_raw: string
          mark_seconds: number | null
          meet_id: number | null
          meet_location: string | null
          meet_name: string | null
          place: number | null
          result_id: number
          round: string | null
          season_code: string | null
          team_id: number | null
          total_competitors: number | null
          wind: string | null
        }
        Insert: {
          athlete_id: number
          created_at?: string | null
          date?: string | null
          event_id?: number | null
          event_name: string
          event_type_id?: number | null
          is_pr?: boolean | null
          is_season_best?: boolean | null
          mark_feet?: string | null
          mark_meters?: number | null
          mark_raw: string
          mark_seconds?: number | null
          meet_id?: number | null
          meet_location?: string | null
          meet_name?: string | null
          place?: number | null
          result_id?: number
          round?: string | null
          season_code?: string | null
          team_id?: number | null
          total_competitors?: number | null
          wind?: string | null
        }
        Update: {
          athlete_id?: number
          created_at?: string | null
          date?: string | null
          event_id?: number | null
          event_name?: string
          event_type_id?: number | null
          is_pr?: boolean | null
          is_season_best?: boolean | null
          mark_feet?: string | null
          mark_meters?: number | null
          mark_raw?: string
          mark_seconds?: number | null
          meet_id?: number | null
          meet_location?: string | null
          meet_name?: string | null
          place?: number | null
          result_id?: number
          round?: string | null
          season_code?: string | null
          team_id?: number | null
          total_competitors?: number | null
          wind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "results_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["event_type_id"]
          },
          {
            foreignKeyName: "results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
      schools: {
        Row: {
          city: string | null
          created_at: string | null
          current_conference_id: number | null
          division: string | null
          is_active: boolean | null
          logo_file_path: string | null
          logo_source: string | null
          logo_url: string | null
          ncaa_region: string | null
          official_name: string
          region_id: number | null
          school_id: number
          short_name: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          current_conference_id?: number | null
          division?: string | null
          is_active?: boolean | null
          logo_file_path?: string | null
          logo_source?: string | null
          logo_url?: string | null
          ncaa_region?: string | null
          official_name: string
          region_id?: number | null
          school_id?: number
          short_name?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          current_conference_id?: number | null
          division?: string | null
          is_active?: boolean | null
          logo_file_path?: string | null
          logo_source?: string | null
          logo_url?: string | null
          ncaa_region?: string | null
          official_name?: string
          region_id?: number | null
          school_id?: number
          short_name?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_current_conference_id_fkey"
            columns: ["current_conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["conference_id"]
          },
          {
            foreignKeyName: "schools_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["region_id"]
          },
        ]
      }
      teams: {
        Row: {
          athletic_net_url: string | null
          coach_name: string | null
          created_at: string | null
          gender: string
          is_active: boolean | null
          school_id: number
          team_id: number
          tfrrs_team_url: string | null
          updated_at: string | null
        }
        Insert: {
          athletic_net_url?: string | null
          coach_name?: string | null
          created_at?: string | null
          gender: string
          is_active?: boolean | null
          school_id: number
          team_id?: number
          tfrrs_team_url?: string | null
          updated_at?: string | null
        }
        Update: {
          athletic_net_url?: string | null
          coach_name?: string | null
          created_at?: string | null
          gender?: string
          is_active?: boolean | null
          school_id?: number
          team_id?: number
          tfrrs_team_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "teams_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools_full"
            referencedColumns: ["school_id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string | null
          email: string
          feature: string | null
          id: number
        }
        Insert: {
          created_at?: string | null
          email: string
          feature?: string | null
          id?: number
        }
        Update: {
          created_at?: string | null
          email?: string
          feature?: string | null
          id?: number
        }
        Relationships: []
      }
    }
    Views: {
      schools_full: {
        Row: {
          city: string | null
          conference_abbrev: string | null
          conference_name: string | null
          division: string | null
          is_active: boolean | null
          logo_url: string | null
          official_name: string | null
          region_name: string | null
          school_id: number | null
          short_name: string | null
          state: string | null
        }
        Relationships: []
      }
      teams_summary: {
        Row: {
          athlete_count: number | null
          conference_name: string | null
          division: string | null
          gender: string | null
          region_name: string | null
          school_name: string | null
          team_id: number | null
        }
        Relationships: []
      }
      unprocessed_live_results: {
        Row: {
          athlete_id: number | null
          created_at: string | null
          date: string | null
          event_name: string | null
          is_processed: boolean | null
          live_result_id: number | null
          mark_raw: string | null
          mark_seconds: number | null
          meet_name: string | null
          meet_url: string | null
          participant_name: string | null
          place: number | null
          round: string | null
          scraped_at: string | null
          splits: string[] | null
          team_id: number | null
          updated_at: string | null
        }
        Insert: {
          athlete_id?: number | null
          created_at?: string | null
          date?: string | null
          event_name?: string | null
          is_processed?: boolean | null
          live_result_id?: number | null
          mark_raw?: string | null
          mark_seconds?: number | null
          meet_name?: string | null
          meet_url?: string | null
          participant_name?: string | null
          place?: number | null
          round?: string | null
          scraped_at?: string | null
          splits?: string[] | null
          team_id?: number | null
          updated_at?: string | null
        }
        Update: {
          athlete_id?: number | null
          created_at?: string | null
          date?: string | null
          event_name?: string | null
          is_processed?: boolean | null
          live_result_id?: number | null
          mark_raw?: string | null
          mark_seconds?: number | null
          meet_name?: string | null
          meet_url?: string | null
          participant_name?: string | null
          place?: number | null
          round?: string | null
          scraped_at?: string | null
          splits?: string[] | null
          team_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_results_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["athlete_id"]
          },
          {
            foreignKeyName: "live_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "live_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams_summary"
            referencedColumns: ["team_id"]
          },
        ]
      }
    }
    Functions: {
      detect_timing_platform: { Args: { url: string }; Returns: string }
      get_weekly_performances: {
        Args: {
          p_division?: string
          p_end_date: string
          p_limit?: number
          p_start_date: string
        }
        Returns: {
          athlete_id: number
          date: string
          division: string
          event_name: string
          full_name: string
          gender: string
          mark_meters: number
          mark_raw: string
          mark_seconds: number
          meet_id: number
          meet_name: string
          place: number
          school_name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
