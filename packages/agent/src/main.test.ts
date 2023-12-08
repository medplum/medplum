import { App } from './app';
import { main } from './main';
import fs from 'fs';

describe('Main', () => {
  beforeEach(() => {
    console.log = jest.fn();
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    jest.spyOn(App.prototype, 'start').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Missing arguments', () => {
    main(['node', 'index.js']).catch(console.log);
    expect(console.log).toHaveBeenCalledWith('Missing arguments');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Command line arguments success', () => {
    main(['node', 'index.js', 'http://example.com', 'clientId', 'clientSecret', 'agentId']).catch(console.log);
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });

  test('Empty properties file', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');
    main([]).catch(console.log);
    expect(console.log).toHaveBeenCalledWith('Missing arguments');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  test('Properties file success', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(
        ['baseUrl=http://example.com', 'clientId=clientId', 'clientSecret=clientSecret', 'agentId=agentId'].join('\n')
      );
    main(['node', 'index.js']).catch(console.log);
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
