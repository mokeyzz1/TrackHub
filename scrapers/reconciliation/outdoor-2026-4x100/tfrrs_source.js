const {
  fetchEventResults,
  fetchMeetEvents,
  shouldScrapeEvent,
} = require('../../tfrrs/meet-scraper/sync-weekend-results');
const { EVENT_CODE, normalizeSourceFact } = require('./domain');

class Tfrrs4x100Source {
  async load(meet, teamCatalog) {
    const sourceUrl = meet.tfrrs_url;
    if (!sourceUrl) {
      return {
        snapshot: { status: 'unavailable', event_count: 0, reason: 'missing_tfrrs_url' },
        facts: [],
      };
    }

    const meetData = await fetchMeetEvents(sourceUrl);
    if (!meetData) {
      return {
        snapshot: { status: 'unavailable', event_count: 0, reason: 'tfrrs_meet_fetch_failed' },
        facts: [],
      };
    }

    const events = meetData.events.filter(event => shouldScrapeEvent(event, EVENT_CODE));
    if (!events.length) {
      return {
        snapshot: {
          status: 'not_contested',
          event_count: 0,
          source_meet_key: String(meetData.meetId || ''),
          source_meet_name: meetData.meetName || null,
          source_url: sourceUrl,
        },
        facts: [],
      };
    }

    const rows = [];
    for (const event of events) {
      const eventRows = await fetchEventResults(
        event.eventUrl,
        meetData.meetId,
        meetData.meetName,
        meet.date || meetData.meetDate,
        event.eventName,
        meet.meet_id,
        meet.name,
        event.gender
      );
      rows.push(...eventRows);
    }

    return {
      snapshot: {
        status: 'present',
        event_count: events.length,
        source_meet_key: String(meetData.meetId || ''),
        source_meet_name: meetData.meetName || null,
        source_url: sourceUrl,
        event_urls: events.map(event => event.eventUrl),
      },
      facts: rows.map((row, index) => normalizeSourceFact(row, index + 1, teamCatalog)),
    };
  }
}

module.exports = { Tfrrs4x100Source };
