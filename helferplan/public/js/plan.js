document.addEventListener('DOMContentLoaded', () => {
    // API base for Helferplan
    const API_URL_HELFERPLAN = (() => {
        const meta = document.querySelector('meta[name="api-url-helferplan"]');
        if (meta && meta.content) return meta.content.replace(/\/$/, '');
        if (window.__API_URL_HELFERPLAN) return String(window.__API_URL_HELFERPLAN).replace(/\/$/, '');
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return `${window.location.protocol}//${window.location.hostname}:3003/api`;
        }
        return `${window.location.origin}/api`;
    })();
    window.API_URL_HELFERPLAN = API_URL_HELFERPLAN;
    console.info('API_URL_HELFERPLAN =', API_URL_HELFERPLAN);

    // DOM elements
    const timelineHeader = document.getElementById('timeline-header');
    const gridContainer = document.getElementById('grid-container');
    const teamListPanel = document.getElementById('team-list-panel');
    const planTeamFilter = document.getElementById('plan-team-filter');
    const viewTeamFilter = document.getElementById('view-team-filter');
    const helperPool = document.getElementById('helper-pool');

    const modal = document.getElementById('shift-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const teamSelect = document.getElementById('modal-team-select');
    const helperSelect = document.getElementById('modal-helper-select');

    // Globale State-Variablen
    // WICHTIG: allActivities muss synchron mit den API-Daten gehalten werden
    // Diese Variable wird für Drag-and-Drop-Validierung verwendet
    let allActivities = []; // Wird in generateGrid() aus API geladen

    // Config
    const HOUR_PX = 40;      // width per hour column
    const LEFT_COL_PX = 200; // left name column width

    // State
    let allHelpers = [];
    let allTeams = [];
    let helperById = {};
    let EVENT_START_DATE = '2024-07-19T12:00:00Z'; // fallback
    let highlightedSlots = []; // [{el, originalBg, hourIndex}] start first then next
    let allShifts = []; // cached shift array from server; used to find shift ids

    // --- Helpers ---
    function hourIndexToDate(index) {
        const start = new Date(EVENT_START_DATE);
        start.setHours(start.getHours() + index);
        return start;
    }

    function dateToHourIndex(dateString) {
        const start = new Date(EVENT_START_DATE);
        const d = new Date(dateString);
        const diff = (d - start) / (1000 * 60 * 60);
        return Math.round(diff);
    }

    function luminanceForHex(hex) {
        try {
            const c = hex.replace('#','');
            const r = parseInt(c.slice(0,2),16);
            const g = parseInt(c.slice(2,4),16);
            const b = parseInt(c.slice(4,6),16);
            return (0.299*r + 0.587*g + 0.114*b);
        } catch (e) { return 0; }
    }

    // Prüft ob eine Zeit für eine Aktivität erlaubt ist
    // TODO: Implementierung basierend auf Aktivitäts-Zeitfenster
    function isTimeAllowed(activity, startTime) {
        // Aktuell keine spezifischen Zeitbeschränkungen implementiert
        // Diese Funktion kann erweitert werden, um z.B. Aktivitäts-spezifische
        // Zeitfenster zu prüfen (z.B. activity.allowed_start, activity.allowed_end)

        // Basale Validierung: Prüfe ob Aktivität überhaupt definiert ist
        if (!activity) {
            console.warn('isTimeAllowed: Keine Aktivität übergeben');
            return false;
        }

        // Weitere Validierungslogik kann hier hinzugefügt werden
        return true;
    }

    // --- Rendering helpers ---
    function renderTeamListPanel() {
        teamListPanel.innerHTML = '';
        allTeams.forEach(team => {
            const div = document.createElement('div');
            div.className = 'team-item';
            const colorBox = document.createElement('div');
            colorBox.className = 'team-color';
            const color = team.color_hex || '#666';
            colorBox.style.backgroundColor = color;
            colorBox.style.color = luminanceForHex(color) > 160 ? '#111' : '#fff';
            colorBox.textContent = team.name;
            div.appendChild(colorBox);
            teamListPanel.appendChild(div);
        });
    }

    function populatePlanTeamFilter() {
        planTeamFilter.innerHTML = '<option value="">-- Team wählen --</option>';
        allTeams.forEach(team => planTeamFilter.appendChild(new Option(team.name, team.id)));
    }

    function populateViewTeamFilter() {
        viewTeamFilter.innerHTML = '<option value="">Alle Teams</option>';
        allTeams.forEach(team => viewTeamFilter.appendChild(new Option(team.name, team.id)));
    }

    function populateModalTeamSelect() {
        teamSelect.innerHTML = '<option value="">Team auswaehlen</option>';
        allTeams.forEach(team => teamSelect.add(new Option(team.name, team.id)));
    }

    function renderHelperPool() {
        helperPool.innerHTML = '';
        const selectedTeam = planTeamFilter.value;
        if (!selectedTeam) {
            const empty = document.createElement('div');
            empty.id = 'helper-pool-empty';
            empty.textContent = 'Wähle ein Team um Helfer anzuzeigen.';
            helperPool.appendChild(empty);
            return;
        }
        const helpers = allHelpers.filter(h => String(h.team_id) === String(selectedTeam));
        if (!helpers.length) {
            const empty = document.createElement('div');
            empty.id = 'helper-pool-empty';
            empty.textContent = 'Keine Helfer in dieser Mannschaft.';
            helperPool.appendChild(empty);
            return;
        }
        helpers.forEach(h => {
            const div = document.createElement('div');
            div.className = 'helper-item';
            div.draggable = true;
            div.dataset.helperId = h.id;
            div.dataset.helperName = h.name;
            const team = allTeams.find(t => t.id == h.team_id);
            const color = team ? team.color_hex : '#888';
            div.dataset.teamColor = color;
            div.innerHTML = `<strong>${h.name}</strong>`;
            div.addEventListener('dragstart', (ev) => {
                const payload = JSON.stringify({ helper_id: h.id, helper_name: h.name, team_color: color, team_id: h.team_id });
                ev.dataTransfer.setData('application/json', payload);
                ev.dataTransfer.effectAllowed = 'copy';
            });
            helperPool.appendChild(div);
        });
    }

    // --- Timeline / Grid generation ---
    function generateTimeline() {
        const hoursCountByDay = [12, 24, 18];
        const days = ['Freitag','Samstag','Sonntag'];
        const totalHours = hoursCountByDay.reduce((a,b)=>a+b,0);
        const gridTemplateColumns = `${LEFT_COL_PX}px repeat(${totalHours}, ${HOUR_PX}px)`;

        timelineHeader.innerHTML = '';
        timelineHeader.style.display = 'grid';
        timelineHeader.style.gridTemplateColumns = gridTemplateColumns;
        timelineHeader.style.gridGap = '0';
        timelineHeader.style.paddingLeft = '0';
        timelineHeader.style.paddingInlineStart = '0';

        const placeholder = document.createElement('div');
        placeholder.className = 'left-placeholder';
        placeholder.style.background = 'transparent';
        placeholder.style.margin = '0';
        placeholder.style.padding = '0';
        placeholder.style.width = `${LEFT_COL_PX}px`;
        placeholder.style.minWidth = `${LEFT_COL_PX}px`;
        placeholder.style.maxWidth = `${LEFT_COL_PX}px`;
        timelineHeader.appendChild(placeholder);

        const daysWrapper = document.createElement('div');
        daysWrapper.style.display = 'grid';
        daysWrapper.style.gridTemplateColumns = `repeat(${totalHours}, ${HOUR_PX}px)`;
        daysWrapper.style.gridColumn = '2 / -1';
        daysWrapper.style.gap = '0';

        let offset = 0;
        hoursCountByDay.forEach((count, idx) => {
            const dh = document.createElement('div');
            dh.className = 'day-header';
            dh.style.gridColumn = `${offset+1} / ${offset+1+count}`;
            dh.style.textAlign = 'center';
            dh.style.padding = '6px 0';
            dh.textContent = days[idx] || '';
            daysWrapper.appendChild(dh);
            offset += count;
        });
        timelineHeader.appendChild(daysWrapper);

        const hoursWrapper = document.createElement('div');
        hoursWrapper.style.display = 'grid';
        hoursWrapper.style.gridTemplateColumns = `repeat(${totalHours}, ${HOUR_PX}px)`;
        hoursWrapper.style.gridColumn = '2 / -1';
        hoursWrapper.style.gap = '0';
        for (let i=0;i<totalHours;i++){
            const hour = document.createElement('div');
            hour.className = 'hour-slot';
            hour.textContent = `${(12 + i) % 24}:00`;
            hoursWrapper.appendChild(hour);
        }
        timelineHeader.appendChild(hoursWrapper);

        return { totalHours, gridTemplateColumns };
    }

    async function generateGrid(timelineConfig) {
        const resp = await fetch(`${API_URL_HELFERPLAN}/activities`);
        if (!resp.ok) throw new Error('Fehler beim Laden der Taetigkeiten');
        const activities = await resp.json();

        // KRITISCH: Synchronisiere die global verfügbare allActivities-Variable
        // Diese wird für Drag-and-Drop-Validierung benötigt (Zeile ~261)
        allActivities = activities;
        console.log('allActivities synchronisiert:', allActivities.length, 'Aktivitäten geladen');

        const groups = activities.reduce((acc, a) => {
            const g = a.group_name || 'Ohne Gruppe';
            (acc[g] || (acc[g]=[])).push(a);
            return acc;
        }, {});

        gridContainer.innerHTML = '';

        for (const groupName in groups) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'activity-group-header';
            groupHeader.textContent = groupName;
            gridContainer.appendChild(groupHeader);

            groups[groupName].forEach(activity => {
                const row = document.createElement('div');
                row.className = 'activity-row';
                row.style.display = 'grid';
                row.style.gridTemplateColumns = timelineConfig.gridTemplateColumns;
                row.style.gridGap = '0';

                const nameCell = document.createElement('div');
                nameCell.className = 'activity-name';
                nameCell.textContent = activity.name;
                row.appendChild(nameCell);

                for (let i=0;i<timelineConfig.totalHours;i++){
                    const slot = document.createElement('div');
                    slot.className = 'shift-slot';
                    // WICHTIG: Setze data-activity-id für Drag-and-Drop-Validierung
                    slot.dataset.activityId = activity.id;
                    slot.dataset.hourIndex = i;

                    // Validierung: Prüfe ob activity.id gesetzt ist
                    if (!activity.id) {
                        console.warn('Aktivität ohne ID erkannt:', activity);
                    }

                    slot.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        handleHoverHighlight(slot);
                    });
                    slot.addEventListener('dragenter', (e) => {
                        e.preventDefault();
                        handleHoverHighlight(slot);
                    });
                    slot.addEventListener('dragleave', (e) => {
                        clearHoverHighlight();
                    });

                    // DROP handler: prefer highlighted slots in the same row for consistency
                    // Validiert Helfer-Berechtigung und Zeitverfügbarkeit vor dem Erstellen der Schicht
                    slot.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        try {
                            const data = JSON.parse(e.dataTransfer.getData('application/json'));
                            if (!data || !data.helper_id) return;

                            const helperId = data.helper_id;
                            const helper = allHelpers.find(h => h.id === helperId);

                            if (!helper) {
                                alert('Fehler: Der ausgewählte Helfer konnte nicht gefunden werden.');
                                return;
                            }

                            // KRITISCH: Hole Aktivität aus allActivities (muss synchronisiert sein)
                            const activityId = parseInt(slot.dataset.activityId);
                            const activity = allActivities.find(a => a.id === activityId);

                            if (!activity) {
                                console.error('Keine Aktivität gefunden für ID:', activityId);
                                console.error('Verfügbare Aktivitäten (erste 10):', allActivities.slice(0, 10).map(a => ({ id: a.id, name: a.name })));
                                console.error('Slot dataset:', slot.dataset);
                                alert(`Fehler: Aktivität mit ID ${activityId} nicht gefunden. Möglicherweise wurden die Aktivitätsdaten nicht korrekt geladen.`);
                                return;
                            }

                            const startIndex = parseInt(slot.dataset.hourIndex);
                            const startTime = hourIndexToDate(startIndex);

                            // Validierung: Prüfe, ob der Helfer für die Aktivität geeignet ist
                            if (activity.role_requirement === 'Erwachsen' && helper.role === 'Minderjaehrig') {
                                alert('Fehler: Diese Schicht erfordert einen Erwachsenen. Der ausgewählte Helfer ist nicht berechtigt.');
                                return;
                            }

                            if (!isTimeAllowed(activity, startTime)) {
                                alert('Diese Zeit ist für die Schicht nicht verfügbar.');
                                return;
                            }

                            const endTime = hourIndexToDate(startIndex + 2);

                            // Setze die Farbe und den Text sofort, bevor der Server-Call erfolgt
                            const team = allTeams.find(t => t.id == helper.team_id);
                            const teamColor = team ? team.color_hex : '#888';

                            slot.innerHTML = `<strong>${helper.name}</strong>`;
                            slot.classList.add('filled');
                            slot.style.backgroundColor = teamColor;
                            slot.dataset.helperId = helperId;

                            const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    activity_id: activityId,
                                    start_time: startTime.toISOString(),
                                    end_time: endTime.toISOString(),
                                    helper_id: helperId,
                                }),
                            });

                            if (!resp.ok) {
                                const txt = await resp.text().catch(() => null);
                                throw new Error(txt || 'Server Fehler beim Anlegen');
                            }

                            // Erfolg: Schichten neu laden, um die Anzeige zu synchronisieren
                            await fetchAndRenderAllShifts();
                        } catch (err) {
                            console.error('Drop Fehler:', err);
                            alert('Fehler beim Eintragen der Schicht: ' + err.message);
                        } finally {
                            clearHoverHighlight();
                        }
                    });

                    slot.addEventListener('click', () => openShiftModal(slot, activity));
                    row.appendChild(slot);
                }

                gridContainer.appendChild(row);
            });
        }
    }

    // Hover: highlight exactly 2 cells (start + next).
    function handleHoverHighlight(slot) {
        clearHoverHighlight();

        const idx = parseInt(slot.dataset.hourIndex);
        const row = slot.parentElement;
        if (!row) return;

        // start slot detection (walk left if hovered slot is a hidden follow-slot)
        let startIdx = idx;
        let startSlot = row.querySelector(`.shift-slot[data-hour-index='${startIdx}']`);
        if (!startSlot) return;

        if (startSlot.classList.contains('slot-hidden')) {
            let back = startIdx - 1;
            while (back >= 0) {
                const cand = row.querySelector(`.shift-slot[data-hour-index='${back}']`);
                if (!cand) { back--; continue; }
                if (!cand.classList.contains('slot-hidden')) {
                    startIdx = back;
                    startSlot = cand;
                    break;
                }
                back--;
            }
        }

        if (startSlot && !startSlot.classList.contains('slot-hidden')) {
            highlightedSlots.push({ el: startSlot, originalBg: startSlot.style.backgroundColor || '', hourIndex: startIdx });
            startSlot.classList.add('potential-drop');
        }

        const nextIdx = startIdx + 1;
        const nextSlot = row.querySelector(`.shift-slot[data-hour-index='${nextIdx}']`);
        if (nextSlot && !nextSlot.classList.contains('slot-hidden')) {
            highlightedSlots.push({ el: nextSlot, originalBg: nextSlot.style.backgroundColor || '', hourIndex: nextIdx });
            nextSlot.classList.add('potential-drop');
        }
    }

    function clearHoverHighlight() {
        highlightedSlots.forEach(item => {
            if (item.el) {
                item.el.classList.remove('potential-drop');
                item.el.classList.remove('drop-target');
                item.el.style.backgroundColor = item.originalBg || '';
            }
        });
        highlightedSlots = [];
    }

    // --- NEW: helper to fetch shifts (returns array) ---
    async function getShifts() {
        const r = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`);
        if (!r.ok) throw new Error('Fehler beim Laden der Schichten');
        return await r.json();
    }

    // Fetch shifts and render them into the grid, using grid-column spans
    async function fetchAndRenderAllShifts() {
        document.querySelectorAll('.shift-slot').forEach(s => {
            s.innerHTML = '';
            s.classList.remove('filled');
            s.style.backgroundColor = '';
            s.style.gridColumn = '';
            s.classList.remove('slot-hidden');
            s.classList.remove('dimmed');
            delete s.dataset.helperId;
            delete s.dataset.hiddenForSpan;
            delete s.dataset.startTime;
            delete s.dataset.shiftId;
        });

        try {
            const shifts = await getShifts();
            allShifts = shifts || [];
            shifts.forEach(shift => {
                const startIdx = dateToHourIndex(shift.start_time);
                const endIdx = dateToHourIndex(shift.end_time);
                const duration = Math.max(1, endIdx - startIdx);

                const startSlot = document.querySelector(`.shift-slot[data-activity-id='${shift.activity_id}'][data-hour-index='${startIdx}']`);
                if (!startSlot) return;

                startSlot.innerHTML = shift.helper_name ? shift.helper_name.split(' ')[0] : '—';
                startSlot.classList.add('filled');
                startSlot.style.backgroundColor = shift.team_color || '#666';
                startSlot.dataset.helperId = shift.helper_id || '';
                // store server-provided start and id (server now reliably returns id)
                startSlot.dataset.startTime = shift.start_time;
                if (shift.id) startSlot.dataset.shiftId = shift.id;

                if (duration > 1) {
                    startSlot.style.gridColumn = `span ${duration}`;
                    for (let k=1;k<duration;k++){
                        const follow = document.querySelector(`.shift-slot[data-activity-id='${shift.activity_id}'][data-hour-index='${startIdx + k}']`);
                        if (follow) {
                            follow.classList.add('slot-hidden');
                            follow.dataset.hiddenForSpan = 'true';
                        }
                    }
                }
            });
            applyViewFilter();
        } catch (err) {
            console.error('fetchAndRenderAllShifts error', err);
        }
    }

    // View filter dims non-selected team slots
    function applyViewFilter() {
        const viewTeamId = viewTeamFilter.value;
        if (!viewTeamId) {
            document.querySelectorAll('.shift-slot').forEach(s => s.classList.remove('dimmed'));
            return;
        }
        document.querySelectorAll('.shift-slot').forEach(s => {
            const helperId = s.dataset.helperId;
            if (!helperId) { s.classList.remove('dimmed'); return; }
            const helper = helperById[helperId];
            const tid = helper ? String(helper.team_id) : null;
            if (tid && tid === String(viewTeamId)) s.classList.remove('dimmed'); else s.classList.add('dimmed');
        });
    }

    // --- Modal logic (click-to-edit) ---
    let currentSlot = null;
    function openShiftModal(slotElement, activity) {
        // If clicked slot is a hidden follow-slot, find its visible start slot (walk left)
        let slot = slotElement;
        if (slot.dataset.hiddenForSpan === 'true' || slot.classList.contains('slot-hidden')) {
            const row = slot.closest('.activity-row');
            let idx = parseInt(slot.dataset.hourIndex);
            while (idx >= 0) {
                const cand = row.querySelector(`.shift-slot[data-hour-index='${idx}']`);
                if (cand && !cand.classList.contains('slot-hidden')) {
                    slot = cand;
                    break;
                }
                idx--;
            }
        }

        currentSlot = slot;
        const startIso = currentSlot.dataset.startTime || hourIndexToDate(parseInt(currentSlot.dataset.hourIndex)).toISOString();
        const startTime = new Date(startIso);

        modalTitle.textContent = `${activity.name}`;
        modalSubtitle.textContent = `${startTime.toLocaleString('de-DE', { weekday:'long', hour:'2-digit', minute:'2-digit' })} Uhr`;

        teamSelect.innerHTML = '<option value="">Team auswaehlen</option>';
        allTeams.forEach(t => teamSelect.add(new Option(t.name, t.id)));

        const existingHelperId = currentSlot.dataset.helperId;
        if (existingHelperId) {
            const helper = allHelpers.find(h => h.id == existingHelperId);
            if (helper) {
                teamSelect.value = helper.team_id;
                updateHelperDropdown(helper.team_id);
                helperSelect.value = helper.id;
            }
        } else updateHelperDropdown('');

        modal.style.display = 'flex';
    }

    function updateHelperDropdown(teamId) {
        helperSelect.innerHTML = '<option value="">Helfer auswawhlen</option>';
        if (teamId) allHelpers.filter(h => h.team_id == teamId).forEach(h => helperSelect.add(new Option(h.name, h.id)));
    }

    function setupModalListeners() {
        teamSelect.addEventListener('change', () => updateHelperDropdown(teamSelect.value));
        modal.querySelector('#cancel-shift-button').addEventListener('click', () => modal.style.display = 'none');

        modal.querySelector('#shift-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const helperId = helperSelect.value;
            if (!helperId) { alert('Bitte einen Helfer auswawhlen.'); return; }
            const activityId = currentSlot.dataset.activityId;
            const hourIndex = parseInt(currentSlot.dataset.hourIndex);
            const startTime = hourIndexToDate(hourIndex);
            const endTime = hourIndexToDate(hourIndex + 2);

            const response = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity_id: activityId, start_time: startTime.toISOString(), end_time: endTime.toISOString(), helper_id: helperId })
            });

            if (response.status === 409) {
                // Conflict: server should provide existing_shift in body
                let body = null;
                try { body = await response.json(); } catch(e){ body = null; }
                const existing = body && (body.existing_shift || body.conflicting_shift || body.existing);
                if (existing) {
                    const who = existing.helper_name || existing.helper_id || 'unbekannt';
                    if (confirm(`Konflikt: Es existiert bereits eine Schicht (${who}). Überschreiben?`)) {
                        // attempt delete by id if server provided it
                        if (existing.id) {
                            const del = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts/${existing.id}`, { method: 'DELETE' });
                            if (!del.ok) alert('Löschen der bestehenden Schicht fehlgeschlagen; siehe Konsole.');
                            else {
                                // retry create
                                const retry = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ activity_id: activityId, start_time: startTime.toISOString(), end_time: endTime.toISOString(), helper_id: helperId })
                                });
                                if (!retry.ok) alert('Erneutes Anlegen nach Löschung fehlgeschlagen.');
                            }
                        } else {
                            alert('Server lieferte keine ID; automatisches Überschreiben nicht möglich.');
                        }
                    }
                } else {
                    alert('Konflikt beim Anlegen (409). Siehe Konsole.');
                }
                await fetchAndRenderAllShifts();
                return;
            }

            if (response.ok) {
                modal.style.display = 'none';
                await fetchAndRenderAllShifts();
            } else {
                let txt = '';
                try { txt = await response.text(); } catch(e){}
                console.error('Save shift failed', response.status, txt);
                alert('Die Rolle des Helfers entspricht nicht den Anforderungen der Schicht (Erwachsener oder Orga).');
            }
        });

        // DELETE handler: prefer deleting by shift id if available
        modal.querySelector('#delete-shift-button').addEventListener('click', async () => {
            if (!currentSlot || !currentSlot.dataset.helperId) { modal.style.display = 'none'; return; }
            if (!confirm('Soll die Schicht wirklich geleert werden?')) return;

            const shiftId = currentSlot.dataset.shiftId;
            if (shiftId) {
                try {
                    const del = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts/${shiftId}`, { method: 'DELETE' });
                    const text = await del.text().catch(()=>null);
                    console.log('DELETE by id response', del.status, text);
                    if (!del.ok) {
                        // fallback to previous behavior if server doesn't support DELETE by id
                        console.warn('DELETE by id failed; falling back to body-delete');
                    } else {
                        await fetchAndRenderAllShifts();
                        modal.style.display = 'none';
                        return;
                    }
                } catch (err) {
                    console.error('DELETE by id failed', err);
                }
            }

            // fallback: body-based delete (existing robust logic)
            const activityId = currentSlot.dataset.activityId;
            const helperId = currentSlot.dataset.helperId;
            const startTimeIso = currentSlot.dataset.startTime || hourIndexToDate(parseInt(currentSlot.dataset.hourIndex)).toISOString();

            // simple delete attempt
            try {
                const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ activity_id: activityId, start_time: startTimeIso, helper_id: helperId })
                });
                const text = await resp.text().catch(()=>null);
                console.log('DELETE fallback response', resp.status, text);
                // refresh list
                await fetchAndRenderAllShifts();
                modal.style.display = 'none';
            } catch (err) {
                console.error('Fallback delete failed', err);
                alert('Fehler beim Löschen der Schicht.');
            }
        });

        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }


    // --- Initialization ---
    async function init() {
        try {
            const sres = await fetch(`${API_URL_HELFERPLAN}/settings`);
            if (sres.ok) {
                const settings = await sres.json();
                if (settings.event_friday) EVENT_START_DATE = `${settings.event_friday}T12:00:00Z`;
            }
        } catch (e) {
            // ignore, keep fallback
        }

        [allHelpers, allTeams] = await Promise.all([
            fetch(`${API_URL_HELFERPLAN}/helpers`).then(r => r.ok ? r.json() : []),
            fetch(`${API_URL_HELFERPLAN}/teams`).then(r => r.ok ? r.json() : [])
        ]);

        helperById = {};
        allHelpers.forEach(h => helperById[h.id] = h);

        renderTeamListPanel();
        populateModalTeamSelect();
        populatePlanTeamFilter();
        populateViewTeamFilter();

        const timelineConfig = generateTimeline();
        await generateGrid(timelineConfig);
        await fetchAndRenderAllShifts();
        setupModalListeners();

        planTeamFilter.addEventListener('change', () => renderHelperPool());
        viewTeamFilter.addEventListener('change', () => applyViewFilter());
    }

    init().catch(err => console.error('Init error:', err));
});
