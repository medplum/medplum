// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global process */
/* global console */

// Overrides the Medplum version across the entire monorepo so that the root
// package, every workspace package (including @medplum/core and @medplum/agent),
// and all internal @medplum/* dependency references agree on a single version.
//
// This is primarily used by the "Build agent" workflow's `version` override
// input so that the version baked into @medplum/core (and therefore reported by
// the agent), the version in the produced artifact/installer filenames, and the
// agent's own version all match the requested version.
//
// Implemented in Node (rather than shell/sed/`npm version`) so it behaves
// identically on the Windows, Linux, and macOS build runners. It only rewrites
// package.json files; the lockfile is intentionally left untouched since the
// build runs against the already-installed node_modules.
//
// Usage: node scripts/set-medplum-version.mjs <version>

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Usage: node scripts/set-medplum-version.mjs <version>');
  process.exit(1);
}

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function collectPackageJsonFiles(dir, acc) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') {
      continue;
    }
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      collectPackageJsonFiles(fullPath, acc);
    } else if (entry === 'package.json') {
      acc.push(fullPath);
    }
  }
  return acc;
}

// The root package.json plus every package.json under packages/ and examples/.
const packageFiles = ['package.json'];
for (const root of ['packages', 'examples']) {
  collectPackageJsonFiles(root, packageFiles);
}

let updatedFiles = 0;

for (const file of packageFiles) {
  const raw = readFileSync(file, 'utf8');
  const pkg = JSON.parse(raw);
  let changed = false;

  // Set the package's own version.
  if (pkg.version !== undefined && pkg.version !== newVersion) {
    pkg.version = newVersion;
    changed = true;
  }

  // Rewrite internal @medplum/* dependency references. Only concrete version
  // pins are touched; ranges like `workspace:*` or `*` are left alone.
  for (const depKey of DEP_KEYS) {
    const deps = pkg[depKey];
    if (!deps) {
      continue;
    }
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@medplum/') && deps[name] !== newVersion && /^[~^]?\d/.test(deps[name])) {
        deps[name] = newVersion;
        changed = true;
      }
    }
  }

  if (changed) {
    // Preserve a trailing newline if the original had one.
    const trailing = raw.endsWith('\n') ? '\n' : '';
    writeFileSync(file, JSON.stringify(pkg, null, 2) + trailing);
    updatedFiles++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Set all Medplum versions to ${newVersion} across ${updatedFiles} package.json file(s).`);
