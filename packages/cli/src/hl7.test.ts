import fs from 'fs';
import net from 'net';
import { generateSampleHl7Message } from './hl7';
import { main } from './index';

describe('HL7 commands', () => {
  test('Client and server', async () => {
    console.error = jest.fn();
    console.log = jest.fn();

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
    await main(['node', 'index.js', 'hl7', 'send', 'localhost', '56999', '']);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Missing HL7 message body'));

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
