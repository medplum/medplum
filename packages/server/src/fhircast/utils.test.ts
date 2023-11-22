import { generateId } from '@medplum/core';
import { Redis } from 'ioredis';
import { loadTestConfig } from '../config';
import { closeRedis, getRedis, initRedis } from '../redis';
import { HeartbeatStore, getTopicForUser } from './utils';

jest.mock('ioredis');
jest.useFakeTimers();
const timeoutSpy = jest.spyOn(global, 'setTimeout');

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

  describe('HeartbeatStore', () => {
    let topic: string;
    let subClient: Redis;
    let heartbeatStore: HeartbeatStore;

    beforeAll(async () => {
      const config = await loadTestConfig();
      initRedis(config.redis);
      expect(getRedis()).toBeDefined();

      topic = 'abc123';
      subClient = getRedis().duplicate();
      await subClient.subscribe(topic);
      heartbeatStore = new HeartbeatStore();
    });

    beforeEach(() => {
      timeoutSpy.mockClear();
    });

    afterAll(() => {
      heartbeatStore.stopAll();
    });

    test('Should publish a heartbeat message on the interval', (done) => {
      heartbeatStore.start(topic, 10000);
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

    test('Should stop when `.stop` called on topic', () => {
      expect(setTimeout).toHaveBeenCalledTimes(0);
      jest.advanceTimersByTime(10001);
      expect(setTimeout).toHaveBeenCalledTimes(1);
      const stopped = heartbeatStore.stop(topic);
      expect(stopped).toEqual(true);
      subClient.on('message', () => {
        // We should never get here since we stopped the timer
        expect(false).toBe(true);
      });
      jest.advanceTimersByTime(10001);
      expect(setTimeout).toHaveBeenCalledTimes(1);
    });

    test("Should return false when `.stop` is called on a topic that doesn't have a heartbeat", () => {
      const stopped = heartbeatStore.stop('xyz-789');
      expect(stopped).toEqual(false);
    });

    test('Should still work when `.start` called on a topic that already has a heartbeat', () => {
      const started = heartbeatStore.start(topic, 10000);
      expect(started).toEqual(true);
      const startedTwice = heartbeatStore.start(topic, 10000);
      expect(startedTwice).toEqual(false);
    });

    test('Should stop all heartbeats when `.stopAll` is called', () => {
      heartbeatStore.start(topic, 10000);
      heartbeatStore.start(topic + '-1', 10000);
      heartbeatStore.start(topic + '-2', 10000);
      expect(heartbeatStore.size).toEqual(3);
      heartbeatStore.stopAll();
      expect(heartbeatStore.size).toEqual(0);
      subClient.on('message', () => {
        // We should never get here since we stopped the timer
        expect(false).toBe(true);
      });
      jest.advanceTimersByTime(10001);
    });

    test('.has(topic)', () => {
      expect(heartbeatStore.has(topic)).toEqual(false);
      heartbeatStore.start(topic, 10000);
      expect(heartbeatStore.has(topic)).toEqual(true);
    });
  });
});
