// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

// Summarizes server test timings as Markdown, for the CI job summary.
//
// Reads the NDJSON files written by packages/server/src/test.timing-reporter.ts
// and any turbo run summaries (`turbo run --summarize`, .turbo/runs/*.json).
// The goal is to tell whether a slow run is spending its time on CPU (collect/
// import), the database (tests and hooks), or waiting (idle workers, a long
// scheduling tail).
//
// Worker ids are not visible to the reporter, so worker lanes are inferred by
// packing file intervals greedily; treat them as approximate.
//
// Usage: node scripts/analyze-test-timing.mjs <dir|file>...

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';

const TOP_N = 15;
// Slack for skew between the worker-side start time and the main-process end time
const LANE_TOLERANCE_MS = 100;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/analyze-test-timing.mjs <dir|file>...');
  process.exit(1);
}

const timingFiles = [];
const turboFiles = [];
for (const arg of args) {
  if (!existsSync(arg)) {
    console.error(`Skipping missing path: ${arg}`);
    continue;
  }
  const files = statSync(arg).isDirectory() ? readdirSync(arg).map((f) => join(arg, f)) : [arg];
  for (const file of files.sort()) {
    if (file.endsWith('.ndjson')) {
      timingFiles.push(file);
    } else if (file.endsWith('.json')) {
      turboFiles.push(file);
    }
  }
}

const turboSummaries = turboFiles.map(readTurboSummary).filter(Boolean);
const lines = [];

lines.push('# Test timing', '');
if (turboSummaries.length === 0 && timingFiles.length === 0) {
  lines.push('_No timing data found._');
}
for (const summary of turboSummaries) {
  renderTurboSummary(summary);
}
for (const file of timingFiles) {
  renderTimingFile(file);
}

console.log(lines.join('\n'));

function readTurboSummary(file) {
  try {
    const summary = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(summary.tasks) && summary.execution ? summary : undefined;
  } catch (err) {
    console.error(`Skipping unreadable turbo summary ${file}: ${err.message}`);
    return undefined;
  }
}

function readNdjson(file) {
  const rows = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch {
      // A job killed mid-write can leave a partial last line
    }
  }
  return rows;
}

function renderTurboSummary(summary) {
  const { execution } = summary;
  lines.push(`## Turbo: \`${execution.command}\``, '');
  lines.push(
    `${formatMs(execution.endTime - execution.startTime)} total; ` +
      `${execution.attempted} attempted, ${execution.cached} cached, ${execution.failed} failed`,
    ''
  );

  const tasks = summary.tasks
    .map((t) => ({
      id: t.taskId,
      task: t.task,
      status: t.cache?.status ?? '?',
      source: t.cache?.source,
      duration: t.execution ? t.execution.endTime - t.execution.startTime : undefined,
    }))
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));

  // Builds are mostly cache hits and would bury the table
  const shown = tasks.filter((t) => t.task.startsWith('test') || (t.duration ?? 0) >= 10_000);
  const hidden = tasks.filter((t) => !shown.includes(t));

  const rows = shown.map((t) => [
    code(t.id),
    t.source ? `${t.status} (${t.source})` : t.status,
    t.duration === undefined ? 'n/a' : formatMs(t.duration),
  ]);
  if (hidden.length > 0) {
    const hits = hidden.filter((t) => t.status === 'HIT').length;
    const total = hidden.reduce((sum, t) => sum + (t.duration ?? 0), 0);
    rows.push([`_${hidden.length} other tasks_`, `${hits} HIT`, formatMs(total)]);
  }
  lines.push(...table(['Task', 'Cache', 'Duration'], rows), '');
}

