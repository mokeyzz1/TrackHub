/**
 * Scraper Configuration
 */

module.exports = {
  // Rate limiting
  DELAY_BETWEEN_REQUESTS: 1500,  // ms between requests (be nice to TFRRS)
  DELAY_ON_ERROR: 5000,          // ms to wait after an error
  DELAY_ON_RATE_LIMIT: 30000,    // ms to wait if rate limited

  // Timeouts
  REQUEST_TIMEOUT: 60000,        // 60 seconds per request

  // Retries
  MAX_RETRIES: 3,
  RETRY_BACKOFF_MULTIPLIER: 2,   // exponential backoff

  // Batch processing
  BATCH_SIZE: 100,               // save checkpoint every N athletes
  SAVE_RESULTS_EVERY: 50,        // append results to file every N athletes

  // Files
  OUTPUT_DIR: './output',
  LOGS_DIR: './logs',

  // Resume
  CHECKPOINT_FILE: './output/scraper-checkpoint.json',
  RESULTS_FILE: './output/scraped-results.json',
  ERRORS_FILE: './output/scraper-errors.json',
};
