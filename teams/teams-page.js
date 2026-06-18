const API_BASE = (window.API_URL_TEAMS || '/teams/api').replace(/\/$/, '');

let teams = [];
let currentAlphaFilter = '';

const els = {
  importBtn: document.getElementById('importBtn'),
  importMessage: document.getElementById('importMessage'),
  importConfigForm: document.getElementById('importConfigForm'),
  reloadConfig: document.getElementById('reloadConfig'),
  spreadsheetId: document.getElementById('spreadsheetId'),
  sheetName: document.getElementById('sheetName'),
  sheetNameTop: document.getElementById('sheetNameTop'),
  startRow: document.getElementById('startRow'),
  endRow: document.getElementById('endRow'),
  importStatusTop: document.getElementById('importStatusTop'),
  teamCount: document.getElementById('teamCount'),
  angemeldetCount: document.getElementById('angemeldetCount'),
  waitlistCount: document.getElementById('waitlistCount'),
  paidWaitlistCount: document.getElementById('paidWaitlistCount'),
  paidCount: document.getElementById('paidCount'),
  nextReplacementHero: document.getElementById('nextReplacementHero'),
  nextReplacementDetail: document.getElementById('nextReplacementDetail'),
  cancelTeamSelect: document.getElementById('cancelTeamSelect'),
  replacementTeamSelect: document.getElementById('replacementTeamSelect'),
  managementForm: document.getElementById('managementForm'),
  managementMessage: document.getElementById('managementMessage'),
  search: document.getElementById('search'),
  statusFilter: document.getElementById('statusFilter'),
  paymentFilter: document.getElementById('paymentFilter'),
  levelFilter: document.getElementById('levelFilter'),
  alphaFilter: document.getElementById('alphaFilter'),
  teamTableBody: document.querySelector('#teamTable tbody'),
  waitlistTableBody: document.querySelector('#waitlistTable tbody')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function statusLabel(status) {
  const labels = {
    neutral: 'Offen',
    offen: 'Offen',
    angemeldet: 'Angemeldet',
    abgemeldet: 'Abgemeldet',
    rueckgabe: 'Rueckgabe',
    nachruecker: 'Offen',
    angefragt: 'Angefragt',
    positive: 'Positive Rueckmeldung'
  };
  return labels[status] || status || 'Offen';
}

function isPaid(team) {
  return Number(team.bezahlt) === 1 || team.bezahlt === true;
}

function isWaitlist(team) {
  return Number(team.warteliste) === 1 || team.status === 'nachruecker';
}

function firstName(team) {
  const imported = String(team.melder_vorname || '').trim();
  if (imported) return imported;

  return String(team.anmelder || '')
    .replace(/^(hallo|hi|liebe|lieber|frau|herr)\s+/i, '')
    .replace(/[,\.;:].*$/, '')
    .trim()
    .split(/\s+/)[0] || 'zusammen';
}

function teamOptionLabel(team) {
  const marker = team.original_nummer || (isWaitlist(team) ? 'NR' : team.id);
  const paid = isPaid(team) ? 'bezahlt' : 'offen';
  return `${marker} - ${team.name} (${paid})`;
}

function phoneDisplay(team) {
  return String(team.telefon || '').trim();
}

function whatsappNumber(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `49${digits.slice(1)}`;
  return digits;
}

function whatsappUrl(team, body) {
  const number = whatsappNumber(team.telefon);
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}

function bankDetails(team) {
  return `\n\nFalls ihr noch nicht ueberwiesen habt, hier unsere Bankdaten:\nTSV RW Auerbach - Abt Volleyball\nVolksbank Darmstadt Mainz eG. BIC: MVBMDE55\nIBAN: DE31 5519 0000 0055 6431 18\nStichwort: BVT2026 - ${team.name}`;
}

function paymentAmount(team) {
  const match = String(team.bezahlstatus || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? `${match[0].replace('.', ',')} EUR` : '';
}

function getImportConfigFromForm() {
  return {
    spreadsheetId: els.spreadsheetId.value.trim(),
    sheetName: els.sheetName.value.trim(),
    startRow: Number(els.startRow.value || 3),
    endRow: els.endRow.value.trim()
  };
}

function setImportConfigForm(config) {
  els.spreadsheetId.value = config.spreadsheetId || '';
  els.sheetName.value = config.sheetName || 'Anmeldungen 2026';
  els.startRow.value = config.startRow || 3;
  els.endRow.value = config.endRow || '';
  els.sheetNameTop.textContent = config.sheetName || 'Anmeldungen 2026';
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || response.statusText);
  }
  return data;
}

