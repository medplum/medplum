import fs from 'node:fs';
import net from 'node:net';
import { generateSampleHl7Message } from './hl7';
import { main } from './index';

describe('HL7 commands', () => {
  test('Client and server', async () => {
    console.error = jest.fn();
    console.log = jest.fn();
    process.exit = jest.fn<never, any>().mockImplementation(function exit(exitCode: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    }) as unknown as typeof process.exit;
    const processError = jest.spyOn(process.stderr, 'write').mockImplementation(jest.fn());

    const originalCreateServer = net.createServer;
    let capturedReturnValue: net.Server | undefined = undefined;

    const createServerSpy = jest.spyOn(net, 'createServer').mockImplementation((...args) => {
      capturedReturnValue = originalCreateServer(...args);
      return capturedReturnValue;
    });

    // Start a server
    await main(['node', 'index.js', 'hl7', 'listen', '56999']);
    expect(console.log).toHaveBeenCalledWith('Listening on port 56999');
    (console.log as unknown as jest.Mock).mockClear();

    // Send a message with missing body
    await expect(main(['node', 'index.js', 'hl7', 'send', 'localhost', '56999', ''])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(processError).toHaveBeenCalledWith(expect.stringContaining('Missing HL7 message body'));

    // Send a message from file
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => generateSampleHl7Message());
    await main(['node', 'index.js', 'hl7', 'send', 'localhost', '56999', '--file', 'sample.hl7']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('MSH|^~\\&|ADTSYS|HOSPITAL|RECEIVER|DEST|'));
    (console.log as unknown as jest.Mock).mockClear();

    // Send a generated message
    await main(['node', 'index.js', 'hl7', 'send', 'localhost', '56999', '--generate-example']);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('MSH|^~\\&|ADTSYS|HOSPITAL|RECEIVER|DEST|'));
    (console.log as unknown as jest.Mock).mockClear();

    expect(createServerSpy).toHaveBeenCalled();
    (capturedReturnValue as unknown as net.Server).close();
    createServerSpy.mockRestore();
  });
});
