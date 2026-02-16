import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Pressable, StyleSheet, ScrollView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const URL_HOME = 'https://portal.cpevalencia.com/#Home';
const URL_CHAPERO = 'https://portal.cpevalencia.com/#User,ViewNoray,8';

const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-06', '2026-01-22', '2026-03-19', '2026-04-03',
  '2026-04-06', '2026-04-13', '2026-05-01', '2026-08-15', '2026-10-09',
  '2026-10-12', '2026-11-01', '2026-12-06', '2026-12-08', '2026-12-25',
];

const SALARY_CSV = `grupo,especialidad,jornada,salario_base_eur
I,LABORABLE,02-08,210.51
I,LABORABLE,08-14,107.80
I,LABORABLE,14-20,107.80
I,LABORABLE,20-02,149.29
I,SABADO,08-14,123.67
I,SABADO,14-20,179.12
I,SABADO,20-02,263.44
I,FESTIVO,02-08,379.00
I,FESTIVO,08-14,179.02
I,FESTIVO,14-20,253.65
I,FESTIVO,20-02,341.46
II,LABORABLE,02-08,217.40
II,LABORABLE,08-14,111.33
II,LABORABLE,14-20,111.33
II,LABORABLE,20-02,154.20
II,SABADO,08-14,127.72
II,SABADO,14-20,184.99
II,SABADO,20-02,271.96
II,FESTIVO,02-08,391.42
II,FESTIVO,08-14,184.89
II,FESTIVO,14-20,261.98
II,FESTIVO,20-02,352.49
III,LABORABLE,02-08,225.82
III,LABORABLE,08-14,115.44
III,LABORABLE,14-20,115.44
III,LABORABLE,20-02,159.91
III,SABADO,08-14,131.81
III,SABADO,14-20,191.77
III,SABADO,20-02,282.10
III,FESTIVO,02-08,405.86
III,FESTIVO,08-14,191.66
III,FESTIVO,14-20,271.51
III,FESTIVO,20-02,365.52
IV,LABORABLE,02-08,238.98
IV,LABORABLE,08-14,122.17
IV,LABORABLE,14-20,122.17
IV,LABORABLE,20-02,169.25
IV,SABADO,08-14,138.49
IV,SABADO,14-20,203.00
IV,SABADO,20-02,298.55
IV,FESTIVO,02-08,429.56
IV,FESTIVO,08-14,202.88
IV,FESTIVO,14-20,287.36
IV,FESTIVO,20-02,386.88
I,FESTIVO_TO_LABORABLE,20-02,302.48
II,FESTIVO_TO_LABORABLE,20-02,312.34
III,FESTIVO_TO_LABORABLE,20-02,323.86
IV,FESTIVO_TO_LABORABLE,20-02,342.76
I,FESTIVO_TO_FESTIVO,20-02,341.46
II,FESTIVO_TO_FESTIVO,20-02,352.64
III,FESTIVO_TO_FESTIVO,20-02,365.62
IV,FESTIVO_TO_FESTIVO,20-02,386.98`;

function parseSalaryCsv(csvText) {
  const lines = String(csvText || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const table = {};
  const festiveNight = { FESTIVO_TO_LABORABLE: {}, FESTIVO_TO_FESTIVO: {} };

  for (let i = 1; i < lines.length; i += 1) {
    const [group, dayType, shift, amountRaw] = lines[i].split(',').map((v) => String(v || '').trim());
    const amount = Number(String(amountRaw).replace(',', '.'));
    if (!group || !dayType || !shift || Number.isNaN(amount)) continue;

    if (dayType === 'FESTIVO_TO_LABORABLE' || dayType === 'FESTIVO_TO_FESTIVO') {
      festiveNight[dayType][group] = Number(amount.toFixed(2));
      continue;
    }

    if (!table[group]) table[group] = {};
    if (!table[group][dayType]) table[group][dayType] = {};
    table[group][dayType][shift] = Number(amount.toFixed(2));
  }

  return { table, festiveNight };
}

const SALARY_DATA = parseSalaryCsv(SALARY_CSV);

function toYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function nextDay(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + 1);
  return toYmd(dt);
}

function getDayType(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const wd = dt.getDay();
  if (wd === 0 || HOLIDAYS_2026.includes(dateStr)) return 'FESTIVO';
  if (wd === 6) return 'SABADO';
  return 'LABORABLE';
}

function inferGroupBySpecialty(specialty) {
  const s = String(specialty || '').toUpperCase();
  if (s.includes('CONDUCTOR 1A') || s.includes('CONDUCTOR 1ª')) return 'II';
  return 'II';
}

