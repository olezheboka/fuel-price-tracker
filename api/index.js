// Vercel auto-detects Functions only under /api for non-framework ("Other")
// projects. The actual Express app lives in server/index.js (its own
// package.json/node_modules); this file just re-exports it so Vercel's
// zero-config builder picks it up.
module.exports = require('../server/index.js');
