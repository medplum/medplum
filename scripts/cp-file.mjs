#!/usr/bin/env node
/* globals process console */
import { copyFileSync } from 'node:fs';

const src = process.argv[2];
const dest = process.argv[3];

if (!(src && dest)) {
  console.error('Command must contain a path to a file and a destination.');
  process.exit(1);
}

copyFileSync(src, dest);
console.info(`Copied ${src} to ${dest} successfully.`);