function calculateSalaryEntries(entries, irpfPercent = 0) {
  const out = [];

  for (const e of entries || []) {
    const group = inferGroupBySpecialty(e.specialty);
    const shift = e.shift;
    const date = e.date;
    const production = Number(e.production || 0);
    if (!group || !shift || !date) continue;

    const dayType = getDayType(date);
    let base = Number(SALARY_DATA.table?.[group]?.[dayType]?.[shift] || 0);

    if (dayType === 'FESTIVO' && shift === '20-02') {
      const next = nextDay(date);
      const nextFestive = getDayType(next) === 'FESTIVO';
      const key = nextFestive ? 'FESTIVO_TO_FESTIVO' : 'FESTIVO_TO_LABORABLE';
      base = Number(SALARY_DATA.festiveNight?.[key]?.[group] || base);
    }

    const total = Number((base + production).toFixed(2));
    const net = Number((total * (1 - (irpfPercent / 100))).toFixed(2));

    out.push({
      ...e,
      group,
      dayType,
      base: Number(base.toFixed(2)),
      total,
      net,
    });
  }

  return out;
}

function buildCalcScript(userInput) {
  const payload = JSON.stringify(String(userInput || ''));
  return `
(() => {
  const input = ${payload};

  function normalizeChapa(value) {
    const digits = String(value || '').replace(/\\D/g, '');
    if (!digits) return null;
    if (digits.length === 4) return '7' + digits;
    if (digits.length === 5) return digits;
    if (digits.length > 5) return digits.slice(-5);
    return digits.padStart(5, '0');
  }

  function toCensoKey(chapaNorm) {
    if (!chapaNorm) return null;
    const digits = String(chapaNorm).replace(/\\D/g, '');
    if (!digits) return null;
    if (digits.length >= 4) return digits.slice(-4);
    return digits.padStart(4, '0');
  }

  function rgbFrom(styleText) {
    const m = styleText && styleText.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }

  function isGray(rgb) {
    if (!rgb) return false;
    return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 24;
  }

  function extract(doc) {
    const labels = ['LAB', 'FES', 'NOC', 'NOC-FES'];
    const bodyText = (doc.body && doc.body.innerText) || '';
    const doors = {};

    for (const label of labels) {
      const re = new RegExp(label + '\\\\s*(\\\\d{3,5})', 'i');
      const m = bodyText.match(re);
      if (m) doors[label] = normalizeChapa(m[1]);
    }

    const all = Array.from(doc.querySelectorAll('a, span, td, b, font, div'));
    const candidates = [];
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (!/^\\d{3,5}$/.test(text)) continue;
      if (el.children.length > 0) {
        const hasEqualChild = Array.from(el.children).some((c) => (c.textContent || '').trim() === text);
        if (hasEqualChild) continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;

      const style = getComputedStyle(el);
      const p = el.parentElement;
      const pStyle = p ? getComputedStyle(p) : null;
      const classBlob = (String(el.className || '') + ' ' + String(p ? (p.className || '') : '')).toLowerCase();

      const color = rgbFrom(style.color || '');
      const bg = rgbFrom(style.backgroundColor || '');
      const pbg = pStyle ? rgbFrom(pStyle.backgroundColor || '') : null;
      const hasBgImage = (style.backgroundImage && style.backgroundImage !== 'none') ||
        (pStyle && pStyle.backgroundImage && pStyle.backgroundImage !== 'none');
      const radiusText = style.borderRadius || '';
      const parentRadius = pStyle ? pStyle.borderRadius || '' : '';
      const hasRadius = /%/.test(radiusText) || /%/.test(parentRadius) || Number.parseFloat(radiusText) > 8 || Number.parseFloat(parentRadius) > 8;
      const isCircleSized = rect.width >= 14 && rect.width <= 42 && rect.height >= 14 && rect.height <= 42;
      const hasCircleShape = isCircleSized && hasRadius;

      const classNoContr = /nco|nocontrat|no.?contrat/.test(classBlob);
      const classOther = /dob|ant|exc|con\\b|contrat/.test(classBlob) && !classNoContr;
      const toneGray = isGray(color) || isGray(bg) || isGray(pbg);
      const darkText = color && color.r < 120 && color.g < 120 && color.b < 120;
      const isNoContratado = classNoContr || (!classOther && hasCircleShape && (hasBgImage || toneGray || darkText));

      candidates.push({ raw: text, isNoContratado });
    }

    const grayMap = {};
    for (const item of candidates) {
      grayMap[item.raw] = grayMap[item.raw] || false;
      if (item.isNoContratado) grayMap[item.raw] = true;
    }

    const lines = bodyText.split(/\\r?\\n/);
    const orderedFromText = [];
    const seen = new Set();
    for (const line of lines) {
      const tokens = line.match(/\\b\\d{3,5}\\b/g) || [];
      if (tokens.length < 10) continue;
      for (const tk of tokens) {
        if (seen.has(tk)) continue;
        seen.add(tk);
        orderedFromText.push({ raw: tk, isNoContratado: !!grayMap[tk] });
      }
    }

    const preOrdered = orderedFromText
      .map((e) => ({ raw: e.raw, norm: normalizeChapa(e.raw), isNoContratado: !!e.isNoContratado }))
      .filter((e) => !!e.norm);

    const byNorm = new Map();
    for (const item of preOrdered) {
      const prev = byNorm.get(item.norm);
      if (!prev) {
        byNorm.set(item.norm, item);
        continue;
      }
      if (!prev.isNoContratado && item.isNoContratado) byNorm.set(item.norm, item);
    }
    return { doors, ordered: Array.from(byNorm.values()) };
  }

  function calculate(snapshot, userValue) {
    const userChapa = normalizeChapa(userValue);
    const userCensoKey = toCensoKey(userChapa);
    if (!userChapa) throw new Error('Chapa invalida');

    const idx = new Map();
    snapshot.ordered.forEach((e, i) => {
      const k = toCensoKey(e.norm);
      if (k && !idx.has(k)) idx.set(k, i);
    });
    const userIdx = idx.get(userCensoKey);
    if (userIdx === undefined) throw new Error('Tu chapa no aparece en el censo');

    function countGrayForwardCircularExclusive(fromIdx, toIdx) {
      const n = snapshot.ordered.length;
      if (!n || fromIdx === toIdx) return 0;
      let c = 0;
      for (let i = (fromIdx + 1) % n; i !== toIdx; i = (i + 1) % n) {
        if (snapshot.ordered[i].isNoContratado) c += 1;
      }
      return c;
    }

    const results = Object.entries(snapshot.doors).map(([door, doorChapa]) => {
      const doorKey = toCensoKey(doorChapa);
      const doorIdx = idx.get(doorKey);
      if (doorIdx === undefined) {
        return { door, doorChapa, distance: null, error: 'Puerta no encontrada en censo (' + doorKey + ')' };
      }
      return { door, doorChapa, distance: countGrayForwardCircularExclusive(doorIdx, userIdx) };
    });

    const ranked = results.filter((r) => Number.isFinite(r.distance)).sort((a, b) => a.distance - b.distance);
    return {
      userChapa,
      userCensoKey,
      results,
      recommended: ranked[0] || null,
      meta: {
        totalChapas: snapshot.ordered.length,
        noContratadas: snapshot.ordered.filter((x) => x.isNoContratado).length
      }
    };
  }

  function computeInDoc(doc, frameUrl) {
    try {
      if (!doc || !doc.body) return { ok: false, frameUrl, error: 'sin DOM' };
      const snapshot = extract(doc);
      const doorCount = Object.keys(snapshot.doors || {}).length;
      if (doorCount < 1 || snapshot.ordered.length < 20) {
        return { ok: false, frameUrl, error: 'frame no parece chapero', doorCount, ordered: snapshot.ordered.length };
      }
      return { ok: true, frameUrl, ...calculate(snapshot, input) };
    } catch (e) {
      return { ok: false, frameUrl, error: String(e && e.message || e) };
    }
  }

  const payloads = [];
  payloads.push(computeInDoc(document, location.href));

  for (let i = 0; i < window.frames.length; i += 1) {
    try {
      const fwin = window.frames[i];
      const fdoc = fwin.document;
      const furl = (fwin.location && fwin.location.href) || ('frame:' + i);
      payloads.push(computeInDoc(fdoc, furl));
    } catch (_) {}
  }

  const ok = payloads.filter((p) => p.ok);
  const result = ok.length
    ? ok.sort((a, b) => (b.meta.totalChapas || 0) - (a.meta.totalChapas || 0))[0]
    : { ok: false, error: payloads.map((p) => '[' + p.frameUrl + '] ' + p.error).join(' | ') };

  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'calc', result }));
  }
})();
true;
`;
}

