const API_BASE = (window.API_URL_TEAMS || '/teams/api').replace(/\/$/, '');

let teams = [];
let currentAlphaFilter = '';
let preparedDrafts = [];

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
  teilnehmerCount: document.getElementById('teilnehmerCount'),
  nextReplacementHero: document.getElementById('nextReplacementHero'),
  nextReplacementDetail: document.getElementById('nextReplacementDetail'),
  cancelTeamSelect: document.getElementById('cancelTeamSelect'),
  replacementTeamSelect: document.getElementById('replacementTeamSelect'),
  standbyCount: document.getElementById('standbyCount'),
  managementForm: document.getElementById('managementForm'),
  managementMessage: document.getElementById('managementMessage'),
  prepareStandbyMails: document.getElementById('prepareStandbyMails'),
  search: document.getElementById('search'),
  statusFilter: document.getElementById('statusFilter'),
  paymentFilter: document.getElementById('paymentFilter'),
  alphaFilter: document.getElementById('alphaFilter'),
  teamTableBody: document.querySelector('#teamTable tbody'),
  mailPreviewList: document.getElementById('mailPreviewList'),
  openAllDrafts: document.getElementById('openAllDrafts')
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
    neutral: 'Neutral',
    angemeldet: 'Angemeldet',
    abgemeldet: 'Abgemeldet',
    nachruecker: 'Nachruecker'
  };
  return labels[status] || status || 'Neutral';
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
  const marker = isWaitlist(team) ? 'NR' : (team.original_nummer || team.id);
  const paid = isPaid(team) ? 'bezahlt' : 'offen';
  return `${marker} - ${team.name} (${paid})`;
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
  renderManagementOptions();
  renderTeams();
  updateStats();
}

