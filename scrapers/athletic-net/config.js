/**
 * Athletic.net Scraper Configuration
 */

module.exports = {
  // API endpoint
  SEARCH_API: 'https://www.athletic.net/api/v1/AutoComplete/search',

  // Rate limiting (be nice)
  DELAY_BETWEEN_REQUESTS: 100,   // 100ms between API calls
  DELAY_ON_ERROR: 5000,          // 5s on error
  DELAY_ON_RATE_LIMIT: 60000,    // 1 min if rate limited

  // Batch processing
  SAVE_EVERY: 500,               // Save checkpoint every N athletes

  // Retry
  MAX_RETRIES: 3,

  // Files
  OUTPUT_DIR: './output',
  LOGS_DIR: './logs',
  CHECKPOINT_FILE: './output/mapping-checkpoint.json',
  MAPPING_FILE: './output/athlete-mapping.json',
  NO_MATCH_FILE: './output/no-match.json',
  ERRORS_FILE: './output/mapping-errors.json',
};
