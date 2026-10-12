// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* global console, process */

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Generates the Content-Security-Policy for www.medplum.com, including a sha256
// hash for every inline <script> Docusaurus emits into the built site.
//
// Why this exists: `script-src 'unsafe-inline'` is what security scanners flag,
// and it cannot simply be deleted, because Docusaurus inlines scripts we do not
// control (the pre-paint colour-mode switch, the base-url banner) alongside ones
// we configure (the gtag bootstrap, the kapa.ai queue stub). Hashing them is the
// only way to drop 'unsafe-inline' without breaking the site.
//
// The hashes change whenever Docusaurus, its config, or those snippets change,
// so they are regenerated from the build output rather than committed by hand.
//
// Usage:
//   node scripts/generate-csp.mjs                      # print the CSP
//   node scripts/generate-csp.mjs --out policy.json    # write a CloudFront policy config
//   node scripts/generate-csp.mjs --check policy.json  # fail if that file is stale
//
// The output is a build artifact and is deliberately not committed: a policy
// generated from a stale build omits hashes for inline scripts added since, and
// applying it would block them.
//
// To apply a generated policy:
//   aws cloudfront create-response-headers-policy --response-headers-policy-config file://policy.json

const BUILD_DIR = 'packages/docs/build';

// CloudFront rejects a response headers policy whose CSP exceeds this.
const CLOUDFRONT_CSP_LIMIT = 1783;

// Inline <script> types the CSP script-src directive actually governs. A block
// with any other type (application/ld+json, text/template, ...) is data, not
// script: the browser never executes it and CSP never checks it, so hashing one
// would be noise. JSON-LD matters here specifically because Docusaurus emits a
// different block on every page, which would make a fixed hash list impossible.
const EXECUTABLE_SCRIPT_TYPES = new Set([
  '',
  'module',
  'importmap',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
]);

const INLINE_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const TYPE_ATTR_RE = /\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SRC_ATTR_RE = /\bsrc\s*=/i;

/**
 * The policy, minus the script hashes, which are filled in from the build.
 *
 * Ported from packages/docs/vercel.json, which stopped taking effect when www
 * moved off Vercel to S3 + CloudFront. See medplum/medplum-ee#1087.
 * @param hashes - Base64 sha256 digests of the site's inline scripts.
 * @returns The CSP directives, as a map of directive name to source list.
 */
function buildDirectives(hashes) {
  return {
    'default-src': ["'none'"],
    'base-uri': ["'self'"],
    'child-src': ["'self'"],
    'connect-src': [
      "'self'",
      '*.medplum.com',
      '*.google.com',
      '*.google-analytics.com',
      '*.algolia.net',
      '*.algolianet.com',
      '*.algolia.io',
      '*.cookieyes.com',
      'cdn-cookieyes.com',
      'pro.ip-api.com',
      '9xgnrndqve.execute-api.us-west-2.amazonaws.com',
      // The four below exist only for the LiveIntent tag. It currently 403s at
      // the vendor's own CDN; if it is retired, drop these. medplum-ee#1164.
      'a.usbrowserspeed.com',
      'alocdn.com',
      '*.liadm.com',
      'proxy.kapa.ai',
      'metrics.kapa.ai',
    ],
    'font-src': ["'self'", 'data:', 'fonts.gstatic.com'],
    'form-action': ["'self'", '*.gstatic.com', '*.google.com'],
    // Not 'none': the docs site is deliberately embeddable across our own
    // subdomains, which is also why X-Frame-Options stays SAMEORIGIN.
    'frame-ancestors': ["'self'", '*.medplum.com'],
    'frame-src': ["'self'", '*.medplum.com', '*.gstatic.com', '*.google.com', '*.youtube.com'],
    'img-src': [
      "'self'",
      'data:',
      '*.medplum.com',
      '*.gstatic.com',
      '*.google.com',
      '*.googletagmanager.com',
      'github.com',
      '*.github.com',
      '*.githubusercontent.com',
      '*.youtube.com',
      'cdn-cookieyes.com',
    ],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", '*.medplum.com'],
    // Explicit rather than inherited from default-src: scanners check for it by
    // name. The built site contains no <object>, <embed> or <applet>.
    'object-src': ["'none'"],
    // No 'unsafe-inline'. Note that browsers ignore 'unsafe-inline' entirely once
    // a hash is present, so this list has to be complete or inline scripts break.
    'script-src': [
      "'self'",
      ...hashes.map((h) => `'sha256-${h}'`),
      '*.medplum.com',
      '*.gstatic.com',
      '*.google.com',
      '*.googleapis.com',
      '*.googletagmanager.com',
      'cdn-cookieyes.com',
      'ddwl4m2hdecbv.cloudfront.net',
      '*.liadm.com',
      'widget.kapa.ai',
    ],
    // Docusaurus and Mantine both inject styles at runtime; 'unsafe-inline' is
    // unavoidable here. Scanners flag script-src, not style-src, and an inline
    // style is a materially smaller problem than an inline script.
    'style-src': ["'self'", "'unsafe-inline'", '*.medplum.com', '*.gstatic.com', '*.google.com', '*.googleapis.com'],
    'worker-src': ["'self'", 'blob:', '*.medplum.com', '*.gstatic.com', '*.google.com'],
  };
}

