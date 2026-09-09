import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Meet } from './useMeets';

export type MeetDetails = Meet;

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
        .from('v_meets_lifecycle')
        .select('*')
        .eq('meet_id', Number(meetId))
        .single();

      if (meetError) throw meetError;

      setMeet(meetData);
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
