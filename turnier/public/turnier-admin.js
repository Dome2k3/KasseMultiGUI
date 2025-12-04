// turnier-admin.js - Tournament Admin Frontend Logic

// API Base URL - will be set from config.js or default
const API_BASE = window.API_URL_TURNIER;

// State
let currentTurnierId = null;
let turniere = [];
let teams = [];
let spiele = [];
let phasen = [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    loadTurniere();
    createToastContainer();
});

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function createToastContainer() {
    if (!document.querySelector('.toast-container')) {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
}

function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE');
}

function formatTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('de-DE');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modals on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Close modals on ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// ==========================================
// TOURNAMENT MANAGEMENT
// ==========================================

async function loadTurniere() {
    try {
        const res = await fetch(`${API_BASE}/api/turniere`);
        turniere = await res.json();

        const select = document.getElementById('turnier-select');
        select.innerHTML = '<option value="">-- Turnier wählen --</option>';

        turniere.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = `${t.turnier_name} (${formatDate(t.turnier_datum)})`;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Error loading tournaments:', err);
        showToast('Fehler beim Laden der Turniere', 'error');
    }
}

async function loadTurnier() {
    const select = document.getElementById('turnier-select');
    currentTurnierId = select.value;

    if (!currentTurnierId) {
        document.getElementById('turnier-details').style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}`);
        const turnier = await res.json();

        // Fill config fields
        document.getElementById('config-name').value = turnier.turnier_name || '';
        document.getElementById('config-datum').value = turnier.turnier_datum ? turnier.turnier_datum.split('T')[0] : '';
        document.getElementById('config-teams').value = turnier.anzahl_teams || 32;
        document.getElementById('config-felder').value = turnier.anzahl_felder || 4;
        document.getElementById('config-spielzeit').value = turnier.spielzeit_minuten || 15;
        document.getElementById('config-pause').value = turnier.pause_minuten || 5;
        document.getElementById('config-startzeit').value = turnier.startzeit || '09:00';
        document.getElementById('config-endzeit').value = turnier.endzeit || '18:00';
        document.getElementById('config-modus').value = turnier.modus || 'seeded';
        document.getElementById('config-email').checked = turnier.email_benachrichtigung;

        document.getElementById('turnier-details').style.display = 'block';

        // Load related data
        await Promise.all([
            loadTeams(),
            loadPhasen(),
            loadSpiele(),
            loadMeldungen()
        ]);
    } catch (err) {
        console.error('Error loading tournament:', err);
        showToast('Fehler beim Laden des Turniers', 'error');
    }
}

function showNewTurnierModal() {
    document.getElementById('new-turnier-name').value = '';
    document.getElementById('new-turnier-datum').value = '';
    document.getElementById('new-turnier-teams').value = '32';
    document.getElementById('new-turnier-felder').value = '4';
    openModal('new-turnier-modal');
}

async function createTurnier() {
    const name = document.getElementById('new-turnier-name').value.trim();
    const datum = document.getElementById('new-turnier-datum').value;
    const anzahlTeams = parseInt(document.getElementById('new-turnier-teams').value, 10);
    const anzahlFelder = parseInt(document.getElementById('new-turnier-felder').value, 10);

    if (!name || !datum) {
        showToast('Name und Datum sind erforderlich', 'warning');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/turniere`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                turnier_name: name,
                turnier_datum: datum,
                anzahl_teams: anzahlTeams,
                anzahl_felder: anzahlFelder
            })
        });

        const data = await res.json();

        if (data.success) {
            showToast('Turnier erstellt!', 'success');
            closeModal('new-turnier-modal');
            await loadTurniere();

            // Select the new tournament
            document.getElementById('turnier-select').value = data.id;
            await loadTurnier();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error creating tournament:', err);
        showToast('Fehler beim Erstellen', 'error');
    }
}