async function loadImportConfig() {
  const config = await fetchJson(`${API_BASE}/import-config`);
  setImportConfigForm(config);
}

async function saveImportConfig() {
  const result = await fetchJson(`${API_BASE}/import-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getImportConfigFromForm())
  });
  setImportConfigForm(result.config);
  els.importMessage.textContent = 'Konfiguration gespeichert.';
}

async function runImport() {
  const ok = confirm('Achtung: Der Import ueberschreibt alle bestehenden Team-Daten. Fortfahren?');
  if (!ok) return;

  els.importBtn.disabled = true;
  els.importStatusTop.textContent = 'Import laeuft';
  els.importMessage.textContent = 'Import laeuft... bitte warten.';

  try {
    const data = await fetchJson(`${API_BASE}/import-teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: getImportConfigFromForm(), saveConfig: true })
    });
    els.importMessage.textContent = `Import erfolgreich: ${data.result?.importedRows || 0} Zeilen gelesen.`;
    els.importStatusTop.textContent = 'importiert';
    await loadTeams();
  } catch (err) {
    console.error(err);
    els.importMessage.textContent = `Import fehlgeschlagen: ${err.message}`;
    els.importStatusTop.textContent = 'Fehler';
  } finally {
    els.importBtn.disabled = false;
  }
}

async function loadTeams() {
  teams = await fetchJson(`${API_BASE}/teams`);
  renderAlphaButtons();
  renderLevelFilter();
  renderManagementOptions();
  renderTeams();
  renderWaitlist();
  updateStats();
}

function renderLevelFilter() {
  const levels = [...new Set(teams
    .map((team) => String(team.level || '').trim())
    .filter((level) => level && level !== 'nicht angegeben'))]
    .sort((a, b) => a.localeCompare(b, 'de'));
  const current = els.levelFilter.value;

  els.levelFilter.innerHTML = '<option value="">Alle Level</option>' + levels.map((level) => (
    `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`
  )).join('');

  if (levels.includes(current)) {
    els.levelFilter.value = current;
  }
}

function getReplacementCandidates() {
  return teams
    .filter((team) => isWaitlist(team) && team.status !== 'abgemeldet' && team.status !== 'angemeldet')
    .sort((a, b) => Number(a.sheet_row || a.id) - Number(b.sheet_row || b.id));
}

function renderManagementOptions() {
  const activeTeams = teams
    .filter((team) => team.status !== 'abgemeldet' && !isWaitlist(team))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'));
  const replacements = getReplacementCandidates();

  els.cancelTeamSelect.innerHTML = activeTeams.map((team) => (
    `<option value="${team.id}">${escapeHtml(teamOptionLabel(team))}</option>`
  )).join('');

  els.replacementTeamSelect.innerHTML = '<option value="">Keinen Nachruecker fest eintragen</option>' + replacements.map((team, index) => (
    `<option value="${team.id}" ${index === 0 ? 'selected' : ''}>${escapeHtml(teamOptionLabel(team))}</option>`
  )).join('');

  const next = replacements.find(isPaid) || replacements[0];
  if (next) {
    els.nextReplacementHero.textContent = next.name;
    els.nextReplacementDetail.textContent = `${next.anmelder || 'Melder unbekannt'} - ${isPaid(next) ? 'bezahlt' : 'Zahlung offen'}`;
  } else {
    els.nextReplacementHero.textContent = 'kein Nachruecker';
    els.nextReplacementDetail.textContent = 'Bitte Warteliste in Spalte A pruefen.';
  }
}

