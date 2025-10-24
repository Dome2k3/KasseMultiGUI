// https://github.com/Dome2k3/KasseMultiGUI/blob/main/helferplan/public/js/plan.js
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

    // Config
    const HOUR_PX = 40;      // width per hour column
    const LEFT_COL_PX = 200; // left name column width

    // State
    let allHelpers = [];
    let allTeams = [];
    let helperById = {};
    let EVENT_START_DATE = '2024-07-19T12:00:00Z'; // fallback
    let highlightedSlots = []; // [{el, originalBg, hourIndex}] start first then next

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
        // hours per day: Fri 12..23 -> 12h, Sat -> 24h, Sun -> 18h
        const hoursCountByDay = [12, 24, 18];
        const days = ['Freitag','Samstag','Sonntag'];
        const totalHours = hoursCountByDay.reduce((a,b)=>a+b,0);

        // gridTemplateColumns string reused for header and rows
        const gridTemplateColumns = `${LEFT_COL_PX}px repeat(${totalHours}, ${HOUR_PX}px)`;

        // header is single grid that uses same template
        timelineHeader.innerHTML = '';
        timelineHeader.style.display = 'grid';
        timelineHeader.style.gridTemplateColumns = gridTemplateColumns;
        timelineHeader.style.gridGap = '0';

        // IMPORTANT: ensure header has no padding (removes that green offset)
        timelineHeader.style.paddingLeft = '0';
        timelineHeader.style.paddingInlineStart = '0';

        // left placeholder (must be a fixed-width transparent block)
        const placeholder = document.createElement('div');
        placeholder.className = 'left-placeholder';
        placeholder.style.background = 'transparent';
        placeholder.style.margin = '0';
        placeholder.style.padding = '0';
        // explicitly set width so browser doesn't apply padding to header instead
        placeholder.style.width = `${LEFT_COL_PX}px`;
        placeholder.style.minWidth = `${LEFT_COL_PX}px`;
        placeholder.style.maxWidth = `${LEFT_COL_PX}px`;
        timelineHeader.appendChild(placeholder);

        // day headers wrapper: uses the right-side columns only
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

        // hour row (right side)
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

        // group activities by group_name
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

                // name cell (part of the grid - ensures exact column alignment)
                const nameCell = document.createElement('div');
                nameCell.className = 'activity-name';
                nameCell.textContent = activity.name;
                row.appendChild(nameCell);

                for (let i=0;i<timelineConfig.totalHours;i++){
                    const slot = document.createElement('div');
                    slot.className = 'shift-slot';
                    slot.dataset.activityId = activity.id;
                    slot.dataset.hourIndex = i;

                    // Drag handlers - highlight and drop logic
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
                    // --- DROP handler: determine start matching the hover for same row ---
                    slot.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        try {
                            const data = JSON.parse(e.dataTransfer.getData('application/json'));
                            if (!data || !data.helper_id) return;

                            const rowEl = slot.closest('.activity-row');
                            // pick start from highlights that belong to this row (hover visualization)
                            const relevant = highlightedSlots.filter(h => h.el && h.el.closest('.activity-row') === rowEl);
                            let startIndex;
                            if (relevant.length > 0) {
                                startIndex = Math.min(...relevant.map(h => h.hourIndex));
                            } else {
                                // fallback: derive from target slot index, walk left if hidden
                                startIndex = parseInt(slot.dataset.hourIndex);
                                while (startIndex > 0) {
                                    const cand = rowEl.querySelector(`.shift-slot[data-hour-index='${startIndex}']`);
                                    if (!cand) break;
                                    if (!cand.classList.contains('slot-hidden')) break;
                                    startIndex--;
                                }
                            }

                            const startTime = hourIndexToDate(startIndex);
                            const endTime = hourIndexToDate(startIndex + 2); // min 2h

                            const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    activity_id: activity.id,
                                    start_time: startTime.toISOString(),
                                    end_time: endTime.toISOString(),
                                    helper_id: data.helper_id
                                })
                            });
                            if (!resp.ok) {
                                const txt = await resp.text();
                                throw new Error(txt || 'Server Fehler');
                            }
                            await fetchAndRenderAllShifts();
                        } catch (err) {
                            console.error('Drop Fehler:', err);
                            alert('Fehler beim Eintragen der Schicht');
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

        // figure out visible start slot (walk left if the hovered slot is a hidden follow-slot)
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

    // Fetch shifts and render them into the grid, using grid-column spans
    async function fetchAndRenderAllShifts() {
        // clear all slots
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
        });

        const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`);
        if (!resp.ok) {
            console.error('Fehler beim Laden der Schichten');
            return;
        }
        const shifts = await resp.json();

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
            // save exact server start_time so deletes match DB exactly
            startSlot.dataset.startTime = shift.start_time;

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
        // If the clicked slot is a hidden follow-slot, find its start slot (leftwards)
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
        // If server provided exact start_time, use it; otherwise compute from hourIndex
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

            if (response.ok) {
                modal.style.display = 'none';
                await fetchAndRenderAllShifts();
            } else {
                alert('Fehler beim Speichern der Schicht.');
            }
        });

        modal.querySelector('#delete-shift-button').addEventListener('click', async () => {
            // if no helper assigned, just close
            if (!currentSlot.dataset.helperId) { modal.style.display = 'none'; return; }
            if (!confirm('Soll die Schicht wirklich geleert werden?')) return;

            const activityId = currentSlot.dataset.activityId;
            // prefer exact start_time saved from server if available
            const startTimeIso = currentSlot.dataset.startTime || hourIndexToDate(parseInt(currentSlot.dataset.hourIndex)).toISOString();

            const response = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity_id: activityId, start_time: startTimeIso })
            });

            if (response.ok) {
                modal.style.display = 'none';
                await fetchAndRenderAllShifts();
            } else {
                // show server message if available
                let txt = '';
                try { txt = await response.text(); } catch (e) {}
                console.error('Delete failed', response.status, txt);
                alert('Fehler beim Loeschen der Schicht.');
            }
        });

        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
    }

    // --- Initialization ---
    async function init() {
        // load settings to set EVENT_START_DATE
        try {
            const sres = await fetch(`${API_URL_HELFERPLAN}/settings`);
            if (sres.ok) {
                const settings = await sres.json();
                if (settings.event_friday) EVENT_START_DATE = `${settings.event_friday}T12:00:00Z`;
            }
        } catch (e) {
            // ignore, keep fallback
        }

        // load data
        [allHelpers, allTeams] = await Promise.all([
            fetch(`${API_URL_HELFERPLAN}/helpers`).then(r => r.ok ? r.json() : []),
            fetch(`${API_URL_HELFERPLAN}/teams`).then(r => r.ok ? r.json() : [])
        ]);

        // map helpers by id
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

        // bind filters
        planTeamFilter.addEventListener('change', () => renderHelperPool());
        viewTeamFilter.addEventListener('change', () => applyViewFilter());
    }

    init().catch(err => console.error('Init error:', err));
});