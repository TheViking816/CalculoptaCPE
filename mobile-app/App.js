import React, { useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Pressable, StyleSheet, ScrollView, Platform, StatusBar as RNStatusBar, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const URL_HOME = 'https://portal.cpevalencia.com/#Home';
const URL_CHAPERO = 'https://portal.cpevalencia.com/#User,ViewNoray,8';
const URL_SUELDO = 'https://misueldocpe.vercel.app/';
const URL_DESCANSOS = 'https://descansos-cpe.vercel.app/';
const URL_DOBLES = 'https://portal.cpevalencia.com/#User,ViewNoray,19';
const URL_PEDIR_DESCANSOS = 'https://portal.cpevalencia.com/#User,ViewNoray,18';
const URL_JORNALES = 'https://portal.cpevalencia.com/#User,ViewNoray,1';
const URL_DONDE_VOY = 'https://portal.cpevalencia.com/#User,ViewNoray,0';
const URL_PRIMAS = 'https://portal.cpevalencia.com/#User,ViewNoray,2';
const URL_CONTRATACION = 'https://portal.cpevalencia.com/#User,ViewNoray,9';
const URL_PREVISION = 'https://portal.cpevalencia.com/#User,ViewNoray,12';
const ICON_SUELDO = require('./assets/misueldocpe.png');
const ICON_DESCANSOS = require('./assets/descansos.png');
const WebViewComponent = Platform.OS === 'web' ? null : require('react-native-webview').WebView;
const SESSION_CHECK_MS = 120000;

const QUICK_ACTIONS = [
  { key: 'donde-voy', label: '¿Donde voy?', emoji: '\uD83D\uDCCD', url: URL_DONDE_VOY },
  { key: 'solicitar-dobles', label: 'Solicitar Dobles', emoji: '\uD83D\uDD01', url: URL_DOBLES },
  { key: 'jornales', label: 'Consulta Jornales', emoji: '\uD83D\uDCCB', url: URL_JORNALES },
  { key: 'solicitar-descansos', label: 'Solicitar Descansos', emoji: '\uD83C\uDF34', url: URL_PEDIR_DESCANSOS },
  { key: 'primas', label: 'Consulta Primas', emoji: '\uD83D\uDCB0', url: URL_PRIMAS },
  { key: 'prevision', label: 'Prevision', emoji: '\uD83D\uDCC5', url: URL_PREVISION },
  { key: 'chapero', label: 'Chapero', emoji: '\uD83D\uDEAA', special: 'door' },
  { key: 'sueldo', label: 'MiSueldoCPE', icon: ICON_SUELDO, url: URL_SUELDO },
  { key: 'contratacion', label: 'Contratacion', emoji: '\uD83E\uDDFE', url: URL_CONTRATACION },
  { key: 'descansos', label: 'DescansosCPE', icon: ICON_DESCANSOS, url: URL_DESCANSOS },
];

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

    function countAllForwardCircularExclusive(fromIdx, toIdx) {
      const n = snapshot.ordered.length;
      if (!n || fromIdx === toIdx) return 0;
      let c = 0;
      for (let i = (fromIdx + 1) % n; i !== toIdx; i = (i + 1) % n) {
        c += 1;
      }
      return c;
    }

    const results = Object.entries(snapshot.doors).map(([door, doorChapa]) => {
      const doorKey = toCensoKey(doorChapa);
      const doorIdx = idx.get(doorKey);
      if (doorIdx === undefined) {
        return { door, doorChapa, distance: null, error: 'Puerta no encontrada en censo (' + doorKey + ')' };
      }
      return {
        door,
        doorChapa,
        distance: countGrayForwardCircularExclusive(doorIdx, userIdx),
        distanceAll: countAllForwardCircularExclusive(doorIdx, userIdx),
      };
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

export default function App() {
  const webRef = useRef(null);
  const lastSafeUrlRef = useRef(URL_HOME);
  const [chapa, setChapa] = useState('');
  const [status, setStatus] = useState('Listo.');
  const [calc, setCalc] = useState(null);
  const [url, setUrl] = useState(URL_HOME);
  const [toolsOpen, setToolsOpen] = useState(Platform.OS === 'web');
  const [showDoorQuick, setShowDoorQuick] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [webPanelUrl, setWebPanelUrl] = useState('');
  const topInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0;
  
  function openExternalWebUrl(target, statusText) {
    if (Platform.OS !== 'web') return false;
    try {
      const win = window.open(target, '_blank', 'noopener,noreferrer');
      if (!win) {
        setStatus('Tu navegador ha bloqueado la nueva pestana. Permite ventanas emergentes para esta web.');
        return true;
      }
    } catch {
      setStatus('No se pudo abrir la pestana nueva. Revisa bloqueo de popups.');
      return true;
    }
    setStatus(statusText);
    setToolsOpen(false);
    setShowDoorQuick(false);
    return true;
  }

  const summary = useMemo(() => {
    if (!calc || !calc.ok) return null;
    const best = calc.recommended
      ? `${calc.recommended.door} (distancia ${calc.recommended.distance})`
      : 'Sin recomendacion';
    return `Chapa ${calc.userChapa} (censo ${calc.userCensoKey}) | Puerta mas cercana: ${best}`;
  }, [calc]);

  function shouldBlockDownloadUrl(rawUrl) {
    const u = String(rawUrl || '').toLowerCase();
    if (!u) return false;
    if (u.startsWith('blob:')) return true;
    if (u.startsWith('data:application/pdf')) return true;
    if (u.includes('/pdf/')) return true;
    if (u.includes('/pdf/evaluaciones/')) return true;
    if (u.includes('.pdf')) return true;
    if (u.includes('.zip') || u.includes('.rar') || u.includes('.7z')) return true;
    if (u.includes('.xls') || u.includes('.xlsx') || u.includes('.csv')) return true;
    if (u.includes('.doc') || u.includes('.docx')) return true;
    if (u.includes('/informe')) return true;
    if (u.includes('attachment=')) return true;
    if (u.includes('content-disposition=')) return true;
    if (u.includes('descarga')) return true;
    if (u.includes('download')) return true;
    return false;
  }

  function onShouldStartLoadWithRequest(req) {
    const nextUrl = String((req && req.url) || '');
    if (shouldBlockDownloadUrl(nextUrl)) {
      setStatus('Descarga bloqueada en la app. Abre ese documento en navegador si lo necesitas.');
      return false;
    }
    return true;
  }

  function onFileDownload(ev) {
    const nextUrl = String((ev && ev.nativeEvent && ev.nativeEvent.downloadUrl) || '');
    setStatus('Descarga bloqueada en la app: ' + (nextUrl || 'archivo'));
  }

  function onNavChange(navState) {
    const nextUrl = String((navState && navState.url) || '');
    if (!nextUrl) return;
    const lower = nextUrl.toLowerCase();
    if (lower.includes('login') || lower.includes('logout')) {
      setStatus('Sesion no valida. Inicia sesion para recuperar datos.');
    }
    if (shouldBlockDownloadUrl(nextUrl)) {
      webRef.current?.stopLoading();
      if (webRef.current?.goBack && navState?.canGoBack) webRef.current.goBack();
      setStatus('Descarga bloqueada en la app. Abre ese documento en navegador si lo necesitas.');
      if (lastSafeUrlRef.current) setUrl(lastSafeUrlRef.current);
      return;
    }
    lastSafeUrlRef.current = nextUrl;
  }

  function getBlockDownloadsInjectedJs() {
    return `
(() => {
  if (window.__cpeBridgeInstalled) return;
  window.__cpeBridgeInstalled = true;

  function postMessage(type, payload) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...(payload || {}) }));
  }

  function blocked(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return false;
    return u.includes('.pdf') || u.includes('.zip') || u.includes('.rar') || u.includes('.7z') ||
      u.includes('/pdf/') || u.includes('/pdf/evaluaciones/') ||
      u.includes('.xls') || u.includes('.xlsx') || u.includes('.csv') || u.includes('.doc') ||
      u.includes('.docx') || u.includes('/informe') || u.includes('attachment=') ||
      u.includes('content-disposition=') || u.includes('descarga') || u.includes('download');
  }

  function blockedForNode(node, attr) {
    try {
      const v = node && node.getAttribute ? node.getAttribute(attr) : '';
      return blocked(v);
    } catch (_) { return false; }
  }

  const oldOpen = window.open;
  window.open = function(url) {
    if (blocked(url)) return null;
    return oldOpen ? oldOpen.apply(window, arguments) : null;
  };

  const oldAssign = window.location.assign ? window.location.assign.bind(window.location) : null;
  if (oldAssign) {
    window.location.assign = function(url) {
      if (blocked(url)) return;
      return oldAssign(url);
    };
  }

  document.addEventListener('click', function(e) {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (blocked(href)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  const oldFetch = window.fetch ? window.fetch.bind(window) : null;
  if (oldFetch) {
    window.fetch = function(input, init) {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      if (blocked(u)) return Promise.reject(new Error('blocked download'));
      return oldFetch(input, init);
    };
  }

  const oldXhrOpen = XMLHttpRequest && XMLHttpRequest.prototype && XMLHttpRequest.prototype.open;
  if (oldXhrOpen) {
    XMLHttpRequest.prototype.open = function(method, url) {
      if (blocked(url)) throw new Error('blocked download');
      return oldXhrOpen.apply(this, arguments);
    };
  }

  function cleanupPdfNodes(root) {
    const nodes = (root || document).querySelectorAll('iframe,embed,object,a[href]');
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      const srcBlocked = blockedForNode(n, 'src');
      const dataBlocked = blockedForNode(n, 'data');
      const hrefBlocked = blockedForNode(n, 'href');
      if (srcBlocked || dataBlocked || hrefBlocked) {
        if (n.tagName === 'A') {
          n.setAttribute('href', '#');
        } else {
          n.remove();
        }
      }
    }
  }

  cleanupPdfNodes(document);
  const mo = new MutationObserver(function() { cleanupPdfNodes(document); });
  mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  setInterval(function() { cleanupPdfNodes(document); }, 1200);

  function checkSession() {
    const text = ((document.body && document.body.innerText) || '').toLowerCase();
    const href = String(window.location && window.location.href || '').toLowerCase();
    const expired = href.includes('login') || href.includes('logout') ||
      text.includes('iniciar sesion') || text.includes('sesion expirada') ||
      text.includes('sesion caducada');
    if (expired) {
      postMessage('sessionExpired');
      return;
    }
    if (window.location && window.location.hostname && window.location.hostname.includes('portal.cpevalencia.com')) {
      fetch(window.location.origin + '/', { method: 'GET', credentials: 'include', cache: 'no-store' }).catch(function(){});
    }
  }

  setInterval(checkSession, ${SESSION_CHECK_MS});
  checkSession();

  let startY = null;
  let startAtTop = false;
  let startAtBottom = false;
  let refreshLockMs = 0;

  function scrollPos() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function maxScrollPos() {
    const root = document.documentElement || document.body;
    const body = document.body || { scrollHeight: 0 };
    const maxHeight = Math.max(root ? root.scrollHeight : 0, body.scrollHeight || 0);
    return Math.max(0, maxHeight - window.innerHeight);
  }

  function requestRefresh(source) {
    const now = Date.now();
    if (now - refreshLockMs < 1500) return;
    refreshLockMs = now;
    postMessage('refreshRequest', { source: source || 'gesture' });
  }

  document.addEventListener('touchstart', function(e) {
    const touch = e.touches && e.touches[0];
    startY = touch ? touch.clientY : null;
    const top = scrollPos();
    const bottom = maxScrollPos() - top;
    startAtTop = top <= 2;
    startAtBottom = bottom <= 2;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (startY === null) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const delta = touch.clientY - startY;
    if (startAtTop && delta > 110) {
      startY = null;
      requestRefresh('pullDownTop');
      return;
    }
    if (startAtBottom && delta < -110) {
      startY = null;
      requestRefresh('pullUpBottom');
    }
  }, { passive: true });
})();
true;
`;
  }

  function openChapero() {
    setStatus('Abriendo chapero...');
    const target = URL_CHAPERO;
    if (Platform.OS === 'web') setWebPanelUrl('');

    if (openExternalWebUrl(target, 'Chapero abierto para mantener sesion.')) {
      return;
    }

    setUrl(target);
    webRef.current?.injectJavaScript(`
      try {
        window.location.hash = '#User,ViewNoray,8';
        window.location.href = '${URL_CHAPERO}';
      } catch (_) {}
      true;
    `);
  }

  function openModuleUrl(target) {
    if (Platform.OS === 'web' && (target === URL_SUELDO || target === URL_DESCANSOS)) {
      setWebPanelUrl(target);
      setStatus('Modulo abierto dentro del hub web.');
      setToolsOpen(true);
      setShowDoorQuick(false);
      return;
    }

    if (openExternalWebUrl(target, 'Modulo abierto para mantener sesion.')) {
      return;
    }

    setUrl(target);
    lastSafeUrlRef.current = target;
    setStatus('Abriendo modulo...');
    setToolsOpen(false);
    setShowDoorQuick(false);
  }

  function reloadPortal(reason = 'Recargando pagina...') {
    if (Platform.OS === 'web') {
      if (webPanelUrl) {
        setWebPanelUrl((current) => {
          if (!current) return '';
          const joiner = current.includes('?') ? '&' : '?';
          return `${current}${joiner}_reload=${Date.now()}`;
        });
      } else if (typeof window !== 'undefined' && window.location) {
        window.location.reload();
      }
      setStatus(reason);
      return;
    }
    webRef.current?.reload();
    setStatus(reason);
    setShowResult(false);
  }

  function onCalcPress() {
    if (Platform.OS === 'web') {
      setStatus('Usa Android/iOS para calcular. El modo web es solo visual.');
      return;
    }
    const trimmed = chapa.trim();
    if (!trimmed) {
      setStatus('Introduce una chapa.');
      return;
    }
    setStatus('Calculando...');
    setCalc(null);
    setShowResult(false);
    webRef.current?.injectJavaScript(buildCalcScript(trimmed));
  }

  function onMessage(ev) {
    try {
      const data = JSON.parse(ev.nativeEvent.data);
      if (data.type === 'refreshRequest') {
        reloadPortal('Recarga solicitada por gesto de scroll.');
        return;
      }
      if (data.type === 'sessionExpired') {
        setStatus('Sesion caducada detectada. Vuelve a iniciar sesion en el portal.');
        return;
      }
      if (data.type === 'calc') {
        if (data.result && data.result.ok) {
          setCalc(data.result);
          setStatus('Calculo completado.');
          setShowResult(true);
        } else {
          setCalc(data.result || null);
          setStatus('Error: ' + ((data.result && data.result.error) || 'No se pudo calcular'));
          setShowResult(false);
        }
      }
    } catch {
      setStatus('Respuesta invalida desde WebView.');
    }
  }

  function onCalcPressWebFallback() {
    setStatus('En navegador no se puede leer chapero automaticamente. Usa la app Android para calcular puertas.');
    setShowResult(false);
  }

  return (
    <SafeAreaView style={[styles.safe, { paddingTop: topInset }]}>
      <StatusBar style="dark" translucent={false} backgroundColor="#ffffff" />
      <View style={styles.webWrap}>
        {Platform.OS === 'web' ? (
          <View style={styles.webInfo}>
            <Text style={styles.webInfoTitle}>Hub CPE Valencia</Text>
            {webPanelUrl ? (
              <View style={styles.webPanel}>
                <View style={styles.webPanelHeader}>
                  <Text style={styles.webPanelTitle}>{webPanelUrl === URL_SUELDO ? 'MiSueldoCPE' : 'DescansosCPE'}</Text>
                  <View style={styles.webPanelButtons}>
                    <Pressable style={styles.webPanelBtn} onPress={() => openExternalWebUrl(webPanelUrl, 'Modulo abierto en pestana nueva.')}>
                      <Text style={styles.webPanelBtnText}>Abrir fuera</Text>
                    </Pressable>
                    <Pressable style={styles.webPanelBtn} onPress={() => setWebPanelUrl('')}>
                      <Text style={styles.webPanelBtnText}>Cerrar</Text>
                    </Pressable>
                  </View>
                </View>
                <iframe
                  title="Modulo CPE"
                  src={webPanelUrl}
                  style={{ width: '100%', height: '100%', border: '0', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}
                />
              </View>
            ) : (
              <Text style={styles.webInfoText}>Burbujas activas: abre modulos y vuelve al hub sin salir.</Text>
            )}
          </View>
        ) : (
          <WebViewComponent
            ref={webRef}
            source={{ uri: url }}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onFileDownload={onFileDownload}
            onNavigationStateChange={onNavChange}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            pullToRefreshEnabled
            setSupportMultipleWindows={false}
            allowFileAccess={false}
            allowingReadAccessToURL={URL_HOME}
            injectedJavaScriptBeforeContentLoaded={getBlockDownloadsInjectedJs()}
            originWhitelist={['*']}
          />
        )}
      </View>
      {toolsOpen ? (
        <View style={styles.quickActions}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              style={action.special === 'door' ? styles.quickBubbleDoor : styles.quickBubble}
              onPress={() => {
                if (action.special === 'door') {
                  setShowDoorQuick((v) => !v);
                  return;
                }
                openModuleUrl(action.url);
              }}
            >
              {action.icon ? (
                <Image source={action.icon} style={styles.quickIcon} resizeMode="contain" />
              ) : (
                <Text style={styles.quickDoorEmoji}>{action.emoji}</Text>
              )}
              <Text style={action.special === 'door' ? styles.quickLabelDoor : styles.quickLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {showDoorQuick ? (
        <View style={styles.doorMiniCard}>
          <TextInput
            style={styles.input}
            value={chapa}
            onChangeText={setChapa}
            keyboardType="number-pad"
            placeholder="Introduce chapa"
          />
          <View style={styles.rowButtons}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={openChapero}>
              <Text style={styles.btnGhostText}>Ir Chapero</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={Platform.OS === 'web' ? onCalcPressWebFallback : onCalcPress}>
              <Text style={styles.btnPrimaryText}>Calcular</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {Platform.OS === 'web' ? null : (
        <Pressable style={styles.reloadFab} onPress={() => reloadPortal('Recargando pagina del portal...')}>
          <Text style={styles.reloadFabText}>{'\u21BB'}</Text>
        </Pressable>
      )}

      {Platform.OS === 'web' ? null : (
        <Pressable
          style={styles.fab}
          onPress={() => {
            const next = !toolsOpen;
            setToolsOpen(next);
            if (!next) setShowDoorQuick(false);
          }}
        >
          <Text style={styles.fabText}>{toolsOpen ? 'X' : '\uD83D\uDEE0\uFE0F'}</Text>
        </Pressable>
      )}

      {showResult && calc && calc.ok ? (
        <View style={styles.resultCard}>
          <View style={styles.resultHead}>
            <Text style={styles.resultTitle}>Resultado</Text>
            <Pressable onPress={() => setShowResult(false)}>
              <Text style={styles.closeResult}>Cerrar</Text>
            </Pressable>
          </View>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
          <ScrollView style={styles.resultList}>
            <View style={styles.rowHead}>
              <Text style={styles.colDoorHead}>Puerta</Text>
              <Text style={styles.colValueHead}>Chapa</Text>
              <Text style={styles.colValueHead}>No cont.</Text>
              <Text style={styles.colValueHead}>Total</Text>
            </View>
            {calc.results.map((r) => (
              <View key={r.door}>
                <View style={styles.rowResult}>
                  <Text style={styles.colDoor}>{r.door}</Text>
                  <Text style={styles.colValue}>{r.doorChapa}</Text>
                  <Text style={styles.colValue}>{Number.isFinite(r.distance) ? r.distance : '-'}</Text>
                  <Text style={styles.colValue}>{Number.isFinite(r.distanceAll) ? r.distanceAll : '-'}</Text>
                </View>
                {r.error ? <Text style={styles.rowError}>{r.error}</Text> : null}
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
  webInfo: { flex: 1, padding: 12 },
  webInfoTitle: { fontSize: 22, fontWeight: '800', color: '#0f2a43', marginBottom: 8 },
  webInfoText: { fontSize: 14, color: '#32506f' },
  webPanel: {
    flex: 1,
    minHeight: 420,
    borderWidth: 1,
    borderColor: '#dbe3ef',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  webPanelHeader: {
    height: 46,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5ebf5',
    backgroundColor: '#f6f9ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  webPanelTitle: { fontWeight: '800', color: '#123151' },
  webPanelButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  webPanelBtn: { backgroundColor: '#0b5ea8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  webPanelBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  quickActions: {
    position: 'absolute',
    right: 14,
    bottom: 88,
    width: 320,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 156,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3ef',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  quickBubbleDoor: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 156,
    backgroundColor: '#0b5ea8',
    borderWidth: 1,
    borderColor: '#0b5ea8',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  quickIcon: { width: 24, height: 24, borderRadius: 6, marginRight: 8 },
  quickDoorEmoji: { fontSize: 18, marginRight: 8 },
  quickLabel: { color: '#0f2a43', fontWeight: '700', fontSize: 10, flex: 1 },
  quickLabelDoor: { color: '#ffffff', fontWeight: '700', fontSize: 10, flex: 1 },
  doorMiniCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 86,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe3ef',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  input: {
    backgroundColor: '#f7f9fd',
    borderWidth: 1,
    borderColor: '#cfdaea',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  rowButtons: { flexDirection: 'row', marginTop: 10, gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0b5ea8' },
  btnGhost: { backgroundColor: '#e7effa', borderWidth: 1, borderColor: '#c7d7ee' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnGhostText: { color: '#0b4e8d', fontWeight: '700' },
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
  reloadFab: {
    position: 'absolute',
    right: 86,
    bottom: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c8d8ec',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 7,
  },
  reloadFabText: { color: '#0b5ea8', fontWeight: '900', fontSize: 22, marginTop: -1 },
  resultCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 80,
    maxHeight: 300,
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
  summary: { fontWeight: '700', color: '#0f2a43', marginBottom: 8, fontSize: 13 },
  resultList: { maxHeight: 220 },
  rowHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#d8e2f1' },
  colDoorHead: { width: 72, fontWeight: '800', color: '#0f2a43', fontSize: 12 },
  colValueHead: { width: 72, fontWeight: '800', color: '#0f2a43', fontSize: 12 },
  rowResult: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#edf2f8' },
  colDoor: { width: 72, fontWeight: '700', color: '#123151' },
  colValue: { width: 72, color: '#1e3a5c' },
  rowError: { color: '#a13a3a', marginBottom: 6, fontSize: 12 }
});

