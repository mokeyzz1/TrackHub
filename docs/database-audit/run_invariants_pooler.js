// Local audit wrapper: run the repository's read-only invariant suite through Supavisor.
// This does not modify the database.
const fs = require('fs');
const path = require('path');
const sourcePath = path.join(__dirname, '..', '..', 'scrapers', 'verify-data-invariants.js');
let source = fs.readFileSync(sourcePath, 'utf8');
source = source.replace(
  "require('dotenv').config({ path: require('path').join(__dirname, '.env') });\nconst rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '../.env') }).parsed || {};",
  "const rootEnv = require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') }).parsed || {};"
);
source = source.replace(
  "const host = 'db.' + new URL(process.env.SUPABASE_URL).host.split('.')[0] + '.supabase.co';",
  "const host = 'aws-0-us-west-2.pooler.supabase.com';"
);
source = source.replace("user: 'postgres'", "user: 'postgres.hunbahsnaeeztmzqpnrl'");
eval(source);
