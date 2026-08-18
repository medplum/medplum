// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = []
  // Hand-added: medplum_unaccent() below depends on this extension. Mirrors the btree_gist line in v111.ts
  await fns.query(client, results, `CREATE EXTENSION IF NOT EXISTS unaccent`);
  await fns.query(client, results, `CREATE FUNCTION medplum_unaccent(text)
    RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $function$SELECT public.unaccent('public.unaccent', normalize($1, NFC))$function$`);
}
