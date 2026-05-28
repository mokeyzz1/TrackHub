CREATE OR REPLACE FUNCTION detect_timing_platform(url TEXT)
RETURNS TEXT AS $$
BEGIN
    IF url IS NULL THEN
        RETURN NULL;
    ELSIF url LIKE '%athletic.net%' OR url LIKE '%jdlfasttrack%' OR url LIKE '%blacksquirrel%' THEN
        RETURN 'athletic_net';
    ELSIF url LIKE '%milesplit%' THEN
        RETURN 'milesplit';
    ELSIF url LIKE '%pttiming%' THEN
        RETURN 'pt_timing';
    ELSIF url LIKE '%finishtiming%' OR url LIKE '%finishlynx%' THEN
        RETURN 'finish_timing';
    ELSIF url LIKE '%tfrrs%' THEN
        RETURN 'tfrrs';
    ELSIF url LIKE '%flashresults%' THEN
        RETURN 'flashresults';
    ELSIF url LIKE '%rosterathletics%' THEN
        RETURN 'rosterathletics';
    ELSIF url LIKE '%xpresstiming%' THEN
        RETURN 'xpresstiming';
    ELSIF url LIKE '%halfmiletiming%' THEN
        RETURN 'halfmiletiming';
    ELSIF url LIKE '%windsortiming%' THEN
        RETURN 'windsortiming';
    ELSIF url LIKE '%leonetiming%' THEN
        RETURN 'leonetiming';
    ELSIF url LIKE '%wayzatatiming%' THEN
        RETURN 'wayzatatiming';
    ELSIF url LIKE '%deltatiming%' THEN
        RETURN 'deltatiming';
    ELSIF url LIKE '%lexicontiming%' THEN
        RETURN 'lexicontiming';
    ELSIF url LIKE '%herostiming%' THEN
        RETURN 'herostiming';
    ELSIF url LIKE '%omegatiming%' THEN
        RETURN 'omegatiming';
    ELSIF url LIKE '%domtel-sport%' THEN
        RETURN 'domtel';
    ELSIF url LIKE '%liveres.%' THEN
        RETURN 'live_results';
    ELSIF url LIKE '%timing%' THEN
        RETURN 'other_timing';
    ELSE
        RETURN 'other';
    END IF;
END;
$$ LANGUAGE plpgsql;

UPDATE meets
SET timing_platform = detect_timing_platform(meet_url)
WHERE meet_url IS NOT NULL
  AND (
    timing_platform IS NULL
    OR timing_platform = 'other'
    OR timing_platform = 'other_timing'
  );
