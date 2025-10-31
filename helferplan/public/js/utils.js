// Shared utility functions for Helferplan

// Luminance threshold for determining text color on colored backgrounds
const LUMINANCE_THRESHOLD = 160;

/**
 * Calculate luminance value for a hex color
 * Used to determine if text should be dark or light on a colored background
 * @param {string} hex - Hex color code (e.g., '#ff0000')
 * @returns {number} Luminance value (0-255)
 */
function luminanceForHex(hex) {
    try {
        const c = hex.replace('#', '');
        const r = parseInt(c.slice(0, 2), 16);
        const g = parseInt(c.slice(2, 4), 16);
        const b = parseInt(c.slice(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b);
    } catch (e) {
        return 0;
    }
}

/**
 * Get text color (dark or light) based on background color luminance
 * @param {string} bgColorHex - Background color hex code
 * @returns {string} Text color ('#111' for dark, '#fff' for light)
 */
function getTextColorForBackground(bgColorHex) {
    return luminanceForHex(bgColorHex) > LUMINANCE_THRESHOLD ? '#111' : '#fff';
}

/**
 * Parse time string "HH:MM" to hours as decimal
 * @param {string} timeStr - Time string in format "HH:MM"
 * @returns {number} Time as decimal hours (e.g., "13:30" returns 13.5)
 */
function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
}

/**
 * Format time from decimal hours to "HH:MM"
 * @param {number} decimalHours - Time as decimal hours
 * @returns {string} Time formatted as "HH:MM"
 */
function formatTime(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color code (e.g., '#ff0000')
 * @returns {Object} RGB object with r, g, b properties
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 150, g: 150, b: 150 };
}
