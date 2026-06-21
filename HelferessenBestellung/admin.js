const API_BASE = (window.API_URL_HELFERESSEN || `${window.location.origin}/HelferessenBestellung/api`).replace(/\/$/, '');

let events = [];
let selectedEventId = null;

const els = {
  eventForm: document.getElementById('eventForm'),
  tagLabel: document.getElementById('tagLabel'),
  eventDate: document.getElementById('eventDate'),
  mainEnabled: document.getElementById('mainEnabled'),
  iceEnabled: document.getElementById('iceEnabled'),
  createStatus: document.getElementById('createStatus'),
  qrBox: document.getElementById('qrBox'),
  eventList: document.getElementById('eventList'),
  reloadEvents: document.getElementById('reloadEvents'),
  summaryTitle: document.getElementById('summaryTitle'),
  summaryList: document.getElementById('summaryList'),
  whatsappSummary: document.getElementById('whatsappSummary')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function publicUrl(eventId) {
  const url = new URL('bestellung.html', window.location.href);
  url.searchParams.set('event', eventId);
  return url.toString();
}

function qrUrl(eventId) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(publicUrl(eventId))}`;
}

function labelMain(choice) {
  const labels = {
    salami: 'Salami',
    schinken: 'Schinken',
    vegetarisch: 'Vegetarisch',
    pizzadoener: 'Pizzadoener',
    doener: 'Doener',
    pommes: 'Pommes'
  };
  return labels[choice] || 'Kein Hauptessen';
}

function orderText(order) {
  const parts = [];
  if (order.mainChoice) parts.push(labelMain(order.mainChoice));
  if (order.mainChoice === 'doener' && order.doenerOhneZwiebeln) parts.push('ohne Zwiebeln');
  if (order.mainChoice === 'doener' && order.doenerFalafel) parts.push('Falafel');
  if (order.wantsIce) parts.push('Eis');
  return parts.join(', ') || 'Keine Auswahl';
}

function summarize(orders) {
  const summary = new Map();
  for (const order of orders) {
    if (order.mainChoice) {
      const key = order.mainChoice === 'doener'
        ? [labelMain(order.mainChoice), order.doenerOhneZwiebeln ? 'ohne Zwiebeln' : '', order.doenerFalafel ? 'Falafel' : ''].filter(Boolean).join(' / ')
        : labelMain(order.mainChoice);
      summary.set(key, (summary.get(key) || 0) + 1);
    }
    if (order.wantsIce) {
      summary.set('Eis', (summary.get('Eis') || 0) + 1);
    }
  }
  return [...summary.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
}

function renderQr(eventId) {
  const link = publicUrl(eventId);
  els.qrBox.innerHTML = `
    <img src="${escapeHtml(qrUrl(eventId))}" alt="QR-Code zur Helferessen-Auswahl">
    <div class="link-box">${escapeHtml(link)}</div>
    <a class="primary-button" href="${escapeHtml(link)}" target="_blank" rel="noopener">Auswahlseite oeffnen</a>
  `;
}

function renderEvents() {
  if (!events.length) {
    els.eventList.innerHTML = '<div class="muted">Noch keine Planung angelegt.</div>';
    return;
  }

  els.eventList.innerHTML = events.map((event) => `
    <article class="order-item">
      <div class="order-head">
        <strong>${escapeHtml(event.tagLabel)}</strong>
        <button type="button" class="ghost-button" data-select-event="${event.id}">Auswaehlen</button>
      </div>
      <div class="muted">
        ${escapeHtml(event.eventDate || 'ohne Datum')} ·
        ${event.mainEnabled ? 'Partypizza/Doener' : ''}
        ${event.mainEnabled && event.iceEnabled ? ' + ' : ''}
        ${event.iceEnabled ? 'Eis' : ''}
      </div>
    </article>
  `).join('');
}

async function loadEvents() {
  events = await fetchJson(`${API_BASE}/events`);
  renderEvents();
  if (!selectedEventId && events[0]) {
    await selectEvent(events[0].id);
  }
}

async function selectEvent(eventId) {
  selectedEventId = eventId;
  renderQr(eventId);
  const data = await fetchJson(`${API_BASE}/events/${eventId}/orders`);
  renderSummary(data.event, data.orders);
}

function renderSummary(event, orders) {
  els.summaryTitle.textContent = event.tagLabel;
  const summary = summarize(orders);

  if (!summary.length) {
    els.summaryList.innerHTML = '<div class="muted">Noch keine Eintraege vorhanden.</div>';
    els.whatsappSummary.classList.add('hidden');
    return;
  }

  els.summaryList.innerHTML = summary.map(([label, count]) => `
    <article class="summary-card">
      <strong>${count}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `).join('');

  const orderLines = orders.map((order) => `- ${order.name}: ${orderText(order)}`).join('\n');
  const summaryLines = summary.map(([label, count]) => `${count}x ${label}`).join('\n');
  const message = `Helferessen ${event.tagLabel}\n\nBestellung:\n${summaryLines}\n\nEintraege:\n${orderLines}`;
  els.whatsappSummary.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  els.whatsappSummary.classList.remove('hidden');
}

els.eventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const created = await fetchJson(`${API_BASE}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagLabel: els.tagLabel.value.trim(),
        eventDate: els.eventDate.value,
        mainEnabled: els.mainEnabled.checked,
        iceEnabled: els.iceEnabled.checked
      })
    });
    els.createStatus.textContent = 'Planung erstellt.';
    els.eventForm.reset();
    els.mainEnabled.checked = true;
    await loadEvents();
    await selectEvent(created.id);
  } catch (err) {
    els.createStatus.textContent = err.message;
  }
});

els.reloadEvents.addEventListener('click', loadEvents);

els.eventList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-select-event]');
  if (!button) return;
  await selectEvent(Number(button.dataset.selectEvent));
});

loadEvents().catch((err) => {
  els.createStatus.textContent = `Fehler: ${err.message}`;
});
