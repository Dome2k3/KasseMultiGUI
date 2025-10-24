document.addEventListener('DOMContentLoaded', () => {

    // Verwende immer Port 3003 auf dem aktuellen Host
    const API_URL = `${window.location.protocol}//${window.location.hostname}:3003/api`;

    // Elemente für Teams
    const teamList = document.getElementById('team-list');
    const addTeamForm = document.getElementById('add-team-form');
    const deleteTeamSelect = document.getElementById('delete-team-select');
    const deleteTeamButton = document.getElementById('delete-team-button');

    // Elemente für Helfer
    const helperListBody = document.getElementById('helper-list-body');
    const addHelperForm = document.getElementById('add-helper-form');
    const helperTeamSelect = document.getElementById('helper-team-select');
    const helperFilterTeam = document.getElementById('helper-filter-team');
    const helperError = document.getElementById('helper-error');

    // Elemente fuer Taetigkeiten
    const groupList = document.getElementById('group-list');
    const addGroupForm = document.getElementById('add-group-form');
    const activityListBody = document.getElementById('activity-list-body');
    const addActivityForm = document.getElementById('add-activity-form');
    const activityGroupSelect = document.getElementById('activity-group-select');
    const groupSortInput = document.getElementById('group-sort-input');

    // Settings inputs
    const settingFriday = document.getElementById('setting-friday');
    const settingSaturday = document.getElementById('setting-saturday');
    const settingSunday = document.getElementById('setting-sunday');
    const saveSettingsButton = document.getElementById('save-settings-button');

    // Auf-/Abbau inputs
    const setupDaysInput = document.getElementById('setup-days-input');
    const teardownDaysInput = document.getElementById('teardown-days-input');
    const saveBuildDaysButton = document.getElementById('save-builddays-button');
    const showAufbauButton = document.getElementById('show-aufbau-button');
    const aufbauSection = document.getElementById('aufbau-section');
    const aufbauContainer = document.getElementById('aufbau-container');

    // Event title line element
    const eventTitleLine = document.getElementById('event-title-line');

    /* Hilfsfunktion: setzt die Hintergrundfarbe bei Elementen .team-name und sorgt für Lesbarkeit */
    function applyTeamColors() {
        document.querySelectorAll('.team-name').forEach(el => {
            const color = el.getAttribute('data-color') || el.dataset.color;
            if (!color) return;
            el.style.backgroundColor = color;
            // einfacher Kontrastcheck
            try {
                const c = color.startsWith('#') ? color.slice(1) : color;
                if (c.length === 6) {
                    const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
                    const luminance = (0.299*r + 0.587*g + 0.114*b);
                    el.style.color = luminance > 160 ? '#111' : '#fff';
                } else {
                    el.style.color = '#fff';
                }
            } catch (e) {
                el.style.color = '#fff';
            }
        });
    }

    async function fetchAndRenderTeams() {
        try {
            const response = await fetch(`${API_URL}/teams`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const teams = await response.json();
            teamList.innerHTML = '';
            helperTeamSelect.innerHTML = '<option value="" disabled selected>Team auswählen</option>';
            deleteTeamSelect.innerHTML = '<option value="">Team auswählen</option>';
            helperFilterTeam.innerHTML = '<option value="">Alle</option>';
            teams.forEach(team => {
                const li = document.createElement('li');
                // team-name erhält data-color, damit JS/CSS den Hintergrund setzen kann
                li.innerHTML = `<div class="color-swatch" style="background-color: ${team.color_hex}; width:14px; height:14px; display:inline-block; margin-right:8px; vertical-align:middle; border-radius:3px;"></div>
                                <span class="team-name" data-color="${team.color_hex}">${team.name}</span>`;
                teamList.appendChild(li);

                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                helperTeamSelect.appendChild(option);

                const delOption = option.cloneNode(true);
                deleteTeamSelect.appendChild(delOption);

                // filter select
                const filterOption = option.cloneNode(true);
                helperFilterTeam.appendChild(filterOption);
            });
            // Farben anwenden nachdem die Elemente im DOM sind
            applyTeamColors();
        } catch (error) { console.error('Fehler Teams:', error); }
    }

    async function deleteTeam(id) {
        if (!id) return alert('Kein Team ausgewählt.');
        if (!confirm('Soll das Team wirklich gelöscht werden?')) return;
        try {
            const res = await fetch(`${API_URL}/teams/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Löschen fehlgeschlagen');
            await fetchAndRenderTeams();
            await fetchAndRenderHelpers(); // team changes can affect helper list
        } catch (err) { console.error('Fehler beim Löschen Team:', err); alert('Löschen fehlgeschlagen'); }
    }

    deleteTeamButton.addEventListener('click', () => deleteTeam(deleteTeamSelect.value));

    async function fetchAndRenderHelpers() {
        try {
            const response = await fetch(`${API_URL}/helpers`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const helpers = await response.json();
            renderHelperTable(helpers);
        } catch (error) { console.error('Fehler Helfer:', error); }
    }

    function renderHelperTable(helpers) {
        helperListBody.innerHTML = '';
        const filterTeam = helperFilterTeam.value;
        helpers
            .filter(h => !filterTeam || String(h.team_id) === String(filterTeam))
            .forEach(helper => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${helper.name}</td><td>${helper.team_name || ''}</td><td>${helper.role}</td>`;
                const tdDelete = document.createElement('td');
                const btn = document.createElement('button');
                btn.className = 'small-delete';
                btn.textContent = '✖';
                btn.title = 'Löschen';
                btn.addEventListener('click', async () => {
                    if (!confirm('Wirklich löschen?')) return;
                    try {
                        const res = await fetch(`${API_URL}/helpers/${helper.id}`, { method: 'DELETE' });
                        if (!res.ok) throw new Error('Löschen fehlgeschlagen');
                        fetchAndRenderHelpers();
                    } catch (err) { console.error('Fehler beim Löschen Helfer:', err); alert('Löschen fehlgeschlagen'); }
                });
                tdDelete.appendChild(btn);
                tr.appendChild(tdDelete);
                helperListBody.appendChild(tr);
            });
    }

    helperFilterTeam.addEventListener('change', () => fetchAndRenderHelpers());

    async function fetchAndRenderGroups() {
        try {
            const response = await fetch(`${API_URL}/activity-groups`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const groups = await response.json();
            groupList.innerHTML = '';
            activityGroupSelect.innerHTML = '<option value="" disabled selected>Gruppe auswählen</option>';
            groups.forEach(group => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                const left = document.createElement('span');
                left.textContent = `${group.name} (Sort: ${group.sort_order || 0})`;
                const delBtn = document.createElement('button');
                delBtn.className = 'small-delete';
                delBtn.textContent = '✖';
                delBtn.title = 'Löschen';
                delBtn.addEventListener('click', async () => {
                    if (!confirm('Wirklich löschen?')) return;
                    try {
                        const res = await fetch(`${API_URL}/activity-groups/${group.id}`, { method: 'DELETE' });
                        if (!res.ok) throw new Error('Löschen fehlgeschlagen');
                        fetchAndRenderGroups();
                    } catch (err) { console.error('Fehler beim Löschen Gruppe:', err); alert('Löschen fehlgeschlagen'); }
                });
                li.appendChild(left);
                li.appendChild(delBtn);
                groupList.appendChild(li);

                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                activityGroupSelect.appendChild(option);
            });
            // For activities list refresh (to show group names)
            await fetchAndRenderActivities();
        } catch (error) { console.error('Fehler Gruppen:', error); }
    }

    async function fetchAndRenderActivities() {
        try {
            const response = await fetch(`${API_URL}/activities`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const activities = await response.json();
            activityListBody.innerHTML = '';
            activities.forEach(activity => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${activity.name}</td><td>${activity.group_name || ''}</td><td>${activity.role_requirement}</td>`;
                const tdDelete = document.createElement('td');
                const btn = document.createElement('button');
                btn.className = 'small-delete';
                btn.textContent = '✖';
                btn.title = 'Löschen';
                btn.addEventListener('click', async () => {
                    if (!confirm('Wirklich löschen?')) return;
                    try {
                        const res = await fetch(`${API_URL}/activities/${activity.id}`, { method: 'DELETE' });
                        if (!res.ok) throw new Error('Löschen fehlgeschlagen');
                        fetchAndRenderActivities();
                    } catch (err) { console.error('Fehler beim Löschen Aktivität:', err); alert('Löschen fehlgeschlagen'); }
                });
                tdDelete.appendChild(btn);
                tr.appendChild(tdDelete);
                activityListBody.appendChild(tr);
            });
        } catch (error) { console.error('Fehler Taetigkeiten:', error); }
    }

    async function handleFormSubmit(event, url, body, successCallback) {
        event.preventDefault();
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const text = await response.text();
                let err;
                try { err = JSON.parse(text); } catch (_) { err = { error: text }; }
                throw new Error(err.error || 'Ein Fehler ist aufgetreten.');
            }
            event.target.reset();
            successCallback();
        } catch (error) {
            console.error('Fehler beim Senden:', error);
            alert(error.message);
        }
    }

    addTeamForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/teams`, {
        name: e.target.elements['team-name-input'].value,
        color_hex: e.target.elements['team-color-input'].value
    }, async () => { await fetchAndRenderTeams(); await fetchAndRenderHelpers(); }));

    // HELFER: Vor dem Anlegen prüfen, ob der Name bereits existiert (einmalig)
    addHelperForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = e.target.elements['helper-name-input'].value && e.target.elements['helper-name-input'].value.trim();
        const team_id = e.target.elements['helper-team-select'].value;
        const role = e.target.elements['helper-role-select'].value;
        if (!name) return;

        try {
            // Hole alle Helfer und prüfe auf Doppelten Namen (case-insensitive)
            const res = await fetch(`${API_URL}/helpers`);
            if (!res.ok) throw new Error('Fehler beim Prüfen vorhandener Helfer');
            const helpers = await res.json();
            const exists = helpers.some(h => (h.name || '').trim().toLowerCase() === name.toLowerCase());
            if (exists) {
                // Zeige Nachricht Inline (falls vorhanden) oder als alert
                if (helperError) {
                    helperError.style.display = 'inline';
                    setTimeout(() => helperError.style.display = 'none', 3500);
                } else {
                    alert('Name schon belegt.');
                }
                return;
            }

            // Wenn Name frei: sende POST
            const postRes = await fetch(`${API_URL}/helpers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, team_id, role })
            });
            if (!postRes.ok) {
                const text = await postRes.text();
                let err;
                try { err = JSON.parse(text); } catch (_) { err = { error: text }; }
                throw new Error(err.error || 'Ein Fehler ist aufgetreten.');
            }
            e.target.reset();
            await fetchAndRenderHelpers();
        } catch (err) {
            console.error('Fehler beim Anlegen Helfer:', err);
            alert(err.message || 'Speichern fehlgeschlagen');
        }
    });

    addGroupForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/activity-groups`, {
        name: e.target.elements['group-name-input'].value,
        sort_order: Number(e.target.elements['group-sort-input'].value || 0)
    }, async () => { await fetchAndRenderGroups(); }));

    addActivityForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/activities`, {
        name: e.target.elements['activity-name-input'].value,
        group_id: e.target.elements['activity-group-select'].value,
        role_requirement: e.target.elements['activity-role-select'].value
    }, fetchAndRenderActivities));

    // Settings: load and save (inkl. Aufbau/Abbau Tage)
    async function loadSettings() {
        try {
            const res = await fetch(`${API_URL}/settings`);
            if (!res.ok) throw new Error('Settings load failed');
            const settings = await res.json();
            if (settings.event_friday) settingFriday.value = settings.event_friday;
            if (settings.event_saturday) settingSaturday.value = settings.event_saturday;
            if (settings.event_sunday) settingSunday.value = settings.event_sunday;
            // optional neue Keys: setup_days, teardown_days
            if (typeof settings.setup_days !== 'undefined' && setupDaysInput) setupDaysInput.value = settings.setup_days;
            if (typeof settings.teardown_days !== 'undefined' && teardownDaysInput) teardownDaysInput.value = settings.teardown_days;
            // Aktualisiere Titelzeile direkt nach Laden
            updateEventTitleLine();
        } catch (err) { console.error('Fehler beim Laden der Einstellungen:', err); }
    }

    saveSettingsButton.addEventListener('click', async () => {
        try {
            const payload = {
                event_friday: settingFriday.value || '',
                event_saturday: settingSaturday.value || '',
                event_sunday: settingSunday.value || ''
            };
            const res = await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: payload })
            });
            if (!res.ok) throw new Error('Speichern fehlgeschlagen');
            alert('Einstellungen gespeichert');
            updateEventTitleLine();
        } catch (err) { console.error('Fehler beim Speichern Settings:', err); alert('Speichern fehlgeschlagen'); }
    });

    // Speichern der Aufbau/Abbau Tage in settings
    saveBuildDaysButton.addEventListener('click', async () => {
        try {
            const payload = {
                setup_days: Number(setupDaysInput.value || 0),
                teardown_days: Number(teardownDaysInput.value || 0)
            };
            const res = await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: payload })
            });
            if (!res.ok) throw new Error('Speichern fehlgeschlagen');
            alert('Auf-/Abbau Tage gespeichert');
        } catch (err) { console.error('Fehler beim Speichern Aufbau/Abbau:', err); alert('Speichern fehlgeschlagen'); }
    });

    // Erzeugt die lesbare Event-Titelzeile aus Freitag und Sonntag (inkl. Wochentag)
    function formatDateWithWeekday(isoDate) {
        if (!isoDate) return '';
        const d = new Date(isoDate + 'T00:00:00');
        const opts = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
        return new Intl.DateTimeFormat('de-DE', opts).format(d);
    }
    function updateEventTitleLine() {
        const f = settingFriday.value;
        const s = settingSunday.value;
        if (f && s) {
            const startFormatted = formatDateWithWeekday(f);
            const endFormatted = formatDateWithWeekday(s);
            eventTitleLine.textContent = `Bergsträßer Volleyball Turnier vom ${startFormatted} bis ${endFormatted}`;
        } else {
            // Falls Werte fehlen, belasse Default
            // Wenn einzelne Werte gesetzt sind, versuche diese anzuzeigen
            if (f && !s) eventTitleLine.textContent = `Bergsträßer Volleyball Turnier am ${formatDateWithWeekday(f)}`;
            else if (!f && s) eventTitleLine.textContent = `Bergsträßer Volleyball Turnier am ${formatDateWithWeekday(s)}`;
        }
    }

    // Erzeuge Auf-/Abbau-Ansicht basierend auf Einstellungen (sichtbar im Admin)
    function generateAufbauView() {
        if (!aufbauContainer) return;
        aufbauContainer.innerHTML = '';
        const friday = settingFriday.value ? new Date(settingFriday.value + 'T00:00:00') : null;
        const sunday = settingSunday.value ? new Date(settingSunday.value + 'T00:00:00') : null;
        const setupDays = Number(setupDaysInput.value || 0);
        const teardownDays = Number(teardownDaysInput.value || 0);

        // Aufbau: Tage vor Freitag (1..setupDays)
        if (friday && setupDays > 0) {
            for (let i = setupDays; i >= 1; i--) {
                const d = new Date(friday);
                d.setDate(friday.getDate() - i);
                const dayDiv = document.createElement('div');
                dayDiv.className = 'aufbau-day';
                dayDiv.innerHTML = `<h4>Aufbau: ${d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' })}</h4>
                    <div class="slots" data-date="${d.toISOString().slice(0,10)}">
                        <em>Hier können Helfer zugewiesen werden (später implementieren)</em>
                    </div>`;
                aufbauContainer.appendChild(dayDiv);
            }
        }

        // Veranstaltungstage: Freitag-Sonntag anzeigen als Referenz
        if (friday && sunday) {
            const dayRangeDiv = document.createElement('div');
            dayRangeDiv.className = 'aufbau-day';
            dayRangeDiv.innerHTML = `<h4>Veranstaltung: ${friday.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' })} — ${sunday.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' })}</h4>`;
            aufbauContainer.appendChild(dayRangeDiv);
        }

        // Abbau: Tage nach Sonntag (1..teardownDays)
        if (sunday && teardownDays > 0) {
            for (let i = 1; i <= teardownDays; i++) {
                const d = new Date(sunday);
                d.setDate(sunday.getDate() + i);
                const dayDiv = document.createElement('div');
                dayDiv.className = 'aufbau-day';
                dayDiv.innerHTML = `<h4>Abbau: ${d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' })}</h4>
                    <div class="slots" data-date="${d.toISOString().slice(0,10)}">
                        <em>Hier können Helfer zugewiesen werden (später implementieren)</em>
                    </div>`;
                aufbauContainer.appendChild(dayDiv);
            }
        }
    }

    // Button um Auf-/Abbau-Section sichtbar zu machen / aktualisieren
    showAufbauButton.addEventListener('click', () => {
        if (!aufbauSection) return;
        if (aufbauSection.style.display === 'none' || aufbauSection.style.display === '') {
            generateAufbauView();
            aufbauSection.style.display = 'block';
            showAufbauButton.textContent = 'Auf-/Abbau verbergen';
        } else {
            aufbauSection.style.display = 'none';
            showAufbauButton.textContent = 'Auf-/Abbau anzeigen';
        }
    });

    async function initialLoad() {
        await fetchAndRenderTeams();
        await fetchAndRenderHelpers();
        await fetchAndRenderGroups();
        await fetchAndRenderActivities();
        await loadSettings();
    }

    initialLoad();
});