function renderTimingFile(file) {
  const rows = readNdjson(file);
  const run = rows.find((r) => r.type === 'run');
  const end = rows.find((r) => r.type === 'end');
  const modules = rows.filter((r) => r.type === 'module').map(withInterval);

  lines.push(`## ${code(basename(file))}`, '');
  if (!run) {
    lines.push('_No run row; file is empty or truncated._', '');
    return;
  }

  const runStart = Date.parse(run.startedAt);
  const lastEnd = modules.length > 0 ? Math.max(...modules.map((m) => m.occEnd)) : runStart;
  const wall = end?.wallMs ?? lastEnd - runStart;
  const maxWorkers = run.maxWorkers ?? 1;

  lines.push(
    ...table(
      ['Node', 'CPUs', 'Max workers', 'Pool', 'Coverage', 'Started', 'Files', 'Result'],
      [
        [
          run.node,
          run.cpus,
          maxWorkers,
          run.pool,
          run.coverage ? 'on' : 'off',
          run.startedAt,
          modules.length,
          end ? end.reason : '**incomplete** (no end row)',
        ],
      ]
    ),
    ''
  );

  const taskName = basename(file).includes('seed') ? 'test:seed' : 'test';
  const taskId = `${run.project}#${taskName}`;
  for (const summary of turboSummaries) {
    const task = summary.tasks.find((t) => t.taskId === taskId);
    if (task?.cache?.status === 'HIT') {
      lines.push(
        `> [!WARNING]`,
        `> ${code(taskId)} was a turbo cache hit in \`${summary.execution.command}\`. ` +
          `This file may have been restored from an earlier run (started ${run.startedAt}).`,
        ''
      );
      break;
    }
  }

  if (modules.length === 0) {
    lines.push('_No test files recorded._', '');
    return;
  }

  const firstStart = Math.min(...modules.map((m) => m.occStart));
  const busy = sum(modules, (m) => m.occEnd - m.occStart);
  const phases = [
    ['Environment', sum(modules, (m) => m.environmentSetupDuration)],
    ['Prepare', sum(modules, (m) => m.prepareDuration)],
    ['Setup files', sum(modules, (m) => m.setupDuration)],
    ['Collect (import)', sum(modules, (m) => m.collectDuration)],
    ['Tests', sum(modules, (m) => m.testsDuration)],
    ['Hooks (≈ duration − tests)', sum(modules, (m) => m.hooksDuration)],
  ];

  lines.push('### Totals', '');
  lines.push(
    ...table(
      ['Metric', 'Value'],
      [
        ['Wall time', formatMs(wall)],
        ['Before first file (global setup, startup)', formatMs(firstStart - runStart)],
        ['After last file (teardown, coverage)', formatMs(runStart + wall - lastEnd)],
        ['Σ file time', formatMs(busy)],
        ['Worker utilization', `${percent(busy, wall * maxWorkers)} of ${maxWorkers} × wall`],
        ['Tests', sum(modules, (m) => m.testCount)],
      ]
    ),
    ''
  );
  lines.push(
    ...table(
      ['Phase', 'Σ time', '% of file time'],
      phases.map(([name, ms]) => [name, formatMs(ms), percent(ms, busy)])
    ),
    ''
  );

  const lanes = packLanes(modules);
  const span = lastEnd - firstStart;
  const tailStart = firstStart + span * 0.9;
  const tail = modules.filter((m) => m.occEnd > tailStart).sort((a, b) => a.occStart - b.occStart);

  lines.push('### Lanes and tail', '');
  lines.push(
    `${lanes.length} inferred lanes for ${maxWorkers} workers. ` +
      `Idle is time from a lane's last file ending to the last file ending overall.`,
    ''
  );
  lines.push(
    ...table(
      ['Lane', 'Files', 'Busy', 'Idle before end', 'Last file'],
      lanes
        .map((lane, i) => ({ i, lane, laneEnd: lane.at(-1).occEnd }))
        .sort((a, b) => a.laneEnd - b.laneEnd)
        .map(({ i, lane, laneEnd }) => [
          i + 1,
          lane.length,
          formatMs(sum(lane, (m) => m.occEnd - m.occStart)),
          formatMs(lastEnd - laneEnd),
          code(lane.at(-1).file),
        ])
    ),
    ''
  );
  lines.push(`Files still running in the last 10% (after ${formatMs(tailStart - firstStart)}):`, '');
  lines.push(
    ...table(
      ['File', 'Starts at', 'Ends at', 'Time'],
      tail.map((m) => [
        code(m.file),
        formatMs(m.occStart - firstStart),
        formatMs(m.occEnd - firstStart),
        formatMs(m.occEnd - m.occStart),
      ])
    ),
    ''
  );

  lines.push('### Drift', '');
  lines.push('Files bucketed by start time. A rising ms/test suggests the shared database slows as it grows.', '');
  const quintiles = [[], [], [], [], []];
  for (const m of modules) {
    const q = span > 0 ? Math.min(4, Math.floor(((m.occStart - firstStart) / span) * 5)) : 0;
    quintiles[q].push(m);
  }
  lines.push(
    ...table(
      ['Quintile', 'Files', 'Median ms/test', 'Median collect', 'Median hooks'],
      quintiles.map((q, i) => [
        `${i * 20}–${(i + 1) * 20}%`,
        q.length,
        formatMs(median(q.filter((m) => m.testCount > 0).map((m) => m.testsDuration / m.testCount))),
        formatMs(median(q.map((m) => m.collectDuration))),
        formatMs(median(q.map((m) => m.hooksDuration))),
      ])
    ),
    ''
  );

  const fileColumns = ['File', 'Time', 'Duration', 'Collect', 'Hooks', 'Tests'];
  const fileRow = (m) => [
    code(m.file),
    formatMs(m.occEnd - m.occStart),
    formatMs(m.duration),
    formatMs(m.collectDuration),
    formatMs(m.hooksDuration),
    m.testCount,
  ];
  for (const [title, key] of [
    ['duration', 'duration'],
    ['collect time', 'collectDuration'],
    ['hook time', 'hooksDuration'],
  ]) {
    lines.push(`### Top ${TOP_N} files by ${title}`, '');
    lines.push(...table(fileColumns, topBy(modules, (m) => m[key]).map(fileRow)), '');
  }

  const imports = new Map();
  for (const m of modules) {
    for (const imp of m.imports ?? []) {
      const agg = imports.get(imp.path) ?? { path: imp.path, selfTime: 0, maxTotalTime: 0, files: 0 };
      agg.selfTime += imp.selfTime;
      agg.maxTotalTime = Math.max(agg.maxTotalTime, imp.totalTime);
      agg.files++;
      imports.set(imp.path, agg);
    }
  }
  lines.push(`### Top ${TOP_N} imports by self time`, '');
  lines.push('Only the 10 slowest imports per file are recorded, so sums undercount.', '');
  lines.push(
    ...table(
      ['Module', 'Σ self time', 'Files', 'Max total time'],
      topBy([...imports.values()], (i) => i.selfTime).map((i) => [
        code(displayPath(i.path)),
        formatMs(i.selfTime),
        i.files,
        formatMs(i.maxTotalTime),
      ])
    ),
    ''
  );
}

