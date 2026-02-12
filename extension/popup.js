const $ = (id) => document.getElementById(id);
const chapaInput = $('chapa');
const calcBtn = $('calc');
const statusEl = $('status');
const outEl = $('out');

function setStatus(msg) {
  statusEl.textContent = msg || '';
}

function toPromise(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function render(data) {
  const rows = data.results.map((r) => {
    const best = data.recommended && data.recommended.door === r.door ? 'best' : '';
    const dist = Number.isFinite(r.distance) ? r.distance : '-';
    const err = r.error || '';
    return `<tr class="${best}"><td>${r.door}</td><td>${r.doorChapa}</td><td>${dist}</td><td>${err}</td></tr>`;
  }).join('');

  const bestText = data.recommended
    ? `${data.recommended.door} (distancia ${data.recommended.distance})`
    : 'Sin recomendacion';

  outEl.innerHTML = `
    <p><strong>Chapa usuario:</strong> ${data.userChapa} (censo ${data.userCensoKey})</p>
    <p><strong>Puerta mas cercana:</strong> <span class="best">${bestText}</span></p>
    <table>
      <thead>
        <tr><th>Puerta</th><th>Chapa puerta</th><th>Distancia</th><th>Estado</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function injectedCompute(userInput) {
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

      candidates.push({
        raw: text,
        isNoContratado
      });
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
          isNoContratado: !!grayMap[tk]
        });
      }
    }

    const preOrdered = orderedFromText
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
      const prevScore = prev.isNoContratado ? 1 : 0;
      const nextScore = item.isNoContratado ? 1 : 0;
      if (nextScore > prevScore) byNorm.set(item.norm, item);
    }

    return { doors, ordered: Array.from(byNorm.values()) };
  }

  function calculate(snapshot, input) {
    const userChapa = normalizeChapa(input);
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
        return {
          door,
          doorChapa,
          distance: null,
          error: 'Puerta no encontrada en censo (' + doorKey + ')'
        };
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

  try {
    if (!document || !document.body) {
      return { ok: false, frameUrl: location.href, error: 'Frame sin DOM' };
    }
    const snapshot = extract(document);
    const doorCount = Object.keys(snapshot.doors || {}).length;
    if (doorCount < 1 || snapshot.ordered.length < 20) {
      return {
        ok: false,
        frameUrl: location.href,
        orderedLen: snapshot.ordered.length,
        doorCount,
        error: 'Frame no parece chapero'
      };
    }
    return { ok: true, frameUrl: location.href, ...calculate(snapshot, userInput) };
  } catch (err) {
    return { ok: false, frameUrl: location.href, error: String(err && err.message || err) };
  }
}

async function run() {
  const raw = chapaInput.value.trim();
  if (!raw) {
    setStatus('Introduce una chapa.');
    return;
  }

  outEl.innerHTML = '';
  setStatus('Leyendo chapero...');
  calcBtn.disabled = true;

  try {
    const tabs = await toPromise((cb) => chrome.tabs.query({ active: true, currentWindow: true }, cb));
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) throw new Error('No hay pestana activa');

    const results = await toPromise((cb) =>
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id, allFrames: true },
          func: injectedCompute,
          args: [raw]
        },
        cb
      )
    );

    const payloads = (results || []).map((r) => r && r.result).filter(Boolean);
    const ok = payloads.filter((p) => p.ok);
    if (!ok.length) {
      const why = payloads.map((p) => `[${p.frameUrl}] ${p.error || 'sin datos'} (doors=${p.doorCount ?? '-'} ordered=${p.orderedLen ?? '-'})`).join(' | ');
      throw new Error('No se pudo leer chapero. Abre CHAPERO POR ESPECIALIDADES. ' + why);
    }

    ok.sort((a, b) => (b.meta.totalChapas || 0) - (a.meta.totalChapas || 0));
    render(ok[0]);
    setStatus('Calculo completado.');
  } catch (err) {
    setStatus('Error: ' + err.message);
  } finally {
    calcBtn.disabled = false;
  }
}

calcBtn.addEventListener('click', run);
chapaInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') run();
});
