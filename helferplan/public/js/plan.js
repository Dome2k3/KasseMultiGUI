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

    // Globale Variable für Aktivitäten
    let allActivities = []; // Leeres Array als Fallback

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
        let activities = await resp.json();
        allActivities = activities; // Speichere Aktivitäten global

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
                    slot.dataset.activityId = activity.id;
                    slot.dataset.hourIndex = i;

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

                    // DROP handler
                    slot.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        try {
                            const data = JSON.parse(e.dataTransfer.getData('application/json'));
                            if (!data || !data.helper_id) return;

                            const activityId = parseInt(slot.dataset.activityId);
                            const activity = allActivities.find(a => a.id === activityId);

                            if (!activity) {
                                console.error('Keine Aktivität gefunden für ID:', activityId);
                                return;
                            }

                            const startIndex = parseInt(slot.dataset.hourIndex);
                            const startTime = hourIndexToDate(startIndex);

                            if (!isTimeAllowed(activity, startTime)) {
                                alert('Diese Zeit ist für die Schicht nicht verfügbar.');
                                return;
                            }

                            const endTime = hourIndexToDate(startIndex + 2);

                            const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    activity_id: activityId,
                                    start_time: startTime.toISOString(),
                                    end_time: endTime.toISOString(),
                                    helper_id: data.helper_id
                                })
                            });

                            if (!resp.ok) {
                                const txt = await resp.text().catch(() => null);
                                throw new Error(txt || 'Server Fehler beim Anlegen');
                            }

                            await fetchAndRenderAllShifts();
                        } catch (err) {
                            console.error('Drop Fehler:', err);
                            alert('Fehler beim Eintragen der Schicht');
                        } finally {
                            clearHoverHighlight();
                        }
                    });

                    row.appendChild(slot);
                }

                gridContainer.appendChild(row);
            });
        }
    }

    // --- Remaining Code ---
    function isTimeAllowed(activity, startTime) {
        if (!activity || !activity.allowed_time_blocks) {
            console.error('Ungültige Aktivität oder fehlende allowed_time_blocks:', activity);
            return false;
        }
        return activity.allowed_time_blocks.some(block =>
            new Date(startTime) >= new Date(block.start) &&
            new Date(startTime) < new Date(block.end)
        );
    }

    // Initialization
    async function init() {
        const timelineConfig = generateTimeline();
        await generateGrid(timelineConfig);
    }

    init();
});