// turnier-admin.js - Tournament Admin Frontend Logic

// API Base URL - will be set from config.js or default
const API_BASE = window.API_URL_TURNIER;

// State
let currentTurnierId = null;
let turniere = [];
let teams = [];
let spiele = [];
let phasen = [];
let currentAdminTab = 'config';
let meldungenPollInterval = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    loadTurniere();
    createToastContainer();
    
    // Poll for new meldungen every 30 seconds
    meldungenPollInterval = setInterval(() => {
        if (currentTurnierId) {
            loadMeldungen();
        }
    }, 30000);
});

// ==========================================
// TAB NAVIGATION
// ==========================================

function switchAdminTab(tabName) {
    // Update current tab state
    currentAdminTab = tabName;
    
    // Update tab buttons - use data attribute for reliable selection
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

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

// Update mode help text
function updateModusHelp() {
    const modus = document.getElementById('config-modus').value;
    const helpEl = document.getElementById('modus-help');
    
    const helpTexts = {
        'seeded': 'Klassisches Bracket-System mit Setzpositionen',
        'random': 'Klassisches Bracket-System mit zufälliger Auslosung',
        'swiss': 'Swiss System - jedes Team spielt alle Runden bis zum Ende',
        'swiss_144': 'Swiss 144: 32 Hobby-Teams spielen Quali (16 Matches), 16 Gewinner + 112 gesetzte Teams = 128 im Hauptfeld (7 Runden Swiss)'
    };
    
    if (helpEl) {
        helpEl.textContent = helpTexts[modus] || '';
    }
}

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
        
        // Auto-select tournament from localStorage if available
        const savedTurnierId = localStorage.getItem('selectedTurnierId');
        if (savedTurnierId && turniere.find(t => t.id === parseInt(savedTurnierId, 10))) {
            select.value = savedTurnierId;
            await loadTurnier();
        }
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
        // Clear localStorage when no tournament is selected
        localStorage.removeItem('selectedTurnierId');
        return;
    }
    
    // Store selected tournament in localStorage
    localStorage.setItem('selectedTurnierId', currentTurnierId);

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}`);
        const turnier = await res.json();

        // Fill config fields
        document.getElementById('config-name').value = turnier.turnier_name || '';
        document.getElementById('config-datum').value = turnier.turnier_datum ? turnier.turnier_datum.split('T')[0] : '';
        document.getElementById('config-datum-ende').value = turnier.turnier_datum_ende ? turnier.turnier_datum_ende.split('T')[0] : '';
        document.getElementById('config-teams').value = turnier.anzahl_teams || 32;
        document.getElementById('config-felder').value = turnier.anzahl_felder || 4;
        document.getElementById('config-spielzeit').value = turnier.spielzeit_minuten || 0;
        document.getElementById('config-pause').value = turnier.pause_minuten || 0;
        document.getElementById('config-startzeit').value = turnier.startzeit || '09:00';
        document.getElementById('config-endzeit').value = turnier.endzeit || '18:00';
        document.getElementById('config-modus').value = turnier.modus || 'seeded';
        document.getElementById('config-email').checked = turnier.email_benachrichtigung;
        
        // Update mode help text
        updateModusHelp();

        document.getElementById('turnier-details').style.display = 'block';

        // Load related data
        await Promise.all([
            loadSchiriTeams(),
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
    const modus = document.getElementById('new-turnier-modus').value;
    const separateSchiri = document.getElementById('new-turnier-separate-schiri').checked;

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
                anzahl_felder: anzahlFelder,
                modus: modus,
                separate_schiri_teams: separateSchiri
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
        turnier_datum_ende: document.getElementById('config-datum-ende').value || null,
        anzahl_teams: parseInt(document.getElementById('config-teams').value, 10),
        anzahl_felder: parseInt(document.getElementById('config-felder').value, 10),
        spielzeit_minuten: parseInt(document.getElementById('config-spielzeit').value, 10) || 0,
        pause_minuten: parseInt(document.getElementById('config-pause').value, 10) || 0,
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
// SCHIEDSRICHTER TEAMS MANAGEMENT
// ==========================================

let schiriTeams = [];

async function loadSchiriTeams() {
    if (!currentTurnierId) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/schiedsrichter`);
        schiriTeams = await res.json();
        
        renderSchiriTable();
    } catch (err) {
        console.error('Error loading schiri teams:', err);
    }
}

