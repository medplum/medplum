import { randomUUID } from 'crypto';
import { heartbeat } from './heartbeat';
import { getRedis } from './redis';
import * as serverRegistry from './server-registry';
import {
  cleanupServerRegistryHeartbeatListener,
  getClusterStatus,
  initServerRegistryHeartbeatListener,
} from './server-registry';

jest.mock('./redis');
jest.mock('crypto');

const UUID = '00000000-0000-0000-0000-0000deadbeef';

describe('server-registry', () => {
  const mockRedis = {
    setex: jest.fn(),
    keys: jest.fn(),
    mget: jest.fn(),
  };

  const now = new Date('2023-01-15T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);

    (getRedis as jest.Mock).mockReturnValue(mockRedis);
    (randomUUID as jest.Mock).mockReturnValue(UUID);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  test('setServerRegistryPayload', async () => {
    await serverRegistry.setServerRegistryPayload({
      id: 'test-id',
      firstSeen: '2021-01-01T00:00:00.000Z',
      lastSeen: '2021-01-01T00:00:00.000Z',
      version: '1.0.0',
      fullVersion: '1.0.0-test',
    });

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'medplum:server-registry:test-id',
      60,
      JSON.stringify({
        id: 'test-id',
        firstSeen: '2021-01-01T00:00:00.000Z',
        lastSeen: '2021-01-01T00:00:00.000Z',
        version: '1.0.0',
        fullVersion: '1.0.0-test',
      })
    );
  });

  test('init and cleanup ServerRegistryHeartbeatListener', async () => {
    const heartbeatAddListenerSpy = jest.spyOn(heartbeat, 'addEventListener');
    const heartbeatRemoveListenerSpy = jest.spyOn(heartbeat, 'removeEventListener');

    await initServerRegistryHeartbeatListener();
    expect(heartbeatAddListenerSpy).toHaveBeenCalledWith('heartbeat', expect.any(Function));

    heartbeatAddListenerSpy.mockClear();

    // Idempotent
    await initServerRegistryHeartbeatListener();
    expect(heartbeatAddListenerSpy).not.toHaveBeenCalled();

    // Heartbeat listener is called
    heartbeat.dispatchEvent({ type: 'heartbeat' });
    expect(mockRedis.setex).toHaveBeenCalledTimes(1);

    // Cleanup heartbeat
    cleanupServerRegistryHeartbeatListener();
    expect(heartbeatRemoveListenerSpy).toHaveBeenCalledWith('heartbeat', expect.any(Function));

    heartbeatRemoveListenerSpy.mockClear();

    // Idempotent
    cleanupServerRegistryHeartbeatListener();
    expect(heartbeatRemoveListenerSpy).not.toHaveBeenCalled();
  });

  test('getClusterStatus - heterogeneous', async () => {
    const server1 = {
      id: 'server1',
      firstSeen: new Date(now.getTime() - 20000).toISOString(),
      lastSeen: new Date(now.getTime() - 10000).toISOString(),
      version: '1.0.0',
      fullVersion: '1.0.0-a',
    };
    const server2 = {
      id: 'server2',
      firstSeen: new Date(now.getTime() - 40000).toISOString(),
      lastSeen: new Date(now.getTime() - 5000).toISOString(),
      version: '1.0.0',
      fullVersion: '1.0.0-a',
    };
    const server3 = {
      id: 'server3',
      firstSeen: new Date(now.getTime() - 60000).toISOString(),
      lastSeen: new Date(now.getTime() - 15000).toISOString(),
      version: '1.1.0',
      fullVersion: '1.1.0-b',
    };

    mockRedis.keys.mockResolvedValue([
      'medplum:server-registry:server1',
      'medplum:server-registry:server2',
      'medplum:server-registry:server3',
    ]);
    mockRedis.mget.mockResolvedValue([JSON.stringify(server1), JSON.stringify(server2), JSON.stringify(server3)]);

    const status = await getClusterStatus();

    expect(mockRedis.keys).toHaveBeenCalledWith('medplum:server-registry:*');
    expect(mockRedis.mget).toHaveBeenCalledWith([
      'medplum:server-registry:server1',
      'medplum:server-registry:server2',
      'medplum:server-registry:server3',
    ]);

    expect(status.totalServers).toBe(3);
    expect(status.isHomogeneous).toBe(false);
    expect(status.oldestVersion).toBe('1.0.0-a');
    expect(status.newestVersion).toBe('1.1.0-b');
    expect(status.versions).toEqual({
      '1.0.0-a': 2,
      '1.1.0-b': 1,
    });
    expect(status.servers).toHaveLength(3);
    // Note: servers are sorted by fullVersion
    expect(status.servers[0].id).toBe('server1');
    expect(status.servers[0].firstSeenAgeMs).toBe(20000);
    expect(status.servers[0].lastSeenAgeMs).toBe(10000);
    expect(status.servers[1].id).toBe('server2');
    expect(status.servers[1].firstSeenAgeMs).toBe(40000);
    expect(status.servers[1].lastSeenAgeMs).toBe(5000);
    expect(status.servers[2].id).toBe('server3');
    expect(status.servers[2].firstSeenAgeMs).toBe(60000);
    expect(status.servers[2].lastSeenAgeMs).toBe(15000);
  });

  test('getClusterStatus - homogeneous', async () => {
    const server1 = {
      id: 'server1',
      firstSeen: new Date(now.getTime() - 20000).toISOString(),
      lastSeen: new Date(now.getTime() - 10000).toISOString(),
      version: '1.0.0',
      fullVersion: '1.0.0-a',
    };
    const server2 = {
      id: 'server2',
      firstSeen: new Date(now.getTime() - 40000).toISOString(),
      lastSeen: new Date(now.getTime() - 5000).toISOString(),
      version: '1.0.0',
      fullVersion: '1.0.0-a',
    };

    mockRedis.keys.mockResolvedValue(['medplum:server-registry:server1', 'medplum:server-registry:server2']);
    mockRedis.mget.mockResolvedValue([JSON.stringify(server1), JSON.stringify(server2)]);

    const status = await getClusterStatus();

    expect(status.totalServers).toBe(2);
    expect(status.isHomogeneous).toBe(true);
    expect(status.oldestVersion).toBe('1.0.0-a');
    expect(status.newestVersion).toBe('1.0.0-a');
    expect(status.versions).toEqual({
      '1.0.0-a': 2,
    });
    expect(status.servers).toHaveLength(2);
    expect(status.servers[0].firstSeenAgeMs).toBe(20000);
    expect(status.servers[0].lastSeenAgeMs).toBe(10000);
    expect(status.servers[1].firstSeenAgeMs).toBe(40000);
    expect(status.servers[1].lastSeenAgeMs).toBe(5000);
  });

  test('getClusterStatus - empty mget', async () => {
    mockRedis.keys.mockResolvedValue(['medplum:server-registry:server1']);
    mockRedis.mget.mockResolvedValue([null]);

    const status = await getClusterStatus();
    expect(status.totalServers).toBe(0);
    expect(status.servers).toHaveLength(0);
    expect(status.isHomogeneous).toBe(false);
  });
});