function getReplacementCandidates() {
  return teams
    .filter((team) => isWaitlist(team) && isPaid(team) && team.status !== 'abgemeldet' && team.status !== 'angemeldet')
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

  const next = replacements[0];
  if (next) {
    els.nextReplacementHero.textContent = next.name;
    els.nextReplacementDetail.textContent = `${next.anmelder || 'Melder unbekannt'} - ${next.bezahlstatus || 'bezahlt'}`;
  } else {
    els.nextReplacementHero.textContent = 'kein bezahlter Nachruecker';
    els.nextReplacementDetail.textContent = 'Bitte Zahlungsstatus in Spalte W pruefen.';
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

  return teams.filter((team) => {
    const haystack = normalize(`${team.name} ${team.anmelder} ${team.email} ${team.level} ${team.bezahlstatus}`);
    if (currentAlphaFilter && !normalize(team.name).startsWith(normalize(currentAlphaFilter))) return false;
    if (search && !haystack.includes(search)) return false;
    if (status && (team.status || 'neutral') !== status) return false;
    if (payment === 'paid' && !isPaid(team)) return false;
    if (payment === 'open' && isPaid(team)) return false;
    return true;
  });
}

function renderTeams() {
  const filtered = getFilteredTeams();
  els.teamTableBody.innerHTML = filtered.map((team) => {
    const status = team.status || 'neutral';
    const paidClass = isPaid(team) ? 'paid' : 'open';
    const paidLabel = isPaid(team) ? 'Bezahlt' : 'Offen';

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
        <td><span class="badge ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></td>
        <td>
          <span class="badge ${paidClass}">${paidLabel}</span>
          <div class="muted">${escapeHtml(team.bezahlstatus || '')}</div>
        </td>
        <td><span class="level-pill">${escapeHtml(team.level || 'nicht angegeben')}</span></td>
        <td><input class="teilnehmer-input" type="number" min="0" value="${Number(team.teilnehmerzahl || 0)}" data-team-id="${team.id}"></td>
      </tr>
    `;
  }).join('');
}

function updateStats() {
  const filtered = getFilteredTeams();
  const waitlist = filtered.filter(isWaitlist);
  els.teamCount.textContent = filtered.length;
  els.angemeldetCount.textContent = filtered.filter((team) => team.status === 'angemeldet').length;
  els.waitlistCount.textContent = waitlist.length;
  els.paidWaitlistCount.textContent = waitlist.filter(isPaid).length;
  els.paidCount.textContent = filtered.filter(isPaid).length;
  els.teilnehmerCount.textContent = filtered.reduce((sum, team) => sum + Number(team.teilnehmerzahl || 0), 0);
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
  return {
    to: team.email,
    subject: `Freier Startplatz beim BVT 2026 - ${team.name}`,
    body: `Hallo ${firstName(team)},\n\nGute Nachrichten: Beim Bergstraesser Volleyballturnier 2026 ist ein Startplatz frei geworden und ihr seid als naechstes bezahltes Nachruecker-Team an der Reihe.\n\nBitte gebt uns kurz Bescheid, ob ihr den Platz annehmen koennt. Sobald ihr bestaetigt, tragen wir euch fest ein.\n\nViele Gruesse\nDominik\nBVT Orga`
  };
}

function standbyDraft(team) {
  return {
    to: team.email,
    subject: `BVT 2026 Warteliste - seid ihr weiterhin bereit?`,
    body: `Hallo ${firstName(team)},\n\nwir klaeren aktuell die naechsten Nachrueckerplaetze fuer das Bergstraesser Volleyballturnier 2026.\n\nKoennt ihr bitte kurz antworten, ob ihr weiterhin kurzfristig bereit steht, falls ein weiterer Startplatz frei wird? Diese Mail ist noch keine feste Zusage, hilft uns aber sehr bei der Planung.\n\nViele Gruesse\nDominik\nBVT Orga`
  };
}

function renderMailPreviews(drafts) {
  preparedDrafts = drafts;
  els.openAllDrafts.classList.toggle('hidden', drafts.length === 0);

  if (!drafts.length) {
    els.mailPreviewList.innerHTML = '<div class="empty-state">Noch keine Mail vorbereitet.</div>';
    return;
  }

  els.mailPreviewList.innerHTML = drafts.map((draft, index) => `
    <article class="mail-card">
      <h3>${escapeHtml(draft.subject)}</h3>
      <div class="muted">An: ${escapeHtml(draft.to || 'keine E-Mail hinterlegt')}</div>
      <pre>${escapeHtml(draft.body)}</pre>
      <div class="mail-actions">
        <a class="primary-button" href="${escapeHtml(buildMailto(draft))}">Entwurf oeffnen</a>
        <button type="button" class="ghost-button" data-open-draft="${index}">Vorschau erneut oeffnen</button>
      </div>
    </article>
  `).join('');
}

function openDraft(draft) {
  window.location.href = buildMailto(draft);
}

function openAllDrafts() {
  preparedDrafts.forEach((draft, index) => {
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
    renderMailPreviews(drafts);
    openAllDrafts();

    els.managementMessage.textContent = 'Abmeldung gespeichert. Mailentwuerfe wurden vorbereitet.';
    await loadTeams();
  } catch (err) {
    console.error(err);
    els.managementMessage.textContent = `Abmeldung fehlgeschlagen: ${err.message}`;
  }
}

function prepareStandbyMails() {
  const count = Math.max(1, Number(els.standbyCount.value || 1));
  const excluded = Number(els.replacementTeamSelect.value || 0);
  const candidates = getReplacementCandidates()
    .filter((team) => Number(team.id) !== excluded)
    .slice(0, count);

  renderMailPreviews(candidates.map(standbyDraft));
  if (candidates.length) {
    openAllDrafts();
    els.managementMessage.textContent = `${candidates.length} Bereitschaftsmail(s) vorbereitet.`;
  } else {
    els.managementMessage.textContent = 'Keine bezahlten Nachruecker fuer Bereitschaftsmails gefunden.';
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
els.prepareStandbyMails.addEventListener('click', prepareStandbyMails);
els.openAllDrafts.addEventListener('click', openAllDrafts);

els.alphaFilter.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-letter]');
  if (!button) return;
  currentAlphaFilter = button.dataset.letter;
  renderAlphaButtons();
  renderTeams();
  updateStats();
});

[els.search, els.statusFilter, els.paymentFilter].forEach((input) => {
  input.addEventListener('input', () => {
    renderTeams();
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

els.mailPreviewList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-open-draft]');
  if (!button) return;
  openDraft(preparedDrafts[Number(button.dataset.openDraft)]);
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
