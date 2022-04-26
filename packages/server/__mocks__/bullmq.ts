declare const vi;

export const Queue = vi.fn(() => ({
  add: vi.fn(),
  close: vi.fn(),
}));

export const QueueScheduler = vi.fn(() => ({
  close: vi.fn(),
}));

export const Worker = vi.fn(() => ({
  close: vi.fn(),
  on: vi.fn(),
}));
