import express from 'express';
import request from 'supertest';
import { destroyApp, initApp } from './app';

const app = express();

beforeAll(async () => {
  await initApp(app);
});

afterAll(async () => {
  await destroyApp(app);
});

test('Get root', (done) => {
  request(app)
    .get('/')
    .expect(200, done);
});

test('Get healthcheck', (done) => {
  request(app)
    .get('/healthcheck')
    .expect(200, done);
});