async function saveConfig() {
    if (!currentTurnierId) return;

    const config = {
        turnier_name: document.getElementById('config-name').value.trim(),
        turnier_datum: document.getElementById('config-datum').value,
        anzahl_teams: parseInt(document.getElementById('config-teams').value, 10),
        anzahl_felder: parseInt(document.getElementById('config-felder').value, 10),
        spielzeit_minuten: parseInt(document.getElementById('config-spielzeit').value, 10),
        pause_minuten: parseInt(document.getElementById('config-pause').value, 10),
        startzeit: document.getElementById('config-startzeit').value,
        endzeit: document.getElementById('config-endzeit').value,
        modus: document.getElementById('config-modus').value,
        email_benachrichtigung: document.getElementById('config-email').checked
    };

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const data = await res.json();

        if (data.success) {
            showToast('Konfiguration gespeichert', 'success');
            await loadTurniere();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error saving config:', err);
        showToast('Fehler beim Speichern', 'error');
    }
}

// ==========================================
// TEAMS MANAGEMENT
// ==========================================

async function loadTeams() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams`);
        teams = await res.json();

        updateTeamStats();
        renderTeamsTable();
    } catch (err) {
        console.error('Error loading teams:', err);
    }
}

function updateTeamStats() {
    document.getElementById('team-count').textContent = teams.length;
    document.getElementById('team-angemeldet').textContent = teams.filter(t => t.status === 'angemeldet').length;
    document.getElementById('team-bestaetigt').textContent = teams.filter(t => t.status === 'bestaetigt').length;
}

function renderTeamsTable() {
    const tbody = document.querySelector('#teams-table tbody');
    tbody.innerHTML = '';

    const search = document.getElementById('team-search').value.toLowerCase();
    const klasseFilter = document.getElementById('team-filter-klasse').value;

    const filtered = teams.filter(t => {
        if (klasseFilter && t.klasse !== klasseFilter) return false;
        if (search && !t.team_name.toLowerCase().includes(search) &&
            !(t.ansprechpartner || '').toLowerCase().includes(search) &&
            !(t.verein || '').toLowerCase().includes(search)) return false;
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Keine Teams gefunden</td></tr>';
        return;
    }

    filtered.forEach((team, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${escapeHtml(team.team_name)}</td>
            <td>${escapeHtml(team.ansprechpartner || '-')}</td>
            <td>${escapeHtml(team.email || '-')}</td>
            <td>${escapeHtml(team.verein || '-')}</td>
            <td>${escapeHtml(team.klasse || 'A')}</td>
            <td>${team.setzposition || 0}</td>
            <td><span class="status-badge status-${team.status || 'angemeldet'}">${team.status || 'angemeldet'}</span></td>
            <td class="action-btns">
                <button class="btn btn-small btn-primary" onclick="editTeam(${team.id})">✏️</button>
                <button class="btn btn-small btn-danger" onclick="deleteTeam(${team.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterTeams() {
    renderTeamsTable();
}

function showAddTeamModal() {
    document.getElementById('team-name').value = '';
    document.getElementById('team-ansprechpartner').value = '';
    document.getElementById('team-email').value = '';
    document.getElementById('team-telefon').value = '';
    document.getElementById('team-verein').value = '';
    document.getElementById('team-klasse').value = 'A';
    document.getElementById('team-setzposition').value = '0';
    openModal('add-team-modal');
}

async function addTeam() {
    if (!currentTurnierId) return;

    const teamName = document.getElementById('team-name').value.trim();
    if (!teamName) {
        showToast('Teamname ist erforderlich', 'warning');
        return;
    }

    const team = {
        team_name: teamName,
        ansprechpartner: document.getElementById('team-ansprechpartner').value.trim(),
        email: document.getElementById('team-email').value.trim(),
        telefon: document.getElementById('team-telefon').value.trim(),
        verein: document.getElementById('team-verein').value.trim(),
        klasse: document.getElementById('team-klasse').value,
        setzposition: parseInt(document.getElementById('team-setzposition').value, 10) || 0
    };

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(team)
        });

        const data = await res.json();

        if (data.success) {
            showToast('Team hinzugefügt', 'success');
            closeModal('add-team-modal');
            await loadTeams();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error adding team:', err);
        showToast('Fehler beim Hinzufügen', 'error');
    }
}

async function deleteTeam(teamId) {
    if (!confirm('Team wirklich löschen?')) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams/${teamId}`, {
            method: 'DELETE'
        });

        const data = await res.json();

        if (data.success) {
            showToast('Team gelöscht', 'success');
            await loadTeams();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error deleting team:', err);
        showToast('Fehler beim Löschen', 'error');
    }
}

