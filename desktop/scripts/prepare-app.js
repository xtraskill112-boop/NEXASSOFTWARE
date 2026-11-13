/**
 * Copies the single-file Firebase edition into the desktop app and records its version.
 * Source: firebase/hosting/index.html (built with `npm run build:firebase` in frontend/).
 */
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '../../firebase/hosting/index.html');
const targetDir = path.resolve(__dirname, '../app');
const version = require('../../frontend/package.json').version;

if (!fs.existsSync(source)) {
  console.error(`Missing ${source}. Build it first: cd frontend && npm run build:firebase && cp dist-firebase/index.html ../firebase/hosting/index.html`);
  process.exit(1);
}
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, path.join(targetDir, 'index.html'));
fs.writeFileSync(path.join(targetDir, 'version.json'), JSON.stringify({ version }, null, 2));
console.log(`Bundled app ${version} (${(fs.statSync(source).size / 1024 / 1024).toFixed(2)} MB) -> app/`);
