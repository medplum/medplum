#!/usr/bin/env node
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Runs Hugo with Dart Sass on the PATH. Hugo compiles SCSS by running an external `sass`, which must be the native
// Dart Sass compiler, but node_modules/.bin/sass is the JS-only `sass` package (a vite peer dependency). So put the
// compiler from sass-embedded's platform package first on the PATH.
//
// Usage: node scripts/hugo.mjs [hugo arguments...]

/* global process */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import hugoPath from 'hugo-bin';

const require = createRequire(import.meta.url);

// sass-embedded's own platform detection (e.g. linux-musl). It isn't exported, so require it by path.
const sassEmbeddedMain = require.resolve('sass-embedded');
const { compilerModule } = require(path.join(path.dirname(sassEmbeddedMain), 'src', 'compiler-module.js'));
const sassLauncher = `${compilerModule}/dart-sass/sass${process.platform === 'win32' ? '.bat' : ''}`;
const sassDir = path.dirname(createRequire(sassEmbeddedMain).resolve(sassLauncher));

const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
const result = spawnSync(hugoPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, [pathKey]: sassDir + path.delimiter + (process.env[pathKey] ?? '') },
});
process.exit(result.status ?? 1);
