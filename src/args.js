function parseArgs(argv) {
  const args = {
    chapa: null,
    url: 'https://portal.cpevalencia.com/Noray/InformeEspecialidadesChapSinE.asp',
    manual: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--chapa' && argv[i + 1]) {
      args.chapa = Number(argv[i + 1]);
      i += 1;
    } else if (token === '--url' && argv[i + 1]) {
      args.url = argv[i + 1];
      i += 1;
    } else if (token === '--manual') {
      args.manual = true;
    }
  }

  return args;
}

module.exports = { parseArgs };
