import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateCourseMastery, toAgsScore } from '../lti/courseMastery.ts';

test('course mastery is the equal-weight mean across all required nodes', () => {
    assert.equal(aggregateCourseMastery([1, 0.5, 0, 0.5]).score, 0.5);
});

test('unassessed nodes count as zero, so a few finished nodes do not inflate the grade', () => {
    const { score, completed } = aggregateCourseMastery([0.9, 0.9, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.ok(Math.abs(score - 0.18) < 1e-9);
    assert.equal(completed, false);
});

test('completion requires every node at or above the mastery threshold', () => {
    assert.equal(aggregateCourseMastery([0.8, 0.95]).completed, true);
    assert.equal(aggregateCourseMastery([0.8, 0.79]).completed, false);
});

test('boundaries: empty curriculum, out-of-range and non-finite values', () => {
    assert.deepEqual(aggregateCourseMastery([]), { score: 0, completed: false });
    assert.equal(aggregateCourseMastery([2, -1]).score, 0.5);
    assert.equal(aggregateCourseMastery([Number.NaN, 1]).score, 0.5);
});

test('AGS score conversion rounds to the 0-100 scale and clamps', () => {
    assert.equal(toAgsScore(0), 0);
    assert.equal(toAgsScore(0.456), 46);
    assert.equal(toAgsScore(1), 100);
    assert.equal(toAgsScore(1.4), 100);
    assert.equal(toAgsScore(-0.2), 0);
});
