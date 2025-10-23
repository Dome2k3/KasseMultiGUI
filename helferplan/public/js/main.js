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
                li.innerHTML = `<div class="color-swatch" style="background-color: ${team.color_hex};"></div> ${team.name}`;
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

    addHelperForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/helpers`, {
        name: e.target.elements['helper-name-input'].value,
        team_id: e.target.elements['helper-team-select'].value,
        role: e.target.elements['helper-role-select'].value
    }, fetchAndRenderHelpers));

    addGroupForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/activity-groups`, {
        name: e.target.elements['group-name-input'].value,
        sort_order: Number(e.target.elements['group-sort-input'].value || 0)
    }, async () => { await fetchAndRenderGroups(); }));

    addActivityForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/activities`, {
        name: e.target.elements['activity-name-input'].value,
        group_id: e.target.elements['activity-group-select'].value,
        role_requirement: e.target.elements['activity-role-select'].value
    }, fetchAndRenderActivities));

    // Settings: load and save
    async function loadSettings() {
        try {
            const res = await fetch(`${API_URL}/settings`);
            if (!res.ok) throw new Error('Settings load failed');
            const settings = await res.json();
            if (settings.event_friday) settingFriday.value = settings.event_friday;
            if (settings.event_saturday) settingSaturday.value = settings.event_saturday;
            if (settings.event_sunday) settingSunday.value = settings.event_sunday;
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
        } catch (err) { console.error('Fehler beim Speichern Settings:', err); alert('Speichern fehlgeschlagen'); }
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