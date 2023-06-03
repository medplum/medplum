import { MEDPLUM_VERSION } from '@medplum/core';
import { Request, Response } from 'express';
import { getClient } from './database';
import { getRedis } from './redis';

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  res.json({
    ok: true,
    version: MEDPLUM_VERSION,
    postgres: await testPostgres(),
    redis: await testRedis(),
  });
}

async function testPostgres(): Promise<boolean> {
  return (await getClient().query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(): Promise<boolean> {
  try {

    return (await getRedis().ping()) === 'PONG';
  } catch(err) {
    return false
  }
}