function renderSchiriTable() {
    const tbody = document.querySelector('#schiri-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (schiriTeams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Keine Schiedsrichter-Teams</td></tr>';
        return;
    }
    
    schiriTeams.forEach((schiri, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${escapeHtml(schiri.team_name)}</td>
            <td>${escapeHtml(schiri.ansprechpartner || '-')}</td>
            <td>${escapeHtml(schiri.telefon || '-')}</td>
            <td>${schiri.verfuegbar ? '✅ Ja' : '❌ Nein'}</td>
            <td>${schiri.aktiv ? '✅ Ja' : '❌ Nein'}</td>
            <td class="action-btns">
                <button class="btn btn-small ${schiri.verfuegbar ? 'btn-warning' : 'btn-success'}" 
                        onclick="toggleSchiriVerfuegbar(${schiri.id}, ${!schiri.verfuegbar})"
                        title="${schiri.verfuegbar ? 'Als nicht verfügbar markieren' : 'Als verfügbar markieren'}">
                    ${schiri.verfuegbar ? '🚫' : '✅'}
                </button>
                <button class="btn btn-small btn-danger" onclick="deleteSchiri(${schiri.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function showAddSchiriModal() {
    document.getElementById('schiri-name').value = '';
    document.getElementById('schiri-ansprechpartner').value = '';
    document.getElementById('schiri-telefon').value = '';
    openModal('add-schiri-modal');
}

async function addSchiri() {
    if (!currentTurnierId) return;
    
    const teamName = document.getElementById('schiri-name').value.trim();
    if (!teamName) {
        showToast('Team Name ist erforderlich', 'warning');
        return;
    }
    
    const schiri = {
        team_name: teamName,
        ansprechpartner: document.getElementById('schiri-ansprechpartner').value.trim(),
        telefon: document.getElementById('schiri-telefon').value.trim()
    };
    
    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/schiedsrichter`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(schiri)
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast('Schiedsrichter-Team hinzugefügt', 'success');
            closeModal('add-schiri-modal');
            await loadSchiriTeams();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error adding schiri:', err);
        showToast('Fehler beim Hinzufügen', 'error');
    }
}

async function toggleSchiriVerfuegbar(schiriId, verfuegbar) {
    if (!currentTurnierId) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/schiedsrichter/${schiriId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ verfuegbar })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast(verfuegbar ? 'Als verfügbar markiert' : 'Als nicht verfügbar markiert', 'success');
            await loadSchiriTeams();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error toggling schiri:', err);
        showToast('Fehler', 'error');
    }
}

async function deleteSchiri(schiriId) {
    if (!currentTurnierId) return;
    if (!confirm('Schiedsrichter-Team wirklich löschen?')) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/schiedsrichter/${schiriId}`, {
            method: 'DELETE'
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast('Schiedsrichter-Team gelöscht', 'success');
            await loadSchiriTeams();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error deleting schiri:', err);
        showToast('Fehler beim Löschen', 'error');
    }
}

// ==========================================
// TEAMS MANAGEMENT
// ==========================================

// Teams display limit state
let teamsDisplayLimit = 32;
const TEAMS_PAGE_SIZE = 16;

async function loadTeams() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams`);
        teams = await res.json();

        teamsDisplayLimit = 32; // Reset to default when loading
        updateTeamStats();
        renderTeamsTable();
    } catch (err) {
        console.error('Error loading teams:', err);
    }
}

function updateTeamStats() {
    const totalCount = teams.length;
    const angemeldetCount = teams.filter(t => t.status === 'angemeldet').length;
    const bestaetigtCount = teams.filter(t => t.status === 'bestaetigt').length;
    
    // Count by category
    const klasseA = teams.filter(t => t.klasse === 'A').length;
    const klasseB = teams.filter(t => t.klasse === 'B').length;
    const klasseC = teams.filter(t => t.klasse === 'C').length;
    const klasseD = teams.filter(t => t.klasse === 'D').length;
    
    document.getElementById('team-count').textContent = totalCount;
    document.getElementById('team-angemeldet').textContent = angemeldetCount;
    document.getElementById('team-bestaetigt').textContent = bestaetigtCount;
    document.getElementById('team-klasse-breakdown').textContent = `(A: ${klasseA}, B: ${klasseB}, C: ${klasseC}, D: ${klasseD})`;
}

// Cache for team statistics to avoid recalculation
let teamStatsCache = {};

function calculateAllTeamStats() {
    // Reset cache
    teamStatsCache = {};
    
    // Pre-calculate stats for all teams in one pass through games
    teams.forEach(team => {
        teamStatsCache[team.id] = { gamesPlayed: 0, refCount: 0 };
    });
    
    // Single pass through games to calculate all statistics
    spiele.forEach(spiel => {
        if (spiel.status === 'beendet') {
            // Count games played
            if (spiel.team1_id && teamStatsCache[spiel.team1_id]) {
                teamStatsCache[spiel.team1_id].gamesPlayed++;
            }
            if (spiel.team2_id && teamStatsCache[spiel.team2_id]) {
                teamStatsCache[spiel.team2_id].gamesPlayed++;
            }
            
            // Count referee duties
            if (spiel.schiedsrichter_name) {
                const refTeam = teams.find(t => t.team_name === spiel.schiedsrichter_name);
                if (refTeam && teamStatsCache[refTeam.id]) {
                    teamStatsCache[refTeam.id].refCount++;
                }
            }
        }
    });
}

function getTeamGameStats(teamId) {
    // Return cached stats or default values
    return teamStatsCache[teamId] || { gamesPlayed: 0, refCount: 0 };
}

function renderTeamsTable() {
    const tbody = document.querySelector('#teams-table tbody');
    tbody.innerHTML = '';

    // Recalculate team statistics before rendering
    calculateAllTeamStats();

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
        tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Keine Teams gefunden</td></tr>';
        updateTeamsShowMoreButton(0, 0);
        return;
    }

    // Limit display to teamsDisplayLimit
    const displayTeams = filtered.slice(0, teamsDisplayLimit);
    const remainingCount = filtered.length - teamsDisplayLimit;

    displayTeams.forEach((team, idx) => {
        const tr = document.createElement('tr');
        const isAbgemeldet = team.status === 'abgemeldet';
        const toggleBtnClass = isAbgemeldet ? 'btn-success' : 'btn-warning';
        const toggleBtnIcon = isAbgemeldet ? '✅' : '🚫';
        const toggleBtnTitle = isAbgemeldet ? 'Wieder anmelden' : 'Abmelden';
        
        const stats = getTeamGameStats(team.id);
        
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${escapeHtml(team.team_name)}</td>
            <td>${escapeHtml(team.ansprechpartner || '-')}</td>
            <td>${escapeHtml(team.email || '-')}</td>
            <td>${escapeHtml(team.verein || '-')}</td>
            <td>${escapeHtml(team.klasse || 'A')}</td>
            <td>${team.setzposition || 0}</td>
            <td>${stats.gamesPlayed}</td>
            <td>${stats.refCount}</td>
            <td><span class="status-badge status-${team.status || 'angemeldet'}">${team.status || 'angemeldet'}</span></td>
            <td class="action-btns">
                <button class="btn btn-small btn-primary" onclick="editTeam(${team.id})">✏️</button>
                <button class="btn btn-small ${toggleBtnClass}" onclick="toggleTeamStatus(${team.id}, '${team.status || 'angemeldet'}')" title="${toggleBtnTitle}">${toggleBtnIcon}</button>
                <button class="btn btn-small btn-danger" onclick="deleteTeam(${team.id})">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    updateTeamsShowMoreButton(remainingCount, filtered.length);
}

function updateTeamsShowMoreButton(remainingCount, totalCount) {
    // Remove existing buttons if any
    const existingControls = document.getElementById('teams-pagination-controls');
    if (existingControls) {
        existingControls.remove();
    }

    if (remainingCount <= 0) return;

    const tableContainer = document.querySelector('#teams-table').parentElement;
    const controls = document.createElement('div');
    controls.id = 'teams-pagination-controls';
    controls.className = 'teams-pagination-controls';
    controls.innerHTML = `
        <span class="teams-info">Zeige ${teamsDisplayLimit} von ${totalCount} Teams</span>
        <button class="btn btn-secondary btn-small" onclick="showMoreTeams(${TEAMS_PAGE_SIZE})">
            Weitere ${Math.min(TEAMS_PAGE_SIZE, remainingCount)} anzeigen
        </button>
        <button class="btn btn-secondary btn-small" onclick="showAllTeams()">
            Alle anzeigen (${remainingCount} mehr)
        </button>
    `;
    tableContainer.appendChild(controls);
}

function showMoreTeams(count) {
    teamsDisplayLimit += count;
    renderTeamsTable();
}

function showAllTeams() {
    teamsDisplayLimit = Infinity;
    renderTeamsTable();
}

function filterTeams() {
    teamsDisplayLimit = 32; // Reset limit when filtering
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
    document.getElementById('team-passwort').value = '';
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
        setzposition: parseInt(document.getElementById('team-setzposition').value, 10) || 0,
        passwort: document.getElementById('team-passwort').value.trim()
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
                setzposition: parseInt(parts[6], 10) || 0,
                passwort: parts[7] || ''
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

// History and pending collapsed state
let historyCollapsed = true;
let pendingCollapsed = true;
let anzahlFelder = 4; // Default, will be loaded from config
let vorschauGames = []; // Store Vorschau games

async function loadSpiele() {
    if (!currentTurnierId) return;

    try {
        // Get tournament config for anzahl_felder
        const configRes = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}`);
        const config = await configRes.json();
        anzahlFelder = config.anzahl_felder || 4;

        const phaseId = document.getElementById('spiele-filter-phase').value;
        const status = document.getElementById('spiele-filter-status').value;

        let url = `${API_BASE}/api/turniere/${currentTurnierId}/spiele?`;
        if (phaseId) url += `phase_id=${phaseId}&`;
        if (status) url += `status=${status}&`;

        const res = await fetch(url);
        spiele = await res.json();

        // Load Vorschau (next 10 upcoming games)
        await loadVorschau();

        renderGameOverview();
        renderSpieleTable();
        updateTournamentControls();
    } catch (err) {
        console.error('Error loading games:', err);
    }
}

