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
    const SlotRules = window.HelferplanSlotRules;

    if (!SlotRules) {
        throw new Error('HelferplanSlotRules konnte nicht geladen werden. Bitte prüfen Sie die Script-Reihenfolge und die Browser-Konsole auf Ladefehler von slot-rules.js.');
    }

    // Globale State-Variablen
    // WICHTIG: allActivities muss synchron mit den API-Daten gehalten werden
    // Diese Variable wird für Drag-and-Drop-Validierung verwendet
    let allActivities = []; // Wird in generateGrid() aus API geladen

    // Config
    const HOUR_PX = 40;      // width per hour column
    const LEFT_COL_PX = 200; // left name column width
    const DEFAULT_ROLE = SlotRules.DEFAULT_ROLE || 'Alle';
    const SLOT_DURATION_HOURS = SlotRules.SLOT_DURATION_HOURS || 2;
    const DAY_TRANSITION_FR_SA = 12; // Friday to Saturday transition at hour 12
    const DAY_TRANSITION_SA_SO = 36; // Saturday to Sunday transition at hour 36
    const TOTAL_HOURS = 54;  // Fr 12:00 → So 18:00 = 12 + 24 + 18

    // State
    let allHelpers = [];
    let allTeams = [];
    let helperById = {};
    let EVENT_START_DATE = '2024-07-19T12:00:00Z'; // fallback
    let highlightedSlots = []; // [{el, originalBg, hourIndex}] start first then next
    let allShifts = []; // cached shift array from server; used to find shift ids
    let allowedTimeBlocks = {}; // {activityId: [{start, end}, ...]}
    let validSlotStartsCache = {}; // {activityId: Map<hourIndex, duration>} – computed from allowedTimeBlocks
    let currentUser = null; // Current authenticated user
    let currentActivity = null; // Activity associated with the currently open modal

    // Token helpers for localStorage fallback (for browsers that block cookies, e.g. Chrome iOS)
    function getStoredToken() {
        try { return localStorage.getItem('hp_session_token'); } catch(e) { console.warn('Failed to retrieve token:', e); return null; }
    }

    function getAuthHeaders() {
        const token = getStoredToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

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

    // Fetch allowed time blocks for all activities
    async function fetchAllowedTimeBlocks(activities) {
        allowedTimeBlocks = {};
        const promises = activities.map(async (activity) => {
            try {
                const res = await fetch(`${API_URL_HELFERPLAN}/activities/${activity.id}/allowed-time-blocks`, { credentials: 'include' });
                if (res.ok) {
                    const blocks = await res.json();
                    allowedTimeBlocks[activity.id] = blocks;
                } else {
                    allowedTimeBlocks[activity.id] = [];
                }
            } catch (err) {
                console.warn(`Failed to fetch allowed blocks for activity ${activity.id}:`, err);
                allowedTimeBlocks[activity.id] = [];
            }
        });
        await Promise.all(promises);
    }

    function getSlotRule(activity, hourIndex, endHourIndex = hourIndex + SLOT_DURATION_HOURS) {
        return SlotRules.getShiftRule(activity, hourIndex, {
            endHourIndex,
            duration: endHourIndex - hourIndex,
            coverageBlocks: allowedTimeBlocks[activity.id] || activity.allowed_time_blocks || [],
            eventStartHour: SlotRules.EVENT_START_HOUR
        });
    }

    // Compute valid 2h-aligned slot start positions within each free run of an activity.
    // Returns Map<hourIndex, duration> where duration is 2 (normal) or 1 (last hour of an odd-length run).
    // This enforces that helpers can only start shifts at even offsets from the beginning of each
    // contiguous allowed block, preventing isolated 1h-slots mid-run (e.g. 13:00 inside a 12-16 block).
    function computeValidSlotStarts(activity) {
        const blocks = allowedTimeBlocks[activity.id] || [];
        const result = new Map();

        if (blocks.length === 0) {
            // Backward-compat: empty blocks means all hours needed → 2h-aligned from index 0
            for (let pos = 0; pos < TOTAL_HOURS; pos += 2) {
                const dur = (pos + 2 <= TOTAL_HOURS) ? 2 : 1;
                result.set(pos, dur);
            }
            return result;
        }

        const sorted = [...blocks].sort((a, b) => a.start - b.start);
        for (const block of sorted) {
            let pos = block.start;
            while (pos < block.end) {
                const remaining = block.end - pos;
                const dur = remaining >= 2 ? 2 : 1;
                result.set(pos, dur);
                pos += dur;
            }
        }
        return result;
    }

    // Returns {valid: bool, duration: number} for the given slot position.
    // Only positions that are 2h-aligned starts within their free run return valid=true.
    function getValidSlotInfo(activity, hourIndex) {
        if (!validSlotStartsCache[activity.id]) {
            validSlotStartsCache[activity.id] = computeValidSlotStarts(activity);
        }
        const cache = validSlotStartsCache[activity.id];
        if (cache.has(hourIndex)) {
            return { valid: true, duration: cache.get(hourIndex) };
        }
        return { valid: false, duration: SLOT_DURATION_HOURS };
    }

    function getAssignableSlotDuration(activity, hourIndex) {
        return getValidSlotInfo(activity, hourIndex).duration;
    }

    function applyBaseSlotState(slot, activity, hourIndex) {
        const validInfo = getValidSlotInfo(activity, hourIndex);
        let slotRule;
        if (!validInfo.valid) {
            // Position is not a 2h-aligned block start within its free run → not available
            slotRule = {
                isNeeded: false,
                roleRequirement: activity.role_requirement || DEFAULT_ROLE,
                allowedRoles: [],
                visualState: 'not-needed',
                title: 'Kein freier 2h-Block an dieser Position',
                nightRestricted: false
            };
        } else {
            slotRule = getSlotRule(activity, hourIndex, hourIndex + validInfo.duration);
        }

        slot.classList.remove('filled', 'slot-open-pair', 'slot-state-open-all', 'slot-state-open-adult', 'slot-state-open-orga', 'slot-state-not-needed');
        slot.style.backgroundColor = '';
        slot.style.color = '';
        slot.style.opacity = '1';
        slot.style.gridColumn = '';
        slot.textContent = '';
        slot.title = slotRule.title;
        slot.dataset.roleRequirement = slotRule.roleRequirement;
        slot.dataset.isNeeded = slotRule.isNeeded ? 'true' : 'false';
        slot.dataset.nightRestricted = slotRule.nightRestricted ? 'true' : 'false';
        slot.classList.add(`slot-state-${slotRule.visualState}`);
        slot.style.cursor = slotRule.isNeeded ? 'pointer' : 'not-allowed';
        slot.tabIndex = slotRule.isNeeded ? 0 : -1;
        return slotRule;
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

    // --- Authentication Functions ---
    
    async function checkCurrentUser() {
        try {
            const res = await fetch(`${API_URL_HELFERPLAN}/current-user`, { 
                credentials: 'include',
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated && data.user) {
                    currentUser = data.user;
                    updateAuthUI();
                    return true;
                }
            }
        } catch (err) {
            console.warn('Failed to check current user:', err);
        }
        currentUser = null;
        updateAuthUI();
        return false;
    }

    function updateAuthUI() {
        const authStatus = document.getElementById('auth-status');
        const writeModeBtn = document.getElementById('write-mode-btn');
        const logoutBtn = document.getElementById('logout-btn');
        
        if (!authStatus || !writeModeBtn) return;
        
        if (currentUser && currentUser.is_editor) {
            authStatus.textContent = `Bearbeite als: ${currentUser.display_name}`;
            authStatus.style.display = 'inline-block';
            authStatus.style.color = '#28a745';
            authStatus.style.fontWeight = 'bold';
            writeModeBtn.style.display = 'none';
            if (logoutBtn) {
                logoutBtn.style.display = 'inline-block';
            }
        } else if (currentUser) {
            authStatus.textContent = `Angemeldet: ${currentUser.display_name} (nur Lesezugriff)`;
            authStatus.style.display = 'inline-block';
            authStatus.style.color = '#ffc107';
            writeModeBtn.style.display = 'inline-block';
            writeModeBtn.textContent = 'Schreibrechte beantragen';
            if (logoutBtn) {
                logoutBtn.style.display = 'inline-block';
            }
        } else {
            authStatus.style.display = 'none';
            writeModeBtn.style.display = 'inline-block';
            writeModeBtn.textContent = 'Bearbeitungsmodus';
            if (logoutBtn) {
                logoutBtn.style.display = 'none';
            }
        }

        // Show "Turnier-Admin" nav link only for admins
        const navTurniAdmin = document.getElementById('nav-turnier-admin');
        if (navTurniAdmin) {
            navTurniAdmin.style.display = (currentUser && currentUser.is_admin) ? '' : 'none';
        }
    }

    function showAuthModal() {
        const authModal = document.getElementById('auth-modal');
        if (!authModal) return;
        
        // Clear previous inputs
        document.getElementById('auth-name').value = currentUser ? currentUser.display_name : '';
        document.getElementById('auth-email').value = currentUser ? currentUser.email : '';
        document.getElementById('auth-error').textContent = '';
        
        authModal.style.display = 'flex';
    }

    async function handleAuthSubmit() {
        const name = document.getElementById('auth-name').value.trim();
        const email = document.getElementById('auth-email').value.trim();
        const errorDiv = document.getElementById('auth-error');
        
        if (!name || !email) {
            errorDiv.textContent = 'Bitte Name und E-Mail eingeben.';
            return;
        }
        
        try {
            const res = await fetch(`${API_URL_HELFERPLAN}/auth/identify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                credentials: 'include',
                body: JSON.stringify({ name, email })
            });
            
            if (res.ok) {
                const data = await res.json();
                currentUser = data.user;
                // Store token in localStorage as fallback for cookie issues (e.g. Chrome iOS)
                if (data.token) {
                    try { localStorage.setItem('hp_session_token', data.token); } catch(e) { console.warn('Failed to store token:', e); }
                }
                updateAuthUI();
                document.getElementById('auth-modal').style.display = 'none';
                
                if (!currentUser.is_editor) {
                    alert('Sie wurden erfolgreich angemeldet, haben aber noch keine Schreibrechte. Bitte kontaktieren Sie einen Administrator.');
                }
            } else {
                const error = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
                errorDiv.textContent = error.error || 'Anmeldung fehlgeschlagen.';
            }
        } catch (err) {
            console.error('Auth error:', err);
            errorDiv.textContent = 'Verbindungsfehler. Bitte versuchen Sie es erneut.';
        }
    }

    async function handleLogout() {
        try {
            await fetch(`${API_URL_HELFERPLAN}/auth/session`, {
                method: 'DELETE',
                credentials: 'include',
                headers: getAuthHeaders()
            });
        } catch (err) {
            console.warn('Logout request failed:', err);
        }
        
        currentUser = null;
        try { localStorage.removeItem('hp_session_token'); } catch(e) { console.warn('Failed to remove token:', e); }
        updateAuthUI();
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
            
            // Build HTML with name and icons
            let html = `<strong>${h.name}</strong>`;
            
            // Add Minderjährig icon (youth icon instead of baby)
            if (h.role === 'Minderjaehrig') {
                html += `<span class="helper-icon" title="Minderjährig">🧒</span>`;
            }
            
            // Add ORGA icon
            if (h.role === 'Orga') {
                html += `<span class="helper-icon" title="Orga">⭐</span>`;
            }
            
            div.innerHTML = html;
            
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
            
            // Add visual separator for day transitions
            if (i === DAY_TRANSITION_FR_SA || i === DAY_TRANSITION_SA_SO) {
                hour.style.borderLeft = '2px solid #000';
                hour.style.marginLeft = '4px';
            }
            
            hoursWrapper.appendChild(hour);
        }
        timelineHeader.appendChild(hoursWrapper);

        return { totalHours, gridTemplateColumns };
    }

    async function generateGrid(timelineConfig) {
        const resp = await fetch(`${API_URL_HELFERPLAN}/activities`, { credentials: 'include' });
        if (!resp.ok) throw new Error('Fehler beim Laden der Taetigkeiten');
        const activities = await resp.json();

        // KRITISCH: Synchronisiere die global verfügbare allActivities-Variable
        // Diese wird für Drag-and-Drop-Validierung benötigt (Zeile ~261)
        allActivities = activities;
        console.log('allActivities synchronisiert:', allActivities.length, 'Aktivitäten geladen');

        // Fetch allowed time blocks for all activities
        await fetchAllowedTimeBlocks(activities);
        // Invalidate the valid-slot-starts cache so it's rebuilt with fresh block data
        validSlotStartsCache = {};

        const groups = activities.reduce((acc, a) => {
            const g = a.group_name || 'Ohne Gruppe';
            (acc[g] || (acc[g]=[])).push(a);
            return acc;
        }, {});

        gridContainer.innerHTML = '';

        for (const groupName in groups) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'activity-group-header';
            // Wrap group text in sticky span so it stays visible when scrolling
            const groupText = document.createElement('span');
            groupText.className = 'activity-group-header-text';
            groupText.textContent = groupName;
            groupHeader.appendChild(groupText);
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
                    slot.dataset.roleRequirement = activity.role_requirement || DEFAULT_ROLE;

                    // Validierung: Prüfe ob activity.id gesetzt ist
                    if (!activity.id) {
                        console.warn('Aktivität ohne ID erkannt:', activity);
                    }
                    
                    // Add visual separator for day transitions
                    if (i === DAY_TRANSITION_FR_SA || i === DAY_TRANSITION_SA_SO) {
                        slot.style.borderLeft = '2px solid #000';
                        slot.style.marginLeft = '4px';
                    }
                    applyBaseSlotState(slot, activity, i);

                    slot.addEventListener('dragover', (e) => {
                        const slotDuration = getAssignableSlotDuration(activity, i);
                        const slotRule = getSlotRule(activity, i, i + slotDuration);
                        if (!slotRule.isNeeded) {
                            e.dataTransfer.dropEffect = 'none';
                            return;
                        }
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        handleHoverHighlight(slot);
                    });
                    slot.addEventListener('dragenter', (e) => {
                        const slotDuration = getAssignableSlotDuration(activity, i);
                        const slotRule = getSlotRule(activity, i, i + slotDuration);
                        if (!slotRule.isNeeded) return;
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

                            let startSlot = slot;
                            if (startSlot.classList.contains('slot-hidden')) {
                                const row = startSlot.parentElement;
                                let back = parseInt(startSlot.dataset.hourIndex) - 1;
                                while (back >= 0) {
                                    const candidate = row.querySelector(`.shift-slot[data-hour-index='${back}']`);
                                    if (candidate && !candidate.classList.contains('slot-hidden')) {
                                        startSlot = candidate;
                                        break;
                                    }
                                    back -= 1;
                                }
                            }

                            const startIndex = parseInt(startSlot.dataset.hourIndex);
                            const slotDuration = getAssignableSlotDuration(activity, startIndex);
                            const startTime = hourIndexToDate(startIndex);
                            const endIndex = startIndex + slotDuration;
                            const validation = SlotRules.validateShiftAssignment({
                                activity,
                                coverageBlocks: allowedTimeBlocks[activityId] || [],
                                startHourIndex: startIndex,
                                endHourIndex: endIndex,
                                helperRole: helper.role,
                                eventStartHour: SlotRules.EVENT_START_HOUR
                            });
                            if (!validation.valid) {
                                alert(validation.message);
                                return;
                            }
                            const endTime = hourIndexToDate(endIndex);

                            const resp = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                credentials: 'include',
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

                            // Erfolg: Setze die Farbe und den Text lokal, ohne neu zu laden
                            // Dies vermeidet das Flackern und erhält die Teamfarbe
                            const team = allTeams.find(t => t.id == helper.team_id);
                            const teamColor = team ? team.color_hex : '#888';

                            const row = startSlot.parentElement;
                            startSlot.innerHTML = helper.name.split(' ')[0] || helper.name;
                            startSlot.classList.add('filled');
                            startSlot.classList.remove('slot-open-pair');
                            startSlot.style.backgroundColor = teamColor;
                            startSlot.style.color = SlotRules.getTextColorForBackground(teamColor);
                            startSlot.style.opacity = '1';
                            startSlot.dataset.helperId = helperId;
                            startSlot.dataset.startTime = startTime.toISOString();
                            
                            const responseData = await resp.json();
                            if (responseData.id) {
                                startSlot.dataset.shiftId = responseData.id;
                            }

                            // Apply span for the effective slot duration (1h isolated or 2h default)
                            startSlot.style.gridColumn = slotDuration > 1 ? `span ${slotDuration}` : '';
                            
                            // Hide the follow slot
                            for (let k = 1; k < slotDuration; k++) {
                                const follow = row.querySelector(`.shift-slot[data-activity-id='${activityId}'][data-hour-index='${startIndex + k}']`);
                                if (follow) {
                                    follow.classList.add('slot-hidden');
                                    follow.dataset.hiddenForSpan = 'true';
                                }
                            }

                            // Anwenden des View-Filters auf den neu hinzugefügten Slot
                            applyViewFilter();
                        } catch (err) {
                            console.error('Drop Fehler:', err);
                            alert('Fehler beim Eintragen der Schicht: ' + err.message);
                        } finally {
                            clearHoverHighlight();
                        }
                    });

                    slot.addEventListener('click', () => {
                        const slotDuration = getAssignableSlotDuration(activity, i);
                        const slotRule = getSlotRule(activity, i, i + slotDuration);
                        if (!slotRule.isNeeded && !slot.dataset.helperId) {
                            alert('Hier wird keine Schicht benötigt.');
                            return;
                        }
                        openShiftModal(slot, activity);
                    });
                    slot.addEventListener('keydown', (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        slot.click();
                    });
                    row.appendChild(slot);
                }
                gridContainer.appendChild(row);
            });
        }
        reapplyOpenSlotVisuals();
    }

    // Span open valid 2h slots and add the connected block visual (→ arrow).
    // Called after generateGrid and after fetchAndRenderAllShifts renders filled shifts.
    function reapplyOpenSlotVisuals() {
        document.querySelectorAll('.activity-row').forEach(row => {
            row.querySelectorAll('.shift-slot').forEach(slot => {
                if (slot.classList.contains('slot-hidden')) return;
                if (slot.classList.contains('filled')) return;

                const hourIndex = parseInt(slot.dataset.hourIndex);
                const activityId = slot.dataset.activityId;
                const activity = allActivities.find(a => String(a.id) === String(activityId));
                if (!activity) return;

                const validInfo = getValidSlotInfo(activity, hourIndex);
                if (!validInfo.valid || validInfo.duration <= 1) return;

                const slotRule = getSlotRule(activity, hourIndex, hourIndex + validInfo.duration);
                if (!slotRule.isNeeded) return;

                // Span the cell across both hour columns
                slot.style.gridColumn = `span ${validInfo.duration}`;
                if (slot.classList.contains('slot-open-pair')) return; // already styled
                slot.classList.add('slot-open-pair');

                // Hide follow slot(s)
                for (let k = 1; k < validInfo.duration; k++) {
                    const follow = row.querySelector(`.shift-slot[data-hour-index='${hourIndex + k}']`);
                    if (follow) {
                        follow.classList.add('slot-hidden');
                        follow.dataset.hiddenForSpan = 'true';
                    }
                }

                // Build the inner connected-block visual
                slot.innerHTML = '';
                const pair = document.createElement('div');
                pair.className = 'slot-pair';

                const b1 = document.createElement('div');
                b1.className = 'slot-pair-block';

                const arrow = document.createElement('span');
                arrow.className = 'slot-pair-arrow';
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '→';

                const b2 = document.createElement('div');
                b2.className = 'slot-pair-block';

                pair.appendChild(b1);
                pair.appendChild(arrow);
                pair.appendChild(b2);
                slot.appendChild(pair);
            });
        });
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

        let activity = null;
        if (startSlot && !startSlot.classList.contains('slot-hidden')) {
            activity = allActivities.find(a => String(a.id) === String(startSlot.dataset.activityId));
            if (activity) {
                const slotDuration = getAssignableSlotDuration(activity, startIdx);
                const slotRule = getSlotRule(activity, startIdx, startIdx + slotDuration);
                if (!slotRule.isNeeded) return;
            }
            highlightedSlots.push({ el: startSlot, originalBg: startSlot.style.backgroundColor || '', hourIndex: startIdx });
            startSlot.classList.add('potential-drop');
        }

        const duration = activity ? getAssignableSlotDuration(activity, startIdx) : SLOT_DURATION_HOURS;
        for (let step = 1; step < duration; step += 1) {
            const nextIdx = startIdx + step;
            const nextSlot = row.querySelector(`.shift-slot[data-hour-index='${nextIdx}']`);
            if (nextSlot && !nextSlot.classList.contains('slot-hidden')) {
                highlightedSlots.push({ el: nextSlot, originalBg: nextSlot.style.backgroundColor || '', hourIndex: nextIdx });
                nextSlot.classList.add('potential-drop');
            }
        }
    }

    function clearHoverHighlight() {
        highlightedSlots.forEach(item => {
            if (item.el) {
                item.el.classList.remove('potential-drop');
                item.el.classList.remove('drop-target');
                if (!item.el.classList.contains('filled')) {
                    item.el.style.backgroundColor = item.originalBg || '';
                }
            }
        });
        highlightedSlots = [];
    }

    // --- NEW: helper to fetch shifts (returns array) ---
    async function getShifts() {
        const r = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, { cache: 'no-store' });
        if (!r.ok) throw new Error('Fehler beim Laden der Schichten');
        return await r.json();
    }

    // Fetch shifts and render them into the grid, using grid-column spans
    async function fetchAndRenderAllShifts() {
        document.querySelectorAll('.shift-slot').forEach(s => {
            s.classList.remove('slot-hidden');
            s.classList.remove('dimmed');
            delete s.dataset.helperId;
            delete s.dataset.hiddenForSpan;
            delete s.dataset.startTime;
            delete s.dataset.shiftId;

            const activityId = s.dataset.activityId;
            const hourIndex = parseInt(s.dataset.hourIndex);
            const activity = allActivities.find(a => String(a.id) === String(activityId));
            if (activity) {
                applyBaseSlotState(s, activity, hourIndex);
            }
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
                startSlot.style.color = SlotRules.getTextColorForBackground(shift.team_color || '#666');
                startSlot.style.opacity = '1';
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
            reapplyOpenSlotVisuals();
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
        currentActivity = activity;
        const startIso = currentSlot.dataset.startTime || hourIndexToDate(parseInt(currentSlot.dataset.hourIndex)).toISOString();
        const startTime = new Date(startIso);

        modalTitle.textContent = `${activity.name}`;
        modalSubtitle.textContent = `${startTime.toLocaleString('de-DE', { weekday:'long', hour:'2-digit', minute:'2-digit' })} Uhr`;

        // Show role requirement hint
        const roleHint = document.getElementById('modal-role-hint');
        const currentHourIndex = parseInt(currentSlot.dataset.hourIndex);
        const slotDuration = getAssignableSlotDuration(activity, currentHourIndex);
        const slotRule = getSlotRule(activity, currentHourIndex, currentHourIndex + slotDuration);
        if (roleHint) {
            if (slotRule.roleRequirement === 'Alle' && !slotRule.nightRestricted) {
                roleHint.style.display = 'none';
            } else {
                const roleLabel = SlotRules.getRoleRequirementLabel(slotRule.roleRequirement);
                roleHint.textContent = `Anforderung: ${roleLabel}${slotRule.nightRestricted ? ' (Nachtregel aktiv)' : ''}`;
                roleHint.style.display = 'block';
            }
        }

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
        helperSelect.innerHTML = '<option value="">Helfer auswählen</option>';
        if (!teamId) return;
        const hourIndex = currentSlot ? parseInt(currentSlot.dataset.hourIndex) : 0;
        const slotDuration = currentActivity ? getAssignableSlotDuration(currentActivity, hourIndex) : SLOT_DURATION_HOURS;
        const slotRule = currentActivity
            ? getSlotRule(currentActivity, hourIndex, hourIndex + slotDuration)
            : { allowedRoles: SlotRules.getAllowedRolesForRequirement(DEFAULT_ROLE) };
        allHelpers
            .filter(h => h.team_id == teamId)
            .filter(h => slotRule.allowedRoles.includes(h.role))
            .forEach(h => helperSelect.add(new Option(h.name, h.id)));
    }

    function setupModalListeners() {
        teamSelect.addEventListener('change', () => updateHelperDropdown(teamSelect.value));
        modal.querySelector('#cancel-shift-button').addEventListener('click', () => modal.style.display = 'none');

        modal.querySelector('#shift-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const helperId = helperSelect.value;
            if (!helperId) { alert('Bitte einen Helfer auswählen.'); return; }

            // Client-side role validation before submitting
            const helper = allHelpers.find(h => h.id == helperId);
            if (helper && currentActivity) {
                const startHourIndex = parseInt(currentSlot.dataset.hourIndex);
                const slotDuration = getAssignableSlotDuration(currentActivity, startHourIndex);
                const validation = SlotRules.validateShiftAssignment({
                    activity: currentActivity,
                    coverageBlocks: allowedTimeBlocks[currentActivity.id] || [],
                    startHourIndex,
                    endHourIndex: startHourIndex + slotDuration,
                    helperRole: helper.role,
                    eventStartHour: SlotRules.EVENT_START_HOUR
                });
                if (!validation.valid) {
                    alert(validation.message);
                    return;
                }
            }

            const activityId = currentSlot.dataset.activityId;
            const hourIndex = parseInt(currentSlot.dataset.hourIndex);
            const slotDuration = currentActivity ? getAssignableSlotDuration(currentActivity, hourIndex) : SLOT_DURATION_HOURS;
            const startTime = hourIndexToDate(hourIndex);
            const endTime = hourIndexToDate(hourIndex + slotDuration);

            const response = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                credentials: 'include',
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
                            const del = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts/${existing.id}`, { method: 'DELETE', credentials: 'include', headers: getAuthHeaders() });
                            if (!del.ok) alert('Löschen der bestehenden Schicht fehlgeschlagen; siehe Konsole.');
                            else {
                                // retry create
                                const retry = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                                    credentials: 'include',
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
                let errorMsg = 'Fehler beim Speichern der Schicht.';
                try {
                    const body = await response.json();
                    if (body && body.error) errorMsg = body.error;
                } catch(e) {
                    try { const txt = await response.text(); if (txt) errorMsg = txt; } catch(e2) {}
                }
                console.error('Save shift failed', response.status, errorMsg);
                alert(errorMsg);
            }
        });

        // DELETE handler: prefer deleting by shift id if available
        modal.querySelector('#delete-shift-button').addEventListener('click', async () => {
            if (!currentSlot || !currentSlot.dataset.helperId) { modal.style.display = 'none'; return; }
            if (!confirm('Soll die Schicht wirklich geleert werden?')) return;

            const shiftId = currentSlot.dataset.shiftId;
            if (shiftId) {
                try {
                    const del = await fetch(`${API_URL_HELFERPLAN}/tournament-shifts/${shiftId}`, { method: 'DELETE', credentials: 'include', headers: getAuthHeaders() });
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
                    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                    credentials: 'include',
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

        // Check authentication status
        await checkCurrentUser();

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
        setupAuthListeners();

        planTeamFilter.addEventListener('change', () => renderHelperPool());
        viewTeamFilter.addEventListener('change', () => applyViewFilter());
    }

    function setupAuthListeners() {
        const writeModeBtn = document.getElementById('write-mode-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const authModal = document.getElementById('auth-modal');
        const authSubmitBtn = document.getElementById('auth-submit');
        const authCancelBtn = document.getElementById('auth-cancel');
        
        if (writeModeBtn) {
            writeModeBtn.addEventListener('click', showAuthModal);
        }
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
        
        if (authSubmitBtn) {
            authSubmitBtn.addEventListener('click', handleAuthSubmit);
        }
        
        if (authCancelBtn) {
            authCancelBtn.addEventListener('click', () => {
                authModal.style.display = 'none';
            });
        }
        
        if (authModal) {
            authModal.addEventListener('click', (e) => {
                if (e.target === authModal) {
                    authModal.style.display = 'none';
                }
            });
        }
    }

    init().catch(err => console.error('Init error:', err));
});
