// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vitest/config';
import type { Reporter, TestModule, TestRunEndReason, Vitest } from 'vitest/node';
import { experimental_getRunnerTask } from 'vitest/node';

/**
 * Per-file timing reporter for diagnosing slow CI runs.
 *
 * Writes one NDJSON row per test module to `.vitest-reports/<fileName>`, plus a leading `run` row
 * and a trailing `end` row. Summarize the output with `scripts/analyze-test-timing.mjs`.
 */

export interface ModuleTimingRow {
  file: string;
  state: string;
  /** Epoch ms when the module's tests started running; collection happens before this. */
  startTime: number | undefined;
  /** Epoch ms when the main process received the module result. */
  endTime: number;
  environmentSetupDuration: number;
  prepareDuration: number;
  collectDuration: number;
  setupDuration: number;
  duration: number;
  testCount: number;
  testsDuration: number;
  hooksDuration: number;
  slowestTests: { name: string; duration: number }[];
  imports: { path: string; selfTime: number; totalTime: number }[];
}

export function summarizeModule(mod: TestModule, startTime: number | undefined, endTime: number): ModuleTimingRow {
  const diagnostic = mod.diagnostic();

  const tests: { name: string; duration: number }[] = [];
  let testCount = 0;
  for (const testCase of mod.children.allTests()) {
    testCount++;
    const duration = testCase.diagnostic()?.duration;
    if (duration !== undefined) {
      tests.push({ name: testCase.fullName, duration });
    }
  }
  const testsDuration = tests.reduce((sum, t) => sum + t.duration, 0);

  const imports = Object.entries(diagnostic.importDurations)
    .map(([path, { selfTime, totalTime }]) => ({ path, selfTime, totalTime }))
    .sort((a, b) => b.selfTime - a.selfTime)
    .slice(0, 10);

  return {
    file: mod.relativeModuleId,
    state: mod.state(),
    startTime,
    endTime,
    environmentSetupDuration: diagnostic.environmentSetupDuration,
    prepareDuration: diagnostic.prepareDuration,
    collectDuration: diagnostic.collectDuration,
    setupDuration: diagnostic.setupDuration,
    duration: diagnostic.duration,
    testCount,
    testsDuration,
    hooksDuration: Math.max(0, diagnostic.duration - testsDuration),
    slowestTests: tests.sort((a, b) => b.duration - a.duration).slice(0, 5),
    imports,
  };
}

export class TimingReporter implements Reporter {
  private readonly outputFile: string;
  private readonly projectName: string;
  private startedAt = 0;

  constructor(outputFile: string, projectName: string) {
    this.outputFile = outputFile;
    this.projectName = projectName;
  }

  onInit(vitest: Vitest): void {
    this.startedAt = Date.now();
    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, '');
    this.write({
      type: 'run',
      project: this.projectName,
      startedAt: new Date(this.startedAt).toISOString(),
      node: process.version,
      cpus: availableParallelism(),
      maxWorkers: resolveMaxWorkers(vitest, this.projectName),
      pool: vitest.config.pool,
      coverage: vitest.config.coverage.enabled,
    });
  }

  onTestModuleEnd(mod: TestModule): void {
    if (mod.project.name !== this.projectName) {
      return;
    }
    const startTime = experimental_getRunnerTask(mod).result?.startTime;
    this.write({ type: 'module', ...summarizeModule(mod, startTime, Date.now()) });
  }

  onTestRunEnd(modules: readonly TestModule[], _errors: unknown, reason: TestRunEndReason): void {
    const moduleCount = modules.filter((mod) => mod.project.name === this.projectName).length;
    this.write({ type: 'end', wallMs: Date.now() - this.startedAt, reason, moduleCount });
  }

  private write(row: Record<string, unknown>): void {
    appendFileSync(this.outputFile, JSON.stringify(row) + '\n');
  }
}

/**
 * Mirrors vitest's own `resolveMaxWorkers`, since the config leaves it unset when defaulted.
 * @param vitest - The Vitest instance.
 * @param projectName - The project whose tests are timed.
 * @returns The number of workers the project's tests run on.
 */
function resolveMaxWorkers(vitest: Vitest, projectName: string): number {
  const project = vitest.projects.find((p) => p.name === projectName);
  const configured = project?.config.maxWorkers || vitest.config.maxWorkers;
  if (configured) {
    return configured;
  }
  const cpus = availableParallelism();
  return vitest.config.watch ? Math.max(Math.floor(cpus / 2), 1) : Math.max(cpus - 1, 1);
}

/**
 * Registers a {@link TimingReporter} alongside whatever reporters are configured.
 *
 * Adding it here rather than in `test.reporters` keeps it when the CLI passes `--reporter`,
 * which replaces the configured list.
 * @param fileName - Output file name within the project's `.vitest-reports` directory.
 * @returns The Vite plugin.
 */
export function timingReporterPlugin(fileName: string): Plugin {
  return {
    name: 'medplum-timing-reporter',
    configureVitest({ vitest, project }) {
      // A --merge-reports run replays results from blobs and would clobber the real timings.
      if (vitest.config.mergeReports) {
        return;
      }
      const outputFile = resolve(project.config.root, '.vitest-reports', fileName);
      vitest.config.reporters.push(new TimingReporter(outputFile, project.name));
    },
  };
}