function showImportTeamsModal() {
    document.getElementById('import-teams-data').value = '';
    openModal('import-teams-modal');
}

async function importTeams() {
    if (!currentTurnierId) return;

    const data = document.getElementById('import-teams-data').value.trim();
    if (!data) {
        showToast('Keine Daten eingegeben', 'warning');
        return;
    }

    const lines = data.split('\n').filter(line => line.trim());
    const teamsToImport = [];

    for (const line of lines) {
        const parts = line.split(';').map(p => p.trim());
        if (parts.length >= 1 && parts[0]) {
            teamsToImport.push({
                team_name: parts[0],
                ansprechpartner: parts[1] || '',
                email: parts[2] || '',
                telefon: parts[3] || '',
                verein: parts[4] || '',
                klasse: parts[5] || 'A',
                setzposition: parseInt(parts[6], 10) || 0
            });
        }
    }

    if (teamsToImport.length === 0) {
        showToast('Keine gültigen Teams gefunden', 'warning');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teams: teamsToImport })
        });

        const result = await res.json();

        if (result.success) {
            showToast(`${result.imported} Teams importiert`, 'success');
            closeModal('import-teams-modal');
            await loadTeams();
        } else {
            showToast('Fehler: ' + (result.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error importing teams:', err);
        showToast('Fehler beim Import', 'error');
    }
}

// ==========================================
// PHASES MANAGEMENT
// ==========================================

async function loadPhasen() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/phasen`);
        phasen = await res.json();

        // Fill phase filter
        const select = document.getElementById('spiele-filter-phase');
        select.innerHTML = '<option value="">Alle Phasen</option>';
        phasen.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.phase_name;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Error loading phases:', err);
    }
}

// ==========================================
// GAMES MANAGEMENT
// ==========================================

async function loadSpiele() {
    if (!currentTurnierId) return;

    try {
        const phaseId = document.getElementById('spiele-filter-phase').value;
        const status = document.getElementById('spiele-filter-status').value;

        let url = `${API_BASE}/api/turniere/${currentTurnierId}/spiele?`;
        if (phaseId) url += `phase_id=${phaseId}&`;
        if (status) url += `status=${status}&`;

        const res = await fetch(url);
        spiele = await res.json();

        renderSpieleTable();
    } catch (err) {
        console.error('Error loading games:', err);
    }
}

function renderSpieleTable() {
    const tbody = document.querySelector('#spiele-table tbody');
    tbody.innerHTML = '';

    const search = document.getElementById('spiele-search').value.toLowerCase();

    const filtered = spiele.filter(s => {
        if (search && !(s.team1_name || '').toLowerCase().includes(search) &&
            !(s.team2_name || '').toLowerCase().includes(search)) return false;
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Keine Spiele gefunden</td></tr>';
        return;
    }

    filtered.forEach(spiel => {
        const tr = document.createElement('tr');

        const team1Class = spiel.gewinner_id === spiel.team1_id ? 'winner' : (spiel.gewinner_id === spiel.team2_id ? 'loser' : '');
        const team2Class = spiel.gewinner_id === spiel.team2_id ? 'winner' : (spiel.gewinner_id === spiel.team1_id ? 'loser' : '');

        tr.innerHTML = `
            <td>${spiel.spiel_nummer}</td>
            <td>${escapeHtml(spiel.phase_name || '-')}</td>
            <td>${spiel.runde}</td>
            <td class="${team1Class}">${escapeHtml(spiel.team1_name || 'TBD')}</td>
            <td>vs</td>
            <td class="${team2Class}">${escapeHtml(spiel.team2_name || 'TBD')}</td>
            <td>${escapeHtml(spiel.feld_name || '-')}</td>
            <td>${formatDateTime(spiel.geplante_zeit)}</td>
            <td>${spiel.ergebnis_team1 !== null ? `${spiel.ergebnis_team1} : ${spiel.ergebnis_team2}` : '-'}</td>
            <td><span class="status-badge status-${spiel.status}">${spiel.status}</span></td>
            <td class="action-btns">
                <button class="btn btn-small btn-primary" onclick="showEditResultModal(${spiel.id})">✏️</button>
                ${spiel.team1_id && spiel.team2_id ? `<button class="btn btn-small btn-info" onclick="sendGameNotification(${spiel.id})">📧</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterSpiele() {
    renderSpieleTable();
}

function showEditResultModal(spielId) {
    const spiel = spiele.find(s => s.id === spielId);
    if (!spiel) return;

    document.getElementById('edit-spiel-id').value = spielId;
    document.getElementById('edit-team1-name').textContent = spiel.team1_name || 'Team 1';
    document.getElementById('edit-team2-name').textContent = spiel.team2_name || 'Team 2';
    document.getElementById('edit-ergebnis-team1').value = spiel.ergebnis_team1 || 0;
    document.getElementById('edit-ergebnis-team2').value = spiel.ergebnis_team2 || 0;
    document.getElementById('edit-satz1-team1').value = spiel.satz1_team1 || '';
    document.getElementById('edit-satz1-team2').value = spiel.satz1_team2 || '';
    document.getElementById('edit-satz2-team1').value = spiel.satz2_team1 || '';
    document.getElementById('edit-satz2-team2').value = spiel.satz2_team2 || '';
    document.getElementById('edit-satz3-team1').value = spiel.satz3_team1 || '';
    document.getElementById('edit-satz3-team2').value = spiel.satz3_team2 || '';
    document.getElementById('edit-bemerkung').value = spiel.bemerkung || '';

    openModal('edit-result-modal');
}

async function saveResult() {
    const spielId = document.getElementById('edit-spiel-id').value;
    if (!spielId || !currentTurnierId) return;

    const result = {
        ergebnis_team1: parseInt(document.getElementById('edit-ergebnis-team1').value, 10) || 0,
        ergebnis_team2: parseInt(document.getElementById('edit-ergebnis-team2').value, 10) || 0,
        satz1_team1: parseInt(document.getElementById('edit-satz1-team1').value, 10) || null,
        satz1_team2: parseInt(document.getElementById('edit-satz1-team2').value, 10) || null,
        satz2_team1: parseInt(document.getElementById('edit-satz2-team1').value, 10) || null,
        satz2_team2: parseInt(document.getElementById('edit-satz2-team2').value, 10) || null,
        satz3_team1: parseInt(document.getElementById('edit-satz3-team1').value, 10) || null,
        satz3_team2: parseInt(document.getElementById('edit-satz3-team2').value, 10) || null,
        bemerkung: document.getElementById('edit-bemerkung').value.trim(),
        bearbeitet_von: 'Admin'
    };

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/spiele/${spielId}/admin-ergebnis`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        });

        const data = await res.json();

        if (data.success) {
            showToast('Ergebnis gespeichert', 'success');
            closeModal('edit-result-modal');
            await loadSpiele();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error saving result:', err);
        showToast('Fehler beim Speichern', 'error');
    }
}

