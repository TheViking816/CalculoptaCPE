const path = require('path');
const express = require('express');
const { getChaperoSnapshot } = require('./scrapeChapero');
const { calculateDoorDistances, normalizeChapa } = require('./distance');

const app = express();
const PORT = Number(process.env.PORT) || 3088;
const publicDir = path.join(__dirname, '..', 'web');

let running = false;

app.use(express.json());
app.use(express.static(publicDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/calculate', async (req, res) => {
  if (running) {
    return res.status(429).json({ error: 'Ya hay un calculo en marcha. Espera y reintenta.' });
  }

  const inputChapa = req.body && req.body.chapa;
  const manual = !!(req.body && req.body.manual);
  const url = (req.body && req.body.url) || 'https://portal.cpevalencia.com/Noray/InformeEspecialidadesChapSinE.asp';
  const normalizedInput = normalizeChapa(inputChapa);

  if (!normalizedInput) {
    return res.status(400).json({ error: 'Chapa invalida.' });
  }

  running = true;
  try {
    const snapshot = await getChaperoSnapshot(url, { manual });
    const output = calculateDoorDistances(normalizedInput, snapshot);
    return res.json(output);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno' });
  } finally {
    running = false;
  }
});

app.listen(PORT, () => {
  console.log('Web lista en http://localhost:' + PORT);
});
