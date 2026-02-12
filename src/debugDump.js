const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { normalizeChapa } = require('./distance');

const PROFILE_DIR = path.join(__dirname, '..', '.auth', 'chrome-profile');
const OUT_PATH = path.join(__dirname, '..', 'debug-chapero.json');
const URL = 'https://portal.cpevalencia.com/#User,ViewNoray,8';

async function waitForEnter(message) {
  console.log(message);
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
}

async function findNorayFrame(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const byUrl = page.frames().find((f) => {
      const u = f.url() || '';
      return u.includes('InformeEspecialidadesChapSinE.asp') || u.includes('/Noray/');
    });
    if (byUrl) return byUrl;

    const handles = await page.$$('iframe');
    for (const h of handles) {
      const id = (await h.getAttribute('id')) || '';
      const name = (await h.getAttribute('name')) || '';
      const src = (await h.getAttribute('src')) || '';
      if (!/noray/i.test(id + ' ' + name + ' ' + src)) continue;
      const frame = await h.contentFrame();
      if (frame) return frame;
    }
    await page.waitForTimeout(600);
  }
  throw new Error('No frame noray');
}

async function main() {
  if (!fs.existsSync(PROFILE_DIR)) throw new Error('Falta perfil. Ejecuta npm run login');

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled']
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitForEnter('Abre CHAPERO POR ESPECIALIDADES y pulsa ENTER para volcar debug.');
  const frame = await findNorayFrame(page);

  const data = await frame.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const items = [];
    for (const el of all) {
      const txt = (el.textContent || '').trim();
      if (!/^\d{3,5}$/.test(txt)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) continue;
      const st = getComputedStyle(el);
      const p = el.parentElement;
      const pst = p ? getComputedStyle(p) : null;
      items.push({
        text: txt,
        tag: el.tagName,
        className: String(el.className || ''),
        parentTag: p ? p.tagName : '',
        parentClass: p ? String(p.className || '') : '',
        color: st.color,
        bg: st.backgroundColor,
        bgImage: st.backgroundImage,
        parentBg: pst ? pst.backgroundColor : '',
        parentBgImage: pst ? pst.backgroundImage : '',
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      });
    }
    return {
      bodySample: (document.body && document.body.innerText || '').slice(0, 2000),
      items
    };
  });

  const normalized = data.items.map((it) => ({ ...it, norm: normalizeChapa(it.text) }));
  const grouped = {};
  for (const it of normalized) {
    const key = `${it.tag}|${it.className}|${it.parentTag}|${it.parentClass}|${it.color}|${it.bg}|${it.bgImage}|${it.parentBg}|${it.parentBgImage}`;
    grouped[key] = (grouped[key] || 0) + 1;
  }

  const out = {
    when: new Date().toISOString(),
    total: normalized.length,
    grouped,
    sample: normalized.slice(0, 120),
    aroundDoors: normalized.filter((x) => ['72636', '71990', '71803', '72614'].includes(x.norm)).slice(0, 20),
    aroundUser72683: normalized.filter((x) => x.norm === '72683').slice(0, 20)
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log('Dump guardado en:', OUT_PATH);
  await ctx.close();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
