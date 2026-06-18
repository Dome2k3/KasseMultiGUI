const API_BASE = (window.API_URL_HELFERESSEN || `${window.location.origin}/HelferessenBestellung/api`).replace(/\/$/, '');
const params = new URLSearchParams(window.location.search);
const eventId = params.get('event');

let currentEvent = null;

const els = {
  pageTitle: document.getElementById('pageTitle'),
  orderForm: document.getElementById('orderForm'),
  nameInput: document.getElementById('nameInput'),
  mainChoiceWrap: document.getElementById('mainChoiceWrap'),
  doenerOptions: document.getElementById('doenerOptions'),
  withoutOnions: document.getElementById('withoutOnions'),
  falafel: document.getElementById('falafel'),
  iceWrap: document.getElementById('iceWrap'),
  wantsIce: document.getElementById('wantsIce'),
  formStatus: document.getElementById('formStatus'),
  reloadOrders: document.getElementById('reloadOrders'),
  orderList: document.getElementById('orderList')
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

function selectedMainChoice() {
  const checked = document.querySelector('input[name="mainChoice"]:checked');
  return checked ? checked.value : '';
}

function labelMain(choice) {
  const labels = {
    salami: 'Salami',
    schinken: 'Schinken',
    vegetarisch: 'Vegetarisch',
    pizzadoener: 'Pizzadoener',
    doener: 'Doener'
  };
  return labels[choice] || '';
}

function orderText(order) {
  const parts = [];
  if (order.mainChoice) parts.push(labelMain(order.mainChoice));
  if (order.mainChoice === 'doener' && order.doenerOhneZwiebeln) parts.push('ohne Zwiebeln');
  if (order.mainChoice === 'doener' && order.doenerFalafel) parts.push('Falafel');
  if (order.wantsIce) parts.push('Eis');
  return parts.join(', ') || 'Keine Auswahl';
}

function updateConditionalFields() {
  const mainChoice = selectedMainChoice();
  els.doenerOptions.classList.toggle('visible', mainChoice === 'doener');
  if (mainChoice !== 'doener') {
    els.withoutOnions.checked = false;
    els.falafel.checked = false;
  }
}

function renderEvent(event) {
  currentEvent = event;
  els.pageTitle.textContent = event.tagLabel;
  els.mainChoiceWrap.classList.toggle('hidden', !event.mainEnabled);
  els.iceWrap.classList.toggle('hidden', !event.iceEnabled);
}

function renderOrders(orders) {
  if (!orders.length) {
    els.orderList.innerHTML = '<div class="muted">Noch keine Eintraege vorhanden.</div>';
    return;
  }

  els.orderList.innerHTML = orders.map((order) => `
    <article class="order-item">
      <div class="order-head">
        <strong>${escapeHtml(order.name)}</strong>
        <button class="delete-button" type="button" data-delete-order="${order.id}" aria-label="Eintrag loeschen">X</button>
      </div>
      <div class="muted">${escapeHtml(orderText(order))}</div>
    </article>
  `).join('');
}

async function loadData() {
  if (!eventId) {
    els.pageTitle.textContent = 'Kein Tag ausgewaehlt';
    els.formStatus.textContent = 'Der QR-Link ist unvollstaendig.';
    return;
  }

  const data = await fetchJson(`${API_BASE}/events/${eventId}/orders`);
  renderEvent(data.event);
  renderOrders(data.orders);
}

els.orderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await fetchJson(`${API_BASE}/events/${eventId}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: els.nameInput.value.trim(),
        mainChoice: selectedMainChoice(),
        doenerOhneZwiebeln: els.withoutOnions.checked,
        doenerFalafel: els.falafel.checked,
        wantsIce: els.wantsIce.checked
      })
    });

    els.formStatus.textContent = 'Eintrag gespeichert.';
    els.nameInput.value = '';
    document.querySelectorAll('input[name="mainChoice"]').forEach((input) => {
      input.checked = false;
    });
    els.withoutOnions.checked = false;
    els.falafel.checked = false;
    els.wantsIce.checked = false;
    updateConditionalFields();
    await loadData();
    els.nameInput.focus();
  } catch (err) {
    els.formStatus.textContent = err.message;
  }
});

document.querySelectorAll('input[name="mainChoice"]').forEach((input) => {
  input.addEventListener('change', updateConditionalFields);
});

els.reloadOrders.addEventListener('click', loadData);

els.orderList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-delete-order]');
  if (!button) return;
  const ok = confirm('Diesen Eintrag wirklich loeschen?');
  if (!ok) return;

  try {
    await fetchJson(`${API_BASE}/orders/${button.dataset.deleteOrder}`, { method: 'DELETE' });
    await loadData();
  } catch (err) {
    alert(`Loeschen fehlgeschlagen: ${err.message}`);
  }
});

loadData().catch((err) => {
  els.formStatus.textContent = `Fehler: ${err.message}`;
});