function getAttr(attrs, re) {
  const match = re.exec(attrs);
  if (!match) {
    return undefined;
  }
  return (match[2] ?? match[3] ?? match[4] ?? '').trim();
}

/**
 * Collects the sha256-base64 of every distinct executable inline script.
 * @param html - The contents of one built HTML page.
 * @param into - Map accumulating hash to script body, across all pages.
 */
function collectHashes(html, into) {
  INLINE_SCRIPT_RE.lastIndex = 0;
  let match;
  while ((match = INLINE_SCRIPT_RE.exec(html)) !== null) {
    const [, attrs, body] = match;
    if (SRC_ATTR_RE.test(attrs)) {
      continue; // external script, covered by the host allowlist
    }
    const type = (getAttr(attrs, TYPE_ATTR_RE) ?? '').toLowerCase();
    if (!EXECUTABLE_SCRIPT_TYPES.has(type)) {
      continue; // data block, not subject to script-src
    }
    // CSP hashes the exact bytes between the tags, with no normalisation.
    into.set(createHash('sha256').update(body, 'utf8').digest('base64'), body);
  }
}

async function* walkHtml(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkHtml(full);
    } else if (entry.name.endsWith('.html')) {
      yield full;
    }
  }
}

function formatCsp(directives) {
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .concat('upgrade-insecure-requests')
    .join('; ');
}

function buildPolicyConfig(csp) {
  return {
    Name: 'medplum-www-security-headers',
    Comment: 'www.medplum.com security headers. Script hashes generated by scripts/generate-csp.mjs. medplum-ee#1087.',
    SecurityHeadersConfig: {
      ContentSecurityPolicy: { ContentSecurityPolicy: csp, Override: true },
      StrictTransportSecurity: {
        AccessControlMaxAgeSec: 63072000,
        IncludeSubdomains: true,
        Preload: true,
        Override: true,
      },
      ContentTypeOptions: { Override: true },
      // SAMEORIGIN, not DENY: frame-ancestors above allows *.medplum.com.
      FrameOptions: { FrameOption: 'SAMEORIGIN', Override: true },
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const checkIndex = args.indexOf('--check');
  const buildDir = process.env.DOCS_BUILD_DIR || BUILD_DIR;

  const scripts = new Map();
  let pageCount = 0;
  for await (const file of walkHtml(buildDir)) {
    collectHashes(await readFile(file, 'utf8'), scripts);
    pageCount++;
  }

  if (pageCount === 0) {
    console.error(`No HTML found in ${buildDir}. Run "npm run build:docs" first.`);
    process.exit(1);
  }

  // Sort for a stable policy: an unsorted Map would reorder on unrelated edits
  // and make every diff look like a change.
  const hashes = [...scripts.keys()].sort();
  const csp = formatCsp(buildDirectives(hashes));

  console.error(`Scanned ${pageCount} pages, found ${hashes.length} distinct inline scripts.`);
  for (const hash of hashes) {
    const preview = scripts.get(hash).trim().replace(/\s+/g, ' ').slice(0, 68);
    console.error(`  sha256-${hash}  ${preview}`);
  }
  console.error(`CSP length: ${csp.length} (CloudFront limit ${CLOUDFRONT_CSP_LIMIT})`);
  if (csp.length > CLOUDFRONT_CSP_LIMIT) {
    console.error('CSP exceeds the CloudFront limit and will be rejected.');
    process.exit(1);
  }

  const policy = buildPolicyConfig(csp);

  if (checkIndex !== -1) {
    const path = args[checkIndex + 1];
    const existing = JSON.parse(await readFile(path, 'utf8'));
    const live = existing.SecurityHeadersConfig?.ContentSecurityPolicy?.ContentSecurityPolicy;
    if (live !== csp) {
      console.error(`\n${path} is stale. Regenerate it with:`);
      console.error(`  node scripts/generate-csp.mjs --out ${path}`);
      process.exit(1);
    }
    console.error(`\n${path} is up to date.`);
    return;
  }

  if (outIndex !== -1) {
    const path = args[outIndex + 1];
    await writeFile(path, `${JSON.stringify(policy, undefined, 2)}\n`);
    console.error(`\nWrote ${path}`);
    return;
  }

  console.log(csp);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
