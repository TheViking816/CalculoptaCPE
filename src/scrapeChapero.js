const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { normalizeChapa } = require('./distance');

const PROFILE_DIR = process.env.AUTH_PROFILE_DIR
  ? path.resolve(process.env.AUTH_PROFILE_DIR)
  : path.join(__dirname, '..', '.auth', 'chrome-profile');
const PLAYWRIGHT_CHANNEL = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const PLAYWRIGHT_HEADLESS = /^(1|true|yes)$/i.test(process.env.PLAYWRIGHT_HEADLESS || 'false');
const PORTAL_FALLBACK_URL = 'https://portal.cpevalencia.com/#User,ViewNoray,8';

async function findNorayFrame(page) {
  const deadline = Date.now() + 25000;
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

    await page.waitForTimeout(800);
  }

  const frameUrls = page.frames().map((f) => f.url());
  throw new Error('No se encontro el iframe del chapero. Frames: ' + frameUrls.join(' | '));
}

async function waitForEnter(message) {
  console.log(message);
  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));
}

async function extractSnapshotFromContext(ctx) {
  const raw = await ctx.evaluate(() => {
    const labels = ['LAB', 'FES', 'NOC', 'NOC-FES'];
    const bodyText = (document.body && document.body.innerText) || '';
    const doors = {};

    for (const label of labels) {
      const re = new RegExp(label + '\\s*(\\d{3,5})', 'i');
      const m = bodyText.match(re);
      if (m) doors[label] = m[1];
    }

    function rgbFrom(styleText) {
      const m = styleText && styleText.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    }

    function isGray(rgb) {
      if (!rgb) return false;
      return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 24;
    }

    function getCandidateElements() {
      const all = Array.from(document.querySelectorAll('a, span, td, b, font, div'));
      const out = [];

      for (const el of all) {
        const text = (el.textContent || '').trim();
        if (!/^\d{3,5}$/.test(text)) continue;
        if (el.children.length > 0) {
          const hasEqualChild = Array.from(el.children).some((c) => (c.textContent || '').trim() === text);
          if (hasEqualChild) continue;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) continue;

        const style = getComputedStyle(el);
        const p = el.parentElement;
        const parentStyle = p ? getComputedStyle(p) : null;
        const className = ((el.className && String(el.className)) || '').toLowerCase();
        const parentClass = p ? ((p.className && String(p.className)) || '').toLowerCase() : '';
        const classBlob = className + ' ' + parentClass;

        const color = rgbFrom(style.color || '');
        const bg = rgbFrom(style.backgroundColor || '');
        const pbg = parentStyle ? rgbFrom(parentStyle.backgroundColor || '') : null;
        const hasBgImage = (style.backgroundImage && style.backgroundImage !== 'none') ||
          (parentStyle && parentStyle.backgroundImage && parentStyle.backgroundImage !== 'none');

        const radiusText = style.borderRadius || '';
        const parentRadius = parentStyle ? parentStyle.borderRadius || '' : '';
        const hasRadius = /%/.test(radiusText) || /%/.test(parentRadius) ||
          Number.parseFloat(radiusText) > 8 || Number.parseFloat(parentRadius) > 8;
        const isCircleSized = rect.width >= 14 && rect.width <= 42 && rect.height >= 14 && rect.height <= 42;
        const hasCircleShape = isCircleSized && hasRadius;

        const classNoContr = /nco|nocontrat|no.?contrat/.test(classBlob);
        const classOther = /dob|ant|exc|con\b|contrat/.test(classBlob) && !classNoContr;
        const toneGray = isGray(color) || isGray(bg) || isGray(pbg);
        const darkText = color && color.r < 120 && color.g < 120 && color.b < 120;

        const isNoContratado = classNoContr || (!classOther && hasCircleShape && (hasBgImage || toneGray || darkText));

        out.push({
          raw: text,
          top: rect.top,
          left: rect.left,
          isNoContratado
        });
      }

      return out;
    }

    function buildGrayMap(items) {
      const map = {};
      for (const item of items) {
        const key = String(item.raw);
        map[key] = map[key] || false;
        if (item.isNoContratado) map[key] = true;
      }
      return map;
    }

    function buildOrderFromBodyText(body) {
      const lines = body.split(/\r?\n/);
      const out = [];
      const seen = new Set();

      for (const line of lines) {
        const tokens = line.match(/\b\d{3,5}\b/g) || [];
        // Matrix rows have many tokens. Header/legend lines usually do not.
        if (tokens.length < 10) continue;
        for (const tk of tokens) {
          if (seen.has(tk)) continue;
          seen.add(tk);
          out.push({ raw: tk });
        }
      }
      return out;
    }

    const candidates = getCandidateElements();
    const grayMap = buildGrayMap(candidates);
    const orderedFromText = buildOrderFromBodyText(bodyText);

    return {
      doors,
      ordered: orderedFromText.map((x) => ({
        raw: x.raw,
        isNoContratado: !!grayMap[x.raw]
      }))
    };
  });

  const normalizedDoors = {};
  for (const [k, v] of Object.entries(raw.doors || {})) {
    const n = normalizeChapa(v);
    if (n) normalizedDoors[k] = n;
  }

  const preOrdered = (raw.ordered || [])
    .map((e) => ({
      raw: e.raw,
      norm: normalizeChapa(e.raw),
      isNoContratado: !!e.isNoContratado
    }))
    .filter((e) => !!e.norm);

  const byNorm = new Map();
  for (const item of preOrdered) {
    const prev = byNorm.get(item.norm);
    if (!prev) {
      byNorm.set(item.norm, item);
      continue;
    }
    const prevScore = (prev.isNoContratado ? 1 : 0);
    const nextScore = (item.isNoContratado ? 1 : 0);
    if (nextScore > prevScore) {
      byNorm.set(item.norm, item);
    }
  }

  // Keep censo order as detected from text rows.
  const orderedNoSort = Array.from(byNorm.values());

  const missingDoors = ['LAB', 'FES', 'NOC', 'NOC-FES'].filter((k) => !normalizedDoors[k]);
  if (missingDoors.length > 0) {
    throw new Error('No se pudieron leer puertas: ' + missingDoors.join(', '));
  }
  if (orderedNoSort.length === 0) {
    throw new Error('No se pudieron leer chapas del tablero.');
  }

  return { doors: normalizedDoors, ordered: orderedNoSort };
}

