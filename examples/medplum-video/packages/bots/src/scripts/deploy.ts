/**
 * Deployment script for medplum-video bots.
 *
 * Creates or updates every bot in Medplum, uploads compiled code, and writes
 * LiveKit credentials into Project.secret so bots can read them via
 * `event.secrets`.  Also keeps medplum.config.json in sync with real bot IDs.
 *
 * Usage (from packages/bots):
 *   npm run deploy          # local Medplum at http://localhost:8103/
 *   npm run deploy staging  # staging server
 *
 * Prerequisites:
 *   - .env.local (or .env.staging.local) at the repo root or packages/bots root
 *   - npm run build  (creates dist/<bot>.js files)
 */

import type { PatchOperation } from '@medplum/core';
import { MedplumClient } from '@medplum/core';
import type { Bot, Subscription } from '@medplum/fhirtypes';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Environments ────────────────────────────────────────────────────────────

interface DeploymentConfig {
  environment: 'local' | 'staging';
  defaultBaseUrl: string;
  // First match wins.  Earlier names override later ones.
  envFileNames: string[];
}

const DEPLOYMENT_CONFIGS: Record<string, DeploymentConfig> = {
  local: {
    environment: 'local',
    defaultBaseUrl: 'http://localhost:8103/',
    envFileNames: ['.env.local', '.env'],
  },
  staging: {
    environment: 'staging',
    defaultBaseUrl: 'https://api.staging.medplum.dev/',
    envFileNames: ['.env.staging.local', '.env.staging'],
  },
};

// ── Project-level secrets written to Project.secret ─────────────────────────

const PROJECT_SECRET_NAMES = [
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'LIVEKIT_HOST',
  'LIVEKIT_WS_URL',
] as const;

// ── Bot definitions ──────────────────────────────────────────────────────────

interface BotDefinition {
  /** Used as the FHIR Bot.identifier value and as the dist filename stem. */
  identifier: string;
  name: string;
  description: string;
  /** Bots that need ProjectMembership write access. */
  admin?: boolean;
}

const BOT_DEFINITIONS: BotDefinition[] = [
  {
    identifier: 'create-video-room',
    name: 'create-video-room',
    description: 'Create a LiveKit room for a new Encounter',
  },
  {
    identifier: 'start-adhoc-visit',
    name: 'start-adhoc-visit',
    description: 'Start an ad-hoc (unscheduled) video visit',
  },
  {
    identifier: 'generate-token',
    name: 'generate-token',
    description: 'Issue a LiveKit access token for a participant',
  },
  {
    identifier: 'admit-patient',
    name: 'admit-patient',
    description: 'Admit a waiting patient into the video room',
  },
  {
    identifier: 'on-encounter-status-change',
    name: 'on-encounter-status-change',
    description: 'Subscription bot – react to Encounter status transitions',
    admin: true,
  },
  {
    identifier: 'on-video-room-ended',
    name: 'on-video-room-ended',
    description: 'LiveKit webhook – room ended lifecycle handler',
    admin: true,
  },
  {
    identifier: 'post-visit-summarize',
    name: 'post-visit-summarize',
    description: 'Post-visit AI summarisation and coding',
    admin: true,
  },
];

// ── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(): { environment: string; only: string[] } {
  const only: string[] = [];
  let environment: string | undefined;

  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--only' || a === '-o') {
      const next = process.argv[++i];
      if (!next || next.startsWith('-')) throw new Error(`Expected bot identifier(s) after ${a}`);
      only.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a in DEPLOYMENT_CONFIGS) {
      if (environment) throw new Error(`Multiple environments specified`);
      environment = a;
    } else {
      throw new Error(`Unknown argument: "${a}". Use "local" or "staging", optionally --only <id>`);
    }
  }
  return {
    environment: environment ?? (process.env['DEPLOY_ENV'] ?? 'local'),
    only,
  };
}

// ── Env file loader ──────────────────────────────────────────────────────────

function loadEnv(config: DeploymentConfig): void {
  const candidates: string[] = [];
  for (const name of config.envFileNames) {
    candidates.push(
      resolve(__dirname, `../../${name}`),       // packages/bots/<file>
      resolve(__dirname, `../../../../${name}`), // examples/medplum-video/<file>
      resolve(process.cwd(), name),
    );
  }

  for (const p of candidates) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key && !(key in process.env)) process.env[key] = value;
    }
    console.log(`   Loaded env: ${p}`);
    return;
  }
  console.log(`   No env file found (tried ${config.envFileNames.join(', ')}), using existing environment`);
}

// ── Medplum client init ──────────────────────────────────────────────────────

