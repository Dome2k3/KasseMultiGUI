document.addEventListener('DOMContentLoaded', () => {
    // Verwende immer Port 3003 auf dem aktuellen Host
    const API_URL = `${window.location.protocol}//${window.location.hostname}:3003/api`;

    const timelineHeader = document.getElementById('timeline-header');
    const gridContainer = document.getElementById('grid-container');
    const modal = document.getElementById('shift-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const teamSelect = document.getElementById('modal-team-select');
    const helperSelect = document.getElementById('modal-helper-select');

    // Neue Elemente: left panel
    const teamListPanel = document.getElementById('team-list-panel');
    const planTeamFilter = document.getElementById('plan-team-filter'); // filter für Helper-Pool
    const viewTeamFilter = document.getElementById('view-team-filter'); // Ansicht-Filter
    const helperPool = document.getElementById('helper-pool');

    let allHelpers = [];
    let allTeams = [];
    let helperById = {};
    let currentSlot = null;

    // Fallback falls kein Setting vorhanden ist
    const FALLBACK_EVENT_START = '2024-07-19T12:00:00Z'; // fallback: Friday 12:00 UTC

    // Wird später per Setting gesetzt
    let EVENT_START_DATE = FALLBACK_EVENT_START;

    // Breite pro Stunde (verkleinert, Plan insgesamt schmaler)
    const HOUR_PX = 40; // kleiner als vorher (60 -> 40)

    // Tracking highlight beim Drag
    let highlightedSlots = [];

    function hourIndexToDate(index) {
        const startDate = new Date(EVENT_START_DATE);
        startDate.setHours(startDate.getHours() + index);
        return startDate;
    }

    function dateToHourIndex(dateString) {
        const startDate = new Date(EVENT_START_DATE);
        const shiftDate = new Date(dateString);
        const diffHours = (shiftDate - startDate) / (1000 * 60 * 60);
        // Runde auf ganze Stunden
        return Math.round(diffHours);
    }

    async function init() {
        // Lade Settings zuerst, um EVENT_START_DATE setzen zu können
        try {
            const settingsRes = await fetch(`${API_URL}/settings`);
            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                if (settings.event_friday) {
                    EVENT_START_DATE = `${settings.event_friday}T12:00:00Z`;
                }
            }
        } catch (err) {
            console.warn('Konnte Settings nicht laden, benutze Fallback.', err);
            EVENT_START_DATE = FALLBACK_EVENT_START;
        }

        [allHelpers, allTeams] = await Promise.all([
            fetch(`${API_URL}/helpers`).then(res => res.json()),
            fetch(`${API_URL}/teams`).then(res => res.json())
        ]);

        // build helperById map
        helperById = {};
        allHelpers.forEach(h => { helperById[h.id] = h; });

        renderTeamListPanel();
        populateModalTeamSelect();
        populatePlanTeamFilter();
        populateViewTeamFilter();

        const timelineConfig = generateTimeline();
        await generateGrid(timelineConfig);
        await fetchAndRenderAllShifts();
        setupModalListeners();

        // Filter change: render helper pool
        planTeamFilter.addEventListener('change', () => renderHelperPool());
        // Ansicht-Filter: aktualisiert Darstellung der Farben
        viewTeamFilter.addEventListener('change', () => applyViewFilter());
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

    function renderTeamListPanel() {
        teamListPanel.innerHTML = '';
        allTeams.forEach(team => {
            const div = document.createElement('div');
            div.className = 'team-item';
            const colorBox = document.createElement('div');
            colorBox.className = 'team-color';
            const color = team.color_hex || '#666';
            colorBox.style.backgroundColor = color;
            const lum = luminanceForHex(color);
            colorBox.style.color = lum > 160 ? '#111' : '#fff';
            colorBox.textContent = team.name; // jetzt der Teamname in der Teamfarbe
            div.appendChild(colorBox);
            teamListPanel.appendChild(div);
        });
    }

    function populatePlanTeamFilter() {
        planTeamFilter.innerHTML = '<option value="">-- Team wählen --</option>';
        allTeams.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team.id;
            opt.textContent = team.name;
            planTeamFilter.appendChild(opt);
        });
    }

    function populateViewTeamFilter() {
        viewTeamFilter.innerHTML = '<option value="">Alle Teams</option>';
        allTeams.forEach(team => {
            const opt = document.createElement('option');
            opt.value = team.id;
            opt.textContent = team.name;
            viewTeamFilter.appendChild(opt);
        });
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
            // find team color
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

    function generateTimeline() {
        const days = ['Freitag', 'Samstag', 'Sonntag'];
        // Stunden pro Tag wie vorher: 12/24/18
        let hoursCountByDay = [12, 24, 18];
        let totalHours = hoursCountByDay.reduce((a, b) => a + b, 0);

        // Verwende HOUR_PX statt feste 60px
        const gridTemplateColumns = `200px repeat(${totalHours}, ${HOUR_PX}px)`;
        timelineHeader.style.gridTemplateColumns = gridTemplateColumns;
        timelineHeader.innerHTML = '';

        // Tag-Header
        let dayHeaders = document.createElement('div');
        dayHeaders.className = 'day-headers-wrapper';
        dayHeaders.style.gridColumn = '1 / -1';
        dayHeaders.style.display = 'grid';
        dayHeaders.style.gridTemplateColumns = gridTemplateColumns;

        const placeholder = document.createElement('div');
        dayHeaders.appendChild(placeholder);

        const daysWrapper = document.createElement('div');
        daysWrapper.style.display = 'grid';
        daysWrapper.style.gridTemplateColumns = `repeat(${totalHours}, ${HOUR_PX}px)`;
        daysWrapper.style.gridColumn = `2 / ${2 + totalHours}`;
        daysWrapper.style.gap = '0';
        // Fill day wrappers by grouping hours (visual only)
        let offset = 0;
        hoursCountByDay.forEach((count, idx) => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.style.gridColumn = `${offset + 1} / ${offset + 1 + count}`;
            dayHeader.style.textAlign = 'center';
            dayHeader.textContent = days[idx];
            daysWrapper.appendChild(dayHeader);
            offset += count;
        });
        dayHeaders.appendChild(daysWrapper);
        timelineHeader.appendChild(dayHeaders);

        // Stundenzeile
        const hourSlotsWrapper = document.createElement('div');
        hourSlotsWrapper.className = 'hour-slots-wrapper';
        hourSlotsWrapper.style.gridColumn = '1 / -1';
        hourSlotsWrapper.style.display = 'grid';
        hourSlotsWrapper.style.gridTemplateColumns = gridTemplateColumns;
        hourSlotsWrapper.style.alignItems = 'center';

        const hourPlaceholder = document.createElement('div');
        hourSlotsWrapper.appendChild(hourPlaceholder);

        for (let i = 0; i < totalHours; i++) {
            const hourSlot = document.createElement('div');
            hourSlot.className = 'hour-slot';
            let currentHour = (12 + i) % 24;
            hourSlot.textContent = `${currentHour}:00`;
            hourSlotsWrapper.appendChild(hourSlot);
        }
        timelineHeader.appendChild(hourSlotsWrapper);

        return { totalHours, gridTemplateColumns };
    }

    async function generateGrid(timelineConfig) {
        try {
            const response = await fetch(`${API_URL}/activities`);
            if (!response.ok) throw new Error('Fehler beim Laden der Taetigkeiten');
            const activities = await response.json();

            const groupedActivities = activities.reduce((acc, activity) => {
                const groupName = activity.group_name || 'Ohne Gruppe';
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(activity);
                return acc;
            }, {});

            gridContainer.innerHTML = '';

            for (const groupName in groupedActivities) {
                const groupHeader = document.createElement('div');
                groupHeader.className = 'activity-group-header';
                groupHeader.textContent = groupName;
                gridContainer.appendChild(groupHeader);

                groupedActivities[groupName].forEach(activity => {
                    const row = document.createElement('div');
                    row.className = 'activity-row';
                    // wichtige Anpassung: jede Zeile verwendet gleiche Spalten wie header
                    row.style.display = 'grid';
                    row.style.gridTemplateColumns = timelineConfig.gridTemplateColumns;
                    row.style.gridAutoFlow = 'column';

                    const nameCell = document.createElement('div');
                    nameCell.className = 'activity-name';
                    nameCell.textContent = activity.name;
                    // nameCell style bleibt in CSS, links feste Breite 200px durch template
                    row.appendChild(nameCell);

                    for (let i = 0; i < timelineConfig.totalHours; i++) {
                        const shiftSlot = document.createElement('div');
                        shiftSlot.className = 'shift-slot';
                        shiftSlot.dataset.activityId = activity.id;
                        shiftSlot.dataset.hourIndex = i;

                        // Drag & Drop handlers
                        shiftSlot.addEventListener('dragover', (e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            // frequently update highlight based on hovered slot
                            handleHoverHighlight(shiftSlot);
                        });
                        shiftSlot.addEventListener('dragenter', (e) => {
                            e.preventDefault();
                            handleHoverHighlight(shiftSlot);
                        });
                        shiftSlot.addEventListener('dragleave', (e) => {
                            // remove highlight when leaving the slot area
                            clearHoverHighlight();
                        });
                        shiftSlot.addEventListener('drop', async (e) => {
                            e.preventDefault();
                            clearHoverHighlight();
                            try {
                                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                                if (!data || !data.helper_id) return;
                                // Build start/end times: min. 2 hours
                                const startIndex = parseInt(shiftSlot.dataset.hourIndex);
                                const startTime = hourIndexToDate(startIndex);
                                const endTime = hourIndexToDate(startIndex + 2); // standard 2h duration
                                // POST assign
                                const resp = await fetch(`${API_URL}/tournament-shifts`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        activity_id: activity.id,
                                        start_time: startTime.toISOString(),
                                        end_time: endTime.toISOString(),
                                        helper_id: data.helper_id
                                    })
                                });
                                if (!resp.ok) throw new Error('Server Fehler');
                                // Re-render komplette Schichten (sauberer)
                                await fetchAndRenderAllShifts();
                            } catch (err) {
                                console.error('Drop Fehler:', err);
                                alert('Fehler beim Eintragen der Schicht');
                            }
                        });

                        shiftSlot.addEventListener('click', () => openShiftModal(shiftSlot, activity));
                        row.appendChild(shiftSlot);
                    }
                    gridContainer.appendChild(row);
                });
            }
        } catch (error) { console.error(error); gridContainer.innerHTML = 'Fehler beim Aufbau des Rasters.'; }
    }

    // highlight helper: show the start slot and the following slot(s) for min 2h (and handle available span)
    function handleHoverHighlight(slot) {
        clearHoverHighlight();
        const idx = parseInt(slot.dataset.hourIndex);
        const activityId = slot.dataset.activityId;
        // highlight start slot
        const startSlot = document.querySelector(`.shift-slot[data-activity-id='${activityId}'][data-hour-index='${idx}']`);
        if (startSlot) {
            startSlot.classList.add('potential-drop');
            highlightedSlots.push(startSlot);
        }
        // highlight second hour (min 2h)
        const nextSlot = document.querySelector(`.shift-slot[data-activity-id='${activityId}'][data-hour-index='${idx + 1}']`);
        if (nextSlot && !nextSlot.classList.contains('slot-hidden')) {
            nextSlot.classList.add('potential-drop');
            highlightedSlots.push(nextSlot);
        }
        // if there is a third hour available, give a faint hint (optional)
        const thirdSlot = document.querySelector(`.shift-slot[data-activity-id='${activityId}'][data-hour-index='${idx + 2}']`);
        if (thirdSlot && !thirdSlot.classList.contains('slot-hidden')) {
            thirdSlot.classList.add('potential-drop');
            thirdSlot.style.backgroundColor = 'rgba(33,150,243,0.04)';
            highlightedSlots.push(thirdSlot);
        }
    }

    function clearHoverHighlight() {
        highlightedSlots.forEach(s => {
            s.classList.remove('potential-drop');
            s.classList.remove('drop-target');
            s.style.backgroundColor = '';
        });
        highlightedSlots = [];
    }

    async function fetchAndRenderAllShifts() {
        // Reset: zeige alle Slots und entferne Spans/Hidden-Klassen
        document.querySelectorAll('.shift-slot').forEach(slot => {
            slot.innerHTML = '';
            slot.classList.remove('filled');
            slot.style.backgroundColor = '';
            slot.style.gridColumn = '';
            slot.classList.remove('slot-hidden');
            slot.classList.remove('dimmed');
            delete slot.dataset.helperId;
            delete slot.dataset.hiddenForSpan;
        });

        const shifts = await fetch(`${API_URL}/tournament-shifts`).then(res => res.json());
        // shifts enthalten: activity_id, start_time, end_time, helper_id, helper_name, team_color
        shifts.forEach(shift => {
            const startDate = new Date(shift.start_time);
            const endDate = new Date(shift.end_time);
            const duration = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60))); // Stunden
            const hourIndex = dateToHourIndex(shift.start_time);

            // Finde das Start-Slot-Element
            const startSlot = document.querySelector(`.shift-slot[data-activity-id='${shift.activity_id}'][data-hour-index='${hourIndex}']`);
            if (!startSlot) return;

            // Setze Anzeige im Start-Slot und span über duration Stunden
            startSlot.innerHTML = shift.helper_name ? shift.helper_name.split(' ')[0] : '—';
            startSlot.classList.add('filled');
            startSlot.style.backgroundColor = shift.team_color || '#666';
            startSlot.dataset.helperId = shift.helper_id || '';

            // Breite über mehrere Stunden
            if (duration > 1) {
                startSlot.style.gridColumn = `span ${duration}`;
                // Verstecke die Folgeslots, damit keine doppelten Kacheln erscheinen
                for (let k = 1; k < duration; k++) {
                    const followSlot = document.querySelector(`.shift-slot[data-activity-id='${shift.activity_id}'][data-hour-index='${hourIndex + k}']`);
                    if (followSlot) {
                        followSlot.classList.add('slot-hidden');
                        followSlot.dataset.hiddenForSpan = 'true';
                    }
                }
            }
        });

        // Wende View-Filter an (falls gesetzt)
        applyViewFilter();
    }

    function applyViewFilter() {
        const viewTeamId = viewTeamFilter.value;
        if (!viewTeamId) {
            // entferne Dimmung
            document.querySelectorAll('.shift-slot').forEach(slot => {
                slot.classList.remove('dimmed');
            });
            return;
        }
        // Für jede gefüllte Slot: finde helper (über dataset.helperId) und dessen team_id
        document.querySelectorAll('.shift-slot').forEach(slot => {
            const helperId = slot.dataset.helperId;
            if (!helperId) {
                // leere Slots: normal lassen
                slot.classList.remove('dimmed');
                return;
            }
            const helper = helperById[helperId];
            const tid = helper ? String(helper.team_id) : null;
            if (tid && tid === String(viewTeamId)) {
                slot.classList.remove('dimmed');
            } else {
                slot.classList.add('dimmed');
            }
        });
    }

    function openShiftModal(slotElement, activity) {
        currentSlot = slotElement;
        const hourIndex = parseInt(slotElement.dataset.hourIndex);
        const startTime = hourIndexToDate(hourIndex);

        modalTitle.textContent = `${activity.name}`;
        modalSubtitle.textContent = `${startTime.toLocaleString('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit' })} Uhr`;

        teamSelect.innerHTML = '<option value="">Team auswaehlen</option>';
        allTeams.forEach(team => teamSelect.add(new Option(team.name, team.id)));

        const existingHelperId = slotElement.dataset.helperId;
        if (existingHelperId) {
            const helper = allHelpers.find(h => h.id == existingHelperId);
            if (helper) {
                teamSelect.value = helper.team_id;
                updateHelperDropdown(helper.team_id);
                helperSelect.value = helper.id;
            }
        } else {
            updateHelperDropdown('');
        }
        modal.style.display = 'flex';
    }

    function updateHelperDropdown(teamId) {
        helperSelect.innerHTML = '<option value="">Helfer auswawhlen</option>';
        if (teamId) {
            allHelpers.filter(h => h.team_id == teamId).forEach(helper => helperSelect.add(new Option(helper.name, helper.id)));
        }
    }

    function setupModalListeners() {
        teamSelect.addEventListener('change', () => updateHelperDropdown(teamSelect.value));
        modal.querySelector('#cancel-shift-button').addEventListener('click', () => modal.style.display = 'none');
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

        modal.querySelector('#shift-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const helperId = helperSelect.value;
            if (!helperId) { alert('Bitte einen Helfer auswawhlen.'); return; }

            const activityId = currentSlot.dataset.activityId;
            const hourIndex = parseInt(currentSlot.dataset.hourIndex);
            const startTime = hourIndexToDate(hourIndex);
            const endTime = hourIndexToDate(hourIndex + 2); // min. 2h

            const response = await fetch(`${API_URL}/tournament-shifts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity_id: activityId, start_time: startTime.toISOString(), end_time: endTime.toISOString(), helper_id: helperId })
            });

            if (response.ok) {
                modal.style.display = 'none';
                await fetchAndRenderAllShifts();
            } else { alert('Fehler beim Speichern der Schicht.'); }
        });

        modal.querySelector('#delete-shift-button').addEventListener('click', async () => {
            if (!currentSlot.dataset.helperId) { modal.style.display = 'none'; return; }
            if (!confirm('Soll die Schicht wirklich geleert werden?')) return;

            const activityId = currentSlot.dataset.activityId;
            const hourIndex = parseInt(currentSlot.dataset.hourIndex);
            const startTime = hourIndexToDate(hourIndex);

            const response = await fetch(`${API_URL}/tournament-shifts`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity_id: activityId, start_time: startTime.toISOString() })
            });

            if (response.ok) {
                modal.style.display = 'none';
                await fetchAndRenderAllShifts();
            } else { alert('Fehler beim Loeschen der Schicht.'); }
        });
    }

    init();
});