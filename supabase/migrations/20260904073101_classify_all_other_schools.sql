-- Replace the overloaded schools.division = 'Other' value for every reviewed collegiate
-- school in the 2026-09-04 inventory. This intentionally reuses public.divisions and
-- schools.division_id; it does not create a second classification table.
--
-- Evidence: docs/database-audit/OTHER_DIVISION_RESEARCH_20260904.md
-- Rollback: docs/database-audit/rollback_classify_all_other_schools.sql

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO public.divisions (code, display_name, governing_body, sort_order)
VALUES
  ('USPORTS', 'U SPORTS', 'U SPORTS', 7),
  ('USCAA', 'United States Collegiate Athletic Association', 'USCAA', 8),
  ('NCCAA-I', 'NCCAA Division I', 'NCCAA', 9),
  ('NCCAA-II', 'NCCAA Division II', 'NCCAA', 10),
  ('LAI', 'Liga Atletica Interuniversitaria de Puerto Rico', 'LAI', 11)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  operation constant text := '20260904_classify_all_other_schools_v1';
  expected_count constant integer := 128;
  archived_count integer;
  updated_count integer;
BEGIN
  CREATE TEMP TABLE _reviewed_school_classification (
    school_id bigint PRIMARY KEY,
    division_code text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _reviewed_school_classification (school_id, division_code)
  VALUES
    (1703, 'DIII'),
    (1705, 'DIII'),
    (1708, 'DIII'),
    (1710, 'DIII'),
    (1711, 'DIII'),
    (1713, 'DIII'),
    (1714, 'DIII'),
    (1716, 'DIII'),
    (1718, 'DIII'),
    (1719, 'DIII'),
    (1721, 'DIII'),
    (1722, 'DIII'),
    (1727, 'DIII'),
    (1729, 'DIII'),
    (1730, 'DIII'),
    (1731, 'DIII'),
    (1732, 'DIII'),
    (1733, 'DIII'),
    (1734, 'DIII'),
    (1736, 'DIII'),
    (1737, 'DIII'),
    (1738, 'DIII'),
    (1739, 'DIII'),
    (1742, 'DIII'),
    (1743, 'DIII'),
    (1745, 'DIII'),
    (1749, 'DIII'),
    (1750, 'DIII'),
    (1752, 'DIII'),
    (1755, 'DIII'),
    (1756, 'DIII'),
    (1758, 'DIII'),
    (1759, 'DIII'),
    (1760, 'DIII'),
    (1761, 'DIII'),
    (1767, 'DIII'),
    (1768, 'DIII'),
    (1770, 'DIII'),
    (1771, 'DIII'),
    (1774, 'DIII'),
    (1778, 'DIII'),
    (1779, 'DIII'),
    (1786, 'DIII'),
    (1788, 'DIII'),
    (1798, 'DIII'),
    (1802, 'DIII'),
    (1812, 'DIII'),
    (1815, 'DIII'),
    (1816, 'DIII'),
    (1704, 'NAIA'),
    (1706, 'NAIA'),
    (1709, 'NAIA'),
    (1712, 'NAIA'),
    (1717, 'NAIA'),
    (1720, 'NAIA'),
    (1723, 'NAIA'),
    (1724, 'NAIA'),
    (1735, 'NAIA'),
    (1740, 'NAIA'),
    (1741, 'NAIA'),
    (1746, 'NAIA'),
    (1747, 'NAIA'),
    (1751, 'NAIA'),
    (1764, 'NAIA'),
    (1765, 'NAIA'),
    (1766, 'NAIA'),
    (1776, 'NAIA'),
    (1783, 'NAIA'),
    (1789, 'NAIA'),
    (1790, 'NAIA'),
    (1791, 'NAIA'),
    (1792, 'NAIA'),
    (1794, 'NAIA'),
    (1795, 'NAIA'),
    (1796, 'NAIA'),
    (1797, 'NAIA'),
    (1799, 'NAIA'),
    (1800, 'NAIA'),
    (1803, 'NAIA'),
    (1804, 'NAIA'),
    (1808, 'NAIA'),
    (1809, 'NAIA'),
    (1810, 'NAIA'),
    (1813, 'NAIA'),
    (1821, 'NAIA'),
    (1823, 'NAIA'),
    (1757, 'DII'),
    (1715, 'USPORTS'),
    (1725, 'USPORTS'),
    (1748, 'USPORTS'),
    (1754, 'USPORTS'),
    (1762, 'USPORTS'),
    (1763, 'USPORTS'),
    (1769, 'USPORTS'),
    (1772, 'USPORTS'),
    (1785, 'USPORTS'),
    (1787, 'USPORTS'),
    (1793, 'USPORTS'),
    (1805, 'USPORTS'),
    (1811, 'USPORTS'),
    (1817, 'USPORTS'),
    (1820, 'USPORTS'),
    (1825, 'USPORTS'),
    (1826, 'USPORTS'),
    (1831, 'USPORTS'),
    (1773, 'USCAA'),
    (1801, 'USCAA'),
    (1806, 'USCAA'),
    (1814, 'USCAA'),
    (1824, 'USCAA'),
    (1827, 'USCAA'),
    (1828, 'USCAA'),
    (1832, 'USCAA'),
    (1833, 'USCAA'),
    (1834, 'USCAA'),
    (1781, 'NCCAA-I'),
    (1819, 'NCCAA-I'),
    (1784, 'NCCAA-II'),
    (1830, 'NCCAA-II'),
    (1871, 'LAI'),
    (1872, 'LAI'),
    (1873, 'LAI'),
    (1874, 'LAI'),
    (1875, 'LAI'),
    (1876, 'LAI'),
    (1877, 'LAI'),
    (1878, 'LAI'),
    (1879, 'LAI');

  IF (SELECT count(*) FROM _reviewed_school_classification) <> expected_count THEN
    RAISE EXCEPTION 'classification map must contain exactly % schools', expected_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _reviewed_school_classification m
    LEFT JOIN public.divisions d ON d.code = m.division_code
    WHERE d.division_id IS NULL
  ) THEN
    RAISE EXCEPTION 'classification map references a missing division';
  END IF;

  IF (
    SELECT count(*)
    FROM public.divisions
    WHERE (code, display_name, governing_body, sort_order) IN (
      ('USPORTS', 'U SPORTS', 'U SPORTS', 7),
      ('USCAA', 'United States Collegiate Athletic Association', 'USCAA', 8),
      ('NCCAA-I', 'NCCAA Division I', 'NCCAA', 9),
      ('NCCAA-II', 'NCCAA Division II', 'NCCAA', 10),
      ('LAI', 'Liga Atletica Interuniversitaria de Puerto Rico', 'LAI', 11)
    )
  ) <> 5 THEN
    RAISE EXCEPTION 'one or more governing-body division rows conflicts with the reviewed definition';
  END IF;

  IF (SELECT count(*) FROM public.schools WHERE division = 'Other') <> 129 THEN
    RAISE EXCEPTION 'expected the audited live inventory of 129 Other schools';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.schools
    WHERE school_id = 1829
      AND official_name = 'Dawgs Track Club'
      AND division = 'Other'
      AND division_id IS NULL
  ) THEN
    RAISE EXCEPTION 'verified club sentinel is missing or changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.schools s
    JOIN _reviewed_school_classification m USING (school_id)
    WHERE s.division = 'Other' AND s.division_id IS NULL
  ) <> expected_count THEN
    RAISE EXCEPTION 'reviewed school precondition failed; no rows were changed';
  END IF;

  INSERT INTO ingest.fact_cleanup_archive (operation_key, source_table, source_pk, row_data)
  SELECT operation, 'public.schools', s.school_id::text, to_jsonb(s)
  FROM public.schools s
  JOIN _reviewed_school_classification m USING (school_id)
  ON CONFLICT (operation_key, source_table, source_pk) DO NOTHING;

  SELECT count(*) INTO archived_count
  FROM ingest.fact_cleanup_archive
  WHERE operation_key = operation AND source_table = 'public.schools';

  IF archived_count <> expected_count THEN
    RAISE EXCEPTION 'expected % archived school before-images, found %', expected_count, archived_count;
  END IF;

  UPDATE public.schools s
  SET division = m.division_code,
      division_id = d.division_id,
      updated_at = now()
  FROM _reviewed_school_classification m
  JOIN public.divisions d ON d.code = m.division_code
  WHERE s.school_id = m.school_id
    AND s.division = 'Other'
    AND s.division_id IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> expected_count THEN
    RAISE EXCEPTION 'expected % classified schools, updated %', expected_count, updated_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _reviewed_school_classification m
    JOIN public.schools s USING (school_id)
    JOIN public.divisions d ON d.division_id = s.division_id
    WHERE s.division <> m.division_code OR d.code <> m.division_code
  ) THEN
    RAISE EXCEPTION 'classification postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.schools WHERE division = 'Other') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.schools
       WHERE school_id = 1829 AND division = 'Other' AND division_id IS NULL
     ) THEN
    RAISE EXCEPTION 'only the verified club should remain in Other';
  END IF;

  RAISE NOTICE 'classified % schools; Dawgs Track Club remains Other by design', expected_count;
END
$$;

COMMIT;
