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
