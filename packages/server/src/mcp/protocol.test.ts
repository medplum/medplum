// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import express, { json } from 'express';
import request from 'supertest';
import {
  DEFAULT_PROTOCOL_VERSION,
  JsonRpcErrorCode,
  LATEST_PROTOCOL_VERSION,
  McpServer,
  SUPPORTED_PROTOCOL_VERSIONS,
} from './protocol';

// These tests exercise the protocol only, so they deliberately avoid initApp() and the database.
// The Medplum tools are covered end-to-end in routes.test.ts.
describe('MCP protocol', () => {
  const server = new McpServer({ name: 'medplum-test', version: '1.2.3' });
  const app = express();

  beforeAll(() => {
    server.registerTool(
      'echo',
      {
        description: 'Echoes the message back.',
        inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
      },
      async ({ message }) => ({ content: [{ type: 'text', text: message }] })
    );

    server.registerTool('explode', { inputSchema: { type: 'object' } }, async () => {
      throw new Error('boom');
    });

    app.use(json({ type: [ContentType.JSON] }));
    app.all('/mcp', (req, res) => {
      server.handleRequest(req, res).catch(() => res.status(500).end());
    });
  });

  /**
   * Dispatches a JSON-RPC request directly, bypassing HTTP.
   * @param method - The JSON-RPC method.
   * @param params - The method params.
   * @param id - The request id.
   * @returns The JSON-RPC response.
   */
  async function dispatch(method: string, params?: Record<string, unknown>, id: unknown = 1): Promise<any> {
    return server.dispatch({ jsonrpc: '2.0', id, method, params });
  }

  /**
   * Dispatches a `tools/call` request.
   * @param name - The tool name.
   * @param args - The tool arguments.
   * @returns The JSON-RPC response.
   */
  async function callTool(name: string, args?: Record<string, unknown>): Promise<any> {
    return dispatch('tools/call', { name, arguments: args });
  }

  /**
   * Posts a raw body to the test endpoint.
   * @param body - The raw request body.
   * @returns The supertest request.
   */
  function post(body: unknown): request.Test {
    return request(app)
      .post('/mcp')
      .set('Content-Type', ContentType.JSON)
      .send(body as object);
  }

  describe('Transport', () => {
    test.each(['get', 'delete'] as const)('%s is not allowed', async (method) => {
      const agent = request(app);
      const res = await agent[method]('/mcp');
      expect(res).toHaveStatus(405);
      expect(res.headers.allow).toBe('POST');
      expect(res.body.error.code).toBe(JsonRpcErrorCode.InvalidRequest);
    });

    test('Unsupported media type', async () => {
      const res = await request(app).post('/mcp').set('Content-Type', ContentType.TEXT).send('ping');
      expect(res).toHaveStatus(415);
      expect(res.body.error.code).toBe(JsonRpcErrorCode.InvalidRequest);
    });

    test('Responds with JSON', async () => {
      const res = await post({ jsonrpc: '2.0', id: 1, method: 'ping' });
      expect(res).toHaveStatus(200);
      expect(res.headers['content-type']).toContain(ContentType.JSON);
      expect(res.body).toStrictEqual({ jsonrpc: '2.0', id: 1, result: {} });
    });

    test('Notification is acknowledged with 202 and no body', async () => {
      const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(res).toHaveStatus(202);
      expect(res.text).toBe('');
    });

    test('Batch returns only the responses to requests', async () => {
      const res = await post([
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      ]);
      expect(res).toHaveStatus(200);
      expect(res.body.map((r: any) => r.id)).toStrictEqual([1, 2]);
    });

    test('Batch of notifications only', async () => {
      const res = await post([{ jsonrpc: '2.0', method: 'notifications/initialized' }]);
      expect(res).toHaveStatus(202);
    });

    test('Empty batch', async () => {
      const res = await post([]);
      expect(res).toHaveStatus(400);
      expect(res.body.error.code).toBe(JsonRpcErrorCode.InvalidRequest);
    });

    test('Batch element that is not an object', async () => {
      const res = await post([{ jsonrpc: '2.0', id: 1, method: 'ping' }, 'ping']);
      expect(res).toHaveStatus(200);
      expect(res.body[1]).toStrictEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: JsonRpcErrorCode.InvalidRequest, message: 'Request must be a JSON object' },
      });
    });
  });

  describe('Initialization', () => {
    test('Advertises tools capability and server info', async () => {
      const res = await dispatch('initialize', { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {} });
      expect(res.result).toStrictEqual({
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'medplum-test', version: '1.2.3' },
      });
    });

    test.each(SUPPORTED_PROTOCOL_VERSIONS)('Echoes supported version %s', async (protocolVersion) => {
      const res = await dispatch('initialize', { protocolVersion });
      expect(res.result.protocolVersion).toBe(protocolVersion);
    });

    test('Unsupported version is offered the latest instead of failing', async () => {
      const res = await dispatch('initialize', { protocolVersion: '1999-01-01' });
      expect(res.error).toBeUndefined();
      expect(res.result.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    });

    test('Missing version falls back to the default', async () => {
      const res = await dispatch('initialize', {});
      expect(res.result.protocolVersion).toBe(DEFAULT_PROTOCOL_VERSION);
    });

    test('Non-string version is invalid params', async () => {
      const res = await dispatch('initialize', { protocolVersion: 42 });
      expect(res.error.code).toBe(JsonRpcErrorCode.InvalidParams);
    });
  });

  describe('JSON-RPC', () => {
    test('Unknown method', async () => {
      const res = await dispatch('resources/list');
      expect(res.error.code).toBe(JsonRpcErrorCode.MethodNotFound);
      expect(res.error.message).toContain('resources/list');
    });

    test('Unknown notification is ignored', async () => {
      await expect(server.dispatch({ jsonrpc: '2.0', method: 'notifications/cancelled' })).resolves.toBeUndefined();
    });

    test('String ids are supported', async () => {
      const res = await dispatch('ping', undefined, 'abc');
      expect(res.id).toBe('abc');
    });

    test.each([
      ['missing jsonrpc member', { id: 1, method: 'ping' }],
      ['wrong jsonrpc version', { jsonrpc: '1.0', id: 1, method: 'ping' }],
      ['missing method', { jsonrpc: '2.0', id: 1 }],
      ['non-string method', { jsonrpc: '2.0', id: 1, method: 42 }],
      ['positional params', { jsonrpc: '2.0', id: 1, method: 'ping', params: [1, 2] }],
      ['object id', { jsonrpc: '2.0', id: { bad: true }, method: 'ping' }],
      ['not an object', 'ping'],
    ])('Invalid request: %s', async (_name, payload) => {
      const res: any = await server.dispatch(payload);
      expect(res.error.code).toBe(JsonRpcErrorCode.InvalidRequest);
    });

    test('Invalid request preserves a recoverable id, otherwise uses null', async () => {
      const withId: any = await server.dispatch({ jsonrpc: '1.0', id: 77, method: 'ping' });
      expect(withId.id).toBe(77);
      const withoutId: any = await server.dispatch({ jsonrpc: '1.0', method: 'ping' });
      expect(withoutId.id).toBeNull();
    });
  });

  describe('Tools', () => {
    test('Duplicate registration throws', () => {
      expect(() =>
        server.registerTool('echo', { inputSchema: { type: 'object' } }, async () => ({ content: [] }))
      ).toThrow('Tool already registered: echo');
    });

    test('List includes schema and description', async () => {
      const res = await dispatch('tools/list');
      expect(res.result.tools).toStrictEqual([
        {
          name: 'echo',
          description: 'Echoes the message back.',
          inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
        },
        { name: 'explode', description: undefined, inputSchema: { type: 'object' } },
      ]);
    });

    test('Call succeeds', async () => {
      const res = await callTool('echo', { message: 'hello' });
      expect(res.result).toStrictEqual({ content: [{ type: 'text', text: 'hello' }] });
    });

    test('Handler failure is a successful response with isError', async () => {
      const res = await callTool('explode', {});
      expect(res.error).toBeUndefined();
      expect(res.result.isError).toBe(true);
      expect(res.result.content[0].text).toContain('boom');
    });

    test('Unknown tool', async () => {
      const res = await callTool('nope', {});
      expect(res.error.code).toBe(JsonRpcErrorCode.InvalidParams);
      expect(res.error.message).toBe('Tool not found: nope');
    });

    test('Missing tool name', async () => {
      const res = await dispatch('tools/call', {});
      expect(res.error.code).toBe(JsonRpcErrorCode.InvalidParams);
    });

    test('Non-object arguments', async () => {
      const res = await dispatch('tools/call', { name: 'echo', arguments: 'hello' });
      expect(res.error.code).toBe(JsonRpcErrorCode.InvalidParams);
    });

    test('Omitted arguments default to an empty object', async () => {
      const res = await callTool('explode');
      expect(res.result.isError).toBe(true);
    });
  });

  describe('Authorization', () => {
    test('Disabled tool is hidden from tools/list and rejects calls', async () => {
      // The rejection is deliberately indistinguishable from an unknown tool.
      const restricted = new McpServer({ name: 'test', version: '1' });
      let allowed = false;
      restricted.registerTool('secret', { inputSchema: { type: 'object' }, isEnabled: () => allowed }, async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }));

      const denied: any = await restricted.dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(denied.result.tools).toStrictEqual([]);

      const rejected: any = await restricted.dispatch({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'secret' },
      });
      expect(rejected.error.message).toBe('Tool not found: secret');

      // Authorization is re-evaluated on every request, since it is request-scoped in production.
      allowed = true;
      const listed: any = await restricted.dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(listed.result.tools).toHaveLength(1);
    });
  });

  describe('Argument validation', () => {
    const kitchenSink = new McpServer({ name: 'test', version: '1' });
    kitchenSink.registerTool(
      'kitchen-sink',
      {
        inputSchema: {
          type: 'object',
          properties: {
            str: { type: 'string' },
            num: { type: 'number' },
            int: { type: 'integer' },
            bool: { type: 'boolean' },
            arr: { type: 'array' },
            obj: { type: 'object' },
            any: {},
          },
          required: ['str'],
        },
      },
      async () => ({ content: [] })
    );

    /**
     * Calls the kitchen-sink tool.
     * @param args - The tool arguments.
     * @returns The JSON-RPC response.
     */
    async function call(args: Record<string, unknown>): Promise<any> {
      return kitchenSink.dispatch({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'kitchen-sink', arguments: args },
      });
    }

    test.each([
      ['missing required property', {}, 'missing required property "str"'],
      ['null required property', { str: null }, 'missing required property "str"'],
      ['wrong string', { str: 42 }, 'property "str" must be of type string'],
      ['wrong number', { str: 'a', num: 'x' }, 'property "num" must be of type number'],
      ['NaN number', { str: 'a', num: Number.NaN }, 'property "num" must be of type number'],
      ['non-integer', { str: 'a', int: 1.5 }, 'property "int" must be of type integer'],
      ['wrong boolean', { str: 'a', bool: 'true' }, 'property "bool" must be of type boolean'],
      ['wrong array', { str: 'a', arr: {} }, 'property "arr" must be of type array'],
      ['object given an array', { str: 'a', obj: [] }, 'property "obj" must be of type object'],
    ])('Rejects %s', async (_name, args, message) => {
      const res = await call(args);
      expect(res.error.code).toBe(JsonRpcErrorCode.InvalidParams);
      expect(res.error.message).toContain(message);
    });

    test('Accepts valid values of every type', async () => {
      const res = await call({ str: 'a', num: 1.5, int: 2, bool: true, arr: [1], obj: { a: 1 }, any: 'anything' });
      expect(res.result).toStrictEqual({ content: [] });
    });

    test('Untyped property accepts any value, and unknown properties are ignored', async () => {
      const res = await call({ str: 'a', any: [{ deep: true }], extra: 'ignored' });
      expect(res.error).toBeUndefined();
    });
  });
});
