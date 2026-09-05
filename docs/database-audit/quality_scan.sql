-- Read-only live database quality scan. Run with psql against the project database.
-- It creates only temporary tables in the current session.

SET statement_timeout = '15min';

CREATE TEMP TABLE column_profile(
  schema_name text,
  table_name text,
  column_name text,
  total bigint,
  nulls bigint,
  empty_strings bigint,
  distinct_values bigint
);

DO $$
DECLARE
  r record;
  sql text;
  metrics text;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name,
           string_agg(
             format('jsonb_build_object(%L, jsonb_build_object(''nulls'', %s, ''empty_strings'', %s))',
                    c.column_name,
                    format('count(*) FILTER (WHERE %I IS NULL)', c.column_name),
                    format('count(*) FILTER (WHERE %I IS NOT NULL AND %I::text = '''')', c.column_name, c.column_name)),
             ' || ' ORDER BY c.ordinal_position
           ) AS metrics
      FROM information_schema.columns c
      JOIN pg_class pc ON pc.relname = c.table_name
      JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = c.table_schema
     WHERE c.table_schema IN ('public', 'ingest')
       AND pc.relkind = 'r'
     GROUP BY c.table_schema, c.table_name
     ORDER BY c.table_schema, c.table_name
  LOOP
    sql := format($q$
      WITH stats AS (
        -- Separate small objects avoid PostgreSQL's 100-argument function limit.
        SELECT count(*)::bigint AS total, (%s) AS metrics
          FROM %I.%I
      )
      INSERT INTO column_profile
      SELECT %L, %L, metric.key,
             stats.total,
             (metric.value->>'nulls')::bigint,
             (metric.value->>'empty_strings')::bigint,
             NULL::bigint
        FROM stats CROSS JOIN LATERAL jsonb_each(stats.metrics) metric$q$,
      r.metrics, r.table_schema, r.table_name, r.table_schema, r.table_name);
    EXECUTE sql;
  END LOOP;
END $$;

-- Exact null/empty-string counts for public/ingest ordinary-table columns only.
-- Distinct values are deliberately not calculated; NULL means unmeasured, not zero.
SELECT * FROM column_profile ORDER BY schema_name, table_name, column_name;

-- High-signal missingness candidates, not evidence that sparse columns should be removed.
SELECT *, round(nulls * 100.0 / NULLIF(total, 0), 2) AS null_rate_pct
  FROM column_profile
 WHERE total > 0
   AND (nulls > 0 OR empty_strings > 0)
 ORDER BY null_rate_pct DESC, schema_name, table_name, column_name;
