(() => {
  if (window.__CPE_TOOLS_INSTALLED__) return;
  window.__CPE_TOOLS_INSTALLED__ = true;

  const PORTAL_ORIGIN = 'https://portal.cpevalencia.com';
  const SESSION_CHECK_MS = 120000;

  const URLS = {
    chapero: `${PORTAL_ORIGIN}/#User,ViewNoray,8`,
    dondeVoy: `${PORTAL_ORIGIN}/#User,ViewNoray,0`,
    jornales: `${PORTAL_ORIGIN}/#User,ViewNoray,1`,
    primas: `${PORTAL_ORIGIN}/#User,ViewNoray,2`,
    contratacion: `${PORTAL_ORIGIN}/#User,ViewNoray,9`,
    dobles: `${PORTAL_ORIGIN}/#User,ViewNoray,19`,
    pedirDescansos: `${PORTAL_ORIGIN}/#User,ViewNoray,18`,
    prevision: `${PORTAL_ORIGIN}/#User,ViewNoray,12`,
    miSueldo: 'https://misueldocpe.vercel.app/',
    descansos: 'https://descansos-cpe.vercel.app/'
  };

  const GRID_ITEMS = [
    { label: 'Donde voy?', key: 'dondeVoy', isExternal: false },
    { label: 'Solicitar Dobles', key: 'dobles', isExternal: false },
    { label: 'Consulta Jornales', key: 'jornales', isExternal: false },
    { label: 'Solicitar Descansos', key: 'pedirDescansos', isExternal: false },
    { label: 'Consulta Primas', key: 'primas', isExternal: false },
    { label: 'Prevision', key: 'prevision', isExternal: false },
    { label: 'Chapero', key: 'chapero', isExternal: false, isPrimary: true },
    { label: 'MiSueldoCPE', key: 'miSueldo', isExternal: true },
    { label: 'Contratacion', key: 'contratacion', isExternal: false },
    { label: 'DescansosCPE', key: 'descansos', isExternal: true }
  ];

  const style = document.createElement('style');
  style.textContent = `
    .cpe-fab {
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      border: none;
      background: #0b5ea8;
      color: #fff;
      font-size: 22px;
      cursor: pointer;
      z-index: 2147483647;
      box-shadow: 0 8px 20px rgba(0,0,0,.25);
    }
    .cpe-panel {
      position: fixed;
      right: 18px;
      bottom: 86px;
      width: min(390px, calc(100vw - 28px));
      max-height: 78vh;
      overflow: auto;
      background: #fff;
      border: 1px solid #d9e4f2;
      border-radius: 14px;
      padding: 12px;
      z-index: 2147483647;
      box-shadow: 0 16px 40px rgba(0,0,0,.22);
      font-family: "Segoe UI", Tahoma, sans-serif;
      color: #14304e;
    }
    .cpe-hidden { display: none !important; }
    .cpe-title { font-size: 17px; font-weight: 700; margin: 0 0 8px; }
    .cpe-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .cpe-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 10px;
    }
    .cpe-btn {
      border: 1px solid #c9d8eb;
      background: #f4f8ff;
      color: #14304e;
      border-radius: 10px;
      padding: 9px 10px;
      cursor: pointer;
      font-weight: 700;
      font-size: 12px;
      text-align: left;
    }
    .cpe-btn.primary {
      background: #0b5ea8;
      color: #fff;
      border-color: #0b5ea8;
    }
    .cpe-btn.control {
      text-align: center;
      flex: 1;
    }
    .cpe-input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #c9d8eb;
      border-radius: 10px;
      padding: 9px 10px;
      margin-bottom: 8px;
    }
    .cpe-status {
      font-size: 12px;
      color: #395a79;
      margin-bottom: 8px;
      min-height: 16px;
    }
    .cpe-result {
      border: 1px solid #e1eaf6;
      border-radius: 10px;
      padding: 8px;
    }
    .cpe-result table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .cpe-result th, .cpe-result td { text-align: left; border-bottom: 1px solid #edf2f8; padding: 6px 4px; }
    .cpe-best { color: #0b6f2e; font-weight: 700; }
  `;
  document.documentElement.appendChild(style);

  const fab = document.createElement('button');
  fab.className = 'cpe-fab';
  fab.type = 'button';
  fab.title = 'Herramientas CPE';
  fab.textContent = '+';

  const panel = document.createElement('div');
  panel.className = 'cpe-panel cpe-hidden';
  panel.innerHTML = `
    <div class="cpe-title">CPE Valencia Hub</div>
    <div class="cpe-grid">
      ${GRID_ITEMS.map((item) => {
        const attrs = item.isExternal ? `data-external="${item.key}"` : `data-open="${item.key}"`;
        const klass = item.isPrimary ? 'cpe-btn primary' : 'cpe-btn';
        return `<button class="${klass}" ${attrs}>${item.label}</button>`;
      }).join('')}
    </div>
    <input id="cpe-chapa" class="cpe-input" type="text" inputmode="numeric" placeholder="Chapa (5 digitos o 72999)" />
    <div class="cpe-row">
      <button id="cpe-calc" class="cpe-btn primary control">Calcular puertas</button>
      <button id="cpe-refresh" class="cpe-btn control">Recargar</button>
      <button id="cpe-close" class="cpe-btn control">Cerrar</button>
    </div>
    <div id="cpe-status" class="cpe-status">Abre Chapero por especialidades y pulsa calcular.</div>
    <div id="cpe-out" class="cpe-result cpe-hidden"></div>
  `;

  document.body.appendChild(panel);
  document.body.appendChild(fab);

  const chapaInput = panel.querySelector('#cpe-chapa');
  const statusEl = panel.querySelector('#cpe-status');
  const outEl = panel.querySelector('#cpe-out');

  try {
    const saved = localStorage.getItem('cpe_last_chapa');
    if (saved) chapaInput.value = saved;
  } catch (_) {}

  function setStatus(msg) {
    statusEl.textContent = msg || '';
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

  function rgbFrom(styleText) {
    const m = styleText && styleText.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }

  function isGray(rgb) {
    if (!rgb) return false;
    return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 24;
  }

  function getCandidateDocs() {
    const docs = [document];
    for (let i = 0; i < window.frames.length; i += 1) {
      try {
        const d = window.frames[i].document;
        if (d && d.body) docs.push(d);
      } catch (_) {}
    }
    return docs;
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
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;

      const styleNode = getComputedStyle(el);
      const parent = el.parentElement;
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const classBlob = (String(el.className || '') + ' ' + String(parent ? parent.className || '' : '')).toLowerCase();

      const color = rgbFrom(styleNode.color || '');
      const bg = rgbFrom(styleNode.backgroundColor || '');
      const pbg = parentStyle ? rgbFrom(parentStyle.backgroundColor || '') : null;
      const classNoContr = /nco|nocontrat|no.?contrat/.test(classBlob);
      const classOther = /dob|ant|exc|con\b|contrat/.test(classBlob) && !classNoContr;
      const toneGray = isGray(color) || isGray(bg) || isGray(pbg);
      const isNoContratado = classNoContr || (!classOther && toneGray);
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
      } else if (!prev.isNoContratado && item.isNoContratado) {
        byNorm.set(item.norm, item);
      }
    }
    return { doors, ordered: Array.from(byNorm.values()) };
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
    if (userIdx === undefined) throw new Error('Tu chapa no aparece en el censo.');

    function countNoContr(fromIdx, toIdx) {
      const n = snapshot.ordered.length;
      if (!n || fromIdx === toIdx) return 0;
      let c = 0;
      for (let i = (fromIdx + 1) % n; i !== toIdx; i = (i + 1) % n) {
        if (snapshot.ordered[i].isNoContratado) c += 1;
      }
      return c;
    }

    function countAll(fromIdx, toIdx) {
      const n = snapshot.ordered.length;
      if (!n || fromIdx === toIdx) return 0;
      let c = 0;
      for (let i = (fromIdx + 1) % n; i !== toIdx; i = (i + 1) % n) c += 1;
      return c;
    }

    const results = Object.entries(snapshot.doors).map(([door, doorChapa]) => {
      const doorKey = toCensoKey(doorChapa);
      const doorIdx = idx.get(doorKey);
      if (doorIdx === undefined) return { door, doorChapa, distance: null, distanceAll: null, error: 'Puerta no encontrada' };
      return {
        door,
        doorChapa,
        distance: countNoContr(doorIdx, userIdx),
        distanceAll: countAll(doorIdx, userIdx)
      };
    });
    const ranked = results.filter((r) => Number.isFinite(r.distance)).sort((a, b) => a.distance - b.distance);
    return { userChapa, userCensoKey, results, recommended: ranked[0] || null };
  }

  function renderResult(data) {
    const best = data.recommended ? `${data.recommended.door} (no cont. ${data.recommended.distance})` : 'Sin recomendacion';
    const rows = data.results.map((r) => `
      <tr>
        <td>${r.door}</td>
        <td>${r.doorChapa || '-'}</td>
        <td>${Number.isFinite(r.distance) ? r.distance : '-'}</td>
        <td>${Number.isFinite(r.distanceAll) ? r.distanceAll : '-'}</td>
      </tr>
    `).join('');
    outEl.innerHTML = `
      <div><strong>Chapa:</strong> ${data.userChapa} (censo ${data.userCensoKey})</div>
      <div class="cpe-best" style="margin: 6px 0;"><strong>Puerta mas cercana:</strong> ${best}</div>
      <table>
        <thead><tr><th>Puerta</th><th>Chapa</th><th>No cont.</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    outEl.classList.remove('cpe-hidden');
  }

  function goPortal(url) {
    location.href = url;
  }

  function reloadPage() {
    setStatus('Recargando pagina...');
    location.reload();
  }

  function keepSessionAlive() {
    const text = ((document.body && document.body.innerText) || '').toLowerCase();
    const href = String(location.href || '').toLowerCase();
    const expired = href.includes('login') || href.includes('logout') ||
      text.includes('iniciar sesion') || text.includes('sesion expirada') || text.includes('sesion caducada');
    if (expired) {
      setStatus('Sesion caducada. Inicia sesion de nuevo.');
      return;
    }
    if (location.hostname.includes('portal.cpevalencia.com')) {
      fetch(location.origin + '/', { method: 'GET', credentials: 'include', cache: 'no-store' }).catch(() => {});
    }
  }

  function setupBottomScrollReload() {
    let lastBottomAt = 0;
    let hits = 0;
    const hitWindowMs = 1200;
    const maxGapBottomPx = 3;

    window.addEventListener('wheel', (ev) => {
      if (ev.deltaY <= 0) return;
      const maxScroll = Math.max(
        0,
        Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0) - window.innerHeight
      );
      const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
      if (maxScroll - currentScroll > maxGapBottomPx) return;
      const now = Date.now();
      if (now - lastBottomAt > hitWindowMs) hits = 0;
      lastBottomAt = now;
      hits += 1;
      if (hits >= 2) {
        hits = 0;
        reloadPage();
      }
    }, { passive: true });
  }

  fab.addEventListener('click', () => {
    panel.classList.toggle('cpe-hidden');
  });

  panel.querySelector('#cpe-close').addEventListener('click', () => {
    panel.classList.add('cpe-hidden');
  });

  panel.querySelector('#cpe-refresh').addEventListener('click', reloadPage);

  panel.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const openKey = btn.getAttribute('data-open');
    const extKey = btn.getAttribute('data-external');
    if (openKey && URLS[openKey]) {
      goPortal(URLS[openKey]);
      return;
    }
    if (extKey && URLS[extKey]) {
      window.open(URLS[extKey], '_blank', 'noopener,noreferrer');
    }
  });

  panel.querySelector('#cpe-calc').addEventListener('click', () => {
    try {
      const user = chapaInput.value.trim();
      if (!user) {
        setStatus('Introduce una chapa.');
        return;
      }
      localStorage.setItem('cpe_last_chapa', user);
      setStatus('Leyendo chapero...');
      outEl.classList.add('cpe-hidden');
      const docs = getCandidateDocs();
      const candidates = docs.map((d) => extract(d));
      candidates.sort((a, b) => (b.ordered.length || 0) - (a.ordered.length || 0));
      const best = candidates.find((c) => Object.keys(c.doors || {}).length >= 1 && (c.ordered || []).length >= 20);
      if (!best) {
        setStatus('No detecto chapero. Ve a "Chapero por especialidades" y vuelve a calcular.');
        return;
      }
      const result = calculate(best, user);
      renderResult(result);
      setStatus('Calculo completado.');
    } catch (err) {
      setStatus('Error: ' + String(err && err.message || err));
    }
  });

  setInterval(keepSessionAlive, SESSION_CHECK_MS);
  keepSessionAlive();
  setupBottomScrollReload();
})();
