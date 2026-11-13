/**
 * Publishes the current Firebase edition to the desktop update channel.
 *
 *   node scripts/publish-update.js "What's new in this version"
 *
 * Writes updates/index.html and updates/latest.json at the repository root. Commit and push
 * them: every installed StockSense desktop app (1.1.0 or newer) downloads the new version
 * automatically, verifies its SHA-256 checksum and uses it - no reinstall needed.
 * Bump "version" in frontend/package.json and rebuild before publishing.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'firebase/hosting/index.html');
const version = require(path.join(root, 'frontend/package.json')).version;
const minShellVersion = '1.1.0';
const notes = process.argv.slice(2).join(' ').trim();

const html = fs.readFileSync(source);
if (!html.includes(`v${version}`) && !html.includes(version)) {
  console.error(`firebase/hosting/index.html does not look like version ${version}. Rebuild it first (npm run build:firebase).`);
  process.exit(1);
}
const outDir = path.join(root, 'updates');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
const manifest = {
  version,
  file: 'index.html',
  size: html.length,
  sha256: crypto.createHash('sha256').update(html).digest('hex'),
  minShellVersion,
  notes,
  releasedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Published StockSense ${version} to updates/ (${(html.length / 1024 / 1024).toFixed(2)} MB, sha256 ${manifest.sha256.slice(0, 12)}…)`);
