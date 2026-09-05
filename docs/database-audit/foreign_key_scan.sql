-- Aggregate-only reference checks; never repairs or deletes a row.
-- Temporary output is per constraint. Missing nullable references are not orphans.
CREATE TEMP TABLE foreign_key_profile (
  schema_name text, table_name text, constraint_name text, parent_schema text,
  parent_table text, validated boolean, match_type text,
  orphan_rows bigint, partial_null_rows bigint, error_code text
);

DO $$
DECLARE
  fk record;
  orphan_count bigint;
  partial_count bigint;
BEGIN
  FOR fk IN
    SELECT ns.nspname AS child_schema, child.relname AS child_table,
           pn.nspname AS parent_schema, parent.relname AS parent_table,
           con.conname, con.convalidated, con.confmatchtype,
           bool_and(op.oprname = '=' AND opns.nspname = 'pg_catalog') AS standard_equality,
           string_agg(format('c.%I IS NOT NULL', ca.attname), ' AND ' ORDER BY keys.ordinality) AS all_present,
           string_agg(format('c.%I IS NULL', ca.attname), ' OR ' ORDER BY keys.ordinality) AS any_null,
           string_agg(format('c.%I IS NOT NULL', ca.attname), ' OR ' ORDER BY keys.ordinality) AS any_present,
           string_agg(format('p.%I = c.%I', pa.attname, ca.attname), ' AND ' ORDER BY keys.ordinality) AS matches
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace pn ON pn.oid = parent.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey, con.conpfeqop) WITH ORDINALITY AS keys(child_key, parent_key, eq_op, ordinality)
    JOIN pg_attribute ca ON ca.attrelid = child.oid AND ca.attnum = keys.child_key
    JOIN pg_attribute pa ON pa.attrelid = parent.oid AND pa.attnum = keys.parent_key
    JOIN pg_operator op ON op.oid = keys.eq_op
    JOIN pg_namespace opns ON opns.oid = op.oprnamespace
    WHERE con.contype = 'f' AND ns.nspname !~ '^pg_' AND ns.nspname <> 'information_schema'
    GROUP BY ns.nspname, child.relname, pn.nspname, parent.relname, con.oid
    ORDER BY ns.nspname, child.relname, con.conname
  LOOP
    IF NOT fk.standard_equality OR fk.confmatchtype NOT IN ('s','f') THEN
      INSERT INTO foreign_key_profile VALUES (fk.child_schema, fk.child_table, fk.conname,
        fk.parent_schema, fk.parent_table, fk.convalidated, fk.confmatchtype, NULL, NULL, 'unsupported_match_operator');
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I.%I c WHERE (%s) AND NOT EXISTS (SELECT 1 FROM %I.%I p WHERE %s)',
        fk.child_schema, fk.child_table, fk.all_present, fk.parent_schema, fk.parent_table, fk.matches) INTO orphan_count;
      partial_count := 0;
      IF fk.confmatchtype = 'f' THEN
        EXECUTE format('SELECT count(*) FROM %I.%I c WHERE (%s) AND (%s)',
          fk.child_schema, fk.child_table, fk.any_null, fk.any_present) INTO partial_count;
      END IF;
      INSERT INTO foreign_key_profile VALUES (fk.child_schema, fk.child_table, fk.conname,
        fk.parent_schema, fk.parent_table, fk.convalidated, fk.confmatchtype, orphan_count, partial_count, NULL);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO foreign_key_profile VALUES (fk.child_schema, fk.child_table, fk.conname,
        fk.parent_schema, fk.parent_table, fk.convalidated, fk.confmatchtype, NULL, NULL, SQLSTATE);
    END;
  END LOOP;
END
$$;

SELECT * FROM foreign_key_profile ORDER BY schema_name, table_name, constraint_name;
