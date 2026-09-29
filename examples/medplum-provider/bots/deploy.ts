// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Deploy this app's bots to Medplum.
 *
 * For each bot in the manifest: ensure a Bot resource exists (keyed by its
 * identifier so re-runs update rather than duplicate), bundle the TypeScript to
 * a single CommonJS file, upload it, then call $deploy.
 *
 * The CommonJS output is not incidental. VM-context bots are evaluated with
 * `new vm.Script(...)`, which has no module loader, so ESM output fails at
 * runtime with "Unexpected token 'export'".
 *
 * Usage, with credentials from examples/medplum-provider/.env:
 *   npm run deploy:bots
 */
import { MedplumClient } from '@medplum/core';
import type { Bot, ProjectMembership } from '@medplum/fhirtypes';
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Identifier system used to find a bot again on re-deploy. */
const BOT_IDENTIFIER_SYSTEM = 'https://lyfe.health/bots';

interface BotDefinition {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  /** Seconds. The 10s default is too tight for a bulk preview. */
  readonly timeout: number;
}

const BOTS: BotDefinition[] = [
  {
    name: 'lyfe-drchrono-search',
    description: 'Read-only DrChrono patient search and bulk-import preview for the onboarding flow.',
    source: 'drchrono-search.ts',
    timeout: 120,
  },
  {
    name: 'lyfe-integrations',
    description: 'Per-tenant DrChrono/ZUS credential storage: save, status and test.',
    source: 'lyfe-integrations.ts',
    timeout: 60,
  },
];

/**
 * Give a bot its own ProjectMembership.
 *
 * Creating a Bot with `createResource` — which is what this script does, rather
 * than `Bot/$init` — does NOT create a membership for it. Without one,
 * `getBotProjectMembership` falls back to `ctx.membership`, so the bot silently
 * runs as **the caller**, under the caller's access policy. Verified against the
 * live server: with no membership, `lyfe-integrations` answered `Forbidden` for
 * every action, because a clinic user's policy is an allow-list that does not
 * include `Basic`.
 *
 * The membership is a project administrator for two concrete reasons, both
 * observed rather than assumed:
 *
 *  1. `ProjectMembership` is a project-admin resource type, and the bot has to
 *     search it to work out which clinic the caller belongs to. A non-admin bot
 *     gets `Forbidden` on that search.
 *  2. Medplum only honours a caller-supplied `meta.account` when the writer is a
 *     project admin (`Repository.canWriteAccount`). A non-admin bot's write is
 *     accepted and then lands with no compartment at all.
 *
 * This is the trade the design already makes: the credential records are
 * deliberately outside every clinic access policy, so exactly one identity — the
 * bot — is privileged enough to read them, and that identity runs only code from
 * this repository.
 * @param medplum - Authenticated, project-admin client.
 * @param bot - The bot that was just deployed.
 */
async function ensureBotMembership(medplum: MedplumClient, bot: Bot & { id: string }): Promise<void> {
  const projectId = medplum.getProject()?.id;
  if (!projectId) {
    throw new Error('Client login returned no project');
  }

  const profile = { reference: `Bot/${bot.id}`, display: bot.name };
  const existing = await medplum.searchOne('ProjectMembership', `profile=${encodeURIComponent(profile.reference)}`);

  if (!existing) {
    const created = await medplum.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: `Project/${projectId}` },
      user: profile,
      profile,
      admin: true,
    });
    console.log(`  membership created for ${bot.name ?? bot.id} (${created.id})`);
    return;
  }

  if (!existing.admin) {
    await medplum.updateResource<ProjectMembership>({ ...existing, admin: true });
    console.log(`  membership promoted to admin for ${bot.name ?? bot.id} (${existing.id})`);
  }
}

/**
 * Bundle one bot to a single CommonJS string.
 * @param source - File name within the bots directory.
 * @returns The bundled code.
 */
async function bundle(source: string): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [path.join(dirname, source)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    write: false,
    external: ['@medplum/core', '@medplum/fhirtypes'],
    // Required for VM-context bots. Medplum's wrapper declares `const exports = {}`
    // and then calls `exports.handler(...)`, but esbuild's CJS output reassigns
    // `module.exports` to a fresh object, leaving that `exports` empty. Copying the
    // bundle's exports back across is what medplum-demo-bots does for the same reason.
    footer: { js: 'Object.assign(exports, module.exports);' },
    logLevel: 'silent',
  });
  const out = result.outputFiles?.[0]?.text;
  if (!out) {
    throw new Error(`esbuild produced no output for ${source}`);
  }
  return out;
}

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error('MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET are required');
  }

  const medplum = new MedplumClient({ baseUrl, fetch });
  await medplum.startClientLogin(clientId, clientSecret);
  console.log(`Deploying to ${baseUrl} (project ${medplum.getProject()?.name})`);

  for (const def of BOTS) {
    const code = await bundle(def.source);
    const identifier = [{ system: BOT_IDENTIFIER_SYSTEM, value: def.name }];

    let bot = await medplum.searchOne('Bot', `identifier=${BOT_IDENTIFIER_SYSTEM}|${def.name}`);
    if (bot) {
      bot = await medplum.updateResource<Bot>({ ...bot, description: def.description, timeout: def.timeout, code });
      console.log(`  updated ${def.name} (${bot.id})`);
    } else {
      bot = await medplum.createResource<Bot>({
        resourceType: 'Bot',
        identifier,
        name: def.name,
        description: def.description,
        runtimeVersion: 'vmcontext',
        timeout: def.timeout,
        code,
      });
      console.log(`  created ${def.name} (${bot.id})`);
    }

    await medplum.post(`fhir/R4/Bot/${bot.id}/$deploy`, { code });
    console.log(`  deployed ${def.name}`);

    await ensureBotMembership(medplum, bot);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Deploy failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
