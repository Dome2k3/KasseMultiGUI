document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:3003/api';

    const timelineHeader = document.getElementById('timeline-header');
    const gridContainer = document.getElementById('grid-container');
    const modal = document.getElementById('shift-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const teamSelect = document.getElementById('modal-team-select');
    const helperSelect = document.getElementById('modal-helper-select');

    let allHelpers = [];
    let allTeams = [];
    let currentSlot = null;
    
    const EVENT_START_DATE = '2024-07-19T12:00:00Z'; // Beispiel: Ein Freitag im Juli, als UTC

    function hourIndexToDate(index) {
        const startDate = new Date(EVENT_START_DATE);
        startDate.setHours(startDate.getHours() + index);
        return startDate;
    }

    function dateToHourIndex(dateString) {
        const startDate = new Date(EVENT_START_DATE);
        const shiftDate = new Date(dateString);
        const diffHours = (shiftDate - startDate) / (1000 * 60 * 60);
        return Math.round(diffHours);
    }
    
    async function init() {
        [allHelpers, allTeams] = await Promise.all([
            fetch(`${API_URL}/helpers`).then(res => res.json()),
            fetch(`${API_URL}/teams`).then(res => res.json())
        ]);

        const timelineConfig = generateTimeline();
        await generateGrid(timelineConfig);
        await fetchAndRenderAllShifts();
        setupModalListeners();
    }

    function generateTimeline() {
        const days = ['Freitag', 'Samstag', 'Sonntag'];
        let hoursCountByDay = [12, 24, 18];
        let totalHours = hoursCountByDay.reduce((a, b) => a + b, 0);

        const gridTemplateColumns = `200px repeat(${totalHours}, 60px)`;
        timelineHeader.style.gridTemplateColumns = gridTemplateColumns;
        timelineHeader.innerHTML = '';
        
        let dayHeaders = document.createElement('div');
        dayHeaders.className = 'day-headers-wrapper';
        dayHeaders.style.gridColumn = '1 / -1';
        dayHeaders.style.display = 'grid';
        dayHeaders.style.gridTemplateColumns = '200px repeat(1, 1fr)';
        
        const placeholder = document.createElement('div');
        dayHeaders.appendChild(placeholder);
        
        const daysWrapper = document.createElement('div');
        daysWrapper.style.display = 'grid';
        daysWrapper.style.gridTemplateColumns = '12fr 24fr 18fr';
        dayHeaders.appendChild(daysWrapper);

        days.forEach((day, index) => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = day;
            daysWrapper.appendChild(dayHeader);
        });
        timelineHeader.appendChild(dayHeaders);

        const hourSlotsWrapper = document.createElement('div');
        hourSlotsWrapper.className = 'hour-slots-wrapper';
        hourSlotsWrapper.style.gridColumn = '1 / -1';
        hourSlotsWrapper.style.display = 'grid';
        hourSlotsWrapper.style.gridTemplateColumns = `200px repeat(${totalHours}, 60px)`;
        
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
                    row.style.gridTemplateColumns = timelineConfig.gridTemplateColumns;

                    const nameCell = document.createElement('div');
                    nameCell.className = 'activity-name';
                    nameCell.textContent = activity.name;
                    row.appendChild(nameCell);

                    for (let i = 0; i < timelineConfig.totalHours; i++) {
                        const shiftSlot = document.createElement('div');
                        shiftSlot.className = 'shift-slot';
                        shiftSlot.dataset.activityId = activity.id;
                        shiftSlot.dataset.hourIndex = i;
                        shiftSlot.addEventListener('click', () => openShiftModal(shiftSlot, activity));
                        row.appendChild(shiftSlot);
                    }
                    gridContainer.appendChild(row);
                });
            }
        } catch (error) { console.error(error); gridContainer.innerHTML = 'Fehler beim Aufbau des Rasters.'; }
    }

    async function fetchAndRenderAllShifts() {
        document.querySelectorAll('.shift-slot').forEach(slot => {
            slot.innerHTML = '';
            slot.className = 'shift-slot';
            slot.style.backgroundColor = '';
            delete slot.dataset.helperId;
        });

        const shifts = await fetch(`${API_URL}/tournament-shifts`).then(res => res.json());
        shifts.forEach(shift => {
            const hourIndex = dateToHourIndex(shift.start_time);
            const slot = document.querySelector(`.shift-slot[data-activity-id='${shift.activity_id}'][data-hour-index='${hourIndex}']`);
            if (slot) {
                slot.innerHTML = shift.helper_name.split(' ')[0]; // Nur Vorname
                slot.classList.add('filled');
                slot.style.backgroundColor = shift.team_color;
                slot.dataset.helperId = shift.helper_id;
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
            const endTime = hourIndexToDate(hourIndex + 1);

            const response = await fetch(`${API_URL}/tournament-shifts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activity_id: activityId, start_time: startTime.toISOString(), end_time: endTime.toISOString(), helper_id: helperId })
            });

            if (response.ok) {
                modal.style.display = 'none';
                fetchAndRenderAllShifts();
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
                fetchAndRenderAllShifts();
            } else { alert('Fehler beim Loeschen der Schicht.'); }
        });
    }

    init();
});
