import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Meet } from './useMeets';

export interface Event {
  event_id: number;
  meet_id: number;
  event_name: string;
  event_type: 'track' | 'field' | 'combined' | null;
  gender: 'M' | 'F' | 'Mixed' | null;
  status: 'scheduled' | 'in_progress' | 'completed';
  scheduled_time: string | null;
  actual_start_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetDetails extends Meet {
  events: Event[];
}

export function useMeetDetails(meetId: string | number) {
  const [meet, setMeet] = useState<MeetDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchMeetDetails();
  }, [meetId]);

  async function fetchMeetDetails() {
    try {
      setLoading(true);
      setError(null);

      // Fetch meet details
      const { data: meetData, error: meetError } = await supabase
        .from('meets')
        .select('*')
        .eq('meet_id', meetId)
        .single();

      if (meetError) throw meetError;

      // Fetch events for this meet
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .eq('meet_id', meetId)
        .order('scheduled_time', { ascending: true });

      if (eventsError) throw eventsError;

      setMeet({
        ...meetData,
        events: eventsData || []
      });
    } catch (err) {
      console.error('Error fetching meet details:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }

  function refresh() {
    fetchMeetDetails();
  }

  return {
    meet,
    loading,
    error,
    refresh
  };
}
