import {expect, test} from 'vitest';

// Deliberately failing: proves CI goes red. Reverted in the next commit.
test('CI red proof', () => {
  expect(1).toBe(2);
});
