/**
 * Orchestrates one source adapter through the private ingest boundary.
 */

const { IngestionStore } = require('./ingestion_store');
const { CanonicalFactWriter } = require('./canonical_fact_writer');

function codeRevision(env = process.env) {
  return env.GITHUB_SHA || env.GIT_COMMIT || env.CODE_REVISION || null;
}

class ControlledIngestion {
  constructor({ store, writer, env = process.env } = {}) {
    this.store = store || new IngestionStore({ env });
    this.writer = writer || new CanonicalFactWriter({ pool: this.store.pool, env });
    this.ownsStore = !store;
  }

  async run({ source, mode, scope = {}, parserVersion, records, commit = false } = {}) {
    if (!Array.isArray(records)) throw new Error('records must be an array');
    const runId = await this.store.startRun({
      source,
      mode: commit ? 'commit' : 'dry_run',
      scope,
      parserVersion,
      codeRevision: codeRevision(this.store.env || process.env)
    });
    const metrics = {
      scraped: records.length,
      normalized: 0,
      invalid: 0,
      quarantined: 0,
      staged_source_records: 0,
      staged_observations: 0
    };

    try {
      metrics.normalized = records.length;
      metrics.invalid = records.filter(r => r.observation?.validation_errors?.length).length;
      // Dry runs do not invoke the canonical writer, so surface contract-level quarantines in
      // the run metrics instead of reporting zero while the observation rows are already marked
      // quarantine in the private control plane.
      metrics.quarantined = records.filter(r => r.observation?.decision === 'quarantine').length;
      const staged = await this.store.persistObservations(runId, records);
      metrics.staged_source_records = staged.sourceRecords;
      metrics.staged_observations = staged.observations;

      if (!commit) {
        await this.store.finishRun(runId, { status: 'succeeded', metrics });
        return { runId, ...metrics, committed: false };
      }

      const committed = await this.writer.commitRun(runId);
      Object.assign(metrics, committed);
      const status = committed.quarantined || committed.errors ? 'partial' : 'succeeded';
      await this.store.finishRun(runId, { status, metrics });
      return { runId, ...metrics, committed: true };
    } catch (error) {
      await this.store.finishRun(runId, {
        status: 'failed',
        metrics,
        errorMessage: error?.message || String(error)
      });
      throw error;
    } finally {
      if (this.ownsStore) await this.store.close();
    }
  }
}

module.exports = { ControlledIngestion, codeRevision };
