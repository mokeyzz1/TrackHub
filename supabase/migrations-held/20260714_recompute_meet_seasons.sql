-- Recompute meets.season from date using the canonical convention (2026-07-14).
-- Fixes the hardcoded 'indoor' bug (scrape_meets.js) that mislabeled 2026 meets.
-- Convention: Dec->next-year Indoor; Jan-Mar Indoor; Apr-Jul Outdoor; Aug Summer; Sep-Nov XC.
UPDATE meets SET season = CASE
  WHEN extract(month from date)=12          THEN 'Indoor '  || (extract(year from date)+1)::int
  WHEN extract(month from date) IN (1,2,3)  THEN 'Indoor '  || extract(year from date)::int
  WHEN extract(month from date) IN (4,5,6,7) THEN 'Outdoor ' || extract(year from date)::int
  WHEN extract(month from date)=8           THEN 'Summer '  || extract(year from date)::int
  ELSE 'XC ' || extract(year from date)::int
END;
