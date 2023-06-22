import express from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import { Duplex, Readable } from 'stream';
import request from 'supertest';
import zlib from 'zlib';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { initTestAuth } from '../test.setup';

const app = express();
const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
let accessToken: string;

describe('Binary', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
    rmSync(binaryDir, { recursive: true, force: true });
  });

  test('Create and read binary', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world');
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.text).toEqual('Hello world');
  });

  test('Read binary not found', async () => {
    const res = await request(app)
      .get('/fhir/R4/Binary/2e9dfab6-a3af-4e5b-9324-483b4c333737')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Update and read binary', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world');
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world 2');
    expect(res2.status).toBe(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toEqual('Hello world 2');
  });

  test('Binary CORS', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .set('Origin', 'http://localhost:3000')
      .send('Hello world');
    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('Unsupported content encoding', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .set('Content-Encoding', 'fake')
      .send('Hello world');
    expect(res.status).toBe(400);
  });

  test('Deflate', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .set('Content-Encoding', 'deflate')
      .send(await createBufferForStream('Hello world', zlib.createDeflate()));
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.text).toEqual('Hello world');
  });

  test('GZIP', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .set('Content-Encoding', 'gzip')
      .send(await createBufferForStream('Hello world', zlib.createGzip()));
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.text).toEqual('Hello world');
  });

  test('Update with GZIP', async () => {
    const res = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send('Hello world');
    expect(res.status).toBe(201);

    const binary = res.body;
    const res2 = await request(app)
      .put('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .set('Content-Encoding', 'gzip')
      .send(await createBufferForStream('Hello world 2', zlib.createGzip()));
    expect(res2.status).toBe(200);

    const res3 = await request(app)
      .get('/fhir/R4/Binary/' + binary.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toEqual('Hello world 2');
  });
});

async function createBufferForStream(message: string, stream: Duplex): Promise<Buffer> {
  const input = new Readable();
  input.push(message);
  input.push(null);

  input.pipe(stream);

  return new Promise<Buffer>((resolve, reject) => {
    const _buf: any[] = [];
    stream.on('data', (chunk) => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err) => reject(new Error(`error converting stream - ${err}`)));
  });
}