function renderAlphaButtons() {
  const letters = ['Alle', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  els.alphaFilter.innerHTML = letters.map((letter) => {
    const value = letter === 'Alle' ? '' : letter;
    const active = currentAlphaFilter === value ? ' active' : '';
    return `<button type="button" class="${active}" data-letter="${value}">${letter}</button>`;
  }).join('');
}

function getFilteredTeams() {
  const search = normalize(els.search.value);
  const status = els.statusFilter.value;
  const payment = els.paymentFilter.value;
  const level = els.levelFilter.value;

  return teams.filter((team) => {
    if (isWaitlist(team)) return false;
    const haystack = normalize(`${team.name} ${team.anmelder} ${team.email} ${team.telefon} ${team.level} ${team.bezahlstatus}`);
    if (currentAlphaFilter && !normalize(team.name).startsWith(normalize(currentAlphaFilter))) return false;
    if (search && !haystack.includes(search)) return false;
    if (status && (team.status || 'offen') !== status) return false;
    if (payment === 'paid' && !isPaid(team)) return false;
    if (payment === 'open' && isPaid(team)) return false;
    if (level && String(team.level || '') !== level) return false;
    return true;
  });
}

function renderTeams() {
  const filtered = getFilteredTeams();
  els.teamTableBody.innerHTML = filtered.map((team) => {
    const status = team.status || 'offen';
    const paidClass = isPaid(team) ? 'paid' : 'open';
    const paidLabel = isPaid(team) ? 'Bezahlt' : 'Offen';
    const amount = paymentAmount(team);

    return `
      <tr class="${escapeHtml(status)}">
        <td>${escapeHtml(team.original_nummer || team.id || '')}</td>
        <td>
          <div class="team-name">
            <strong>${escapeHtml(team.name || '')}</strong>
            <small>Zeile ${escapeHtml(team.sheet_row || '-')}</small>
          </div>
        </td>
        <td>${escapeHtml(team.anmelder || '')}</td>
        <td>${escapeHtml(team.email || '')}</td>
        <td>${escapeHtml(phoneDisplay(team) || '-')}</td>
        <td><span class="badge ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></td>
        <td>
          <span class="badge ${paidClass}">${paidLabel}</span>
          ${amount ? `<span class="payment-amount ${paidClass}">${escapeHtml(amount)}</span>` : ''}
          ${!amount && team.bezahlstatus ? `<div class="muted">${escapeHtml(team.bezahlstatus)}</div>` : ''}
        </td>
        <td><span class="level-pill">${escapeHtml(team.level || 'nicht angegeben')}</span></td>
        <td><input class="teilnehmer-input" type="number" min="0" value="${Number(team.teilnehmerzahl || 0)}" data-team-id="${team.id}"></td>
      </tr>
    `;
  }).join('');
}

function renderWaitlist() {
  const waitlist = teams
    .filter(isWaitlist)
    .sort((a, b) => Number(a.sheet_row || a.id) - Number(b.sheet_row || b.id));

  els.waitlistTableBody.innerHTML = waitlist.map((team) => {
    const paidClass = isPaid(team) ? 'paid' : 'open';
    const paidLabel = isPaid(team) ? 'Bezahlt' : 'Offen';
    const amount = paymentAmount(team);
    const draft = standbyDraft(team);
    const whatsApp = whatsappUrl(team, draft.body);
    const status = team.status || 'offen';

    return `
      <tr class="${escapeHtml(status)}">
        <td>${escapeHtml(team.original_nummer || '')}</td>
        <td>
          <div class="team-name">
            <strong>${escapeHtml(team.name || '')}</strong>
            <small>Zeile ${escapeHtml(team.sheet_row || '-')}</small>
          </div>
        </td>
        <td>${escapeHtml(team.anmelder || '')}</td>
        <td>
          <div>${escapeHtml(phoneDisplay(team) || '-')}</div>
          ${whatsApp ? `<a class="mini-link" href="${escapeHtml(whatsApp)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </td>
        <td>
          <span class="badge ${paidClass}">${paidLabel}</span>
          ${amount ? `<span class="payment-amount ${paidClass}">${escapeHtml(amount)}</span>` : ''}
          ${!amount && team.bezahlstatus ? `<div class="muted">${escapeHtml(team.bezahlstatus)}</div>` : ''}
        </td>
        <td>
          <select class="waitlist-status" data-waitlist-status-id="${team.id}">
            <option value="offen" ${status === 'offen' || status === 'nachruecker' ? 'selected' : ''}>Offen</option>
            <option value="angefragt" ${status === 'angefragt' ? 'selected' : ''}>Angefragt</option>
            <option value="positive" ${status === 'positive' ? 'selected' : ''}>Positive Rueckmeldung</option>
            <option value="abgemeldet" ${status === 'abgemeldet' ? 'selected' : ''}>Abgemeldet</option>
          </select>
        </td>
        <td><button type="button" class="ghost-button compact-button" data-standby-team="${team.id}">Anfragen</button></td>
      </tr>
    `;
  }).join('');
}

function updateStats() {
  const filtered = getFilteredTeams();
  const waitlist = teams.filter(isWaitlist);
  els.teamCount.textContent = filtered.length;
  els.angemeldetCount.textContent = filtered.filter((team) => team.status === 'angemeldet').length;
  els.waitlistCount.textContent = waitlist.length;
  els.paidWaitlistCount.textContent = waitlist.filter(isPaid).length;
  els.paidCount.textContent = filtered.filter(isPaid).length;
}

async function updateTeilnehmer(id, value) {
  await fetchJson(`${API_BASE}/teams/${id}/teilnehmer`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teilnehmerzahl: Number(value || 0) })
  });

  const team = teams.find((item) => Number(item.id) === Number(id));
  if (team) team.teilnehmerzahl = Number(value || 0);
  updateStats();
}

async function updateWaitlistStatus(id, status) {
  await fetchJson(`${API_BASE}/teams/${id}/waitlist-status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  const team = teams.find((item) => Number(item.id) === Number(id));
  if (team) team.status = status;
  renderManagementOptions();
  updateStats();
}

function buildMailto({ to, subject, body }) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(to || '')}?${params.toString()}`;
}

function cancellationDraft(team) {
  const paidText = isPaid(team)
    ? '\nFalls ihr bereits bezahlt habt, planen wir die Rueckueberweisung gesammelt nach dem Turnier ein. Bitte meldet euch, falls wir dafuer andere Kontodaten nutzen sollen.\n'
    : '\nDa bei uns aktuell keine Zahlung als bezahlt markiert ist, ist von eurer Seite nichts Weiteres offen.\n';

  return {
    to: team.email,
    subject: `Abmeldung BVT 2026 - ${team.name}`,
    body: `Hallo ${firstName(team)},\n\nschade, dass ihr beim Bergstraesser Volleyballturnier 2026 nicht dabei sein koennt. Wir haben eure Abmeldung fuer "${team.name}" notiert.${paidText}\nDanke, dass ihr uns Bescheid gegeben habt. So koennen wir den Platz fair an ein Nachruecker-Team weitergeben.\n\nViele Gruesse\nDominik\nBVT Orga`
  };
}

function replacementDraft(team) {
  const paymentText = isPaid(team)
    ? 'Eure Zahlung ist bei uns bereits als bezahlt markiert.'
    : `Da bei uns noch keine Zahlung als bezahlt markiert ist, brauchen wir nach eurer Zusage noch die Ueberweisung.${bankDetails(team)}`;

  return {
    to: team.email,
    subject: `Freier Startplatz beim BVT 2026 - ${team.name}`,
    body: `Hallo ${firstName(team)},\n\nGute Nachrichten: Beim Bergstraesser Volleyballturnier 2026 ist ein Startplatz frei geworden und ihr seid als Nachruecker-Team an der Reihe.\n\nBitte gebt mir kurz Bescheid, ob ihr den Platz annehmen koennt. Sobald ihr bestaetigt, tragen wir euch fest ein.\n\n${paymentText}\n\nViele Gruesse\nDominik\nBVT Orga`
  };
}

function standbyDraft(team) {
  const paymentText = isPaid(team) ? '' : bankDetails(team);

  return {
    to: team.email,
    subject: `BVT 2026 Warteliste - seid ihr noch am Start?`,
    body: `Hi ${firstName(team)},\n\nihr seid die naechsten auf der Warteliste beim Bergstraesser Volleyballturnier. Seid ihr noch am Start, sobald etwas frei wird? Aktuell kommen immer mal wieder ein paar Abmeldungen rein.${paymentText}\n\nViele Gruesse\nDominik`
  };
}

function openDraft(draft) {
  window.location.href = buildMailto(draft);
}

function openDrafts(drafts) {
  drafts.forEach((draft, index) => {
    window.setTimeout(() => openDraft(draft), index * 700);
  });
}

async function processCancellation(event) {
  event.preventDefault();
  const cancelTeamId = Number(els.cancelTeamSelect.value);
  const replacementTeamId = Number(els.replacementTeamSelect.value || 0);
  const cancelTeam = teams.find((team) => Number(team.id) === cancelTeamId);
  const replacementTeam = teams.find((team) => Number(team.id) === replacementTeamId);

  if (!cancelTeam) {
    els.managementMessage.textContent = 'Bitte ein abzumeldendes Team auswaehlen.';
    return;
  }

  const ok = confirm(`Team "${cancelTeam.name}" abmelden${replacementTeam ? ` und "${replacementTeam.name}" nachruecken lassen` : ''}?`);
  if (!ok) return;

  try {
    await fetchJson(`${API_BASE}/teams/management/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelTeamId, replacementTeamId: replacementTeamId || null })
    });

    const drafts = [cancellationDraft(cancelTeam)];
    if (replacementTeam) drafts.push(replacementDraft(replacementTeam));
    openDrafts(drafts);

    els.managementMessage.textContent = 'Abmeldung gespeichert. Mailentwuerfe wurden geoeffnet.';
    await loadTeams();
  } catch (err) {
    console.error(err);
    els.managementMessage.textContent = `Abmeldung fehlgeschlagen: ${err.message}`;
  }
}

