'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pageContainsMeetDate } = require('./tfrrs-date-verification');

test('accepts the exact meet date with its year', () => {
  assert.equal(pageContainsMeetDate('Otterbein Invite — January 17, 2026', '2026-01-17'), true);
});

test('accepts a date inside the three-day tolerance', () => {
  assert.equal(pageContainsMeetDate('Meet dates: Jan. 20, 2024', '2024-01-18'), true);
});

test('rejects the same annual weekend in a different year', () => {
  assert.equal(pageContainsMeetDate('Otterbein Invite — January 17, 2026', '2025-01-18'), false);
});

test('does not combine a nearby month/day with a distant year elsewhere on the page', () => {
  assert.equal(pageContainsMeetDate('January 17 results. Historical archive from 2025.', '2025-01-17'), false);
});

test('accepts day-first date text', () => {
  assert.equal(pageContainsMeetDate('Competition held 17 January 2026', '2026-01-17'), true);
});

test('rejects an invalid meet date', () => {
  assert.equal(pageContainsMeetDate('January 17, 2026', 'not-a-date'), false);
});
