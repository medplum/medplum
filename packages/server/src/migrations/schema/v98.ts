// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { PoolClient } from 'pg';
import * as fns from '../migrate-functions';

// prettier-ignore
export async function run(client: PoolClient): Promise<void> {
  const results: { name: string; durationMs: number }[] = []
  await fns.query(client, results, `
    DO $$
    DECLARE
        r RECORD;
    BEGIN
        FOR r IN
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename <> lower(tablename)
        LOOP
            EXECUTE format('ALTER TABLE public.%I RENAME TO public.%I;', r.tablename, lower(r.tablename));
        END LOOP;
    END $$;
    `);
}