async function initMedplum(config: DeploymentConfig): Promise<{ medplum: MedplumClient; projectId: string }> {
  const baseUrl = process.env['MEDPLUM_BASE_URL'] ?? config.defaultBaseUrl;
  const clientId = process.env['MEDPLUM_CLIENT_ID'];
  const clientSecret = process.env['MEDPLUM_CLIENT_SECRET'];

  if (!clientId || !clientSecret) {
    throw new Error(
      `MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET must be set (looked in ${config.envFileNames.join(', ')})\n` +
      'Create an API client at Project Settings > API Clients.'
    );
  }

  const medplum = new MedplumClient({ baseUrl });
  await medplum.startClientLogin(clientId, clientSecret);
  console.log(`   Auth: client credentials (${clientId})`);

  const projectId =
    process.env['PROJECT_ID'] ??
    process.env['MEDPLUM_PROJECT_ID'] ??
    medplum.getProfile()?.meta?.project;

  if (!projectId) {
    throw new Error('No PROJECT_ID in env and could not determine from profile');
  }
  console.log(`   Project: ${projectId}`);
  return { medplum, projectId };
}

// ── Project secrets ───────────────────────────────────────────────────────────

async function upsertProjectSecrets(medplum: MedplumClient, projectId: string): Promise<void> {
  console.log('Upserting project secrets...');
  const project = await medplum.readResource('Project', projectId);
  const ops: PatchOperation[] = [];

  if (!project.secret) {
    ops.push({ op: 'add', path: '/secret', value: [] });
  }

  let count = 0;
  for (const name of PROJECT_SECRET_NAMES) {
    const value = process.env[name];
    if (!value) {
      console.warn(`   Warning: ${name} not set – skipping`);
      continue;
    }
    const idx = project.secret?.findIndex((s) => s.name === name) ?? -1;
    if (idx < 0) {
      ops.push({ op: 'add', path: '/secret/-', value: { name, valueString: value } });
    } else {
      ops.push({ op: 'replace', path: `/secret/${idx}`, value: { name, valueString: value } });
    }
    console.log(`   ${name} = ${value.slice(0, 8)}…`);
    count++;
  }

  if (count > 0) {
    await medplum.patchResource('Project', projectId, ops);
    console.log(`   Upserted ${count} secret(s)`);
  }
}

// ── Bot create / update ───────────────────────────────────────────────────────

async function createOrUpdateBot(
  medplum: MedplumClient,
  projectId: string,
  def: BotDefinition,
  isLocal: boolean,
): Promise<Bot> {
  const runtimeVersion = isLocal ? 'vmcontext' : 'awslambda';

  const existing = await medplum.searchOne('Bot', { identifier: def.identifier });
  if (existing) {
    if (existing.runtimeVersion === runtimeVersion) return existing;
    return (await medplum.updateResource({ ...existing, runtimeVersion })) as Bot;
  }

  const created = await medplum.post(`admin/projects/${projectId}/bot`, {
    name: def.name,
    description: def.description,
  });

  return (await medplum.updateResource({
    ...created,
    identifier: [{ system: 'https://medplum.com/bots', value: def.identifier }],
    runtimeVersion,
    system: true,
  })) as Bot;
}

// ── Bot code deploy ───────────────────────────────────────────────────────────

async function deployBot(medplum: MedplumClient, bot: Bot, identifier: string): Promise<void> {
  const id = bot.id as string;
  const distDir = resolve(__dirname, '../../dist');
  const jsPath = resolve(distDir, `${identifier}.js`);

  if (!existsSync(jsPath)) {
    throw new Error(`Build output not found: ${jsPath}  (run npm run build first)`);
  }

  // Upload TypeScript source for in-app viewing
  const tsPath = resolve(__dirname, `../${identifier}.ts`);
  if (existsSync(tsPath)) {
    const sourceCode = await medplum.createAttachment({
      data: readFileSync(tsPath, 'utf8'),
      filename: `${identifier}.ts`,
      contentType: 'text/typescript',
    });
    await medplum.updateResource({ ...bot, sourceCode });
  }

  const code = readFileSync(jsPath, 'utf8');
  await medplum.post(medplum.fhirUrl('Bot', id, '$deploy'), { code, filename: `${identifier}.js` });
}

// ── Subscription upsert ──────────────────────────────────────────────────────
//
// fhir/sample-data/subscriptions.json contains one Subscription per
// bot-triggered hook with `Bot/<bot-identifier-bot-id>` placeholder
// references.  We substitute real bot IDs and upsert (match by criteria).
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /<([a-z0-9-]+)-bot-id>/g;

