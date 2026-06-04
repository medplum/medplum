// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type * as MockSocketModule from 'mock-socket';
import type * as NodeChildProcess from 'node:child_process';
import type * as NodeFs from 'node:fs';
import type * as NodeOs from 'node:os';
import type * as NodeProcess from 'node:process';
import type * as WsModule from 'ws';

const mockSocketServers: { stop: (cb?: () => void) => void }[] = [];
let mockSocketServersAtTestStart = 0;

beforeEach(() => {
  mockSocketServersAtTestStart = mockSocketServers.length;
});

const processMockState = vi.hoisted(() => ({
  emitChildSend: (emitter: { emit: (event: string, msg: unknown) => void }, msg: unknown): void => {
    emitter.emit('childSend', msg);
  },
}));

const childProcessMock = vi.hoisted(() => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  exec: vi.fn(),
}));

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  openSync: vi.fn(),
  closeSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('node:process', async (importOriginal) => {
  const { default: EventEmitter } = await import('node:events');
  const actual = await importOriginal<typeof NodeProcess>();

  class MockProcess extends EventEmitter {
    send(msg: unknown): boolean {
      processMockState.emitChildSend(this, msg);
      return true;
    }
    exit = vi.fn(() => {
      throw new Error('process.exit');
    });
  }

  const mockProcess = new MockProcess();
  const processMock = Object.assign(mockProcess, actual);
  processMock.send = function (this: InstanceType<typeof MockProcess>, msg: unknown): boolean {
    processMockState.emitChildSend(this, msg);
    return true;
  };

  return {
    ...actual,
    default: processMock,
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOs>();
  const platform = vi.fn(actual.platform);
  const tmpdir = vi.fn(actual.tmpdir);
  return {
    ...actual,
    platform,
    tmpdir,
    default: {
      ...actual,
      platform,
      tmpdir,
    },
  };
});

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeChildProcess>();
  childProcessMock.execSync.mockImplementation(actual.execSync);
  childProcessMock.spawn.mockImplementation(actual.spawn);
  childProcessMock.spawnSync.mockImplementation(actual.spawnSync);
  childProcessMock.exec.mockImplementation(actual.exec);

  const childProcessExports = {
    ...actual,
    execSync: childProcessMock.execSync,
    spawn: childProcessMock.spawn,
    spawnSync: childProcessMock.spawnSync,
    exec: childProcessMock.exec,
    default: {
      ...actual,
      execSync: childProcessMock.execSync,
      spawn: childProcessMock.spawn,
      spawnSync: childProcessMock.spawnSync,
      exec: childProcessMock.exec,
    },
  };
  return childProcessExports;
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  fsMock.existsSync.mockImplementation(actual.existsSync);
  fsMock.readFileSync.mockImplementation(actual.readFileSync);
  fsMock.writeFileSync.mockImplementation(actual.writeFileSync);
  fsMock.appendFileSync.mockImplementation(actual.appendFileSync);
  fsMock.openSync.mockImplementation(actual.openSync);
  fsMock.closeSync.mockImplementation(actual.closeSync);
  fsMock.mkdirSync.mockImplementation(actual.mkdirSync);
  fsMock.unlinkSync.mockImplementation(actual.unlinkSync);
  fsMock.rmSync.mockImplementation(actual.rmSync);

  const fsDefault = {
    ...actual,
    existsSync: fsMock.existsSync,
    readFileSync: fsMock.readFileSync,
    writeFileSync: fsMock.writeFileSync,
    appendFileSync: fsMock.appendFileSync,
    openSync: fsMock.openSync,
    closeSync: fsMock.closeSync,
    mkdirSync: fsMock.mkdirSync,
    unlinkSync: fsMock.unlinkSync,
    rmSync: fsMock.rmSync,
  };

  return {
    ...actual,
    existsSync: fsMock.existsSync,
    readFileSync: fsMock.readFileSync,
    writeFileSync: fsMock.writeFileSync,
    appendFileSync: fsMock.appendFileSync,
    openSync: fsMock.openSync,
    closeSync: fsMock.closeSync,
    mkdirSync: fsMock.mkdirSync,
    unlinkSync: fsMock.unlinkSync,
    rmSync: fsMock.rmSync,
    default: fsDefault,
  };
});

vi.mock('ws', async (importOriginal) => {
  const actual = await importOriginal<typeof WsModule>();
  const { WebSocket: MockWebSocket } = await import('mock-socket');

  class WebSocket extends MockWebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      const url = typeof address === 'string' ? address : address.toString();
      super(url, protocols);
    }
  }

  Object.assign(WebSocket, actual.WebSocket);

  return {
    ...actual,
    default: WebSocket,
    WebSocket,
  };
});

vi.mock('mock-socket', async (importOriginal) => {
  const actual = await importOriginal<typeof MockSocketModule>();
  const OriginalServer = actual.Server;

  class Server extends OriginalServer {
    constructor(...args: ConstructorParameters<typeof OriginalServer>) {
      super(...args);
      mockSocketServers.push(this);
    }
  }

  return {
    ...actual,
    Server,
  };
});

async function resetNodeModuleMocks(): Promise<void> {
  const actualFs = await vi.importActual<typeof NodeFs>('node:fs');
  fsMock.existsSync.mockImplementation(actualFs.existsSync);
  fsMock.readFileSync.mockImplementation(actualFs.readFileSync);
  fsMock.writeFileSync.mockImplementation(actualFs.writeFileSync);
  fsMock.appendFileSync.mockImplementation(actualFs.appendFileSync);
  fsMock.openSync.mockImplementation(actualFs.openSync);
  fsMock.closeSync.mockImplementation(actualFs.closeSync);
  fsMock.mkdirSync.mockImplementation(actualFs.mkdirSync);
  fsMock.unlinkSync.mockImplementation(actualFs.unlinkSync);
  fsMock.rmSync.mockImplementation(actualFs.rmSync);

  const actualChildProcess = await vi.importActual<typeof NodeChildProcess>('node:child_process');
  childProcessMock.execSync.mockImplementation(actualChildProcess.execSync);
  childProcessMock.spawn.mockImplementation(actualChildProcess.spawn);
  childProcessMock.spawnSync.mockImplementation(actualChildProcess.spawnSync);
  childProcessMock.exec.mockImplementation(actualChildProcess.exec);
}

afterEach(async () => {
  vi.clearAllMocks();
  await resetNodeModuleMocks();
  const serversToStop = mockSocketServers.splice(mockSocketServersAtTestStart);
  await Promise.all(
    serversToStop.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.stop(() => resolve());
        })
    )
  );
});
