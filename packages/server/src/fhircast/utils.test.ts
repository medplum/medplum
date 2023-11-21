import { generateId } from '@medplum/core';
import { Redis } from 'ioredis';
import { loadTestConfig } from '../config';
import { closeRedis, getRedis, initRedis } from '../redis';
import { getTopicForUser, setupHeartbeatTimer } from './utils';

jest.mock('ioredis');
jest.useFakeTimers();
jest.spyOn(global, 'setTimeout');

describe('FHIRcast Utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    expect(getRedis()).toBeDefined();
  });

  afterAll(() => {
    closeRedis();
  });

  describe('getTopicForUser', () => {
    test("User doesn't have an existing topic", async () => {
      const userId = generateId();
      await expect(getTopicForUser(userId)).resolves.toBeDefined();
    });

    test('User has existing topic', async () => {
      const userId = generateId();
      const topic = generateId();
      await getRedis().set(`::fhircast::topic:${userId}`, topic);

      await expect(getTopicForUser(userId)).resolves.toBe(topic);
    });
  });

  describe('setupHeartbeatTimer', () => {
    let topic: string;
    let subClient: Redis;
    let timerTeardownCb: () => void;

    beforeAll(async () => {
      const config = await loadTestConfig();
      initRedis(config.redis);
      expect(getRedis()).toBeDefined();

      topic = 'abc123';
      subClient = getRedis().duplicate();
      await subClient.subscribe(topic);
    });

    test('Should publish a heartbeat message on the interval', (done) => {
      timerTeardownCb = setupHeartbeatTimer(topic, 10000);
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 10000);
      subClient.on('message', (channel, msg) => {
        expect(channel).toEqual(topic);
        expect(JSON.parse(msg)).toMatchObject({
          timestamp: expect.any(String),
          id: expect.any(String),
          event: { 'hub.topic': topic, 'hub.event': 'heartbeat', context: [{ key: 'period', decimal: '10' }] },
        });
        done();
      });
      jest.advanceTimersByTime(10001);
      expect(setTimeout).toHaveBeenCalledTimes(2);
    });

    test('Should stop timer when returned callback called', () => {
      expect(setTimeout).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(10001);
      expect(setTimeout).toHaveBeenCalledTimes(3);
      timerTeardownCb();
      subClient.on('message', () => {
        // We should never get here since we stopped the timer
        expect(false).toBe(true);
      });
      jest.advanceTimersByTime(10001);
      expect(setTimeout).toHaveBeenCalledTimes(3);
    });
  });
});
