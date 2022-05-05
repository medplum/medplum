import { Request, Response } from 'express';
import { getClient } from './database';
import { getRedis } from './redis';

export async function healthcheckHandler(_req: Request, res: Response): Promise<void> {
  res.json({
    ok: true,
    postgres: await testPostgres(),
    redis: await testRedis(),
  });
}

async function testPostgres(): Promise<boolean> {
  return (await getClient().query(`SELECT 1 AS "status"`)).rows[0].status === 1;
}

async function testRedis(): Promise<boolean> {
  return (await getRedis().ping()) === 'PONG';
}