// ==========================================
// PENDING RESULTS (MELDUNGEN)
// ==========================================

async function loadMeldungen() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/meldungen`);
        const meldungen = await res.json();

        const container = document.getElementById('meldungen-container');

        if (meldungen.length === 0) {
            container.innerHTML = '<p class="empty-state">Keine offenen Meldungen</p>';
            return;
        }

        container.innerHTML = meldungen.map(m => `
            <div class="meldung-item">
                <h4>Spiel ${m.spiel_nummer}: ${escapeHtml(m.team1_name || 'TBD')} vs ${escapeHtml(m.team2_name || 'TBD')}</h4>
                <div class="meldung-info">
                    Gemeldet von: ${escapeHtml(m.melder_name || m.gemeldet_von)} | ${formatDateTime(m.created_at)}
                </div>
                <div class="meldung-result">
                    ${m.ergebnis_team1} : ${m.ergebnis_team2}
                </div>
                <div class="meldung-actions">
                    <button class="btn btn-small btn-success" onclick="approveMeldung(${m.id})">✅ Genehmigen</button>
                    <button class="btn btn-small btn-danger" onclick="rejectMeldung(${m.id})">❌ Ablehnen</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading meldungen:', err);
    }
}

async function approveMeldung(meldungId) {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/meldungen/${meldungId}/genehmigen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geprueft_von: 'Admin' })
        });

        const data = await res.json();

        if (data.success) {
            showToast('Ergebnis genehmigt', 'success');
            await loadMeldungen();
            await loadSpiele();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error approving:', err);
        showToast('Fehler beim Genehmigen', 'error');
    }
}

