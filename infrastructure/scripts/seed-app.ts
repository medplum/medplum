#!/usr/bin/env tsx
/**
 * One-time setup script — creates the first admin user.
 *
 * Interactive:
 *   npx tsx infrastructure/scripts/seed-app.ts
 *
 * Non-interactive (CI / first boot):
 *   npx tsx infrastructure/scripts/seed-app.ts "Nome" "email" "senha"
 *
 * Reads from apps/web/.env.local automatically.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import * as readline from 'node:readline/promises';

const scryptAsync = promisify(scrypt);

// ── Load .env.local ──────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), 'apps/web/.env.local');
if (!existsSync(envPath)) {
  console.error('❌  apps/web/.env.local not found. Copy .env.example and fill it in first.');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()) as [string, string])
);

const BASE = env.MEDPLUM_BASE_URL?.replace(/\/$/, '');
const CLIENT_ID = env.MEDPLUM_CLIENT_ID;
const CLIENT_SECRET = env.MEDPLUM_CLIENT_SECRET;
const PROJECT_ID = env.MEDPLUM_PROJECT_ID;

if (!BASE || !CLIENT_ID || !CLIENT_SECRET || !PROJECT_ID) {
  console.error('❌  Missing required env vars: MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET, MEDPLUM_PROJECT_ID');
  process.exit(1);
}

// ── Medplum service account ──────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token error ${res.status}: ${body}`);
  }
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function fhir(method: string, path: string, body?: unknown, token?: string): Promise<unknown> {
  const tok = token ?? await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'X-Medplum-Project': PROJECT_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`FHIR ${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ── Password hashing ─────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

// ── Extensions ───────────────────────────────────────────────────────────────

const EXT_PASSWORD = 'https://homehealth.com.br/fhir/StructureDefinition/password-hash';
const EXT_ROLE     = 'https://homehealth.com.br/fhir/StructureDefinition/role';

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🏥  Home Health — First User Setup\n');

  let name: string, email: string, password: string;

  const [,, argName, argEmail, argPassword] = process.argv;

  if (argName && argEmail && argPassword) {
    name = argName;
    email = argEmail;
    password = argPassword;
    console.log(`Criando usuário: ${name} <${email}>`);
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    name     = await rl.question('Nome completo: ');
    email    = await rl.question('E-mail: ');
    password = await rl.question('Senha (mín. 8 chars): ');
    rl.close();
  }

  if (!name || !email || password.length < 8) {
    console.error('\n❌  Preencha todos os campos. Senha deve ter no mínimo 8 caracteres.');
    process.exit(1);
  }

  console.log('\nConectando ao Medplum...');
  const token = await getToken();
  console.log('✓ Conectado');

  // Check if user already exists
  const existing = await fhir('GET',
    `/fhir/R4/Practitioner?telecom=email|${encodeURIComponent(email)}`,
    undefined, token
  ) as { entry?: unknown[] };

  if ((existing.entry?.length ?? 0) > 0) {
    console.error(`\n❌  Já existe um usuário com o e-mail ${email}.`);
    process.exit(1);
  }

  console.log('Criando usuário...');
  const passwordHash = await hashPassword(password);

  const practitioner = await fhir('POST', '/fhir/R4/Practitioner', {
    resourceType: 'Practitioner',
    name: [{ text: name }],
    telecom: [
      { system: 'email', value: email },
    ],
    extension: [
      { url: EXT_PASSWORD, valueString: passwordHash },
      { url: EXT_ROLE,     valueString: 'owner' },
    ],
  }, token) as { id: string };

  console.log(`\n✅  Usuário criado com sucesso!`);
  console.log(`    ID:    ${practitioner.id}`);
  console.log(`    Nome:  ${name}`);
  console.log(`    Email: ${email}`);
  console.log(`    Role:  owner`);
  console.log(`\nAgora rode o app e faça login em http://localhost:3000/login`);
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
