// One-time setup per machine: opens NORMAL Chrome (not automated) with the test profile,
// so you can pass Cloudflare / log in / verify your Google account like a real user.
// Run: npm run setup   — then quit Chrome (Cmd+Q / close all windows) when done.
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const PROFILE_DIR = process.env.CHROME_PROFILE ?? path.join(os.homedir(), 'chrome-test-profile');
const CHROME = {
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  linux: 'google-chrome',
}[process.platform];

console.log(`Profile: ${PROFILE_DIR}\nSign in / pass Cloudflare, then QUIT Chrome to finish.`);
spawn(CHROME, [`--user-data-dir=${PROFILE_DIR}`, '--no-first-run', 'https://qa.novocinemas.com/'], {
  stdio: 'ignore',
}).on('exit', () => console.log('Done. Now run: npm test'));
