const { parseArgs } = require('./args');
const { getChaperoSnapshot } = require('./scrapeChapero');
const { calculateDoorDistances } = require('./distance');

async function main() {
  const parsed = parseArgs(process.argv);
  if (!Number.isFinite(parsed.chapa)) {
    throw new Error('Debes indicar --chapa <numero>. Ejemplo: node src/main.js --chapa 2683 --manual');
  }

  const snapshot = await getChaperoSnapshot(parsed.url, { manual: parsed.manual });
  const result = calculateDoorDistances(parsed.chapa, snapshot);

  console.log('Chapa usuario:', result.userChapa);
  console.log('Puertas:', snapshot.doors);
  console.log('Total chapas detectadas:', result.meta.totalChapas);
  console.log('Chapas no contratadas detectadas:', result.meta.noContratadas);
  console.table(result.results.map((r) => ({
    puerta: r.door,
    chapaPuerta: r.doorChapa,
    distanciaNoContratadas: r.distance,
    estado: r.error || 'ok'
  })));

  if (result.recommended) {
    console.log(
      'Puerta recomendada:',
      result.recommended.door,
      '(distancia',
      result.recommended.distance + ')'
    );
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
