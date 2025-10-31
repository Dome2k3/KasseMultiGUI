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
    const setupDay1Min = document.getElementById('setup-day-1-min');
    const setupDay2 = document.getElementById('setup-day-2');
    const setupDay2Min = document.getElementById('setup-day-2-min');
    const setupDay3 = document.getElementById('setup-day-3');
    const setupDay3Min = document.getElementById('setup-day-3-min');
    const teardownDay1 = document.getElementById('teardown-day-1');
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
            if (settings.setup_day_1_min) setupDay1Min.value = settings.setup_day_1_min;
            if (settings.setup_day_2) setupDay2.value = settings.setup_day_2;
            if (settings.setup_day_2_min) setupDay2Min.value = settings.setup_day_2_min;
            if (settings.setup_day_3) setupDay3.value = settings.setup_day_3;
            if (settings.setup_day_3_min) setupDay3Min.value = settings.setup_day_3_min;
            if (settings.teardown_day_1) teardownDay1.value = settings.teardown_day_1;
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
                setup_day_1_min: setupDay1Min.value || '10',
                setup_day_2: setupDay2.value || '',
                setup_day_2_min: setupDay2Min.value || '10',
                setup_day_3: setupDay3.value || '',
                setup_day_3_min: setupDay3Min.value || '10',
                teardown_day_1: teardownDay1.value || '',
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
        // Load setup/cleanup shifts
        const shiftsRes = await fetch(`${API_URL}/setup-cleanup-shifts`);
        let shifts = await shiftsRes.json();
        
        // Filter by team if needed
        if (teamFilter) {
            shifts = shifts.filter(shift => {
                const helper = allHelpers.find(h => h.id == shift.helper_id);
                return helper && String(helper.team_id) === String(teamFilter);
            });
        }
        
        // Filter out empty shifts
        shifts = shifts.filter(s => s.helper_id);
        
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
        doc.text('Auf- und Abbau Planung', pageWidth / 2, 15, { align: 'center' });
        
        if (teamFilter) {
            const team = allTeams.find(t => t.id == teamFilter);
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text(`Team: ${team ? team.name : teamFilter}`, pageWidth / 2, 22, { align: 'center' });
        }
        
        // Group shifts by date and type
        const groupedByDay = {};
        shifts.forEach(shift => {
            const date = shift.start_time.substring(0, 10);
            const key = `${date}-${shift.day_type}`;
            if (!groupedByDay[key]) {
                groupedByDay[key] = {
                    date: date,
                    type: shift.day_type,
                    shifts: []
                };
            }
            groupedByDay[key].shifts.push(shift);
        });
        
        // Render content
        let yPos = 30;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        
        Object.values(groupedByDay).sort((a, b) => a.date.localeCompare(b.date)).forEach(day => {
            if (yPos > pageHeight - 20) {
                doc.addPage();
                yPos = 15;
            }
            
            // Day header
            const d = new Date(day.date + 'T00:00:00');
            const dateStr = d.toLocaleDateString('de-DE', { 
                weekday: 'long', 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric' 
            });
            
            doc.setFont(undefined, 'bold');
            doc.text(`${day.type} - ${dateStr} (${day.shifts.length} Helfer)`, 10, yPos);
            yPos += 5;
            doc.setFont(undefined, 'normal');
            
            // List helpers
            day.shifts.forEach((shift, idx) => {
                if (yPos > pageHeight - 10) {
                    doc.addPage();
                    yPos = 15;
                }
                
                const helperName = shift.helper_name || 'N/A';
                doc.text(`  ${idx + 1}. ${helperName}`, 10, yPos);
                yPos += 4;
            });
            
            yPos += 3;
        });
        
        // Save PDF
        const teamName = teamFilter ? allTeams.find(t => t.id == teamFilter)?.name || 'Team' : 'Alle';
        doc.save(`Aufbau-Abbau-${teamName}.pdf`);
    }
    
    async function exportCakesPDF(teamFilter, orientation) {
        // Load cakes
        const cakesRes = await fetch(`${API_URL}/cakes`);
        let cakes = await cakesRes.json();
        
        // Filter by team if needed
        if (teamFilter) {
            cakes = cakes.filter(cake => {
                const helper = allHelpers.find(h => h.id == cake.helper_id);
                return helper && String(helper.team_id) === String(teamFilter);
            });
        }
        
        // Filter out empty cakes
        cakes = cakes.filter(c => c.helper_id);
        
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
        doc.text('Kuchen-Spenden Planung', pageWidth / 2, 15, { align: 'center' });
        
        if (teamFilter) {
            const team = allTeams.find(t => t.id == teamFilter);
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text(`Team: ${team ? team.name : teamFilter}`, pageWidth / 2, 22, { align: 'center' });
        }
        
        // Group cakes by day
        const groupedByDay = {
            'Freitag': [],
            'Samstag': [],
            'Sonntag': []
        };
        
        cakes.forEach(cake => {
            if (groupedByDay[cake.donation_day]) {
                groupedByDay[cake.donation_day].push(cake);
            }
        });
        
        // Render content
        let yPos = 30;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        
        Object.keys(groupedByDay).forEach(day => {
            const dayCakes = groupedByDay[day];
            if (dayCakes.length === 0) return;
            
            if (yPos > pageHeight - 20) {
                doc.addPage();
                yPos = 15;
            }
            
            // Day header
            doc.setFont(undefined, 'bold');
            doc.text(`${day} (${dayCakes.length} Kuchen)`, 10, yPos);
            yPos += 5;
            doc.setFont(undefined, 'normal');
            
            // List cakes
            dayCakes.forEach((cake, idx) => {
                if (yPos > pageHeight - 10) {
                    doc.addPage();
                    yPos = 15;
                }
                
                const helperName = cake.helper_name || 'N/A';
                const cakeType = cake.cake_type || 'unbenannt';
                const nuts = cake.contains_nuts ? ' (enthält Nüsse)' : '';
                
                doc.text(`  ${idx + 1}. ${helperName}: ${cakeType}${nuts}`, 10, yPos);
                yPos += 4;
            });
            
            yPos += 3;
        });
        
        // Save PDF
        const teamName = teamFilter ? allTeams.find(t => t.id == teamFilter)?.name || 'Team' : 'Alle';
        doc.save(`Kuchen-${teamName}.pdf`);
    }

    initialLoad();
});