async function extractSnapshotFromPageOrFrame(page) {
  try {
    return await extractSnapshotFromContext(page);
  } catch (_) {
    const frame = await findNorayFrame(page);
    return extractSnapshotFromContext(frame);
  }
}

async function getChaperoSnapshot(url, options) {
  const manual = !!(options && options.manual);
  if (!fs.existsSync(PROFILE_DIR)) {
    throw new Error('No existe perfil de sesion en ' + PROFILE_DIR + '. Ejecuta primero: npm run login');
  }
  if (manual && PLAYWRIGHT_HEADLESS) {
    throw new Error('El modo manual requiere navegador visible. Usa PLAYWRIGHT_HEADLESS=false.');
  }

  const launchOptions = {
    headless: PLAYWRIGHT_HEADLESS,
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

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    try {
      const snapshot = await extractSnapshotFromPageOrFrame(page);
      await context.close();
      return snapshot;
    } catch (_) {
      await page.goto(PORTAL_FALLBACK_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      if (manual) {
        await waitForEnter(
          'Abre el chapero en el navegador (CHAPERO POR ESPECIALIDADES) y pulsa ENTER en esta consola.'
        );
      }
      const snapshot = await extractSnapshotFromPageOrFrame(page);
      await context.close();
      return snapshot;
    }
  } catch (err) {
    await context.close();
    throw err;
  }
}

module.exports = { getChaperoSnapshot };
