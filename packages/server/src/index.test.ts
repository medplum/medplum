import express from 'express';
import { main } from '.';
import { closeDatabase } from './database';
import { closeRedis } from './redis';

jest.mock('bullmq');
jest.mock('ioredis');

jest.mock('express', () => {
  const original = jest.requireActual('express');
  const listen = jest.fn();
  const fn = (): any => {
    const app = original();
    app.listen = listen;
    return app;
  };
  fn.Router = original.Router;
  fn.json = original.json;
  fn.text = original.text;
  fn.urlencoded = original.urlencoded;
  fn.listen = listen;
  return fn;
});

describe('Server', () => {
  test('Main', async () => {
    await main();
    expect((express as any).listen).toHaveBeenCalledWith(8103);
    await closeDatabase();
    closeRedis();
  });
});
