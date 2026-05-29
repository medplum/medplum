// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { main, run } from '.';

vi.mock('node:fs', () => {
  const mock = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: vi.fn(async () => '{}'),
  },
};
  return { default: mock, ...mock };
});
const processError = vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());

describe('CLI', () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...env };
    process.exit = vi.fn<(exitCode?: number) => never>();
  });

  afterEach(() => {
    process.env = env;
  });

  test('run', async () => {
    await run();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('run with optional env set', async () => {
    process.env.MEDPLUM_BASE_URL = 'http://example.com';
    process.env.MEDPLUM_FHIR_URL_PATH = '/fhir/test/path/';
    process.env.MEDPLUM_CLIENT_ACCESS_TOKEN = 'test_token';
    process.env.MEDPLUM_TOKEN_URL = 'http://example.com/oauth/token';
    await run();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Missing command', async () => {
    await main(['node', 'index.js']);
    expect(process.exit).toHaveBeenCalledWith(1);
    // default command help displays
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Usage: medplum [options] [command]'));
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Command to access Medplum CLI'));
  });

  test('Unknown command', async () => {
    await main(['node', 'index.js', 'xyz']);
    expect(processError).toHaveBeenCalledWith(expect.stringContaining(`error: unknown command 'xyz'`));
  });
});
