const form = document.getElementById('calc-form');
const snapshotInput = document.getElementById('snapshot');
const chapaInput = document.getElementById('chapa');
const statusBox = document.getElementById('status');
const resultBox = document.getElementById('result');
const submitBtn = document.getElementById('submit');
const copyBookmarkletBtn = document.getElementById('copy-bookmarklet');
const copyScriptBtn = document.getElementById('copy-script');
const pasteSnapshotBtn = document.getElementById('paste-snapshot');
const bookmarkletLink = document.getElementById('bookmarklet-link');
const themeToggleBtn = document.getElementById('theme-toggle');
const resultModal = document.getElementById('result-modal');
const modalContent = document.getElementById('modal-content');
const closeModalBtn = document.getElementById('close-modal');

function setStatus(msg) {
  if (statusBox) statusBox.textContent = msg || '';
}

function normalizeChapa(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 4) return '7' + digits;
  if (digits.length === 5) return digits;
  if (digits.length > 5) return digits.slice(-5);
  return digits.padStart(5, '0');
}

function toCensoKey(chapaNorm) {
  if (!chapaNorm) return null;
  const digits = String(chapaNorm).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length >= 4) return digits.slice(-4);
  return digits.padStart(4, '0');
}

function buildIndexByCensoKey(ordered) {
  const map = new Map();
  ordered.forEach((e, i) => {
    const key = toCensoKey(e.norm);
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

function countGrayForwardCircularExclusive(ordered, fromIdx, toIdx) {
  const n = ordered.length;
  if (!n || fromIdx === toIdx) return 0;
  let count = 0;
  for (let i = (fromIdx + 1) % n; i !== toIdx; i = (i + 1) % n) {
    if (ordered[i].isNoContratado) count += 1;
  }
  return count;
}

function normalizeSnapshot(snapshotRaw) {
  const doorsIn = snapshotRaw && snapshotRaw.doors ? snapshotRaw.doors : {};
  const orderedIn = Array.isArray(snapshotRaw && snapshotRaw.ordered) ? snapshotRaw.ordered : [];

  const doors = {};
  Object.entries(doorsIn).forEach(([k, v]) => {
    const n = normalizeChapa(v);
    if (n) doors[k] = n;
  });

  const ordered = orderedIn
    .map((e) => ({
      raw: String((e && e.raw) || ''),
      norm: normalizeChapa((e && e.norm) || (e && e.raw)),
      isNoContratado: !!(e && e.isNoContratado)
    }))
    .filter((e) => !!e.norm);

  if (!ordered.length) throw new Error('Snapshot sin chapas en ordered.');
  if (!Object.keys(doors).length) throw new Error('Snapshot sin puertas en doors.');

  return { doors, ordered };
}

function parseSnapshotText(rawText) {
  const text = String(rawText || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('No se detecto un JSON valido en el texto pegado.');
  }

  const candidate = text.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (_err) {
    throw new Error('JSON invalido. Asegurate de pegar solo el snapshot del extractor.');
  }
}

function calculateDoorDistances(userChapa, snapshot) {
  const userNorm = normalizeChapa(userChapa);
  if (!userNorm) throw new Error('Chapa de usuario invalida.');
  const userKey = toCensoKey(userNorm);

  const ordered = snapshot.ordered || [];
  const doors = snapshot.doors || {};
  if (ordered.length === 0) throw new Error('No hay chapas en el snapshot.');

  const idx = buildIndexByCensoKey(ordered);
  const userIdx = idx.get(userKey);
  if (userIdx === undefined) {
    throw new Error('La chapa de usuario ' + userNorm + ' (' + userKey + ') no esta en el censo del chapero actual.');
  }

  const results = Object.entries(doors).map(([door, doorChapa]) => {
    const doorKey = toCensoKey(doorChapa);
    const doorIdx = idx.get(doorKey);
    if (doorIdx === undefined) {
      return {
        door,
        doorChapa,
        distance: null,
        error: 'Puerta no encontrada en censo (' + doorKey + ')'
      };
    }
    return {
      door,
      doorChapa,
      distance: countGrayForwardCircularExclusive(ordered, doorIdx, userIdx)
    };
  });

  const ranked = results
    .filter((r) => Number.isFinite(r.distance))
    .sort((a, b) => a.distance - b.distance);

  return {
    userChapa: userNorm,
    userCensoKey: userKey,
    results,
    recommended: ranked[0] || null,
    meta: {
      totalChapas: ordered.length,
      noContratadas: ordered.filter((e) => e.isNoContratado).length
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderResult(data) {
  const rows = (data.results || [])
    .map((r) => {
      const best = data.recommended && data.recommended.door === r.door ? 'winner' : '';
      const dist = Number.isFinite(r.distance) ? r.distance : '-';
      const info = r.error || '';
      return `<tr class="${best}"><td>${escapeHtml(r.door)}</td><td>${escapeHtml(r.doorChapa || '-')}</td><td>${escapeHtml(dist)}</td><td>${escapeHtml(info)}</td></tr>`;
    })
    .join('');

  const bestText = data.recommended
    ? `Puerta mas cercana: ${data.recommended.door} (distancia ${data.recommended.distance})`
    : 'Sin recomendacion disponible.';

  const html = `
    <p><strong>Chapa usuario:</strong> ${escapeHtml(data.userChapa)}</p>
    <p><strong>Resumen:</strong> ${escapeHtml(data.meta.noContratadas)} no contratadas detectadas de ${escapeHtml(data.meta.totalChapas)} chapas</p>
    <p class="winner">${escapeHtml(bestText)}</p>
    <table>
      <thead>
        <tr><th>Puerta</th><th>Chapa puerta</th><th>Distancia (no contratadas)</th><th>Estado</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (resultBox) resultBox.innerHTML = html;
  if (modalContent) modalContent.innerHTML = html;
  if (resultModal) resultModal.classList.remove('hidden');
}

function extractorBody() {
  function normalizeChapa(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 4) return '7' + digits;
    if (digits.length === 5) return digits;
    if (digits.length > 5) return digits.slice(-5);
    return digits.padStart(5, '0');
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

  function extract(doc) {
    const labels = ['LAB', 'FES', 'NOC', 'NOC-FES'];
    const bodyText = (doc.body && doc.body.innerText) || '';
    const doors = {};

    for (const label of labels) {
      const re = new RegExp(label + '\\s*(\\d{3,5})', 'i');
      const m = bodyText.match(re);
      if (m) doors[label] = normalizeChapa(m[1]);
    }

    const all = Array.from(doc.querySelectorAll('a, span, td, b, font, div'));
    const candidates = [];

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
      const pStyle = p ? getComputedStyle(p) : null;
      const classBlob = (
        String(el.className || '') + ' ' + String(p ? (p.className || '') : '')
      ).toLowerCase();

      const color = rgbFrom(style.color || '');
      const bg = rgbFrom(style.backgroundColor || '');
      const pbg = pStyle ? rgbFrom(pStyle.backgroundColor || '') : null;
      const hasBgImage = (style.backgroundImage && style.backgroundImage !== 'none') ||
        (pStyle && pStyle.backgroundImage && pStyle.backgroundImage !== 'none');

      const radiusText = style.borderRadius || '';
      const parentRadius = pStyle ? pStyle.borderRadius || '' : '';
      const hasRadius = /%/.test(radiusText) || /%/.test(parentRadius) ||
        Number.parseFloat(radiusText) > 8 || Number.parseFloat(parentRadius) > 8;
      const isCircleSized = rect.width >= 14 && rect.width <= 42 && rect.height >= 14 && rect.height <= 42;
      const hasCircleShape = isCircleSized && hasRadius;

      const classNoContr = /nco|nocontrat|no.?contrat/.test(classBlob);
      const classOther = /dob|ant|exc|con\b|contrat/.test(classBlob) && !classNoContr;
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

    const lines = bodyText.split(/\r?\n/);
    const orderedFromText = [];
    const seen = new Set();
    for (const line of lines) {
      const tokens = line.match(/\b\d{3,5}\b/g) || [];
      if (tokens.length < 10) continue;
      for (const tk of tokens) {
        if (seen.has(tk)) continue;
        seen.add(tk);
        orderedFromText.push({
          raw: tk,
          norm: normalizeChapa(tk),
          isNoContratado: !!grayMap[tk]
        });
      }
    }

    return { doors, ordered: orderedFromText };
  }

  function toCensoKey(chapaNorm) {
    if (!chapaNorm) return null;
    const digits = String(chapaNorm).replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length >= 4) return digits.slice(-4);
    return digits.padStart(4, '0');
  }

  function calculate(snapshot, userInput) {
    const userChapa = normalizeChapa(userInput);
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
    };
  }

  function computeInDoc(doc, frameUrl) {
    try {
      if (!doc || !doc.body) {
        return { ok: false, frameUrl, error: 'Frame sin DOM' };
      }
      const snapshot = extract(doc);
      const doorCount = Object.keys(snapshot.doors || {}).length;
      if (doorCount < 1 || snapshot.ordered.length < 20) {
        return {
          ok: false,
          frameUrl,
          doorCount,
          orderedLen: snapshot.ordered.length,
          error: 'Frame no parece chapero'
        };
      }
      return { ok: true, frameUrl, snapshot };
    } catch (err) {
      return { ok: false, frameUrl, error: String(err && err.message || err) };
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
    } catch (_err) {}
  }

  const ok = payloads.filter((p) => p.ok);
  if (!ok.length) {
    const why = payloads
      .map((p) => `[${p.frameUrl}] ${p.error || 'sin datos'} (doors=${p.doorCount ?? '-'} ordered=${p.orderedLen ?? '-'})`)
      .join(' | ');
    alert('No se pudo leer chapero. Asegurate de estar en Chapero por especialidades.\n\n' + why);
    return;
  }

  ok.sort((a, b) => (b.snapshot.ordered.length || 0) - (a.snapshot.ordered.length || 0));
  const snapshot = ok[0].snapshot;

  const last = localStorage.getItem('cpe_chapa_last') || '';
  const rawInput = prompt('Introduce tu chapa (5 digitos o 72999):', last);
  if (rawInput === null) return;

  const chapa = String(rawInput || '').trim();
  if (!chapa) {
    alert('Debes introducir una chapa.');
    return;
  }
  localStorage.setItem('cpe_chapa_last', chapa);

  let data;
  try {
    data = calculate(snapshot, chapa);
  } catch (err) {
    alert('Error al calcular: ' + String(err && err.message || err));
    return;
  }

  const old = document.getElementById('cpe-distance-modal');
  if (old) old.remove();

  const modal = document.createElement('div');
  modal.id = 'cpe-distance-modal';
  modal.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:999999', 'background:rgba(8,14,25,.65)',
    'display:flex', 'align-items:center', 'justify-content:center', 'padding:16px'
  ].join(';');

  const bestText = data.recommended
    ? data.recommended.door + ' (distancia ' + data.recommended.distance + ')'
    : 'Sin recomendacion';

  const rows = data.results.map((r) => {
    const isBest = data.recommended && data.recommended.door === r.door;
    const bg = isBest ? 'background:#e8fff2;font-weight:700' : '';
    const dist = Number.isFinite(r.distance) ? r.distance : '-';
    const err = r.error || '';
    return '<tr style="' + bg + '"><td style="padding:8px;border-bottom:1px solid #dbe3ef">' + r.door + '</td><td style="padding:8px;border-bottom:1px solid #dbe3ef">' + r.doorChapa + '</td><td style="padding:8px;border-bottom:1px solid #dbe3ef">' + dist + '</td><td style="padding:8px;border-bottom:1px solid #dbe3ef">' + err + '</td></tr>';
  }).join('');

  modal.innerHTML = ''
    + '<div style="width:min(860px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:12px;border:1px solid #d7e1ee;padding:14px;font-family:Segoe UI,Tahoma,sans-serif;color:#10243a">'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px">'
    + '    <h2 style="margin:0;font-size:22px">CPE Distancia Puertas</h2>'
    + '    <button id="cpe-distance-close" style="border:0;background:#e6edf5;border-radius:8px;padding:8px 12px;cursor:pointer">Cerrar</button>'
    + '  </div>'
    + '  <p style="margin:0 0 8px"><strong>Chapa usuario:</strong> ' + data.userChapa + ' (censo ' + data.userCensoKey + ')</p>'
    + '  <p style="margin:0 0 12px"><strong>Puerta mas cercana:</strong> <span style="color:#0b6c3d;font-weight:700">' + bestText + '</span></p>'
    + '  <table style="width:100%;border-collapse:collapse;font-size:15px">'
    + '    <thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #dbe3ef">Puerta</th><th style="text-align:left;padding:8px;border-bottom:1px solid #dbe3ef">Chapa puerta</th><th style="text-align:left;padding:8px;border-bottom:1px solid #dbe3ef">Distancia</th><th style="text-align:left;padding:8px;border-bottom:1px solid #dbe3ef">Estado</th></tr></thead>'
    + '    <tbody>' + rows + '</tbody>'
    + '  </table>'
    + '</div>';

  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) modal.remove();
  });
  document.body.appendChild(modal);

  const closeBtn = document.getElementById('cpe-distance-close');
  if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
}

function buildExtractorScript() {
  return '(' + extractorBody.toString() + ')();';
}

function buildBookmarkletHref() {
  return 'javascript:' + buildExtractorScript();
}

async function copyText(value) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const t = document.createElement('textarea');
  t.value = value;
  document.body.appendChild(t);
  t.select();
  document.execCommand('copy');
  t.remove();
}

if (bookmarkletLink) {
  bookmarkletLink.href = buildBookmarkletHref();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cpe_theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? 'Modo claro' : 'Modo oscuro';
  }
}

if (themeToggleBtn) {
  const saved = localStorage.getItem('cpe_theme');
  const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (preferDark ? 'dark' : 'light'));
  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

if (closeModalBtn && resultModal) {
  closeModalBtn.addEventListener('click', () => resultModal.classList.add('hidden'));
}

if (resultModal) {
  resultModal.addEventListener('click', (ev) => {
    if (ev.target === resultModal) resultModal.classList.add('hidden');
  });
}

if (form && snapshotInput && chapaInput && submitBtn && resultBox) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    setStatus('Calculando...');
    resultBox.innerHTML = '';
    submitBtn.disabled = true;

    try {
      const parsed = parseSnapshotText(snapshotInput.value);
      const snapshot = normalizeSnapshot(parsed);
      const data = calculateDoorDistances(chapaInput.value.trim(), snapshot);
      renderResult(data);
      setStatus('Calculo completado.');
    } catch (err) {
      setStatus('Error: ' + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

if (copyBookmarkletBtn) {
  copyBookmarkletBtn.addEventListener('click', async () => {
    try {
      await copyText(buildBookmarkletHref());
      setStatus('Marcador copiado. Crea un marcador y pega el contenido en su URL.');
    } catch (err) {
      setStatus('No se pudo copiar: ' + err.message);
    }
  });
}

if (pasteSnapshotBtn && snapshotInput) {
  pasteSnapshotBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) throw new Error('Portapapeles vacio');
      const parsed = parseSnapshotText(text);
      snapshotInput.value = JSON.stringify(parsed);
      setStatus('JSON pegado automaticamente.');
    } catch (err) {
      setStatus('No se pudo pegar automatico: ' + err.message);
    }
  });
}
