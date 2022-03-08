import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../jest.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { Message } from './parser';
import { HL7_V2_ER7_CONTENT_TYPE } from './routes';

const app = express();
let accessToken: string;

describe('HL7 Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Send message', async () => {
    const msg =
      'MSH|^~\\&|device||host||20180222150842+0100||OUL^R22^OUL_R22|97|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-29^IHE\r\n' +
      'PID|||||^^^^^^U|||U\r\n' +
      'SPM|1|022&BARCODE||SERPLAS^^99ROC|||||||P^^HL70369|||~~~~||||||||||PSCO^^99ROC|||SC^^99ROC\r\n' +
      'SAC|||022^BARCODE|||||||50120|2||||||||||||||||||^1^:^1\r\n' +
      'OBR|1|""||20490^^99ROC|||||||\r\n' +
      'ORC|SC||||CM\r\n' +
      'TQ1|||||||||R^^HL70485\r\n' +
      'OBX|1|NM|20490^20490^99ROC^^^IHELAW|1|32.2|mg/L^^99ROC||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT\r\n';

    const res = await request(app)
      .post(`/hl7/v2`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'text/plain')
      .send(msg);
    expect(res.status).toBe(200);

    const ack = Message.parse(res.text);
    expect(ack.get('MSH')).toBeDefined();
    expect(ack.get('MSA')).toBeDefined();
  });

  test('Send message with content type', async () => {
    const msg =
      'MSH|^~\\&|device||host||20180222150842+0100||OUL^R22^OUL_R22|97|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-29^IHE\r\n' +
      'PID|||||^^^^^^U|||U\r\n' +
      'SPM|1|022&BARCODE||SERPLAS^^99ROC|||||||P^^HL70369|||~~~~||||||||||PSCO^^99ROC|||SC^^99ROC\r\n' +
      'SAC|||022^BARCODE|||||||50120|2||||||||||||||||||^1^:^1\r\n' +
      'OBR|1|""||20490^^99ROC|||||||\r\n' +
      'ORC|SC||||CM\r\n' +
      'TQ1|||||||||R^^HL70485\r\n' +
      'OBX|1|NM|20490^20490^99ROC^^^IHELAW|1|32.2|mg/L^^99ROC||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT\r\n';

    const res = await request(app)
      .post(`/hl7/v2`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', HL7_V2_ER7_CONTENT_TYPE)
      .send(msg);
    expect(res.status).toBe(200);

    const ack = Message.parse(res.text);
    expect(ack.get('MSH')).toBeDefined();
    expect(ack.get('MSA')).toBeDefined();
  });

  test('Send invalid message', async () => {
    const msg = '';

    const res = await request(app)
      .post(`/hl7/v2`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', HL7_V2_ER7_CONTENT_TYPE)
      .send(msg);
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/Content could not be parsed/);
  });
});
