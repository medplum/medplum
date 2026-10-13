// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Type declarations for Bot code, bundled as raw strings. This module is only reachable through a
// dynamic import, so these ~3 MB of declarations load only when the Bot editor is opened.
//
// Relative paths are required: `@medplum/core` is aliased to its `src` directory.
import botLayer from '../../../bot-layer/package.json';
import coreDts from '../../../core/dist/esm/index.d.ts?raw';

const fhirtypesDts = import.meta.glob<string>('../../../fhirtypes/dist/*.d.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Node.js built-in modules, from `require('module').builtinModules`
const NODE_BUILTINS = [
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'inspector/promises',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'readline/promises',
  'repl',
  'stream',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
];

export interface ExtraLib {
  readonly content: string;
  readonly filePath: string;
}

export function getMedplumExtraLibs(): ExtraLib[] {
  const libs: ExtraLib[] = [{ content: coreDts, filePath: 'file:///node_modules/@medplum/core/index.d.ts' }];

  // Keep the file names so the relative `./X.d.ts` imports between fhirtypes files resolve
  for (const [path, content] of Object.entries(fhirtypesDts)) {
    const fileName = path.substring(path.lastIndexOf('/') + 1);
    libs.push({ content, filePath: `file:///node_modules/@medplum/fhirtypes/${fileName}` });
  }

  // Other packages available to Bots at runtime, and Node.js built-ins, are typed as `any`,
  // so importing them is not an error
  const shims = [
    ...Object.keys(botLayer.dependencies).filter((name) => name !== '@medplum/core'),
    ...NODE_BUILTINS,
    ...NODE_BUILTINS.map((name) => `node:${name}`),
  ]
    .map((name) => `declare module '${name}';`)
    .join('\n');
  libs.push({ content: shims, filePath: 'file:///node_modules/@types/bot-layer-shims/index.d.ts' });

  return libs;
}
