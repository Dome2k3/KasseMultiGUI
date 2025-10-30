// Improved drop event handler for adding a helper to a shift slot

function handleDrop(event) {
    event.preventDefault();
    const helperId = event.dataTransfer.getData('text/plain');
    const helper = getHelperById(helperId);

    // Check if the helper's role and activity requirements are met
    if (!validateHelper(helper)) {
        alert('This helper does not meet the role or activity requirements.');
        return;
    }

    const slot = event.target;
    // Apply helper's team color and text style immediately
    slot.style.backgroundColor = helper.teamColor;
    slot.style.color = helper.textColor;
    slot.innerText = helper.name;

    // Provide immediate feedback
    alert('Helper added: ' + helper.name);
}

function validateHelper(helper) {
    // Implement validation logic for role and activity requirements
    return true; // Placeholder for actual validation logic
}

function getHelperById(id) {
    // Function to retrieve helper object by ID
    return { id: id, name: 'Helper Name', teamColor: '#FF0000', textColor: '#000000' }; // Placeholder
}