function buildSalaryExtractScript() {
  return `
(() => {
  const MONTHS = {
    ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
    JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10,
    NOVIEMBRE: 11, DICIEMBRE: 12
  };

  function normalizeText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  }

  function parseShift(jornada) {
    const t = normalizeText(jornada).replace(/\s+/g, ' ');
    if (/\b0?2\D+0?8\b/.test(t)) return '02-08';
    if (/\b0?8\D+14\b/.test(t)) return '08-14';
    if (/\b14\D+20\b/.test(t)) return '14-20';
    if (/\b20\D+0?2\b/.test(t)) return '20-02';
    return null;
  }

  function parseMoney(text) {
    const m = String(text || '').match(/\d+[.,]\d+/g);
    if (!m || !m.length) return 0;
    const n = Number(m[m.length - 1].replace(',', '.'));
    return Number.isNaN(n) ? 0 : Number(n.toFixed(2));
  }

  function monthYearFromText(text) {
    const n = normalizeText(text);
    let m = n.match(/JORNALES\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})/);
    if (!m) m = n.match(/PRIMAS\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})/);
    if (!m) return null;
    const month = MONTHS[m[1]];
    const year = Number(m[2]);
    if (!month || Number.isNaN(year)) return null;
    return { month, year, source: 'title' };
  }

  function monthYearFromDateWidget(text) {
    const m = String(text || '').match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/);
    if (!m) return null;
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (!month || month < 1 || month > 12 || Number.isNaN(year)) return null;
    return { month, year, source: 'widget' };
  }

  function resolveMonthYear(doc) {
    const bodyText = (doc && doc.body && doc.body.innerText) || '';

    const fromTitle = monthYearFromText(bodyText);
    if (fromTitle) return fromTitle;

    try {
      const rootText = (window.top && window.top.document && window.top.document.body && window.top.document.body.innerText) || '';
      const fromTopTitle = monthYearFromText(rootText);
      if (fromTopTitle) return fromTopTitle;
      const fromWidget = monthYearFromDateWidget(rootText);
      if (fromWidget) return fromWidget;
    } catch (_) {}

    const fromWidgetLocal = monthYearFromDateWidget(bodyText);
    if (fromWidgetLocal) return fromWidgetLocal;

    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear(), source: 'now' };
  }

  function parseRowsFromTable(table, month, year) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return [];

    let headerIndex = -1;
    let headCells = [];

    for (let i = 0; i < rows.length; i += 1) {
      const probe = Array.from(rows[i].querySelectorAll('th,td')).map((c) => normalizeText(c.textContent));
      const hasJornada = probe.some((h) => h.includes('JORNADA'));
      const hasDia = probe.some((h) => h === 'DIA' || h.includes(' DIA'));
      if (hasJornada && hasDia) {
        headerIndex = i;
        headCells = probe;
        break;
      }
    }

    if (headerIndex < 0) return [];

    function idxBy(keys, fallback) {
      for (const k of keys) {
        const i = headCells.findIndex((h) => h.includes(k));
        if (i >= 0) return i;
      }
      return fallback;
    }

    const iDia = idxBy(['DIA'], 2);
    const iTipo = idxBy(['TIPO'], 3);
    const iJornada = idxBy(['JORNADA'], 4);
    const iSpecialty = idxBy(['ESPECIALIDAD'], 5);
    const iProduccion = idxBy(['PRODUCCION'], -1);

    const out = [];
    for (let r = headerIndex + 1; r < rows.length; r += 1) {
      const cells = Array.from(rows[r].querySelectorAll('td')).map((c) => String(c.textContent || '').trim());
      if (cells.length < 5) continue;

      const day = Number(cells[iDia] || '');
      const shift = parseShift(cells[iJornada] || '');
      if (!Number.isInteger(day) || day < 1 || day > 31 || !shift) continue;

      const productionCell = iProduccion >= 0 ? (cells[iProduccion] || '') : '';

      out.push({
        date: String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
        shift,
        tipo: String(cells[iTipo] || '').toUpperCase(),
        specialty: String(cells[iSpecialty] || '').toUpperCase(),
        production: parseMoney(productionCell),
      });
    }

    return out;
  }
  function parseRowsFromText(text, month, year) {
    const out = [];
    const lines = String(text || '').split(/\r?\n/).map((l) => String(l || '').trim()).filter(Boolean);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const m = line.match(/(?:^|\s)(\d{1,2})\s+(TUR|NUD)\s+DE\s*(\d{1,2})\s*A\s*(\d{1,2})\s*H\.?/i);
      if (!m) continue;

      const day = Number(m[1]);
      const t1 = String(m[3]).padStart(2, '0');
      const t2 = String(m[4]).padStart(2, '0');
      const shift = t1 + '-' + t2;
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;

      let production = parseMoney(line);
      if (!production && i + 1 < lines.length) {
        production = parseMoney(lines[i + 1]);
      }

      out.push({
        date: String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
        shift,
        tipo: String(m[2] || '').toUpperCase(),
        specialty: '',
        production,
      });
    }

    return out;
  }

  function extractFromDoc(doc, frameUrl) {
    try {
      if (!doc || !doc.body) return { ok: false, frameUrl, error: 'sin DOM', entries: [] };

      const head = resolveMonthYear(doc);
      const tables = Array.from(doc.querySelectorAll('table'));
      const trCount = doc.querySelectorAll('tr').length;
      let all = [];
      for (const t of tables) {
        const rows = parseRowsFromTable(t, head.month, head.year);
        if (rows.length) all = all.concat(rows);
      }

      if (!all.length) {
        const byText = parseRowsFromText((doc.body && doc.body.innerText) || '', head.month, head.year);
        if (byText.length) all = byText;
      }

      if (!all.length) {
        return {
          ok: false,
          frameUrl,
          error: 'no se encontro tabla de jornales/primas (tables=' + tables.length + ', tr=' + trCount + ')',
          entries: [],
        };
      }
      return { ok: true, frameUrl, month: head.month, year: head.year, entries: all, source: head.source };
    } catch (e) {
      return { ok: false, frameUrl, error: String((e && e.message) || e), entries: [] };
    }
  }

  function collectDocs(win, out, seen) {
    if (!win || seen.has(win)) return;
    seen.add(win);

    try {
      out.push({
        doc: win.document,
        url: (win.location && win.location.href) || 'about:blank',
      });
    } catch (_) {}

    const len = (win.frames && win.frames.length) || 0;
    for (let i = 0; i < len; i += 1) {
      try {
        collectDocs(win.frames[i], out, seen);
      } catch (_) {}
    }
  }


  function extractFromHtmlString(htmlText, sourceUrl) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(String(htmlText || ''), 'text/html');
      return extractFromDoc(doc, sourceUrl || 'fetch-html');
    } catch (e) {
      return { ok: false, frameUrl: sourceUrl || 'fetch-html', error: 'fallo parse html: ' + String((e && e.message) || e), entries: [] };
    }
  }

  async function tryFetchFallback(payloads) {
    try {
      const urls = [];
      const seen = {};

      function addUrl(u) {
        if (!u || typeof u !== 'string') return;
        if (!/^https?:\/\//i.test(u)) return;
        if (seen[u]) return;
        seen[u] = true;
        urls.push(u);
      }

      for (let i = 0; i < payloads.length; i += 1) {
        addUrl(payloads[i] && payloads[i].frameUrl);
      }

      try {
        const base = window.location && window.location.origin;
        if (base) addUrl(base + '/Noray/JornalesPrimas.asp');
      } catch (_) {}

      for (let i = 0; i < urls.length; i += 1) {
        const u = urls[i];
        try {
          const resp = await fetch(u, { credentials: 'include', cache: 'no-store' });
          if (!resp || !resp.ok) continue;
          const html = await resp.text();
          const parsed = extractFromHtmlString(html, u + ' [fetch]');
          if (parsed && parsed.ok && parsed.entries && parsed.entries.length) return parsed;
        } catch (_) {}
      }
    } catch (_) {}

    return null;
  }
  function runExtract(attempt) {
    const docs = [];
    collectDocs(window, docs, new Set());

    const payloads = [];
    for (let i = 0; i < docs.length; i += 1) {
      const d = docs[i];
      payloads.push(extractFromDoc(d.doc, d.url || ('frame:' + i)));
    }

    const ok = payloads.filter((p) => p.ok);
    if (ok.length) {
      const result = ok.sort((a, b) => (b.entries.length || 0) - (a.entries.length || 0))[0];
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'salary_extract', result }));
      }
      return;
    }    if (attempt < 12) {
      setTimeout(() => runExtract(attempt + 1), 300);
      return;
    }

    tryFetchFallback(payloads).then((fetched) => {
      if (fetched && fetched.ok && fetched.entries && fetched.entries.length) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'salary_extract', result: fetched }));
        }
        return;
      }

      const result = {
        ok: false,
        error: payloads.map((p) => '[' + p.frameUrl + '] ' + p.error).join(' | '),
        entries: [],
      };
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'salary_extract', result }));
      }
    }).catch(() => {
      const result = {
        ok: false,
        error: payloads.map((p) => '[' + p.frameUrl + '] ' + p.error).join(' | '),
        entries: [],
      };
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'salary_extract', result }));
      }
    });
  }

  runExtract(0);
})();
true;
`;
}
export default function App() {
  const webRef = useRef(null);
  const [toolMode, setToolMode] = useState('puertas');
  const [chapa, setChapa] = useState('');
  const [irpf, setIrpf] = useState('0');
  const [status, setStatus] = useState('Listo.');

  const [calc, setCalc] = useState(null);
  const [salaryResult, setSalaryResult] = useState(null);

  const [url, setUrl] = useState(URL_HOME);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showDoorsResult, setShowDoorsResult] = useState(false);
  const [showSalaryResult, setShowSalaryResult] = useState(false);
  const salaryReqRef = useRef(0);
  const salaryTimerRef = useRef(null);

  const topInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0;

  useEffect(() => () => {
    if (salaryTimerRef.current) {
      clearTimeout(salaryTimerRef.current);
      salaryTimerRef.current = null;
    }
  }, []);

  const doorsSummary = useMemo(() => {
    if (!calc || !calc.ok) return null;
    const best = calc.recommended
      ? `${calc.recommended.door} (distancia ${calc.recommended.distance})`
      : 'Sin recomendacion';
    return `Chapa ${calc.userChapa} (censo ${calc.userCensoKey}) | Puerta mas cercana: ${best}`;
  }, [calc]);

  const salarySummary = useMemo(() => {
    if (!salaryResult?.ok) return null;
    const entries = salaryResult.entries || [];
    const totalBase = entries.reduce((a, x) => a + Number(x.base || 0), 0);
    const totalProd = entries.reduce((a, x) => a + Number(x.production || 0), 0);
    const totalBruto = entries.reduce((a, x) => a + Number(x.total || 0), 0);
    const totalNeto = entries.reduce((a, x) => a + Number(x.net || 0), 0);
    return {
      count: entries.length,
      month: salaryResult.month,
      year: salaryResult.year,
      totalBase: Number(totalBase.toFixed(2)),
      totalProd: Number(totalProd.toFixed(2)),
      totalBruto: Number(totalBruto.toFixed(2)),
      totalNeto: Number(totalNeto.toFixed(2)),
    };
  }, [salaryResult]);

  function openChapero() {
    setStatus('Abriendo chapero...');
    const target = `${URL_CHAPERO}&r=${Date.now()}`;
    setUrl(target);
    webRef.current?.injectJavaScript(`
      try {
        window.location.hash = '#User,ViewNoray,8';
        window.location.href = '${URL_CHAPERO}';
      } catch (_) {}
      true;
    `);
  }

  function onCalcDoorsPress() {
    if (Platform.OS === 'web') {
      setStatus('Usa Android/iOS para calcular. El modo web es solo visual.');
      return;
    }
    const trimmed = chapa.trim();
    if (!trimmed) {
      setStatus('Introduce una chapa.');
      return;
    }
    setStatus('Calculando puertas...');
    setCalc(null);
    setShowDoorsResult(false);
    setShowSalaryResult(false);
    webRef.current?.injectJavaScript(buildCalcScript(trimmed));
  }

  function onReadSalaryPress() {
    if (Platform.OS === 'web') {
      setStatus('Usa Android/iOS para calcular. El modo web es solo visual.');
      return;
    }
    setStatus('Leyendo consulta de jornales/primas...');
    setSalaryResult(null);
    setShowSalaryResult(false);
    setShowDoorsResult(false);

    salaryReqRef.current += 1;
    const requestId = salaryReqRef.current;
    if (salaryTimerRef.current) clearTimeout(salaryTimerRef.current);
    salaryTimerRef.current = setTimeout(() => {
      if (salaryReqRef.current === requestId) {
        setStatus('Error sueldometro: tiempo de espera agotado. Pulsa Leer pantalla de nuevo.');
        setShowSalaryResult(false);
      }
    }, 10000);

    webRef.current?.injectJavaScript(buildSalaryExtractScript());
  }

  function onMessage(ev) {
    try {
      const data = JSON.parse(ev.nativeEvent.data);

      if (data.type === 'calc') {
        if (data.result && data.result.ok) {
          setCalc(data.result);
          setStatus('Calculo de puertas completado.');
          setShowDoorsResult(true);
        } else {
          setCalc(data.result || null);
          setStatus('Error puertas: ' + ((data.result && data.result.error) || 'No se pudo calcular'));
          setShowDoorsResult(false);
        }
        return;
      }

      if (data.type === 'salary_extract') {
        if (salaryTimerRef.current) {
          clearTimeout(salaryTimerRef.current);
          salaryTimerRef.current = null;
        }
        if (data.result && data.result.ok) {
          const irpfNum = Number(String(irpf).replace(',', '.'));
          const safeIrpf = Number.isFinite(irpfNum) ? Math.max(0, Math.min(60, irpfNum)) : 0;
          const entries = calculateSalaryEntries(data.result.entries || [], safeIrpf);
          setSalaryResult({ ok: true, entries, month: data.result.month, year: data.result.year });
          setStatus(`Sueldometro completado (${entries.length} jornales).`);
          setShowSalaryResult(true);
        } else {
          setSalaryResult(data.result || null);
          setStatus('Error sueldometro: ' + ((data.result && data.result.error) || 'No se pudo leer la tabla'));
          setShowSalaryResult(false);
        }
      }
    } catch {
      setStatus('Respuesta invalida desde WebView.');
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: topInset }]}>
      <StatusBar style="dark" translucent={false} backgroundColor="#ffffff" />

      <View style={styles.webWrap}>
        {Platform.OS === 'web' ? (
          <View style={styles.webInfo}>
            <Text style={styles.webInfoTitle}>Usa movil</Text>
            <Text style={styles.webInfoText}>Esta app necesita WebView nativa para login y calculo.</Text>
          </View>
        ) : (
          <WebView
            ref={webRef}
            source={{ uri: url }}
            onMessage={onMessage}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            originWhitelist={['*']}
          />
        )}
      </View>

      <Pressable style={styles.fab} onPress={() => setToolsOpen((v) => !v)}>
        <Text style={styles.fabText}>{toolsOpen ? 'X' : 'CPE'}</Text>
      </Pressable>

      {toolsOpen ? (
        <View style={styles.panel}>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, toolMode === 'puertas' ? styles.modeBtnActive : null]}
              onPress={() => setToolMode('puertas')}
            >
              <Text style={[styles.modeBtnText, toolMode === 'puertas' ? styles.modeBtnTextActive : null]}>Puertas</Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, toolMode === 'sueldo' ? styles.modeBtnActive : null]}
              onPress={() => setToolMode('sueldo')}
            >
              <Text style={[styles.modeBtnText, toolMode === 'sueldo' ? styles.modeBtnTextActive : null]}>Sueldometro</Text>
            </Pressable>
          </View>

          {toolMode === 'puertas' ? (
            <>
              <Text style={styles.panelTitle}>Puertas CPE</Text>
              <TextInput
                style={styles.input}
                value={chapa}
                onChangeText={setChapa}
                keyboardType="number-pad"
                placeholder="Chapa (5 digitos o 72999)"
              />
              <View style={styles.rowButtons}>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={openChapero}>
                  <Text style={styles.btnGhostText}>Ir Chapero</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onCalcDoorsPress}>
                  <Text style={styles.btnPrimaryText}>Calcular</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.panelTitle}>Sueldometro</Text>
              <Text style={styles.hint}>Abre Consulta de jornales o Consulta de primas y pulsa leer.</Text>
              <View style={styles.rowButtons}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={irpf}
                  onChangeText={setIrpf}
                  keyboardType="decimal-pad"
                  placeholder="IRPF % (ej. 2)"
                />
                <Pressable style={[styles.btn, styles.btnPrimary, { flex: 1 }]} onPress={onReadSalaryPress}>
                  <Text style={styles.btnPrimaryText}>Leer pantalla</Text>
                </Pressable>
              </View>
            </>
          )}

          <Text style={styles.status}>{status}</Text>
          <Pressable style={styles.closeTools} onPress={() => setToolsOpen(false)}>
            <Text style={styles.closeToolsText}>Cerrar panel</Text>
          </Pressable>
        </View>
      ) : null}

      {showDoorsResult && calc && calc.ok ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHead}>
            <Text style={styles.resultTitle}>Puertas</Text>
            <Pressable onPress={() => setShowDoorsResult(false)}>
              <Text style={styles.closeResult}>Cerrar</Text>
            </Pressable>
          </View>
          {doorsSummary ? <Text style={styles.summary}>{doorsSummary}</Text> : null}
          <ScrollView style={styles.resultList}>
            <View style={styles.rowHead}>
              <Text style={styles.colDoorHead}>Puerta</Text>
              <Text style={styles.colValueHead}>Chapa</Text>
              <Text style={styles.colValueHead}>Distancia</Text>
            </View>
            {calc.results.map((r) => (
              <View key={r.door}>
                <View style={styles.rowResult}>
                  <Text style={styles.colDoor}>{r.door}</Text>
                  <Text style={styles.colValue}>{r.doorChapa}</Text>
                  <Text style={styles.colValue}>{Number.isFinite(r.distance) ? r.distance : '-'}</Text>
                </View>
                {r.error ? <Text style={styles.rowError}>{r.error}</Text> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showSalaryResult && salaryResult?.ok ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHead}>
            <Text style={styles.resultTitle}>Sueldometro</Text>
            <Pressable onPress={() => setShowSalaryResult(false)}>
              <Text style={styles.closeResult}>Cerrar</Text>
            </Pressable>
          </View>
          {salarySummary ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.summary}>{`${salarySummary.count} jornales | ${salarySummary.month}/${salarySummary.year}`}</Text>
              <Text style={styles.summarySmall}>{`Base: ${salarySummary.totalBase.toFixed(2)} EUR | Produccion: ${salarySummary.totalProd.toFixed(2)} EUR`}</Text>
              <Text style={styles.summarySmall}>{`Bruto: ${salarySummary.totalBruto.toFixed(2)} EUR | Neto: ${salarySummary.totalNeto.toFixed(2)} EUR`}</Text>
            </View>
          ) : null}
          <ScrollView style={styles.resultList}>
            <View style={styles.rowHead}>
              <Text style={styles.colDoorHead}>Fecha</Text>
              <Text style={styles.colValueHead}>Turno</Text>
              <Text style={styles.colValueHead}>Total</Text>
            </View>
            {(salaryResult.entries || []).map((r, idx) => (
              <View key={`${r.date}-${r.shift}-${idx}`}>
                <View style={styles.rowResult}>
                  <Text style={styles.colDoor}>{r.date}</Text>
                  <Text style={styles.colValue}>{r.shift}</Text>
                  <Text style={styles.colValue}>{Number(r.total || 0).toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef3fa' },
  webWrap: { flex: 1, minHeight: 280, borderTopWidth: 1, borderTopColor: '#dbe3ef' },
  webInfo: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  webInfoTitle: { fontSize: 20, fontWeight: '800', color: '#0f2a43', marginBottom: 10 },
  webInfoText: { textAlign: 'center', color: '#36516d', marginBottom: 6 },

  fab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0b5ea8',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 80,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3ef',
    borderRadius: 12,
    padding: 12,
    elevation: 8,
  },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#c7d7ee', backgroundColor: '#e7effa', paddingVertical: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#0b5ea8', borderColor: '#0b5ea8' },
  modeBtnText: { color: '#0b4e8d', fontWeight: '700' },
  modeBtnTextActive: { color: '#fff' },

  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0e2338', marginBottom: 8 },
  hint: { color: '#4f6279', fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: '#f7f9fd', borderWidth: 1, borderColor: '#cfdaea', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  rowButtons: { flexDirection: 'row', marginTop: 10, gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0b5ea8' },
  btnGhost: { backgroundColor: '#e7effa', borderWidth: 1, borderColor: '#c7d7ee' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnGhostText: { color: '#0b4e8d', fontWeight: '700' },
  status: { marginTop: 8, color: '#344e68', fontSize: 13 },
  closeTools: { marginTop: 8, alignSelf: 'flex-end' },
  closeToolsText: { color: '#0b4e8d', fontWeight: '700' },

  resultCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 80,
    maxHeight: 320,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3ef',
    borderRadius: 12,
    padding: 12,
    elevation: 8,
  },
  resultHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  resultTitle: { fontSize: 16, fontWeight: '800', color: '#0e2338' },
  closeResult: { color: '#0b4e8d', fontWeight: '700' },
  summary: { fontWeight: '700', color: '#0f2a43', marginBottom: 4, fontSize: 13 },
  summarySmall: { color: '#1e3a5c', marginBottom: 2, fontSize: 12 },
  resultList: { maxHeight: 220 },
  rowHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#d8e2f1' },
  colDoorHead: { width: 110, fontWeight: '800', color: '#0f2a43' },
  colValueHead: { width: 90, fontWeight: '800', color: '#0f2a43' },
  rowResult: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#edf2f8' },
  colDoor: { width: 110, fontWeight: '700', color: '#123151' },
  colValue: { width: 90, color: '#1e3a5c' },
  rowError: { color: '#a13a3a', marginBottom: 6, fontSize: 12 },
});
