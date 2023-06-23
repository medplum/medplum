import { main, run } from '.';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  constants: {
    O_CREAT: 0,
  },
  promises: {
    readFile: jest.fn(async () => '{}'),
  },
}));
const processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());

describe('CLI', () => {
  const env = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...env };
    process.exit = jest.fn<never, any>();
  });

  afterEach(() => {
    process.env = env;
  });

  test('run', async () => {
    await run();
    expect(process.exit).toBeCalledWith(1);
  });

  test('run with optional env set', async () => {
    process.env.MEDPLUM_BASE_URL = 'http://example.com';
    process.env.MEDPLUM_FHIR_URL_PATH = '/fhir/test/path/';
    process.env.MEDPLUM_CLIENT_ACCESS_TOKEN = 'test_token';
    process.env.MEDPLUM_TOKEN_URL = 'http://example.com/oauth/token';
    await run();
    expect(process.exit).toBeCalledWith(1);
  });

  test('Missing command', async () => {
    await main(['node', 'index.js']);
    expect(process.exit).toHaveBeenCalledWith(1);
    // default command help displays
    expect(processError).toBeCalledWith(expect.stringContaining('Usage: medplum [options] [command]'));
    expect(processError).toBeCalledWith(expect.stringContaining('Command to access Medplum CLI'));
  });

  test('Unknown command', async () => {
    await main(['node', 'index.js', 'xyz']);
    expect(processError).toBeCalledWith(expect.stringContaining(`error: unknown command 'xyz'`));
  });
});
