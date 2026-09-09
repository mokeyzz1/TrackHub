/**
 * Prevent accidental direct writes to canonical fact tables.
 *
 * The legacy paths remain available for a deliberate forensic operation, but production imports
 * must pass through the private ingest transaction. An explicit CLI flag is intentionally noisy so
 * an operator cannot enable it by accident through an inherited environment variable.
 */

function requireControlledCommit({ commit, controlPlane, legacyDirectWrite, importer }) {
  if (!commit || controlPlane || legacyDirectWrite) return;
  throw new Error(
    `${importer}: direct fact writes are disabled. Re-run with --control-plane; ` +
    'use --legacy-direct-write only for an explicitly approved forensic/manual operation.'
  );
}

module.exports = { requireControlledCommit };
