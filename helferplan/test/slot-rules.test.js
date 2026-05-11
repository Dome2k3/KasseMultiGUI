const test = require('node:test');
const assert = require('node:assert/strict');

const SlotRules = require('../public/js/slot-rules.js');

test('marks uncovered hours as not needed', () => {
    const rule = SlotRules.getShiftRule(
        { role_requirement: 'Alle', allowed_time_blocks: [{ start: 4, end: 8 }] },
        1,
        { endHourIndex: 3 }
    );

    assert.equal(rule.isNeeded, false);
    assert.equal(rule.visualState, 'not-needed');
});

test('keeps daytime Alle shifts green and youth-eligible', () => {
    const rule = SlotRules.getShiftRule(
        { role_requirement: 'Alle', allowed_time_blocks: [{ start: 20, end: 30 }] },
        22,
        { endHourIndex: 24 }
    );

    assert.equal(rule.isNeeded, true);
    assert.equal(rule.roleRequirement, 'Alle');
    assert.deepEqual(rule.allowedRoles, ['Minderjaehrig', 'Erwachsen', 'Orga']);
    assert.equal(rule.visualState, 'open-all');
});

test('upgrades late-night Alle shifts to Erwachsene/Orga', () => {
    const rule = SlotRules.getShiftRule(
        { role_requirement: 'Alle', allowed_time_blocks: [{ start: 10, end: 15 }] },
        11,
        { endHourIndex: 13 }
    );

    assert.equal(rule.isNeeded, true);
    assert.equal(rule.roleRequirement, 'Erwachsen');
    assert.equal(rule.nightRestricted, true);
    assert.deepEqual(rule.allowedRoles, ['Erwachsen', 'Orga']);
});

test('backend/shared validation rejects minor helpers on late-night shifts', () => {
    const validation = SlotRules.validateShiftAssignment({
        activity: { role_requirement: 'Alle', allowed_time_blocks: [{ start: 10, end: 15 }] },
        coverageBlocks: [{ start: 10, end: 15 }],
        startHourIndex: 11,
        endHourIndex: 13,
        helperRole: 'Minderjaehrig'
    });

    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'role_mismatch');
    assert.match(validation.message, /Erwachsene oder Orga/i);
});

test('shared validation accepts adults on late-night shifts and rejects partially uncovered ranges', () => {
    const validAdult = SlotRules.validateShiftAssignment({
        activity: { role_requirement: 'Alle', allowed_time_blocks: [{ start: 10, end: 15 }] },
        coverageBlocks: [{ start: 10, end: 15 }],
        startHourIndex: 11,
        endHourIndex: 13,
        helperRole: 'Erwachsen'
    });
    assert.equal(validAdult.valid, true);

    const uncovered = SlotRules.validateShiftAssignment({
        activity: { role_requirement: 'Erwachsen', allowed_time_blocks: [{ start: 4, end: 5 }] },
        coverageBlocks: [{ start: 4, end: 5 }],
        startHourIndex: 4,
        endHourIndex: 6,
        helperRole: 'Erwachsen'
    });
    assert.equal(uncovered.valid, false);
    assert.equal(uncovered.code, 'not_needed');
});

test('helper filtering can rely on shared allowed roles for every slot state', () => {
    assert.deepEqual(SlotRules.getAllowedRolesForRequirement('Alle'), ['Minderjaehrig', 'Erwachsen', 'Orga']);
    assert.deepEqual(SlotRules.getAllowedRolesForRequirement('Erwachsen'), ['Erwachsen', 'Orga']);
    assert.deepEqual(SlotRules.getAllowedRolesForRequirement('Orga'), ['Orga']);
});

test('shared contrast helper returns readable text colors for filled slots', () => {
    assert.equal(SlotRules.getTextColorForBackground('#ffffff'), '#111');
    assert.equal(SlotRules.getTextColorForBackground('#005A9F'), '#fff');
});

test('coverage validation accepts 2h and 4h contiguous ranges', () => {
    const validation = SlotRules.validateCoverageBlocksForSlotDuration([
        { start: 2, end: 4 },
        { start: 7, end: 11 }
    ], { slotDurationHours: 2, minHourIndex: 0, maxHourIndex: 20 });

    assert.equal(validation.valid, true);
});

test('coverage validation allows exactly one isolated hour between blocked neighbors', () => {
    const validation = SlotRules.validateCoverageBlocksForSlotDuration([
        { start: 5, end: 6 }
    ], { slotDurationHours: 2, minHourIndex: 0, maxHourIndex: 20 });

    assert.equal(validation.valid, true);
});

test('coverage validation rejects odd-length contiguous coverage that leaves 1h remainder', () => {
    const validation = SlotRules.validateCoverageBlocksForSlotDuration([
        { start: 8, end: 11 }
    ], { slotDurationHours: 2, minHourIndex: 0, maxHourIndex: 20 });

    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'invalid_coverage_shape');
});

test('coverage validation rejects single-hour coverage at timeline edge', () => {
    const validation = SlotRules.validateCoverageBlocksForSlotDuration([
        { start: 0, end: 1 }
    ], { slotDurationHours: 2, minHourIndex: 0, maxHourIndex: 20 });

    assert.equal(validation.valid, false);
    assert.equal(validation.code, 'invalid_coverage_shape');
});
