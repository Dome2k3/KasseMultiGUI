document.addEventListener('DOMContentLoaded', () => {

    const API_URL = 'http://localhost:3003/api';

    // Elemente f�r Teams
    const teamList = document.getElementById('team-list');
    const addTeamForm = document.getElementById('add-team-form');
    
    // Elemente f�r Helfer
    const helperListBody = document.getElementById('helper-list-body');
    const addHelperForm = document.getElementById('add-helper-form');
    const helperTeamSelect = document.getElementById('helper-team-select');

    // Elemente fuer Taetigkeiten
    const groupList = document.getElementById('group-list');
    const addGroupForm = document.getElementById('add-group-form');
    const activityListBody = document.getElementById('activity-list-body');
    const addActivityForm = document.getElementById('add-activity-form');
    const activityGroupSelect = document.getElementById('activity-group-select');

    async function fetchAndRenderTeams() {
        try {
            const response = await fetch(`${API_URL}/teams`);
            const teams = await response.json();
            teamList.innerHTML = '';
            helperTeamSelect.innerHTML = '<option value="" disabled selected>Team auswaehlen</option>';
            teams.forEach(team => {
                const li = document.createElement('li');
                li.innerHTML = `<div class="color-swatch" style="background-color: ${team.color_hex};"></div> ${team.name}`;
                teamList.appendChild(li);
                const option = document.createElement('option');
                option.value = team.id;
                option.textContent = team.name;
                helperTeamSelect.appendChild(option);
            });
        } catch (error) { console.error('Fehler Teams:', error); }
    }

    async function fetchAndRenderHelpers() {
        try {
            const response = await fetch(`${API_URL}/helpers`);
            const helpers = await response.json();
            helperListBody.innerHTML = '';
            helpers.forEach(helper => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${helper.name}</td><td>${helper.team_name || ''}</td><td>${helper.role}</td>`;
                helperListBody.appendChild(tr);
            });
        } catch (error) { console.error('Fehler Helfer:', error); }
    }

    async function fetchAndRenderGroups() {
        try {
            const response = await fetch(`${API_URL}/activity-groups`);
            const groups = await response.json();
            groupList.innerHTML = '';
            activityGroupSelect.innerHTML = '<option value="" disabled selected>Gruppe auswaehlen</option>';
            groups.forEach(group => {
                const li = document.createElement('li');
                li.textContent = group.name;
                groupList.appendChild(li);
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                activityGroupSelect.appendChild(option);
            });
        } catch (error) { console.error('Fehler Gruppen:', error); }
    }

    async function fetchAndRenderActivities() {
         try {
            const response = await fetch(`${API_URL}/activities`);
            const activities = await response.json();
            activityListBody.innerHTML = '';
            activities.forEach(activity => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${activity.name}</td><td>${activity.group_name || ''}</td><td>${activity.role_requirement}</td>`;
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
                const err = await response.json();
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
    }, fetchAndRenderTeams));

    addHelperForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/helpers`, {
        name: e.target.elements['helper-name-input'].value,
        team_id: e.target.elements['helper-team-select'].value,
        role: e.target.elements['helper-role-select'].value
    }, fetchAndRenderHelpers));

    addGroupForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/activity-groups`, {
        name: e.target.elements['group-name-input'].value
    }, async () => { await fetchAndRenderGroups(); await fetchAndRenderActivities(); }));

    addActivityForm.addEventListener('submit', (e) => handleFormSubmit(e, `${API_URL}/activities`, {
        name: e.target.elements['activity-name-input'].value,
        group_id: e.target.elements['activity-group-select'].value,
        role_requirement: e.target.elements['activity-role-select'].value
    }, fetchAndRenderActivities));

    async function initialLoad() {
        await fetchAndRenderTeams();
        await fetchAndRenderHelpers();
        await fetchAndRenderGroups();
        await fetchAndRenderActivities();
    }
    
    initialLoad();
});