async function upsertSubscriptions(medplum: MedplumClient, botIds: Record<string, string>): Promise<void> {
  const subsPath = resolve(__dirname, '../../../../fhir/sample-data/subscriptions.json');
  if (!existsSync(subsPath)) {
    console.log(`   No subscriptions.json at ${subsPath} - skipping`);
    return;
  }

  const templates = JSON.parse(readFileSync(subsPath, 'utf8')) as Subscription[];

  // Fetch all existing subscriptions once and match by EXACT criteria string.
  // Medplum's `criteria` search parameter is a substring match, so using it
  // for upsert would incorrectly collide (e.g. "Encounter?class=VR" matches
  // the more specific "Encounter?class=VR&status=arrived").
  const existing = await medplum.searchResources('Subscription', '_count=100');
  const byCriteria = new Map<string, Subscription>();
  for (const s of existing) {
    if (s.criteria) byCriteria.set(s.criteria, s);
  }

  let upserted = 0;
  let skipped = 0;

  for (const template of templates) {
    const raw = JSON.stringify(template);

    const missing: string[] = [];
    const resolved = raw.replace(PLACEHOLDER_RE, (_match, identifier: string) => {
      const id = botIds[identifier];
      if (!id) {
        missing.push(identifier);
        return _match;
      }
      return id;
    });

    if (missing.length > 0) {
      console.warn(`   Skipping subscription (${template.criteria}): missing bot ids for ${missing.join(', ')}`);
      skipped++;
      continue;
    }

    const desired = JSON.parse(resolved) as Subscription;
    const match = desired.criteria ? byCriteria.get(desired.criteria) : undefined;

    if (match?.id) {
      const updated = await medplum.updateResource<Subscription>({ ...match, ...desired, id: match.id });
      console.log(`   ~ ${desired.criteria} -> ${desired.channel.endpoint}  (${updated.id})`);
    } else {
      const created = await medplum.createResource<Subscription>(desired);
      console.log(`   + ${desired.criteria} -> ${desired.channel.endpoint}  (${created.id})`);
    }
    upserted++;
  }

  console.log(`   Upserted ${upserted} subscription(s)${skipped ? `, skipped ${skipped}` : ''}`);
}

// ── medplum.config.json sync ─────────────────────────────────────────────────

function syncMedplumConfig(botIds: Record<string, string>): void {
  const configPath = resolve(__dirname, '../../medplum.config.json');
  if (!existsSync(configPath)) return;

  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  for (const bot of cfg.bots ?? []) {
    if (botIds[bot.name]) {
      bot.id = botIds[bot.name];
    }
  }
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');
  console.log('   Synced medplum.config.json');
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { environment, only } = parseArgs();
  const config = DEPLOYMENT_CONFIGS[environment];
  if (!config) {
    throw new Error(`Unknown environment "${environment}". Valid: ${Object.keys(DEPLOYMENT_CONFIGS).join(', ')}`);
  }

  const botsToDeploy = only.length === 0
    ? BOT_DEFINITIONS
    : BOT_DEFINITIONS.filter((b) => only.includes(b.identifier));

  if (botsToDeploy.length === 0) {
    throw new Error(`No bots matched: ${only.join(', ')}`);
  }

  console.log(`\nDeploying medplum-video bots → ${environment.toUpperCase()} (${config.defaultBaseUrl})`);
  if (only.length > 0) console.log(`   Only: ${only.join(', ')}`);

  loadEnv(config);
  const { medplum, projectId } = await initMedplum(config);

  console.log('');
  await upsertProjectSecrets(medplum, projectId);
  console.log('');

  const botIds: Record<string, string> = {};

  for (const def of botsToDeploy) {
    try {
      const bot = await createOrUpdateBot(medplum, projectId, def, config.environment === 'local');
      botIds[def.identifier] = bot.id as string;
      console.log(`+ ${def.name} (${bot.id})`);
      await deployBot(medplum, bot, def.identifier);
      console.log(`  -> deployed`);
    } catch (err) {
      console.error(`x ${def.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Only upsert subscriptions when deploying the full set (otherwise we'd
  // be pointing subs at placeholder or stale ids).
  if (only.length === 0) {
    console.log('\nUpserting subscriptions...');
    await upsertSubscriptions(medplum, botIds);
  } else {
    console.log(`\n   Skipping subscription upsert (partial deploy: ${only.join(', ')})`);
  }

  syncMedplumConfig(botIds);
  console.log('\nDone!\n');
  console.log(`  Bot IDs written to medplum.config.json`);
  console.log(`  LiveKit WS: ${process.env['LIVEKIT_WS_URL'] ?? '(not set)'}`);
}

main().catch((err) => {
  console.error('\nDeployment failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