async function loadVorschau() {
    if (!currentTurnierId) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/vorschau?limit=10`);
        vorschauGames = await res.json();
    } catch (err) {
        console.error('Error loading Vorschau:', err);
        vorschauGames = [];
    }
}

function renderGameOverview() {
    // Active games on fields (games with feld_id and not finished)
    const activeGames = spiele.filter(s => 
        s.feld_id && 
        s.status !== 'beendet' && 
        s.team1_id && s.team2_id
    ).sort((a, b) => a.spiel_nummer - b.spiel_nummer);

    // Pending games without both teams (waiting for bracket progression)
    const pendingGames = spiele.filter(s => 
        !s.feld_id && 
        s.status === 'wartend' && 
        (!s.team1_id || !s.team2_id)
    ).sort((a, b) => a.spiel_nummer - b.spiel_nummer);

    // Finished games for history (max of anzahlFelder or 10, whichever is greater)
    const historyLimit = Math.max(anzahlFelder, 10);
    const finishedGames = spiele.filter(s => 
        s.status === 'beendet'
    ).sort((a, b) => b.spiel_nummer - a.spiel_nummer).slice(0, historyLimit);

    renderGameCards('active-games-container', activeGames, 'active');
    renderGameCards('vorschau-games-container', vorschauGames, 'vorschau');
    renderGameCards('pending-games-container', pendingGames, 'pending');
    renderGameCards('history-games-container', finishedGames, 'finished');
}

function renderGameCards(containerId, games, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (games.length === 0) {
        const emptyMessages = {
            'active': 'Keine aktiven Spiele auf Feldern',
            'vorschau': 'Keine Vorschau-Spiele verfügbar',
            'pending': 'Keine wartenden Spiele',
            'finished': 'Keine abgeschlossenen Spiele'
        };
        container.innerHTML = `<p class="empty-state">${emptyMessages[type]}</p>`;
        return;
    }

    container.innerHTML = games.map(game => {
        const team1Class = game.gewinner_id === game.team1_id ? 'winner' : 
                          (game.gewinner_id === game.team2_id ? 'loser' : '');
        const team2Class = game.gewinner_id === game.team2_id ? 'winner' : 
                          (game.gewinner_id === game.team1_id ? 'loser' : '');
        
        let fieldDisplay;
        if (game.feld_name) {
            fieldDisplay = `<span class="game-card-field">📍 ${escapeHtml(game.feld_name)}</span>`;
        } else if (type === 'vorschau') {
            fieldDisplay = `<span class="game-card-field no-field">🔜 Nächste</span>`;
        } else {
            fieldDisplay = `<span class="game-card-field no-field">⏳ Offen</span>`;
        }

        // Display phase info for Vorschau
        const phaseDisplay = game.phase_name 
            ? `<span class="game-card-phase">${escapeHtml(game.phase_name)}</span>` 
            : '';
        
        // Display either dedicated referee team or playing team acting as referee
        const schiriName = game.schiedsrichter_team_name || game.schiedsrichter_name || '';
        const schiriDisplay = schiriName
            ? `<span class="game-card-schiri">👨‍⚖️ ${escapeHtml(schiriName)}</span>`
            : '<span class="game-card-schiri no-schiri">👨‍⚖️ Kein Schiedsrichter</span>';

        const score1 = game.ergebnis_team1 !== null ? game.ergebnis_team1 : '-';
        const score2 = game.ergebnis_team2 !== null ? game.ergebnis_team2 : '-';

        return `
            <div class="game-card ${type}">
                <div class="game-card-header">
                    <span class="game-card-number">Spiel #${game.spiel_nummer}</span>
                    ${fieldDisplay}
                </div>
                ${phaseDisplay ? `<div class="game-card-phase-info">${phaseDisplay}</div>` : ''}
                <div class="game-card-schiri-info">${schiriDisplay}</div>
                <div class="game-card-teams">
                    <div class="game-card-team ${team1Class}">
                        <span class="game-card-team-name">${escapeHtml(game.team1_name || 'TBD')}</span>
                        <span class="game-card-team-score">${score1}</span>
                    </div>
                    <div class="game-card-team ${team2Class}">
                        <span class="game-card-team-name">${escapeHtml(game.team2_name || 'TBD')}</span>
                        <span class="game-card-team-score">${score2}</span>
                    </div>
                </div>
                <div class="game-card-footer">
                    <span>${formatDateTime(game.geplante_zeit)}</span>
                    <div class="game-card-actions">
                        ${(game.status === 'geplant' || game.status === 'bereit') ? `<button class="btn btn-small btn-success" onclick="markGameAsRunning(${game.id})" title="Spielbogen abgeholt - Spiel läuft">▶️</button>` : ''}
                        <button class="btn btn-small btn-primary" onclick="showEditResultModal(${game.id})">✏️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleHistory() {
    historyCollapsed = !historyCollapsed;
    const container = document.getElementById('history-games-container');
    const icon = document.getElementById('history-toggle-icon');
    
    if (historyCollapsed) {
        container.classList.add('collapsed');
        icon.textContent = '▶';
    } else {
        container.classList.remove('collapsed');
        icon.textContent = '▼';
    }
}

function togglePending() {
    pendingCollapsed = !pendingCollapsed;
    const container = document.getElementById('pending-games-container');
    const icon = document.getElementById('pending-toggle-icon');
    
    if (pendingCollapsed) {
        container.classList.add('collapsed');
        icon.textContent = '▶';
    } else {
        container.classList.remove('collapsed');
        icon.textContent = '▼';
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
        tbody.innerHTML = '<tr><td colspan="13" class="empty-state">Keine Spiele gefunden</td></tr>';
        return;
    }

    filtered.forEach(spiel => {
        const tr = document.createElement('tr');

        const team1Class = spiel.gewinner_id === spiel.team1_id ? 'winner' : (spiel.gewinner_id === spiel.team2_id ? 'loser' : '');
        const team2Class = spiel.gewinner_id === spiel.team2_id ? 'winner' : (spiel.gewinner_id === spiel.team1_id ? 'loser' : '');

        // Display either dedicated referee team or playing team acting as referee
        const schiriName = spiel.schiedsrichter_team_name || spiel.schiedsrichter_name || '-';

        tr.innerHTML = `
            <td>${spiel.spiel_nummer}</td>
            <td>${escapeHtml(spiel.phase_name || '-')}</td>
            <td>${spiel.runde}</td>
            <td class="${team1Class}">${escapeHtml(spiel.team1_name || 'TBD')}</td>
            <td>vs</td>
            <td class="${team2Class}">${escapeHtml(spiel.team2_name || 'TBD')}</td>
            <td>${escapeHtml(spiel.feld_name || '-')}</td>
            <td>${escapeHtml(schiriName)}</td>
            <td>${formatDateTime(spiel.geplante_zeit)}</td>
            <td>${spiel.ergebnis_team1 !== null ? `${spiel.ergebnis_team1} : ${spiel.ergebnis_team2}` : '-'}</td>
            <td><span class="status-badge status-${spiel.status}">${spiel.status}</span></td>
            <td>${escapeHtml(spiel.bemerkung || '-')}</td>
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

async function markGameAsRunning(spielId) {
    if (!currentTurnierId) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/spiele/${spielId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'laeuft' })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showToast('Spiel als laufend markiert', 'success');
            await loadSpiele();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error updating game status:', err);
        showToast('Fehler beim Aktualisieren', 'error');
    }
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

function updateNotificationBadge(count) {
    const badge = document.getElementById('result-notification-badge');
    const countEl = document.getElementById('notification-count');
    
    if (count > 0) {
        countEl.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function showMeldungenTab() {
    // Switch to games tab (where meldungen section is located)
    switchAdminTab('games');
    
    // Scroll to meldungen section
    const meldungenSection = document.getElementById('meldungen-container').closest('.card');
    if (meldungenSection) {
        meldungenSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function loadMeldungen() {
    if (!currentTurnierId) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/meldungen`);
        const meldungen = await res.json();

        const container = document.getElementById('meldungen-container');
        
        // Update notification badge
        updateNotificationBadge(meldungen.length);

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
                ${m.loser_team_code ? `
                <div class="meldung-code">
                    <strong>🔑 Bestätigungscode für ${escapeHtml(m.loser_team_name || 'Verlierer')}:</strong>
                    <span class="code-display">${escapeHtml(m.loser_team_code)}</span>
                </div>
                ` : ''}
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

function updateTournamentControls() {
    // Enable/disable start button based on whether tournament has already started
    const startBtn = document.querySelector('button[onclick="startTurnier()"]');
    if (startBtn && spiele.length > 0) {
        startBtn.disabled = true;
        startBtn.title = 'Turnier wurde bereits gestartet. Verwenden Sie Reset, um neu zu starten.';
        startBtn.style.opacity = '0.5';
        startBtn.style.cursor = 'not-allowed';
    } else if (startBtn) {
        startBtn.disabled = false;
        startBtn.title = 'Turnier starten: Erstellt automatisch alle Spiele basierend auf dem gewählten Modus (Bracket oder Swiss System)';
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
    }
}

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
            updateTournamentControls(); // Re-enable start button after reset
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
    document.getElementById('team-passwort').value = team.passwort || '';

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
            setzposition: parseInt(document.getElementById('team-setzposition').value, 10) || 0,
            passwort: document.getElementById('team-passwort').value.trim()
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

// ==========================================
// EMAIL PREVIEW
// ==========================================

function showEmailPreviewModal() {
    updateEmailPreview();
    openModal('email-preview-modal');
}

function updateEmailPreview() {
    const emailType = document.getElementById('email-preview-type').value;
    const turnierName = document.getElementById('config-name').value || 'Turnier';
    const turnierDatum = document.getElementById('config-datum').value || 'TBA';
    
    let subject = '';
    let content = '';
    
    switch (emailType) {
        case 'spielankuendigung':
            subject = `🏐 Spielankündigung: Team A vs Team B`;
            content = `
                <h2>🏐 Spielankündigung - ${escapeHtml(turnierName)}</h2>
                <p>Euer nächstes Spiel steht an!</p>
                <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
                    <tr><td><strong>Spiel Nr.</strong></td><td>1</td></tr>
                    <tr><td><strong>Team 1</strong></td><td>Team A</td></tr>
                    <tr><td><strong>Team 2</strong></td><td>Team B</td></tr>
                    <tr><td><strong>Feld</strong></td><td>Feld 1</td></tr>
                    <tr><td><strong>Zeit</strong></td><td>${turnierDatum} 10:00 Uhr</td></tr>
                </table>
                <p>Viel Erfolg!</p>
            `;
            break;
        case 'ergebnis':
            subject = `🏐 Spielergebnis: Team A vs Team B`;
            content = `
                <h2>🏐 Spielergebnis - ${escapeHtml(turnierName)}</h2>
                <p>Das Spiel ist beendet!</p>
                <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
                    <tr><td><strong>Spiel Nr.</strong></td><td>1</td></tr>
                    <tr><td><strong>Team 1</strong></td><td>Team A</td></tr>
                    <tr><td><strong>Team 2</strong></td><td>Team B</td></tr>
                    <tr><td><strong>Ergebnis</strong></td><td>21 : 18</td></tr>
                    <tr><td><strong>Gewinner</strong></td><td>Team A 🏆</td></tr>
                </table>
            `;
            break;
        case 'platzierung':
            subject = `🏆 Turnier-Platzierung - ${turnierName}`;
            content = `
                <h2>🏆 Turnier-Platzierung - ${escapeHtml(turnierName)}</h2>
                <p>Herzlichen Glückwunsch zu eurer Platzierung!</p>
                <table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%;">
                    <tr><td><strong>Team</strong></td><td>Team A</td></tr>
                    <tr><td><strong>Platzierung</strong></td><td>1. Platz 🥇</td></tr>
                    <tr><td><strong>Siege</strong></td><td>5</td></tr>
                    <tr><td><strong>Niederlagen</strong></td><td>1</td></tr>
                    <tr><td><strong>Punkte</strong></td><td>+45</td></tr>
                </table>
                <p>Vielen Dank für eure Teilnahme!</p>
            `;
            break;
    }
    
    document.getElementById('email-preview-subject').value = subject;
    document.getElementById('email-preview-content').innerHTML = content;
}

// ==========================================
// TEAM DEREGISTRATION (ABMELDEN)
// ==========================================

async function toggleTeamStatus(teamId, currentStatus) {
    if (!currentTurnierId) return;

    const newStatus = currentStatus === 'abgemeldet' ? 'angemeldet' : 'abgemeldet';
    const action = newStatus === 'abgemeldet' ? 'abmelden' : 'wieder anmelden';
    
    if (!confirm(`Team wirklich ${action}?`)) return;

    try {
        const res = await fetch(`${API_BASE}/api/turniere/${currentTurnierId}/teams/${teamId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        const data = await res.json();

        if (data.success) {
            showToast(`Team ${newStatus === 'abgemeldet' ? 'abgemeldet' : 'wieder angemeldet'}`, 'success');
            await loadTeams();
        } else {
            showToast('Fehler: ' + (data.error || 'Unbekannt'), 'error');
        }
    } catch (err) {
        console.error('Error toggling team status:', err);
        showToast('Fehler beim Ändern des Status', 'error');
    }
}
