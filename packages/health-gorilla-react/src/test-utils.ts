import { expect } from 'vitest';

export function expectToBeDefined<T>(value: T | undefined, message?: string): asserts value is T {
  expect(value, message).toBeDefined();
}
