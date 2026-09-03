const { buildRepairActions, classifyMeet, reconcileMeet } = require('./domain');

class ReconciliationWorker {
  constructor({ database, source, delayMs = 1000 } = {}) {
    if (!database) throw new Error('database is required');
    if (!source) throw new Error('source is required');
    this.database = database;
    this.source = source;
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.lastSourceRequestAt = 0;
  }

  async auditMeet(meet) {
    const relationship = classifyMeet(meet);
    const localFacts = await this.database.getLocalFacts(meet.meet_id);

    if (relationship.kind === 'combined_child_candidate') {
      const result = reconcileMeet({
        meet,
        relationship,
        sourceSnapshot: { status: 'unknown', event_count: 0 },
        sourceFacts: [],
        localFacts,
      });
      return { result, actions: buildRepairActions(result) };
    }

    await this.waitForSource();
    const teamCatalog = await this.database.getTeamCatalog();
    const { snapshot, facts } = await this.source.load(meet, teamCatalog);
    this.lastSourceRequestAt = Date.now();
    const result = reconcileMeet({ meet, relationship, sourceSnapshot: snapshot, sourceFacts: facts, localFacts });
    return { result, actions: buildRepairActions(result) };
  }

  async runQueue({ scope, maxJobs = 0, meetId = null, retryFailed = false, includeStaged = false, recheckStaged = false } = {}) {
    let processed = 0;
    const counts = new Map();
    while (!maxJobs || processed < maxJobs) {
      const job = await this.database.claimJob({ scope, meetId, retryFailed, includeStaged, recheckStaged });
      if (!job) break;
      try {
        const meet = this.database.getMeetForJob
          ? await this.database.getMeetForJob(job)
          : await this.database.getMeet(job.meet_id);
        if (!meet) throw new Error(`meet ${job.meet_id} is missing`);
        const { result, actions } = await this.auditMeet(meet);
        await this.database.finishJob(job, result, actions);
        counts.set(result.status, (counts.get(result.status) || 0) + 1);
      } catch (error) {
        await this.database.failJob(job, error);
        counts.set('failed', (counts.get('failed') || 0) + 1);
      }
      processed++;
    }
    return { processed, statuses: Object.fromEntries([...counts.entries()].sort()) };
  }

  async waitForSource() {
    const waitMs = Math.max(0, this.lastSourceRequestAt + this.delayMs - Date.now());
    if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
  }
}

module.exports = { ReconciliationWorker };
