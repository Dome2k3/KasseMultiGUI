// Improved drop event to immediately update the color and text style of the slot after adding a helper.

// Function to handle drop event
function handleDrop(event) {
    event.preventDefault();
    const data = event.dataTransfer.getData('text/plain');
    const helper = JSON.parse(data);
    const slot = event.target;

    // Validate helper roles and activity requirements
    if (!isValidHelper(helper)) {
        alert('Invalid helper. Please check their role and activity requirements.');
        return;
    }

    // Add helper to the slot
    slot.innerHTML += `<div>${helper.name}</div>`;

    // Immediate color update
    slot.style.backgroundColor = '#c8e6c9'; // Example color
    slot.style.fontWeight = 'bold';

    // Synchronization with the server
    fetchAndRenderAllShifts();
}

// Validation function
function isValidHelper(helper) {
    // Example validation logic
    return helper.role && helper.activityRequirements;
}

// Updated function to fetch and render all shifts
function fetchAndRenderAllShifts() {
    fetch('/api/shifts')
        .then(response => response.json())
        .then(data => {
            renderShifts(data);
        })
        .catch(error => console.error('Error fetching shifts:', error));
}

// Render shifts function (Placeholder)
function renderShifts(data) {
    // Logic to render shifts on the UI
}