async function rejectMeldung(meldungId) {
    // For simplicity, just mark as rejected (would need backend endpoint)
    showToast('Meldung abgelehnt', 'warning');
    await loadMeldungen();
}

// ==========================================
// TOURNAMENT CONTROL
// ==========================================

async function startTurnier() {
    if (!currentTurnierId) return;

    if (!confirm('Turnier wirklich starten? Die Spiele werden generiert.')) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/starten`, {
            method: 'POST'
        });

        const data = await res.json();

        if (data.success) {
            showToast(`${data.spiele_erstellt} Spiele erstellt!`, 'success');
            await loadSpiele();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error starting tournament:', err);
        showToast('Fehler beim Starten', 'error');
    }
}

async function autoAssignFields() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/felder-zuweisen`, {
            method: 'POST'
        });

        const data = await res.json();

        if (data.success) {
            showToast(`${data.assigned} Spielen Felder zugewiesen`, 'success');
            await loadSpiele();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error assigning fields:', err);
        showToast('Fehler bei Feldzuweisung', 'error');
    }
}

async function calculateRanking() {
    if (!currentTurnierId) return;

    const runde = prompt('Nach welcher Runde soll die Platzierung berechnet werden?', '3');
    if (!runde) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/platzierung-berechnen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nach_runde: parseInt(runde, 10) })
        });

        const data = await res.json();

        if (data.success) {
            showToast(`Platzierung für ${data.teams_ranked} Teams berechnet`, 'success');
            document.getElementById('platzierung-runde').value = runde;
            await loadPlatzierung();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error calculating ranking:', err);
        showToast('Fehler bei Berechnung', 'error');
    }
}

async function calculateFinalRanking() {
    if (!currentTurnierId) return;

    if (!confirm('Endplatzierung berechnen?')) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/endplatzierung-berechnen`, {
            method: 'POST'
        });

        const data = await res.json();

        if (data.success) {
            showToast(`Endplatzierung für ${data.teams_ranked} Teams berechnet`, 'success');
            await loadEndplatzierung();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error calculating final ranking:', err);
        showToast('Fehler bei Berechnung', 'error');
    }
}

async function resetTurnier() {
    if (!currentTurnierId) return;

    if (!confirm('⚠️ ACHTUNG: Alle Spiele und Ergebnisse werden gelöscht! Wirklich fortfahren?')) return;
    if (!confirm('Bist du sicher? Diese Aktion kann nicht rückgängig gemacht werden!')) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/reset`, {
            method: 'POST'
        });

        const data = await res.json();

        if (data.success) {
            showToast('Turnier zurückgesetzt', 'success');
            await loadSpiele();
            await loadMeldungen();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error resetting tournament:', err);
        showToast('Fehler beim Reset', 'error');
    }
}

