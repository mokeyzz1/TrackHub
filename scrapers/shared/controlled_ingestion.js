/**
 * Orchestrates one source adapter through the private ingest boundary.
 */

const { IngestionStore } = require('./ingestion_store');
const { CanonicalFactWriter } = require('./canonical_fact_writer');

function codeRevision(env = process.env) {
  return env.GITHUB_SHA || env.GIT_COMMIT || env.CODE_REVISION || null;
}

class ControlledIngestion {
  constructor({ store, writer, pool = null, env = process.env } = {}) {
    // A long-lived batch worker may provide its already-open pool. IngestionStore will not own
    // that pool, so closing a run remains safe without creating one pool per meet.
    this.store = store || new IngestionStore({ pool, env });
    this.writer = writer || new CanonicalFactWriter({ pool: this.store.pool, env });
    this.ownsStore = !store;
  }

  async run({ source, mode, scope = {}, parserVersion, records, commit = false } = {}) {
    if (!Array.isArray(records)) throw new Error('records must be an array');
    let runId;
    let workCompleted = false;
    let failure;
    const metrics = {
      scraped: records.length,
      normalized: 0,
      invalid: 0,
      quarantined: 0,
      staged_source_records: 0,
      staged_observations: 0
    };

    try {
      runId = await this.store.startRun({
        source,
        mode: commit ? 'commit' : 'dry_run',
        scope,
        parserVersion,
        codeRevision: codeRevision(this.store.env || process.env)
      });
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
        workCompleted = true;
        await this.store.finishRun(runId, { status: 'succeeded', metrics });
        return { runId, ...metrics, committed: false };
      }

      const committed = await this.writer.commitRun(runId);
      workCompleted = true;
      Object.assign(metrics, committed);
      const status = committed.quarantined || committed.errors ? 'partial' : 'succeeded';
      await this.store.finishRun(runId, { status, metrics });
      return { runId, ...metrics, committed: true };
    } catch (error) {
      failure = error;
      // A reporting failure cannot undo completed staging or a committed transaction.
      // Leave its status unresolved instead of falsely recording a work failure.
      if (runId && !workCompleted) {
        try {
          await this.store.finishRun(runId, {
            status: 'failed', metrics, errorMessage: error?.message || String(error)
          });
        } catch (reportError) {
          failure = new AggregateError([error, reportError], 'Ingestion failed and failure reporting also failed', { cause: error });
        }
      } else if (workCompleted) {
        failure = new Error('Ingestion work completed but run status could not be recorded', { cause: error });
        failure.runId = runId;
        failure.committed = commit;
        failure.metrics = metrics;
      }
      throw failure;
    } finally {
      if (this.ownsStore) {
        try { await this.store.close(); }
        catch (closeError) {
          if (failure) throw new AggregateError([failure, closeError], 'Ingestion and cleanup both reported errors', { cause: failure });
          throw closeError;
        }
      }
    }
  }
}

module.exports = { ControlledIngestion, codeRevision };
