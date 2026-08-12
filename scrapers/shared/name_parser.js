/**
 * Split a full name into { first_name, last_name } — the single source of truth for name
 * parsing, used by BOTH the one-time backfill and every scraper that creates an athlete.
 *
 * Why this exists: athlete rows were created with `full_name` only, leaving first/last null
 * on ~56% of athletes. Backfilling once fixes history; using this on insert stops it recurring.
 *
 * Rules (conservative — correctness over coverage):
 *   - strip trailing generational suffixes (Jr/Sr/II/III/IV)
 *   - first_name = first token
 *   - last_name  = final token + any preceding surname particles (van/von/de/la/...),
 *                  chained (e.g. "Jet van der Heijden" -> last "van der Heijden")
 *   - middle names are dropped from last_name (first_name stays correct regardless)
 *   - returns null for names we can't split confidently (single token, contains digits,
 *     or first === last like "Ahmed Ahmed") — caller should leave first/last null, not guess
 */
const PARTICLES = new Set([
  'van','von','de','del','della','der','den','ten','ter','di','da','dos','das',
  'la','le','du','st','san','santa','bin','al','vander'
]);
const SUFFIX = new Set(['jr','sr','ii','iii','iv']);

function parseName(fullName) {
  if (!fullName) return null;
  if (/\d/.test(fullName)) return null; // e.g. "Vadim Scherbinin (M63)" age-group tags
  let toks = String(fullName).trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  while (toks.length > 2 && SUFFIX.has(toks[toks.length - 1].toLowerCase().replace(/[.,]/g, ''))) {
    toks.pop();
  }
  if (toks.length < 2) return null; // single token — can't split confidently
  const first = toks[0];
  let i = toks.length - 1;
  const lastParts = [toks[i]];
  i--;
  while (i >= 1 && PARTICLES.has(toks[i].toLowerCase().replace(/[.,]/g, ''))) {
    lastParts.unshift(toks[i]);
    i--;
  }
  const last = lastParts.join(' ');
  if (!first || !last || first === last) return null;
  return { first_name: first, last_name: last };
}

module.exports = { parseName };
