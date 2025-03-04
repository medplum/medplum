/*
 * This is a generated file
 * Do not edit manually.
 */

import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  await client.query(`CREATE FUNCTION medplum_hello(text)
      RETURNS text LANGUAGE sql IMMUTABLE
    AS $function$SELECT 'Hello from Medplum, '||$1||'!'$function$`);

}
