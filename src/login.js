const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PROFILE_DIR = process.env.AUTH_PROFILE_DIR
  ? path.resolve(process.env.AUTH_PROFILE_DIR)
  : path.join(__dirname, '..', '.auth', 'chrome-profile');
const AUTH_DIR = path.dirname(PROFILE_DIR);
const PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';

async function ensureAuthDir() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

async function main() {
  await ensureAuthDir();

  const launchOptions = {
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled']
  };
  if (PLAYWRIGHT_CHANNEL && PLAYWRIGHT_CHANNEL !== 'none') {
    launchOptions.channel = PLAYWRIGHT_CHANNEL;
  }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, launchOptions);

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://portal.cpevalencia.com/', { waitUntil: 'domcontentloaded' });

  console.log('Resuelve Cloudflare + login manualmente y pulsa ENTER cuando estes en el portal.');
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));

  console.log('Perfil guardado en: ' + PROFILE_DIR);
  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
