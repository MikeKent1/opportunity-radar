import assert from 'node:assert/strict';
import { removeRelativeDeadlineText } from './lib/sanitize-opportunity-text.mjs';

const cases = [
  ['Win $200. 50 days left', 'Win $200.'],
  ['Win $200 - 1 day left - 90 participants', 'Win $200 - 90 participants'],
  ['Enter now, ends in 2 days', 'Enter now,'],
  ['Giveaway closes within 48 hours', 'Giveaway'],
  ['Prize draw: 12h remaining', 'Prize draw:'],
  ['Offer expires tomorrow', 'Offer'],
  ['Deadline today for the giveaway', 'for the giveaway'],
  ['Last chance to win a gift card', 'to win a gift card'],
  ['Limited time sweepstakes for cash', 'sweepstakes for cash'],
  ['Win a $200 gift card', 'Win a $200 gift card'],
];

for (const [input, expected] of cases) {
  assert.equal(removeRelativeDeadlineText(input), expected, input);
}

console.log(JSON.stringify({ ok: true, cases: cases.length }));
