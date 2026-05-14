(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.HelferplanSlotRules = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DEFAULT_ROLE = 'Alle';
    const SLOT_DURATION_HOURS = 2;
    const EVENT_START_HOUR = 12;
    const NIGHT_RESTRICTED_UNTIL_HOUR = 7;
    const ROLE_ORDER = { Alle: 0, Erwachsen: 1, Orga: 2 };

    function normalizeRoleRequirement(roleRequirement, fallback) {
        const candidate = roleRequirement || fallback || DEFAULT_ROLE;
        if (Object.prototype.hasOwnProperty.call(ROLE_ORDER, candidate)) {
            return candidate;
        }
        return fallback || DEFAULT_ROLE;
    }

    function normalizeCoverageBlocks(blocks, fallbackRoleRequirement) {
        if (!Array.isArray(blocks)) return [];

        const normalized = blocks
            .map(block => {
                if (!block || !Number.isFinite(Number(block.start)) || !Number.isFinite(Number(block.end))) return null;
                const start = Math.max(0, Math.trunc(Number(block.start)));
                const end = Math.max(start + 1, Math.trunc(Number(block.end)));

                return {
                    start,
                    end,
                    role_requirement: normalizeRoleRequirement(
                        block.role_requirement || block.roleRequirement,
                        fallbackRoleRequirement
                    )
                };
            })
            .filter(Boolean)
            .sort((a, b) => (a.start - b.start) || (a.end - b.end));

        const merged = [];
        normalized.forEach((block) => {
            const previous = merged[merged.length - 1];
            if (
                previous &&
                previous.role_requirement === block.role_requirement &&
                block.start <= previous.end
            ) {
                previous.end = Math.max(previous.end, block.end);
                return;
            }
            merged.push({ ...block });
        });

        return merged;
    }

    function findCoverageBlock(blocks, hourIndex) {
        return (blocks || []).find(block => hourIndex >= block.start && hourIndex < block.end) || null;
    }

    function validateCoverageBlocksForSlotDuration(blocks, options) {
        // options are intentionally accepted for API compatibility with existing call sites.
        return { valid: true, code: 'ok', message: '' };
    }

    function getClockHourForIndex(hourIndex, eventStartHour) {
        return (((Number(eventStartHour ?? EVENT_START_HOUR) + Number(hourIndex)) % 24) + 24) % 24;
    }

    function isNightRestrictedHour(hourIndex, options) {
        const restrictedUntilHour = Number(options && options.restrictedUntilHour);
        const eventStartHour = Number(options && options.eventStartHour);
        const limit = Number.isFinite(restrictedUntilHour) ? restrictedUntilHour : NIGHT_RESTRICTED_UNTIL_HOUR;
        // getClockHourForIndex always normalizes into the range [0, 23].
        const clockHour = getClockHourForIndex(hourIndex, Number.isFinite(eventStartHour) ? eventStartHour : EVENT_START_HOUR);
        return clockHour >= 0 && clockHour < limit;
    }

    function getAllowedRolesForRequirement(roleRequirement) {
        const normalized = normalizeRoleRequirement(roleRequirement, DEFAULT_ROLE);
        if (normalized === 'Orga') return ['Orga'];
        if (normalized === 'Erwachsen') return ['Erwachsen', 'Orga'];
        return ['Minderjaehrig', 'Erwachsen', 'Orga'];
    }

    function getRoleRequirementLabel(roleRequirement) {
        const normalized = normalizeRoleRequirement(roleRequirement, DEFAULT_ROLE);
        if (normalized === 'Orga') return 'nur Orga';
        if (normalized === 'Erwachsen') return 'nur Erwachsene oder Orga';
        return 'Jugend / Erwachsene / Orga';
    }

    function getTextColorForBackground(hex) {
        try {
            const color = String(hex || '').replace('#', '');
            if (color.length !== 6) return '#fff';
            const r = parseInt(color.slice(0, 2), 16);
            const g = parseInt(color.slice(2, 4), 16);
            const b = parseInt(color.slice(4, 6), 16);
            const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
            return luminance > 160 ? '#111' : '#fff';
        } catch (error) {
            return '#fff';
        }
    }

    function getStricterRoleRequirement(currentRole, nextRole) {
        const current = normalizeRoleRequirement(currentRole, DEFAULT_ROLE);
        const next = normalizeRoleRequirement(nextRole, DEFAULT_ROLE);
        return ROLE_ORDER[next] > ROLE_ORDER[current] ? next : current;
    }

    function getShiftRule(activity, startHourIndex, options) {
        const baseRoleRequirement = normalizeRoleRequirement(
            activity && activity.role_requirement,
            DEFAULT_ROLE
        );
        const start = Math.trunc(Number(startHourIndex));
        const duration = Math.max(1, Math.trunc(Number(options && options.duration) || SLOT_DURATION_HOURS));
        const end = Math.max(start + 1, Math.trunc(Number(options && options.endHourIndex) || (start + duration)));
        const providedCoverageBlocks = options && options.coverageBlocks !== undefined
            ? options.coverageBlocks
            : activity && activity.allowed_time_blocks;
        const coverageBlocks = normalizeCoverageBlocks(providedCoverageBlocks, baseRoleRequirement);

        let roleRequirement = baseRoleRequirement;
        let nightRestricted = false;

        for (let hour = start; hour < end; hour += 1) {
            // Empty coverageBlocks means "every hour is needed" for backward compatibility.
            const coverageBlock = coverageBlocks.length > 0 ? findCoverageBlock(coverageBlocks, hour) : { role_requirement: baseRoleRequirement };
            if (!coverageBlock) {
                return {
                    isNeeded: false,
                    roleRequirement: baseRoleRequirement,
                    allowedRoles: [],
                    visualState: 'not-needed',
                    title: 'Hier wird keine Schicht benötigt.',
                    nightRestricted: false
                };
            }

            roleRequirement = getStricterRoleRequirement(roleRequirement, coverageBlock.role_requirement || baseRoleRequirement);
            if (roleRequirement !== 'Orga' && isNightRestrictedHour(hour, options)) {
                nightRestricted = true;
            }
        }

        if (roleRequirement === 'Alle' && nightRestricted) {
            roleRequirement = 'Erwachsen';
        }

        const visualState = roleRequirement === 'Orga'
            ? 'open-orga'
            : roleRequirement === 'Erwachsen'
                ? 'open-adult'
                : 'open-all';
        const title = roleRequirement === 'Orga'
            ? 'Freie Schicht (nur Orga)'
            : roleRequirement === 'Erwachsen'
                ? (nightRestricted ? 'Freie Schicht (nachts nur Erwachsene oder Orga)' : 'Freie Schicht (nur Erwachsene oder Orga)')
                : 'Freie Schicht (Jugend / Erwachsene / Orga)';

        return {
            isNeeded: true,
            roleRequirement,
            allowedRoles: getAllowedRolesForRequirement(roleRequirement),
            visualState,
            title,
            nightRestricted
        };
    }

    function validateShiftAssignment(input) {
        const startHourIndex = Number(input && input.startHourIndex);
        const endHourIndex = Number(input && input.endHourIndex);
        const helperRole = input && input.helperRole;

        if (!Number.isFinite(startHourIndex) || !Number.isFinite(endHourIndex) || endHourIndex <= startHourIndex) {
            return {
                valid: false,
                code: 'invalid_range',
                message: 'Ungültiger Schicht-Zeitraum.'
            };
        }

        const shiftRule = getShiftRule(input && input.activity, startHourIndex, {
            duration: endHourIndex - startHourIndex,
            endHourIndex,
            coverageBlocks: input && input.coverageBlocks,
            eventStartHour: input && input.eventStartHour,
            restrictedUntilHour: input && input.restrictedUntilHour
        });

        if (!shiftRule.isNeeded) {
            return {
                valid: false,
                code: 'not_needed',
                message: 'Hier wird keine Schicht benötigt.',
                shiftRule
            };
        }

        if (!helperRole) {
            return {
                valid: false,
                code: 'missing_helper_role',
                message: 'Die Rolle des Helfers ist unbekannt.',
                shiftRule
            };
        }

        if (!shiftRule.allowedRoles.includes(helperRole)) {
            return {
                valid: false,
                code: 'role_mismatch',
                message: `Diese Schicht erfordert ${getRoleRequirementLabel(shiftRule.roleRequirement)}.`,
                shiftRule
            };
        }

        return {
            valid: true,
            code: 'ok',
            message: '',
            shiftRule
        };
    }

    return {
        DEFAULT_ROLE,
        SLOT_DURATION_HOURS,
        EVENT_START_HOUR,
        NIGHT_RESTRICTED_UNTIL_HOUR,
        normalizeRoleRequirement,
        normalizeCoverageBlocks,
        validateCoverageBlocksForSlotDuration,
        findCoverageBlock,
        getClockHourForIndex,
        isNightRestrictedHour,
        getAllowedRolesForRequirement,
        getRoleRequirementLabel,
        getTextColorForBackground,
        getShiftRule,
        validateShiftAssignment
    };
}));
