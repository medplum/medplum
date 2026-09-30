// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestModule, Vitest } from 'vitest/node';
import { summarizeModule, TimingReporter } from './test.timing-reporter';

interface StubTest {
  fullName: string;
  duration?: number;
}

function stubModule(options: {
  relativeModuleId?: string;
  projectName?: string;
  startTime?: number;
  tests?: StubTest[];
  duration?: number;
  importDurations?: Record<string, { selfTime: number; totalTime: number }>;
}): TestModule {
  const tests = options.tests ?? [];
  return {
    relativeModuleId: options.relativeModuleId ?? 'src/example.test.ts',
    project: { name: options.projectName ?? '@medplum/server' },
    task: { result: options.startTime === undefined ? undefined : { startTime: options.startTime } },
    state: () => 'passed',
    diagnostic: () => ({
      environmentSetupDuration: 1,
      prepareDuration: 2,
      collectDuration: 300,
      setupDuration: 40,
      duration: options.duration ?? 1000,
      heap: undefined,
      importDurations: options.importDurations ?? {},
    }),
    children: {
      *allTests() {
        for (const t of tests) {
          yield {
            fullName: t.fullName,
            diagnostic: () => (t.duration === undefined ? undefined : { duration: t.duration }),
          };
        }
      },
    },
  } as unknown as TestModule;
}

describe('summarizeModule', () => {
  test('summarizes phases, tests, and imports', () => {
    const mod = stubModule({
      duration: 1000,
      tests: [
        { fullName: 'a > one', duration: 100 },
        { fullName: 'a > two', duration: 500 },
        { fullName: 'a > three', duration: 50 },
        { fullName: 'a > four', duration: 200 },
        { fullName: 'a > five', duration: 10 },
        { fullName: 'a > six', duration: 20 },
        { fullName: 'a > skipped' },
      ],
      importDurations: {
        '/repo/packages/server/src/small.ts': { selfTime: 5, totalTime: 5 },
        '/repo/packages/server/src/big.ts': { selfTime: 50, totalTime: 120 },
      },
    });

    const row = summarizeModule(mod, 10_000, 11_500);

    expect(row).toEqual({
      file: 'src/example.test.ts',
      state: 'passed',
      startTime: 10_000,
      endTime: 11_500,
      environmentSetupDuration: 1,
      prepareDuration: 2,
      collectDuration: 300,
      setupDuration: 40,
      duration: 1000,
      testCount: 7,
      testsDuration: 880,
      hooksDuration: 120,
      slowestTests: [
        { name: 'a > two', duration: 500 },
        { name: 'a > four', duration: 200 },
        { name: 'a > one', duration: 100 },
        { name: 'a > three', duration: 50 },
        { name: 'a > six', duration: 20 },
      ],
      imports: [
        { path: '/repo/packages/server/src/big.ts', selfTime: 50, totalTime: 120 },
        { path: '/repo/packages/server/src/small.ts', selfTime: 5, totalTime: 5 },
      ],
    });
  });

  test('never reports negative hook time', () => {
    const mod = stubModule({ duration: 100, tests: [{ fullName: 'x', duration: 150 }] });
    expect(summarizeModule(mod, undefined, 0).hooksDuration).toBe(0);
  });
});

describe('TimingReporter', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'timing-reporter-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function readRows(file: string): Record<string, any>[] {
    return readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  }

  test('writes run, module, and end rows', () => {
    const file = join(dir, 'nested', 'timing.ndjson');
    const reporter = new TimingReporter(file, '@medplum/server');
    const vitest = {
      projects: [],
      config: { maxWorkers: 4, pool: 'forks', coverage: { enabled: true } },
    } as unknown as Vitest;

    reporter.onInit(vitest);
    const mod = stubModule({ startTime: 123, tests: [{ fullName: 't', duration: 5 }] });
    reporter.onTestModuleEnd(mod);
    reporter.onTestModuleEnd(stubModule({ projectName: '@medplum/core' }));
    reporter.onTestRunEnd([mod], [], 'passed');

    const rows = readRows(file);
    expect(rows.map((r) => r.type)).toEqual(['run', 'module', 'end']);
    expect(rows[0]).toMatchObject({
      type: 'run',
      project: '@medplum/server',
      node: process.version,
      maxWorkers: 4,
      pool: 'forks',
      coverage: true,
    });
    expect(typeof rows[0].startedAt).toBe('string');
    expect(rows[0].cpus).toBeGreaterThan(0);
    expect(rows[1]).toMatchObject({ type: 'module', file: 'src/example.test.ts', startTime: 123, testCount: 1 });
    expect(rows[1].endTime).toBeGreaterThan(0);
    expect(rows[2]).toMatchObject({ type: 'end', reason: 'passed', moduleCount: 1 });
    expect(rows[2].wallMs).toBeGreaterThanOrEqual(0);
  });

  test('records the default worker count when maxWorkers is unset', () => {
    const file = join(dir, 'timing.ndjson');
    const reporter = new TimingReporter(file, '@medplum/server');

    reporter.onInit({
      projects: [],
      config: { pool: 'forks', watch: false, coverage: { enabled: false } },
    } as unknown as Vitest);

    expect(readRows(file)[0].maxWorkers).toBe(Math.max(availableParallelism() - 1, 1));
  });

  test('truncates output from a previous run', () => {
    const file = join(dir, 'timing.ndjson');
    writeFileSync(file, '{"type":"stale"}\n');
    const reporter = new TimingReporter(file, '@medplum/server');

    reporter.onInit({
      projects: [],
      config: { maxWorkers: 1, pool: 'forks', coverage: { enabled: false } },
    } as unknown as Vitest);

    expect(readRows(file).map((r) => r.type)).toEqual(['run']);
  });
});
