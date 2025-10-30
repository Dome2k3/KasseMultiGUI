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

    // Helper functions
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

    async function fetchAndRenderAllShifts() {
        try {
            const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`);
            if (!resp.ok) throw new Error('Fehler beim Laden der Schichten');
            const shifts = await resp.json();
            allShifts = shifts;

            document.querySelectorAll('.shift-slot').forEach(slot => {
                slot.innerHTML = '';
                slot.classList.remove('filled');
                slot.style.backgroundColor = '';
            });

            allShifts.forEach(shift => {
                const startIdx = dateToHourIndex(shift.start_time);
                const slot = document.querySelector(`.shift-slot[data-activity-id='${shift.activity_id}'][data-hour-index='${startIdx}']`);
                if (slot) {
                    slot.innerHTML = shift.helper_name || '—';
                    slot.classList.add('filled');
                    slot.style.backgroundColor = shift.team_color || '#666';
                }
            });
        } catch (err) {
            console.error('Fehler beim Laden der Schichten:', err);
        }
    }

    async function generateGrid(timelineConfig) {
        try {
            const resp = await fetch(`${API_URL_HELFERPLAN}/activities`);
            if (!resp.ok) throw new Error('Fehler beim Laden der Aktivitäten');
            const activities = await resp.json();
            allActivities = activities;

            const groups = activities.reduce((acc, a) => {
                const g = a.group_name || 'Ohne Gruppe';
                (acc[g] || (acc[g] = [])).push(a);
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

                    for (let i = 0; i < timelineConfig.totalHours; i++) {
                        const slot = document.createElement('div');
                        slot.className = 'shift-slot';
                        slot.dataset.activityId = activity.id;
                        slot.dataset.hourIndex = i;
                        row.appendChild(slot);
                    }

                    gridContainer.appendChild(row);
                });
            }
        } catch (err) {
            console.error('Fehler beim Generieren des Grids:', err);
        }
    }

    function isTimeAllowed(activity, startTime) {
        if (!activity || !activity.allowed_time_blocks || activity.allowed_time_blocks.length === 0) {
            return true; // Standardmäßig alle Zeiten erlauben
        }
        return activity.allowed_time_blocks.some(block =>
            new Date(startTime) >= new Date(block.start) &&
            new Date(startTime) < new Date(block.end)
        );
    }

    async function init() {
        try {
            const timelineConfig = {
                totalHours: 54, // Example: 3 days of 18 hours each
                gridTemplateColumns: `${LEFT_COL_PX}px repeat(54, ${HOUR_PX}px)`
            };
            await generateGrid(timelineConfig);
            await fetchAndRenderAllShifts();
        } catch (err) {
            console.error('Fehler bei der Initialisierung:', err);
        }
    }

    init();
});