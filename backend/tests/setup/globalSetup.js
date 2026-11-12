const { execSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function globalSetup() {
  require('./env');
  const url = process.env.DATABASE_URL;
  if (!/test/i.test(url)) {
    throw new Error(`Refusing to run tests against a non-test database: ${url}`);
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
};
