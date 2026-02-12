const form = document.getElementById('calc-form');
const statusBox = document.getElementById('status');
const resultBox = document.getElementById('result');
const submitBtn = document.getElementById('submit');

function setStatus(msg) {
  statusBox.textContent = msg || '';
}

function renderResult(data) {
  const rows = (data.results || [])
    .map((r) => {
      const best = data.recommended && data.recommended.door === r.door ? 'winner' : '';
      const dist = Number.isFinite(r.distance) ? r.distance : '-';
      const info = r.error || '';
      return `<tr class="${best}"><td>${r.door}</td><td>${r.doorChapa || '-'}</td><td>${dist}</td><td>${info}</td></tr>`;
    })
    .join('');

  const bestText = data.recommended
    ? `Puerta recomendada: ${data.recommended.door} (distancia ${data.recommended.distance})`
    : 'Sin recomendacion disponible.';

  resultBox.innerHTML = `
    <p><strong>Chapa usuario:</strong> ${data.userChapa}</p>
    <p><strong>Resumen:</strong> ${data.meta.noContratadas} no contratadas detectadas de ${data.meta.totalChapas} chapas</p>
    <p class="winner">${bestText}</p>
    <table>
      <thead>
        <tr><th>Puerta</th><th>Chapa puerta</th><th>Distancia (no contratadas)</th><th>Estado</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const chapa = document.getElementById('chapa').value.trim();
  const manual = document.getElementById('manual').checked;

  setStatus('Calculando...');
  resultBox.innerHTML = '';
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapa, manual })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');

    setStatus('Calculo completado.');
    renderResult(data);
  } catch (err) {
    setStatus('Error: ' + err.message);
  } finally {
    submitBtn.disabled = false;
  }
});
