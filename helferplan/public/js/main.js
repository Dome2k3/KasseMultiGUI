document.addEventListener('DOMContentLoaded', () => {

    // API base (runtime lookup)
    // Lookup order:
    // 1) meta tag <meta name="api-url-helferplan" content="https://.../api">
    // 2) runtime global window.__API_URL_HELFERPLAN (set by config.js loaded before this script)
    // 3) local dev convenience: if served from localhost, assume :3003
    // 4) default: same origin + '/api' (works with Cloudflare/Render tunnels)
    const API_URL = (() => {
        const meta = document.querySelector('meta[name="api-url-helferplan"]');
        if (meta && meta.content) return meta.content.replace(/\/$/, '');
        if (window.__API_URL_HELFERPLAN) return String(window.__API_URL_HELFERPLAN).replace(/\/$/, '');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `${window.location.protocol}//${window.location.hostname}:3003/api`;
        }
        return `${window.location.origin}/api`;
    })();

    // expose for debugging / other scripts
    window.API_URL = API_URL;
    console.info('API_URL =', API_URL);

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

    // Auf-/Abbau settings inputs
    const setupDay1 = document.getElementById('setup-day-1');
    const setupDay1Start = document.getElementById('setup-day-1-start');
    const setupDay1End = document.getElementById('setup-day-1-end');
    const setupDay1Min = document.getElementById('setup-day-1-min');
    const setupDay2 = document.getElementById('setup-day-2');
    const setupDay2Start = document.getElementById('setup-day-2-start');
    const setupDay2End = document.getElementById('setup-day-2-end');
    const setupDay2Min = document.getElementById('setup-day-2-min');
    const setupDay3 = document.getElementById('setup-day-3');
    const setupDay3Start = document.getElementById('setup-day-3-start');
    const setupDay3End = document.getElementById('setup-day-3-end');
    const setupDay3Min = document.getElementById('setup-day-3-min');
    const teardownDay1 = document.getElementById('teardown-day-1');
    const teardownDay1Start = document.getElementById('teardown-day-1-start');
    const teardownDay1End = document.getElementById('teardown-day-1-end');
    const teardownDay1Min = document.getElementById('teardown-day-1-min');
    const saveAufbauSettingsButton = document.getElementById('save-aufbau-settings-button');

    // Kuchen settings inputs
    const cakesFriday = document.getElementById('cakes-friday');
    const cakesSaturday = document.getElementById('cakes-saturday');
    const cakesSunday = document.getElementById('cakes-sunday');
    const saveCakesSettingsButton = document.getElementById('save-cakes-settings-button');

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
                li.innerHTML = `<div class="color-swatch" style="background-color: ${team.color_hex}; width:14px; height:14px; display:inline-block; margin-right:8px; vertical-align:middle; border-rad[...]
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
            
            // Tournament days
            if (settings.event_friday) settingFriday.value = settings.event_friday;
            if (settings.event_saturday) settingSaturday.value = settings.event_saturday;
            if (settings.event_sunday) settingSunday.value = settings.event_sunday;
            
            // Setup/Teardown days
            if (settings.setup_day_1) setupDay1.value = settings.setup_day_1;
            if (settings.setup_day_1_start) setupDay1Start.value = settings.setup_day_1_start;
            if (settings.setup_day_1_end) setupDay1End.value = settings.setup_day_1_end;
            if (settings.setup_day_1_min) setupDay1Min.value = settings.setup_day_1_min;
            if (settings.setup_day_2) setupDay2.value = settings.setup_day_2;
            if (settings.setup_day_2_start) setupDay2Start.value = settings.setup_day_2_start;
            if (settings.setup_day_2_end) setupDay2End.value = settings.setup_day_2_end;
            if (settings.setup_day_2_min) setupDay2Min.value = settings.setup_day_2_min;
            if (settings.setup_day_3) setupDay3.value = settings.setup_day_3;
            if (settings.setup_day_3_start) setupDay3Start.value = settings.setup_day_3_start;
            if (settings.setup_day_3_end) setupDay3End.value = settings.setup_day_3_end;
            if (settings.setup_day_3_min) setupDay3Min.value = settings.setup_day_3_min;
            if (settings.teardown_day_1) teardownDay1.value = settings.teardown_day_1;
            if (settings.teardown_day_1_start) teardownDay1Start.value = settings.teardown_day_1_start;
            if (settings.teardown_day_1_end) teardownDay1End.value = settings.teardown_day_1_end;
            if (settings.teardown_day_1_min) teardownDay1Min.value = settings.teardown_day_1_min;
            
            // Cake counts
            if (settings.cakes_friday) cakesFriday.value = settings.cakes_friday;
            if (settings.cakes_saturday) cakesSaturday.value = settings.cakes_saturday;
            if (settings.cakes_sunday) cakesSunday.value = settings.cakes_sunday;
            
            // Update title line
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

    // Save Auf-/Abbau settings
    saveAufbauSettingsButton.addEventListener('click', async () => {
        try {
            const payload = {
                setup_day_1: setupDay1.value || '',
                setup_day_1_start: setupDay1Start.value || '08:00',
                setup_day_1_end: setupDay1End.value || '20:00',
                setup_day_1_min: setupDay1Min.value || '10',
                setup_day_2: setupDay2.value || '',
                setup_day_2_start: setupDay2Start.value || '08:00',
                setup_day_2_end: setupDay2End.value || '20:00',
                setup_day_2_min: setupDay2Min.value || '10',
                setup_day_3: setupDay3.value || '',
                setup_day_3_start: setupDay3Start.value || '08:00',
                setup_day_3_end: setupDay3End.value || '20:00',
                setup_day_3_min: setupDay3Min.value || '10',
                teardown_day_1: teardownDay1.value || '',
                teardown_day_1_start: teardownDay1Start.value || '08:00',
                teardown_day_1_end: teardownDay1End.value || '20:00',
                teardown_day_1_min: teardownDay1Min.value || '10'
            };
            const res = await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: payload })
            });
            if (!res.ok) throw new Error('Speichern fehlgeschlagen');
            alert('Auf-/Abbau Einstellungen gespeichert');
        } catch (err) { console.error('Fehler beim Speichern Aufbau/Abbau:', err); alert('Speichern fehlgeschlagen'); }
    });

    // Save cake count settings
    saveCakesSettingsButton.addEventListener('click', async () => {
        try {
            const payload = {
                cakes_friday: cakesFriday.value || '0',
                cakes_saturday: cakesSaturday.value || '0',
                cakes_sunday: cakesSunday.value || '0'
            };
            const res = await fetch(`${API_URL}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: payload })
            });
            if (!res.ok) throw new Error('Speichern fehlgeschlagen');
            alert('Kuchen-Anzahl gespeichert');
        } catch (err) { console.error('Fehler beim Speichern Kuchen-Anzahl:', err); alert('Speichern fehlgeschlagen'); }
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

    async function initialLoad() {
        await fetchAndRenderTeams();
        await fetchAndRenderHelpers();
        await fetchAndRenderGroups();
        await fetchAndRenderActivities();
        await loadSettings();
        
        // Populate export team filter
        const exportTeamFilter = document.getElementById('export-team-filter');
        if (exportTeamFilter) {
            exportTeamFilter.innerHTML = '<option value="">Alle Teams</option>';
            allTeams.forEach(team => exportTeamFilter.add(new Option(team.name, team.id)));
        }
    }

    // PDF Export functionality
    const exportPdfButton = document.getElementById('export-pdf-button');
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', async () => {
            const exportType = document.getElementById('export-type').value;
            const teamFilter = document.getElementById('export-team-filter').value;
            const orientation = document.getElementById('export-orientation').value;
            
            try {
                exportPdfButton.disabled = true;
                exportPdfButton.textContent = 'Erstelle PDF...';
                
                if (exportType === 'tournament') {
                    await exportTournamentPDF(teamFilter, orientation);
                } else if (exportType === 'setup') {
                    await exportSetupPDF(teamFilter, orientation);
                } else if (exportType === 'cakes') {
                    await exportCakesPDF(teamFilter, orientation);
                }
            } catch (err) {
                console.error('PDF Export Fehler:', err);
                alert('Fehler beim Erstellen des PDFs: ' + err.message);
            } finally {
                exportPdfButton.disabled = false;
                exportPdfButton.textContent = 'PDF erstellen';
            }
        });
    }
    
    async function exportTournamentPDF(teamFilter, orientation) {
        // Check if jsPDF is loaded
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library nicht geladen. Bitte laden Sie die Seite neu.');
        }
        
        // Load tournament shifts
        const shiftsRes = await fetch(`${API_URL}/tournament-shifts`);
        let shifts = await shiftsRes.json();
        
        // Filter by team if needed
        if (teamFilter) {
            shifts = shifts.filter(shift => {
                const helper = allHelpers.find(h => h.id == shift.helper_id);
                return helper && String(helper.team_id) === String(teamFilter);
            });
        }
        
        // Load activities
        const activitiesRes = await fetch(`${API_URL}/activities`);
        const activities = await activitiesRes.json();
        
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: orientation,
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        // Title
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Turnier-Planung', pageWidth / 2, 15, { align: 'center' });
        
        if (teamFilter) {
            const team = allTeams.find(t => t.id == teamFilter);
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text(`Team: ${team ? team.name : teamFilter}`, pageWidth / 2, 22, { align: 'center' });
        }
        
        // Group shifts by activity and time
        const groupedShifts = {};
        shifts.forEach(shift => {
            const activity = activities.find(a => a.id == shift.activity_id);
            if (!activity) return;
            
            const activityName = activity.name;
            if (!groupedShifts[activityName]) {
                groupedShifts[activityName] = [];
            }
            groupedShifts[activityName].push(shift);
        });
        
        // Render content
        let yPos = 30;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        
        Object.keys(groupedShifts).sort().forEach(activityName => {
            if (yPos > pageHeight - 20) {
                doc.addPage();
                yPos = 15;
            }
            
            // Activity name
            doc.setFont(undefined, 'bold');
            doc.text(activityName, 10, yPos);
            yPos += 5;
            doc.setFont(undefined, 'normal');
            
            // List shifts
            const activityShifts = groupedShifts[activityName].sort((a, b) => 
                new Date(a.start_time) - new Date(b.start_time)
            );
            
            activityShifts.forEach(shift => {
                if (yPos > pageHeight - 10) {
                    doc.addPage();
                    yPos = 15;
                }
                
                const startDate = new Date(shift.start_time);
                const timeStr = startDate.toLocaleString('de-DE', { 
                    weekday: 'short', 
                    day: '2-digit', 
                    month: '2-digit',
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                const helperName = shift.helper_name || 'N/A';
                doc.text(`  ${timeStr}: ${helperName}`, 10, yPos);
                yPos += 4;
            });
            
            yPos += 3;
        });
        
        // Save PDF
        const teamName = teamFilter ? allTeams.find(t => t.id == teamFilter)?.name || 'Team' : 'Alle';
        doc.save(`Turnier-Planung-${teamName}.pdf`);
    }
    
    async function exportSetupPDF(teamFilter, orientation) {
        // Check if jsPDF is loaded
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library nicht geladen. Bitte laden Sie die Seite neu.');
        }
        
        // Load all required data
        const [shiftsRes, settingsRes] = await Promise.all([
            fetch(`${API_URL}/setup-cleanup-shifts`),
            fetch(`${API_URL}/settings`)
        ]);
        let shifts = await shiftsRes.json();
        const settings = await settingsRes.json();
        
        // Filter by team if needed
        if (teamFilter) {
            shifts = shifts.filter(shift => {
                const helper = allHelpers.find(h => h.id == shift.helper_id);
                return helper && String(helper.team_id) === String(teamFilter);
            });
        }
        
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        // Title
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Auf- und Abbau Planung', pageWidth / 2, 10, { align: 'center' });
        
        if (teamFilter) {
            const team = allTeams.find(t => t.id == teamFilter);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Team: ${team ? team.name : teamFilter}`, pageWidth / 2, 16, { align: 'center' });
        }
        
        // Note: parseTime, formatTime, and hexToRgb are now in utils.js
        
        // Process days
        const daysData = [];
        for (let i = 1; i <= 3; i++) {
            const dateKey = `setup_day_${i}`;
            const startKey = `setup_day_${i}_start`;
            const endKey = `setup_day_${i}_end`;
            const date = settings[dateKey];
            const startTime = settings[startKey] || '08:00';
            const endTime = settings[endKey] || '20:00';
            
            if (date) {
                daysData.push({ type: 'Aufbau', date, startTime, endTime, dayNumber: i });
            }
        }
        
        const teardownDate = settings.teardown_day_1;
        if (teardownDate) {
            const startTime = settings.teardown_day_1_start || '08:00';
            const endTime = settings.teardown_day_1_end || '20:00';
            daysData.push({ type: 'Abbau', date: teardownDate, startTime, endTime, dayNumber: 1 });
        }
        
        // Render each day
        let xOffset = 10;
        let yStart = teamFilter ? 22 : 18;
        const columnWidth = 35;
        const rowHeight = 3;
        const headerHeight = 10;
        
        daysData.forEach(dayData => {
            const { type, date, startTime, endTime } = dayData;
            
            // Calculate shift blocks
            const startHours = parseTime(startTime);
            const endHours = parseTime(endTime);
            const shiftBlocks = [];
            let currentStart = startHours;
            
            while (currentStart < endHours) {
                const shiftEnd = Math.min(currentStart + 4, endHours);
                shiftBlocks.push({ start: currentStart, end: shiftEnd });
                currentStart = shiftEnd;
            }
            
            // Day header
            const d = new Date(date + 'T00:00:00');
            const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' });
            const dateStr = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            
            doc.setFontSize(8);
            doc.setFont(undefined, 'bold');
            doc.text(`${weekday} ${dateStr}`, xOffset + (columnWidth * shiftBlocks.length) / 2, yStart, { align: 'center' });
            doc.text(type, xOffset + (columnWidth * shiftBlocks.length) / 2, yStart + 4, { align: 'center' });
            
            let blockX = xOffset;
            
            // Render each shift block
            shiftBlocks.forEach(block => {
                const startStr = formatTime(block.start);
                const endStr = formatTime(block.end);
                
                // Block header
                doc.setFontSize(6);
                doc.setFont(undefined, 'bold');
                doc.text(`${startStr}-${endStr}`, blockX + columnWidth/2, yStart + 8, { align: 'center' });
                
                // Get shifts for this block
                const blockShifts = shifts.filter(s => {
                    if (s.day_type !== type) return false;
                    const shiftDate = s.start_time ? s.start_time.substring(0, 10) : '';
                    if (shiftDate !== date) return false;
                    if (!s.helper_id) return false;
                    
                    const shiftTime = new Date(s.start_time);
                    const shiftHour = shiftTime.getUTCHours() + shiftTime.getUTCMinutes() / 60;
                    return Math.abs(shiftHour - block.start) < 0.1;
                });
                
                doc.setFont(undefined, 'normal');
                doc.setFontSize(5);
                
                let rowY = yStart + headerHeight;
                
                // Draw helper boxes (max 20 for PDF space)
                blockShifts.slice(0, 20).forEach((shift, idx) => {
                    const helper = allHelpers.find(h => h.id == shift.helper_id);
                    if (!helper) return;
                    
                    const team = allTeams.find(t => t.id == helper.team_id);
                    const color = team ? hexToRgb(team.color_hex) : { r: 150, g: 150, b: 150 };
                    
                    // Draw colored box
                    doc.setFillColor(color.r, color.g, color.b);
                    doc.rect(blockX, rowY, columnWidth - 1, rowHeight - 0.3, 'F');
                    
                    // Draw text
                    doc.setTextColor(255, 255, 255);
                    doc.text(helper.name, blockX + columnWidth/2, rowY + rowHeight - 1, { 
                        align: 'center',
                        maxWidth: columnWidth - 2
                    });
                    doc.setTextColor(0, 0, 0);
                    
                    rowY += rowHeight;
                    
                    // Check if we need new column for this day
                    if (rowY > pageHeight - 15 && idx < blockShifts.length - 1) {
                        // Too many entries, truncate
                        doc.setFont(undefined, 'italic');
                        doc.text('...', blockX + columnWidth/2, rowY, { align: 'center' });
                        return;
                    }
                });
                
                blockX += columnWidth;
            });
            
            xOffset = blockX + 5;
            
            // Check if we need a new page
            if (xOffset > pageWidth - 40) {
                doc.addPage();
                xOffset = 10;
                yStart = 10;
            }
        });
        
        // Save PDF
        const teamName = teamFilter ? allTeams.find(t => t.id == teamFilter)?.name || 'Team' : 'Alle';
        doc.save(`Aufbau-Abbau-${teamName}.pdf`);
    }
    
    async function exportCakesPDF(teamFilter, orientation) {
        // Check if jsPDF is loaded
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library nicht geladen. Bitte laden Sie die Seite neu.');
        }
        
        // Load all required data
        const [cakesRes, settingsRes] = await Promise.all([
            fetch(`${API_URL}/cakes`),
            fetch(`${API_URL}/settings`)
        ]);
        let cakes = await cakesRes.json();
        const settings = await settingsRes.json();
        
        // Filter by team if needed
        if (teamFilter) {
            cakes = cakes.filter(cake => {
                const helper = allHelpers.find(h => h.id == cake.helper_id);
                return helper && String(helper.team_id) === String(teamFilter);
            });
        }
        
        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: orientation,
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        // Title
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Kuchen-Spenden Planung', pageWidth / 2, 12, { align: 'center' });
        
        if (teamFilter) {
            const team = allTeams.find(t => t.id == teamFilter);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Team: ${team ? team.name : teamFilter}`, pageWidth / 2, 18, { align: 'center' });
        }
        
        // Note: hexToRgb is now in utils.js
        
        // Group cakes by day
        const days = ['Freitag', 'Samstag', 'Sonntag'];
        const settingsKeys = ['cakes_friday', 'cakes_saturday', 'cakes_sunday'];
        
        let xOffset = 10;
        let yStart = teamFilter ? 24 : 20;
        const columnWidth = (pageWidth - 25) / 3;
        const rowHeight = 6;
        const headerHeight = 12;
        
        days.forEach((day, idx) => {
            const count = parseInt(settings[settingsKeys[idx]] || 0);
            if (count === 0) return;
            
            // Get cakes for this day
            const dayCakes = cakes.filter(c => c.donation_day === day && c.helper_id);
            
            // Day header
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(day, xOffset + columnWidth/2, yStart, { align: 'center' });
            doc.setFontSize(8);
            doc.text(`${dayCakes.length} / ${count}`, xOffset + columnWidth/2, yStart + 5, { align: 'center' });
            
            let rowY = yStart + headerHeight;
            
            // Draw cake entries
            doc.setFont(undefined, 'normal');
            doc.setFontSize(6);
            
            dayCakes.forEach((cake, cakeIdx) => {
                if (rowY > pageHeight - 10) return; // Page limit
                
                const helper = allHelpers.find(h => h.id == cake.helper_id);
                if (!helper) return;
                
                const team = allTeams.find(t => t.id == helper.team_id);
                const color = team ? hexToRgb(team.color_hex) : { r: 150, g: 150, b: 150 };
                
                // Draw colored box for helper name
                doc.setFillColor(color.r, color.g, color.b);
                doc.rect(xOffset, rowY, columnWidth - 2, rowHeight - 2, 'F');
                
                // Draw helper name
                doc.setTextColor(255, 255, 255);
                doc.text(helper.name, xOffset + (columnWidth - 2)/2, rowY + 2.5, { 
                    align: 'center',
                    maxWidth: columnWidth - 4
                });
                
                // Draw cake type and nuts info below
                doc.setTextColor(0, 0, 0);
                const cakeType = cake.cake_type || 'unbenannt';
                const nutsMarker = cake.contains_nuts ? ' 🥜' : '';
                doc.text(`${cakeType}${nutsMarker}`, xOffset + (columnWidth - 2)/2, rowY + 5, { 
                    align: 'center',
                    maxWidth: columnWidth - 4
                });
                
                rowY += rowHeight + 1;
            });
            
            xOffset += columnWidth + 2;
        });
        
        // Legend for nuts
        doc.setFontSize(7);
        doc.setFont(undefined, 'italic');
        doc.text('🥜 = enthält Nüsse', 10, pageHeight - 5);
        
        // Save PDF
        const teamName = teamFilter ? allTeams.find(t => t.id == teamFilter)?.name || 'Team' : 'Alle';
        doc.save(`Kuchen-${teamName}.pdf`);
    }

    initialLoad();
});