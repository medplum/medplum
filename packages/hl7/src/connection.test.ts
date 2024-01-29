import { Hl7Connection } from './connection';
import { CR, FS, VT } from './constants';

describe('HL7 Connection', () => {
  test('Error', async () => {
    const handlers: Record<string, (event: any) => void> = {};

    // Create a mock net.Socket
    const mockSocket: any = {
      on: jest.fn((event: string, handler: (event: any) => void) => {
        handlers[event] = handler;
        return mockSocket;
      }),
      setEncoding: jest.fn(() => mockSocket),
      end: jest.fn(),
      destroy: jest.fn(),
    };

    const listener = jest.fn();

    const connection = new Hl7Connection(mockSocket as any);
    expect(handlers.data).toBeDefined();
    expect(handlers.error).toBeDefined();

    // Listen for errors
    connection.addEventListener('error', listener);

    // Simulate an error
    handlers.error(new Error('test'));
    expect(listener).toHaveBeenCalledTimes(1);

    // Reset the listener
    listener.mockReset();

    // Simulate an invalid data event
    // this.socket.write(VT + reply.toString() + FS + CR);
    handlers.data(VT + FS + CR);
    expect(listener).toHaveBeenCalledTimes(1);

    // Close multiple times to test idempotency
    connection.close();
    connection.close();
  });
});
