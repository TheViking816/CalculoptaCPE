import React, { useMemo, useRef, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Pressable, StyleSheet, ScrollView, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const URL_HOME = 'https://portal.cpevalencia.com/#Home';
const URL_CHAPERO = 'https://portal.cpevalencia.com/#User,ViewNoray,8';

const MODULES = {
  PUERTAS: 'puertas',
  SUELDO: 'sueldometro',
  DESCANSOS: 'descansos',
};

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

export default function App() {
  const webRef = useRef(null);
  const [chapa, setChapa] = useState('');
  const [status, setStatus] = useState('Listo.');
  const [calc, setCalc] = useState(null);
  const [url, setUrl] = useState(URL_HOME);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [module, setModule] = useState(MODULES.PUERTAS);
  const topInset = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0;

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
    if (u.includes('.pdf')) return true;
    if (u.includes('/informe')) return true;
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

  function openChapero() {
    setStatus('Abriendo chapero...');
    const target = `${URL_CHAPERO}&r=${Date.now()}`;
    setUrl(target);
    // Navigate inside current WebView context as primary path.
    webRef.current?.injectJavaScript(`
      try {
        window.location.hash = '#User,ViewNoray,8';
        window.location.href = '${URL_CHAPERO}';
      } catch (_) {}
      true;
    `);
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
      if (data.type !== 'calc') return;
      if (data.result && data.result.ok) {
        setCalc(data.result);
        setStatus('Calculo completado.');
        setShowResult(true);
      } else {
        setCalc(data.result || null);
        setStatus('Error: ' + ((data.result && data.result.error) || 'No se pudo calcular'));
        setShowResult(false);
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
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onFileDownload={onFileDownload}
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
          <Text style={styles.panelTitle}>CPE Central</Text>
          <Text style={styles.panelSub}>Acceso rapido a tus herramientas.</Text>

          <View style={styles.modeTabs}>
            <Pressable
              style={[styles.modeTab, module === MODULES.PUERTAS ? styles.modeTabActive : null]}
              onPress={() => setModule(MODULES.PUERTAS)}
            >
              <Text style={[styles.modeTabText, module === MODULES.PUERTAS ? styles.modeTabTextActive : null]}>Puertas</Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, module === MODULES.SUELDO ? styles.modeTabActive : null]}
              onPress={() => setModule(MODULES.SUELDO)}
            >
              <Text style={[styles.modeTabText, module === MODULES.SUELDO ? styles.modeTabTextActive : null]}>Sueldometro</Text>
            </Pressable>
            <Pressable
              style={[styles.modeTab, module === MODULES.DESCANSOS ? styles.modeTabActive : null]}
              onPress={() => setModule(MODULES.DESCANSOS)}
            >
              <Text style={[styles.modeTabText, module === MODULES.DESCANSOS ? styles.modeTabTextActive : null]}>Descansos</Text>
            </Pressable>
          </View>

          {module === MODULES.PUERTAS ? (
            <>
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
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onCalcPress}>
                  <Text style={styles.btnPrimaryText}>Calcular</Text>
                </Pressable>
              </View>
              <Text style={styles.status}>{status}</Text>
            </>
          ) : (
            <View style={styles.moduleCard}>
              <Text style={styles.moduleCardTitle}>
                {module === MODULES.SUELDO ? 'Sueldometro' : 'Descansos'}
              </Text>
              <Text style={styles.moduleCardText}>
                Este modulo ira en app independiente para que funcione mejor y sin limites del portal embebido.
              </Text>
            </View>
          )}

          <Pressable style={styles.closeTools} onPress={() => setToolsOpen(false)}>
            <Text style={styles.closeToolsText}>Cerrar panel</Text>
          </Pressable>
        </View>
      ) : null}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef3fa' },
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
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0e2338', marginBottom: 8 },
  panelSub: { color: '#526b85', fontSize: 13, marginBottom: 10 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#eef3fb',
    borderWidth: 1,
    borderColor: '#d2deef',
    alignItems: 'center',
  },
  modeTabActive: { backgroundColor: '#0b5ea8', borderColor: '#0b5ea8' },
  modeTabText: { fontWeight: '700', color: '#2c4c6e', fontSize: 12 },
  modeTabTextActive: { color: '#ffffff' },
  input: { backgroundColor: '#f7f9fd', borderWidth: 1, borderColor: '#cfdaea', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  rowButtons: { flexDirection: 'row', marginTop: 10, gap: 8 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#0b5ea8' },
  btnGhost: { backgroundColor: '#e7effa', borderWidth: 1, borderColor: '#c7d7ee' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnGhostText: { color: '#0b4e8d', fontWeight: '700' },
  status: { marginTop: 8, color: '#344e68', fontSize: 13 },
  moduleCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d9e3f1',
    backgroundColor: '#f8fbff',
    padding: 12,
    marginTop: 2,
  },
  moduleCardTitle: { fontSize: 16, fontWeight: '800', color: '#0f2a43', marginBottom: 4 },
  moduleCardText: { color: '#4e6883', fontSize: 13, lineHeight: 18 },
  closeTools: { marginTop: 8, alignSelf: 'flex-end' },
  closeToolsText: { color: '#0b4e8d', fontWeight: '700' },
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
  colDoorHead: { width: 90, fontWeight: '800', color: '#0f2a43' },
  colValueHead: { width: 90, fontWeight: '800', color: '#0f2a43' },
  rowResult: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#edf2f8' },
  colDoor: { width: 90, fontWeight: '700', color: '#123151' },
  colValue: { width: 90, color: '#1e3a5c' },
  rowError: { color: '#a13a3a', marginBottom: 6, fontSize: 12 }
});