els.importConfigForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await saveImportConfig();
  } catch (err) {
    els.importMessage.textContent = `Speichern fehlgeschlagen: ${err.message}`;
  }
});

els.reloadConfig.addEventListener('click', async () => {
  await loadImportConfig();
  els.importMessage.textContent = 'Konfiguration neu geladen.';
});

els.importBtn.addEventListener('click', runImport);
els.managementForm.addEventListener('submit', processCancellation);

els.alphaFilter.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-letter]');
  if (!button) return;
  currentAlphaFilter = button.dataset.letter;
  renderAlphaButtons();
  renderTeams();
  renderWaitlist();
  updateStats();
});

[els.search, els.statusFilter, els.paymentFilter, els.levelFilter].forEach((input) => {
  input.addEventListener('input', () => {
    renderTeams();
    renderWaitlist();
    updateStats();
  });
});

els.teamTableBody.addEventListener('change', async (event) => {
  const input = event.target.closest('input[data-team-id]');
  if (!input) return;

  try {
    await updateTeilnehmer(input.dataset.teamId, input.value);
  } catch (err) {
    alert(`Teilnehmerzahl konnte nicht gespeichert werden: ${err.message}`);
  }
});

els.waitlistTableBody.addEventListener('change', async (event) => {
  const select = event.target.closest('select[data-waitlist-status-id]');
  if (!select) return;

  try {
    await updateWaitlistStatus(select.dataset.waitlistStatusId, select.value);
  } catch (err) {
    alert(`Nachruecker-Status konnte nicht gespeichert werden: ${err.message}`);
  }
});

els.waitlistTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-standby-team]');
  if (!button) return;

  const team = teams.find((item) => Number(item.id) === Number(button.dataset.standbyTeam));
  if (!team) return;

  openDraft(standbyDraft(team));
});

(async function init() {
  try {
    await loadImportConfig();
  } catch (err) {
    els.importMessage.textContent = `Konfiguration konnte nicht geladen werden: ${err.message}`;
  }

  try {
    await loadTeams();
  } catch (err) {
    console.error(err);
    els.importStatusTop.textContent = 'offline';
    els.nextReplacementHero.textContent = 'Server nicht erreichbar';
    els.nextReplacementDetail.textContent = err.message;
  }
}());
