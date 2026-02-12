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
      distance: countGrayForwardCircularExclusive(ordered, doorIdx, userIdx),
      doorIdx,
      userIdx
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
    ranked,
    meta: {
      totalChapas: ordered.length,
      noContratadas: ordered.filter((e) => e.isNoContratado).length
    }
  };
}

module.exports = { normalizeChapa, calculateDoorDistances };
