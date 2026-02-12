const form = document.getElementById('calc-form');
const snapshotInput = document.getElementById('snapshot');
const chapaInput = document.getElementById('chapa');
const statusBox = document.getElementById('status');
const resultBox = document.getElementById('result');
const submitBtn = document.getElementById('submit');
const copyBookmarkletBtn = document.getElementById('copy-bookmarklet');
const copyScriptBtn = document.getElementById('copy-script');
const pasteSnapshotBtn = document.getElementById('paste-snapshot');

function setStatus(msg) {
  statusBox.textContent = msg || '';
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
    ? `Puerta recomendada: ${data.recommended.door} (distancia ${data.recommended.distance})`
    : 'Sin recomendacion disponible.';

  resultBox.innerHTML = `
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

  const snapshot = extract(document);
  const payload = JSON.stringify(snapshot);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(payload).then(() => {
      alert('Snapshot copiado al portapapeles.');
    }).catch(() => {
      prompt('Copia este snapshot JSON:', payload);
    });
  } else {
    prompt('Copia este snapshot JSON:', payload);
  }
}

function buildExtractorScript() {
  return '(' + extractorBody.toString() + ')();';
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

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();

  setStatus('Calculando...');
  resultBox.innerHTML = '';
  submitBtn.disabled = true;

  try {
    const parsed = JSON.parse(snapshotInput.value.trim());
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

copyScriptBtn.addEventListener('click', async () => {
  try {
    await copyText(buildExtractorScript());
    setStatus('Script copiado. En el portal: F12 -> Consola -> pegar -> Enter. Luego vuelve y pulsa "Pegar JSON del portapapeles".');
  } catch (err) {
    setStatus('No se pudo copiar: ' + err.message);
  }
});

copyBookmarkletBtn.addEventListener('click', async () => {
  try {
    await copyText('javascript:' + buildExtractorScript());
    setStatus('Bookmarklet copiado. Guardalo como marcador y ejecútalo dentro de la pagina del chapero.');
  } catch (err) {
    setStatus('No se pudo copiar: ' + err.message);
  }
});

pasteSnapshotBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) throw new Error('Portapapeles vacio');
    JSON.parse(text);
    snapshotInput.value = text;
    setStatus('JSON pegado automaticamente.');
  } catch (err) {
    setStatus('No se pudo pegar automatico: ' + err.message);
  }
});
