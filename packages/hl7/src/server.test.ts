// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message } from '@medplum/core';
import { Hl7Client } from './client';
import { Hl7Server } from './server';

describe('HL7 Server', () => {
  test('Start and stop', async () => {
    const server = new Hl7Server(() => undefined);
    server.start(1234);
    await server.stop();
  });

  test('Send and receive', async () => {
    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    server.start(1234);

    const client = new Hl7Client({
      host: 'localhost',
      port: 1234,
    });

    await client.connect();

    const response = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-\r' +
          'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
          'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-'
      )
    );
    expect(response).toBeDefined();

    await client.close();
    await server.stop();
  });

  test('Send and receive windows-1252', async () => {
    // HL7 messages are typically encoded in ASCII or ISO-8859-1
    // See: https://www.redoxengine.com/blog/everything-you-wanted-to-know-about-character-encoding-in-hl7-and-redox/
    const encoding = 'windows-1252';

    // Create a sample HL7 message with some special characters
    // Windows-1252: https://en.wikipedia.org/wiki/Windows-1252
    const patientName = 'Çödÿ';

    const message = Hl7Message.parse(
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
        `PID|||PATID1234^5^M11||${patientName}||19610615|M-`
    );

    let receivedPatientName: string | undefined = undefined;

    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        receivedPatientName = message.getSegment('PID')?.getField(5)?.toString();
        connection.send(message.buildAck());
      });
    });

    server.start(1235, encoding);

    // First, connect with a client correctly configured for windows-1252
    // This should work correctly
    const client1 = new Hl7Client({
      host: 'localhost',
      port: 1235,
      encoding,
    });

    await client1.connect();

    const response1 = await client1.sendAndWait(message);
    expect(response1).toBeDefined();
    expect(receivedPatientName).toBe(patientName);
    await client1.close();

    // Next, connect with a client configured for utf-8
    // This should produce invalid results due to the encoding mismatch
    // The special characters will be garbled
    // We add this test to demonstrate the importance of matching encodings
    const client2 = new Hl7Client({
      host: 'localhost',
      port: 1235,
      encoding: 'utf-8',
    });

    await client2.connect();

    const response2 = await client2.sendAndWait(message);
    expect(response2).toBeDefined();
    expect(receivedPatientName).toBe('Ã‡Ã¶dÃ¿');
    await client2.close();

    // Shut down
    await server.stop();
  });

  test('Stop called when server not running', async () => {
    const hl7Server = new Hl7Server((_conn) => undefined);
    await expect(hl7Server.stop()).rejects.toThrow('Stop was called but there is no server running');
  });

  describe('Server configuration setters and getters', () => {
    test('setEncoding and getEncoding work correctly', () => {
      const server = new Hl7Server((_conn) => undefined);

      // Test initial state
      expect(server.getEncoding()).toBeUndefined();

      // Test setting encoding
      server.setEncoding('utf-8');
      expect(server.getEncoding()).toBe('utf-8');

      // Test setting different encoding
      server.setEncoding('windows-1252');
      expect(server.getEncoding()).toBe('windows-1252');

      // Test setting undefined
      server.setEncoding(undefined);
      expect(server.getEncoding()).toBeUndefined();
    });

    test('setEnhancedMode and getEnhancedMode work correctly', () => {
      const server = new Hl7Server((_conn) => undefined);

      // Test initial state
      expect(server.getEnhancedMode()).toBe(false);

      // Test setting enhanced mode to true
      server.setEnhancedMode(true);
      expect(server.getEnhancedMode()).toBe(true);

      // Test setting enhanced mode to false
      server.setEnhancedMode(false);
      expect(server.getEnhancedMode()).toBe(false);

      // Test setting enhanced mode to true again
      server.setEnhancedMode(true);
      expect(server.getEnhancedMode()).toBe(true);
    });

    test('setMessagesPerMin and getMessagesPerMin work correctly', () => {
      const server = new Hl7Server((_conn) => undefined);

      // Test initial state
      expect(server.getMessagesPerMin()).toBeUndefined();

      // Test setting messages per minute
      server.setMessagesPerMin(100);
      expect(server.getMessagesPerMin()).toBe(100);

      // Test setting different value
      server.setMessagesPerMin(200);
      expect(server.getMessagesPerMin()).toBe(200);

      // Test setting undefined
      server.setMessagesPerMin(undefined);
      expect(server.getMessagesPerMin()).toBeUndefined();

      // Test setting zero
      server.setMessagesPerMin(0);
      expect(server.getMessagesPerMin()).toBe(0);
    });
  });

  describe('Server start with different configurations', () => {
    test('Start server with no optional parameters', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      server.start(1236);

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that default values are used
      expect(server.getEncoding()).toBeUndefined();
      expect(server.getEnhancedMode()).toBe(false);
      expect(server.getMessagesPerMin()).toBeUndefined();

      await server.stop();
    });

    test('Start server with encoding parameter', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      server.start(1237, 'utf-8');

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that encoding was set
      expect(server.getEncoding()).toBe('utf-8');
      expect(server.getEnhancedMode()).toBe(false);
      expect(server.getMessagesPerMin()).toBeUndefined();

      await server.stop();
    });

    test('Start server with enhancedMode parameter', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      server.start(1238, undefined, true);

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that enhancedMode was set
      expect(server.getEncoding()).toBeUndefined();
      expect(server.getEnhancedMode()).toBe(true);
      expect(server.getMessagesPerMin()).toBeUndefined();

      await server.stop();
    });

    test('Start server with messagesPerMin option', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      server.start(1239, undefined, undefined, { messagesPerMin: 150 });

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that messagesPerMin was set
      expect(server.getEncoding()).toBeUndefined();
      expect(server.getEnhancedMode()).toBe(false);
      expect(server.getMessagesPerMin()).toBe(150);

      await server.stop();
    });

    test('Start server with all parameters set', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      server.start(1240, 'windows-1252', true, { messagesPerMin: 200 });

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that all parameters were set
      expect(server.getEncoding()).toBe('windows-1252');
      expect(server.getEnhancedMode()).toBe(true);
      expect(server.getMessagesPerMin()).toBe(200);

      await server.stop();
    });

    test('Start server with encoding set via setter before start', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Set encoding via setter before starting
      server.setEncoding('iso-8859-1');
      server.start(1241);

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that encoding was preserved
      expect(server.getEncoding()).toBe('iso-8859-1');
      expect(server.getEnhancedMode()).toBe(false);
      expect(server.getMessagesPerMin()).toBeUndefined();

      await server.stop();
    });

    test('Start server with enhancedMode set via setter before start', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Set enhancedMode via setter before starting
      server.setEnhancedMode(true);
      server.start(1242);

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that enhancedMode was preserved
      expect(server.getEncoding()).toBeUndefined();
      expect(server.getEnhancedMode()).toBe(true);
      expect(server.getMessagesPerMin()).toBeUndefined();

      await server.stop();
    });

    test('Start server with messagesPerMin set via setter before start', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Set messagesPerMin via setter before starting
      server.setMessagesPerMin(300);
      server.start(1243);

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that messagesPerMin was preserved
      expect(server.getEncoding()).toBeUndefined();
      expect(server.getEnhancedMode()).toBe(false);
      expect(server.getMessagesPerMin()).toBe(300);

      await server.stop();
    });

    test('Start server with all setters called before start', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Set all properties via setters before starting
      server.setEncoding('utf-8');
      server.setEnhancedMode(true);
      server.setMessagesPerMin(250);
      server.start(1244);

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that all properties were preserved
      expect(server.getEncoding()).toBe('utf-8');
      expect(server.getEnhancedMode()).toBe(true);
      expect(server.getMessagesPerMin()).toBe(250);

      await server.stop();
    });

    test('Start server with parameters overriding setters', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Set properties via setters
      server.setEncoding('utf-8');
      server.setEnhancedMode(false);
      server.setMessagesPerMin(100);

      // Start with different parameters that should override setters
      server.start(1245, 'windows-1252', true, { messagesPerMin: 500 });

      // Verify server is running
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);

      // Test that start parameters override setters
      expect(server.getEncoding()).toBe('windows-1252');
      expect(server.getEnhancedMode()).toBe(true);
      expect(server.getMessagesPerMin()).toBe(500);

      await server.stop();
    });

    test('Enhanced mode with messagesPerMin rate limiting works correctly', async () => {
      // Test with 60 messages per minute = 1 message per second
      const messagesPerMin = 60;
      const expectedMinIntervalMs = (60 * 1000) / messagesPerMin; // 1000ms = 1 second

      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Start server with enhanced mode and rate limiting
      server.start(1246, undefined, true, { messagesPerMin });

      // Verify server is running with correct settings
      expect(server.server).toBeDefined();
      expect(server.server?.listening).toBe(true);
      expect(server.getEnhancedMode()).toBe(true);
      expect(server.getMessagesPerMin()).toBe(messagesPerMin);

      const client = new Hl7Client({
        host: 'localhost',
        port: 1246,
      });

      await client.connect();

      // Send first message - should send instantly
      const firstMessageStart = Date.now();
      const response1 = await client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );
      const firstMessageEnd = Date.now();
      expect(response1).toBeDefined();

      // First message should complete quickly (no rate limiting)
      const firstMessageTime = firstMessageEnd - firstMessageStart;
      expect(firstMessageTime).toBeLessThan(100); // Should complete in less than 100ms

      // Send second message immediately - should be rate limited
      const response2 = await client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00002|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );
      const afterSecondSend = Date.now();
      expect(response2).toBeDefined();

      // Calculate the actual time between the start of first message and end of second message
      const totalTimeMs = afterSecondSend - firstMessageStart;

      // The total time should be at least the expected minimum interval
      // We allow a small tolerance (50ms) for timing variations
      const toleranceMs = 50;
      expect(totalTimeMs).toBeGreaterThanOrEqual(expectedMinIntervalMs - toleranceMs);

      await client.close();
      await server.stop();
    });

    test('Enhanced mode with different messagesPerMin rates', async () => {
      // Test with 120 messages per minute = 1 message per 0.5 seconds
      const messagesPerMin = 120;
      const expectedMinIntervalMs = (60 * 1000) / messagesPerMin; // 500ms = 0.5 seconds

      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Start server with enhanced mode and rate limiting
      server.start(1247, undefined, true, { messagesPerMin });

      const client = new Hl7Client({
        host: 'localhost',
        port: 1247,
      });

      await client.connect();

      // Send multiple messages in quick succession
      const startTime = Date.now();
      const responses = [];

      for (let i = 0; i < 3; i++) {
        const beforeSend = Date.now();
        const response = await client.sendAndWait(
          Hl7Message.parse(
            `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG0000${i + 1}|P|2.2\r` +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          )
        );
        const afterSend = Date.now();
        responses.push({ response, sendTime: afterSend - beforeSend });
      }

      const totalTimeMs = Date.now() - startTime;

      // Verify all responses were received
      responses.forEach(({ response }) => {
        expect(response).toBeDefined();
      });

      // First message should complete quickly (no rate limiting)
      const firstMessage = responses[0];
      expect(firstMessage.sendTime).toBeLessThan(100); // Should complete in less than 100ms

      // The total time should be at least 2 * expectedMinIntervalMs (for 3 messages)
      // First message is instant, then 2 delays between subsequent messages
      // We allow a small tolerance for timing variations
      const toleranceMs = 100;
      const expectedTotalTimeMs = 2 * expectedMinIntervalMs; // 2 intervals for 3 messages
      expect(totalTimeMs).toBeGreaterThanOrEqual(expectedTotalTimeMs - toleranceMs);

      // Subsequent messages (2nd and 3rd) should respect the rate limit
      const subsequentMessages = responses.slice(1);
      subsequentMessages.forEach(({ sendTime }) => {
        expect(sendTime).toBeGreaterThanOrEqual(expectedMinIntervalMs - toleranceMs);
      });

      await client.close();
      await server.stop();
    });

    test('Enhanced mode without rate limiting sends immediately', async () => {
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });

      // Start server with enhanced mode but no rate limiting
      server.start(1248, undefined, true);

      const client = new Hl7Client({
        host: 'localhost',
        port: 1248,
      });

      await client.connect();

      // Send two messages in quick succession
      const startTime = Date.now();

      const response1 = await client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );
      expect(response1).toBeDefined();

      const response2 = await client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00002|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );
      expect(response2).toBeDefined();

      const totalTimeMs = Date.now() - startTime;

      // Without rate limiting, both messages should be sent quickly
      // Should complete in less than 100ms (allowing for network overhead)
      expect(totalTimeMs).toBeLessThan(100);

      await client.close();
      await server.stop();
    });
  });
});