/**
 * Adds the interval a file occupied its worker for. `startTime` marks when tests began running,
 * after environment, setup, and collection, so those phases are subtracted back out.
 * @param m - A module row.
 * @returns The row with `occStart` and `occEnd`.
 */
function withInterval(m) {
  const before = m.environmentSetupDuration + m.prepareDuration + m.setupDuration + m.collectDuration;
  const occStart =
    m.startTime === undefined || m.startTime === null ? m.endTime - m.duration - before : m.startTime - before;
  return { ...m, occStart, occEnd: m.endTime };
}

function packLanes(modules) {
  const lanes = [];
  for (const m of [...modules].sort((a, b) => a.occStart - b.occStart)) {
    let best;
    for (const lane of lanes) {
      const laneEnd = lane.at(-1).occEnd;
      if (laneEnd <= m.occStart + LANE_TOLERANCE_MS && (!best || laneEnd > best.at(-1).occEnd)) {
        best = lane;
      }
    }
    if (best) {
      best.push(m);
    } else {
      lanes.push([m]);
    }
  }
  return lanes;
}

function topBy(items, fn) {
  return [...items].sort((a, b) => fn(b) - fn(a)).slice(0, TOP_N);
}

function sum(items, fn) {
  return items.reduce((total, item) => total + (fn(item) ?? 0), 0);
}

function median(values) {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percent(part, whole) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a';
}

function formatMs(ms) {
  if (ms === undefined || Number.isNaN(ms)) {
    return 'n/a';
  }
  if (Math.abs(ms) < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (Math.abs(seconds) < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.trunc(seconds / 60);
  return `${minutes}m ${(seconds - minutes * 60).toFixed(0).padStart(2, '0')}s`;
}

function displayPath(path) {
  const rel = relative(process.cwd(), path);
  return rel.startsWith('..') || isAbsolute(rel) ? path : rel;
}

function code(text) {
  return `\`${String(text).replaceAll('`', "'")}\``;
}

function table(headers, rows) {
  const cell = (value) => String(value ?? '').replaceAll('|', '\\|');
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ];
}
