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
        const slotDurationHours = Math.max(1, Math.trunc(Number(options && options.slotDurationHours) || SLOT_DURATION_HOURS));
        const allowIsolatedSingleHour = options && options.allowIsolatedSingleHour !== undefined
            ? Boolean(options.allowIsolatedSingleHour)
            : true;
        const minHourIndex = Number(options && options.minHourIndex);
        const maxHourIndex = Number(options && options.maxHourIndex);

        const covered = new Set();
        (blocks || []).forEach((block) => {
            for (let hour = block.start; hour < block.end; hour += 1) {
                covered.add(hour);
            }
        });

        if (covered.size === 0) {
            return { valid: true, code: 'ok', message: '' };
        }

        const coveredHours = Array.from(covered).sort((a, b) => a - b);
        let runStart = coveredHours[0];
        let previousHour = coveredHours[0];
        const runs = [];

        const validateRun = (start, endInclusive) => {
            const runLength = (endInclusive - start) + 1;
            if (runLength % slotDurationHours === 0) return null;

            if (allowIsolatedSingleHour && runLength === 1) {
                const leftHour = start - 1;
                const rightHour = start + 1;
                const hasLeftNeighborHour = Number.isFinite(minHourIndex) ? leftHour >= minHourIndex : true;
                const hasRightNeighborHour = Number.isFinite(maxHourIndex) ? rightHour < maxHourIndex : true;
                const hasLeftGap = !covered.has(leftHour);
                const hasRightGap = !covered.has(rightHour);

                if (hasLeftNeighborHour && hasRightNeighborHour && hasLeftGap && hasRightGap) {
                    return null;
                }
            }

            return {
                valid: false,
                code: 'invalid_coverage_shape',
                message: 'Bedarfszeiten müssen in 2h-Blöcken planbar sein. Nur ein isolierter 1h-Slot zwischen zwei gesperrten Stunden ist erlaubt.',
                runStart: start,
                runEnd: endInclusive + 1
            };
        };

        for (let i = 1; i < coveredHours.length; i += 1) {
            const hour = coveredHours[i];
            if (hour !== previousHour + 1) {
                runs.push({ start: runStart, end: previousHour });
                runStart = hour;
            }
            previousHour = hour;
        }

        runs.push({ start: runStart, end: previousHour });

        for (let i = 0; i < runs.length; i += 1) {
            const error = validateRun(runs[i].start, runs[i].end);
            if (error) return error;
        }

        for (let i = 1; i < runs.length; i += 1) {
            const previousRun = runs[i - 1];
            const currentRun = runs[i];
            const gapLength = currentRun.start - previousRun.end - 1;
            if (gapLength === 1) {
                return {
                    valid: false,
                    code: 'invalid_coverage_shape',
                    message: 'Bedarfszeiten müssen in 2h-Blöcken planbar sein. 1h-Lücken zwischen zwei Bedarfsbereichen sind nicht erlaubt.',
                    gapStart: previousRun.end + 1,
                    gapEnd: currentRun.start
                };
            }
        }

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