// ==========================================
// RANKING
// ==========================================

async function loadPlatzierung() {
    if (!currentTurnierId) return;

    const runde = document.getElementById('platzierung-runde').value;
    if (!runde) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/platzierung?nach_runde=${runde}`);
        const platzierung = await res.json();

        renderPlatzierungTable(platzierung);
    } catch (err) {
        console.error('Error loading ranking:', err);
    }
}

async function loadEndplatzierung() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/endplatzierung`);
        const platzierung = await res.json();

        renderPlatzierungTable(platzierung, true);
    } catch (err) {
        console.error('Error loading final ranking:', err);
    }
}

function renderPlatzierungTable(data, isFinal = false) {
    const tbody = document.querySelector('#platzierung-table tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Keine Platzierung verfügbar</td></tr>';
        return;
    }

    data.forEach(row => {
        const tr = document.createElement('tr');
        const platz = isFinal ? row.endplatzierung : row.platzierung;
        tr.innerHTML = `
            <td><strong>${platz}</strong></td>
            <td>${escapeHtml(row.team_name)}</td>
            <td>${escapeHtml(row.verein || '-')}</td>
            <td>${row.siege}</td>
            <td>${row.niederlagen}</td>
            <td>${row.punkte_dafuer}</td>
            <td>${row.punkte_dagegen}</td>
            <td>${row.punkte_dafuer - row.punkte_dagegen}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// EMAIL NOTIFICATIONS
// ==========================================

async function sendGameNotification(spielId) {
    if (!currentTurnierId) return;

    if (!confirm('E-Mail-Benachrichtigung an beide Teams senden?')) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/email/spielankuendigung`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spiel_id: spielId })
        });

        const data = await res.json();

        if (data.success) {
            showToast(`${data.emails_sent} E-Mail(s) gesendet`, 'success');
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error sending notification:', err);
        showToast('Fehler beim E-Mail-Versand', 'error');
    }
}

// Edit team function placeholder
async function editTeam(teamId) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;

    // Use add team modal for editing (could be improved with dedicated modal)
    document.getElementById('team-name').value = team.team_name || '';
    document.getElementById('team-ansprechpartner').value = team.ansprechpartner || '';
    document.getElementById('team-email').value = team.email || '';
    document.getElementById('team-telefon').value = team.telefon || '';
    document.getElementById('team-verein').value = team.verein || '';
    document.getElementById('team-klasse').value = team.klasse || 'A';
    document.getElementById('team-setzposition').value = team.setzposition || 0;

    // Override add function temporarily
    window.addTeamOriginal = addTeam;
    window.addTeam = async function() {
        const updatedTeam = {
            team_name: document.getElementById('team-name').value.trim(),
            ansprechpartner: document.getElementById('team-ansprechpartner').value.trim(),
            email: document.getElementById('team-email').value.trim(),
            telefon: document.getElementById('team-telefon').value.trim(),
            verein: document.getElementById('team-verein').value.trim(),
            klasse: document.getElementById('team-klasse').value,
            setzposition: parseInt(document.getElementById('team-setzposition').value, 10) || 0
        };

        try {
            const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams/${teamId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedTeam)
            });

            const data = await res.json();

            if (data.success) {
                showToast('Team aktualisiert', 'success');
                closeModal('add-team-modal');
                await loadTeams();
            } else {
                showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
            }
        } catch (err) {
            console.error('Error updating team:', err);
            showToast('Fehler beim Aktualisieren', 'error');
        }

        // Restore original function
        window.addTeam = window.addTeamOriginal;
    };

    openModal('add-team-modal');
}
