// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, isObject, isString, normalizeErrorString } from '@medplum/core';
import type { Request, Response } from 'express';
import { getLogger } from '../logger';

/**
 * Minimal native implementation of the Model Context Protocol (MCP).
 *
 * Covers only the surface Medplum exposes: JSON-RPC 2.0 over Streamable HTTP, with tool
 * registration, discovery, and invocation. See ./README.md for the supported subset and non-goals.
 */

const JSON_RPC_VERSION = '2.0';

/** Protocol version offered when the client requests one we do not support. */
export const LATEST_PROTOCOL_VERSION = '2025-11-25';

/** Assumed when the client omits `protocolVersion`, matching the reference SDK's fallback. */
export const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

/**
 * Protocol versions accepted during initialization.
 *
 * Medplum's surface is wire-compatible across all of these revisions, so accepting the full set
 * costs nothing and keeps clients that pin an older version working.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  '2025-06-18',
  DEFAULT_PROTOCOL_VERSION,
  '2024-11-05',
  '2024-10-07',
];

/** Standard JSON-RPC error codes. See: https://www.jsonrpc.org/specification#error_object */
export const JsonRpcErrorCode = {
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export type JsonRpcId = string | number;

export type JsonRpcResponse =
  | { jsonrpc: typeof JSON_RPC_VERSION; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: typeof JSON_RPC_VERSION; id: JsonRpcId | null; error: { code: number; message: string } };

/** A JSON Schema for a tool's arguments, emitted verbatim by `tools/list`. */
export interface McpToolInputSchema {
  readonly type: 'object';
  /** A property with no `type` accepts any value, such as an arbitrary FHIR request body. */
  readonly properties?: Readonly<Record<string, { type?: string; description?: string }>>;
  readonly required?: readonly string[];
}

export interface McpToolConfig {
  readonly description?: string;
  readonly inputSchema: McpToolInputSchema;
  /**
   * Optional authorization hook. When it returns false the tool is hidden from `tools/list` and
   * rejected by `tools/call`. Implementations should use the existing Medplum authorization checks.
   */
  readonly isEnabled?: () => boolean;
}

export interface McpContent {
  readonly type: 'text';
  readonly text: string;
  readonly id?: string;
  readonly uri?: string;
}

export interface McpToolResult {
  readonly content: readonly McpContent[];
  /** True when the tool failed. A tool failure is not a protocol failure. */
  readonly isError?: boolean;
}

export type McpToolHandler = (args: Record<string, any>) => Promise<McpToolResult>;

/** An error that is reported to the client as a JSON-RPC error response. */
class McpError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'McpError';
    this.code = code;
  }
}

/**
 * A stateless MCP server.
 *
 * Each HTTP request is independently authenticated, dispatched, and completed. There is no session
 * id and no server-side session state, so nothing needs to be resumed and no transport object
 * outlives a request.
 */
export class McpServer {
  private readonly tools = new Map<string, { config: McpToolConfig; handler: McpToolHandler }>();
  private readonly serverInfo: { name: string; version: string };

  constructor(serverInfo: { name: string; version: string }) {
    this.serverInfo = serverInfo;
  }

  /**
   * Registers a tool.
   * @param name - The tool name.
   * @param config - The tool description and input schema.
   * @param handler - The tool implementation.
   */
  registerTool(name: string, config: McpToolConfig, handler: McpToolHandler): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, { config, handler });
  }

  /**
   * Handles a Streamable HTTP request.
   *
   * The specification permits answering a POST with either JSON or an SSE stream; Medplum always
   * chooses JSON. GET (server-initiated stream) and DELETE (session teardown) are not implemented.
   * @param req - The authenticated Express request.
   * @param res - The Express response.
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      this.send(res, 405, errorResponse(null, JsonRpcErrorCode.InvalidRequest, 'Method not allowed'));
      return;
    }

    if (!req.is(ContentType.JSON)) {
      this.send(res, 415, errorResponse(null, JsonRpcErrorCode.InvalidRequest, 'Unsupported media type'));
      return;
    }

    // JSON-RPC batching was removed from MCP in revision 2025-06-18, but is still accepted so that
    // clients pinned to an earlier revision keep working.
    if (Array.isArray(req.body)) {
      if (req.body.length === 0) {
        this.send(res, 400, errorResponse(null, JsonRpcErrorCode.InvalidRequest, 'Batch must not be empty'));
        return;
      }
      const responses = (await Promise.all(req.body.map((message) => this.dispatch(message)))).filter(Boolean);
      if (responses.length === 0) {
        res.status(202).end();
        return;
      }
      this.send(res, 200, responses as JsonRpcResponse[]);
      return;
    }

    const response = await this.dispatch(req.body);
    if (!response) {
      // A notification, such as `notifications/initialized`, is acknowledged with no body.
      res.status(202).end();
      return;
    }
    this.send(res, 200, response);
  }

  /**
   * Dispatches a single JSON-RPC message.
   * @param payload - One parsed JSON payload, not yet validated as JSON-RPC.
   * @returns The response, or undefined for a notification.
   */
  async dispatch(payload: unknown): Promise<JsonRpcResponse | undefined> {
    const id = isObject(payload) && isValidId(payload.id) ? payload.id : null;

    const invalid = validateMessage(payload);
    if (invalid) {
      // The message did not parse as JSON-RPC, so it is impossible to know whether the sender
      // wanted a response. Answer anyway, correlating with the id if one can be recovered.
      return errorResponse(id, JsonRpcErrorCode.InvalidRequest, invalid);
    }

    const { method, params } = payload as { method: string; params?: Record<string, unknown> };
    if (id === null) {
      // Notifications are never answered. Unknown ones are ignored rather than rejected, as the
      // specification requires receivers to tolerate notifications they do not understand.
      return undefined;
    }

    try {
      return { jsonrpc: JSON_RPC_VERSION, id, result: await this.invoke(method, params) };
    } catch (err: any) {
      if (err instanceof McpError) {
        return errorResponse(id, err.code, err.message);
      }
      getLogger().error('Unhandled MCP error', { method, error: normalizeErrorString(err) });
      return errorResponse(id, JsonRpcErrorCode.InternalError, 'Internal error');
    }
  }

  private async invoke(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
          // Tools only. Resources, prompts, sampling, and logging are intentionally absent, so
          // conformant clients will not attempt to use them.
          capabilities: { tools: {} },
          serverInfo: this.serverInfo,
        };

      case 'ping':
        return {};

      case 'tools/list':
        return { tools: this.listTools() };

      case 'tools/call':
        return this.callTool(params);

      default:
        throw new McpError(JsonRpcErrorCode.MethodNotFound, `Method not found: ${method}`);
    }
  }

  private listTools(): unknown[] {
    const result = [];
    for (const [name, { config }] of this.tools) {
      if (!config.isEnabled || config.isEnabled()) {
        result.push({ name, description: config.description, inputSchema: config.inputSchema });
      }
    }
    return result;
  }

  private async callTool(params: Record<string, unknown> | undefined): Promise<McpToolResult> {
    const name = params?.name;
    if (!isString(name)) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, 'Invalid or missing "name" parameter');
    }

    const args = params?.arguments ?? {};
    if (!isObject(args) || Array.isArray(args)) {
      throw new McpError(JsonRpcErrorCode.InvalidParams, 'Invalid "arguments" parameter, expected an object');
    }

    const tool = this.tools.get(name);
    if (!tool || (tool.config.isEnabled && !tool.config.isEnabled())) {
      // Deliberately identical for "unknown" and "not authorized" so that the server does not
      // disclose the existence of tools the caller cannot see.
      throw new McpError(JsonRpcErrorCode.InvalidParams, `Tool not found: ${name}`);
    }

    validateArgs(name, tool.config.inputSchema, args);

    try {
      return await tool.handler(args);
    } catch (err: any) {
      // A tool failure is not a protocol failure, so it is reported inside a successful response.
      getLogger().warn('MCP tool error', { tool: name, error: normalizeErrorString(err) });
      return { content: [{ type: 'text', text: normalizeErrorString(err) }], isError: true };
    }
  }

  private send(res: Response, status: number, body: JsonRpcResponse | JsonRpcResponse[]): void {
    res.status(status).type(ContentType.JSON).send(JSON.stringify(body));
  }
}

function isValidId(value: unknown): value is JsonRpcId {
  // JSON-RPC also permits a null id, but reserves it for responses to unidentifiable requests, so
  // a null id on an incoming message is treated as a notification.
  return isString(value) || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Validates that a payload is a well-formed JSON-RPC 2.0 request or notification.
 * @param value - The unvalidated payload.
 * @returns An error message, or undefined if the payload is valid.
 */
function validateMessage(value: unknown): string | undefined {
  if (!isObject(value) || Array.isArray(value)) {
    return 'Request must be a JSON object';
  }
  if (value.jsonrpc !== JSON_RPC_VERSION) {
    return `Invalid or missing "jsonrpc" member, expected "${JSON_RPC_VERSION}"`;
  }
  if (!isString(value.method)) {
    return 'Invalid or missing "method" member';
  }
  if (value.params !== undefined && (!isObject(value.params) || Array.isArray(value.params))) {
    // MCP always uses by-name parameters, so positional (array) params are rejected.
    return 'Invalid "params" member, expected an object';
  }
  if (value.id !== undefined && value.id !== null && !isValidId(value.id)) {
    return 'Invalid "id" member, expected a string or number';
  }
  return undefined;
}

/**
 * Negotiates the protocol version.
 *
 * Per the specification, when the client requests a version the server does not support, the server
 * responds with one it does support and lets the client decide whether to continue.
 * @param requested - The `protocolVersion` from the initialize params.
 * @returns The negotiated protocol version.
 */
function negotiateProtocolVersion(requested: unknown): string {
  if (requested === undefined || requested === null) {
    return DEFAULT_PROTOCOL_VERSION;
  }
  if (!isString(requested)) {
    throw new McpError(JsonRpcErrorCode.InvalidParams, 'Invalid "protocolVersion" parameter, expected a string');
  }
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION;
}

/**
 * Validates tool arguments against the tool's input schema.
 *
 * Supports only the slice of JSON Schema that Medplum's tools declare: an object with typed
 * properties and a required list. Anything richer belongs in the tool handler, which has the FHIR
 * validation infrastructure available to it.
 * @param toolName - The tool name, used in error messages.
 * @param schema - The tool's input schema.
 * @param args - The arguments supplied by the client.
 */
function validateArgs(toolName: string, schema: McpToolInputSchema, args: Record<string, unknown>): void {
  const fail = (message: string): never => {
    throw new McpError(JsonRpcErrorCode.InvalidParams, `Invalid arguments for tool ${toolName}: ${message}`);
  };

  for (const name of schema.required ?? []) {
    if (args[name] === undefined || args[name] === null) {
      fail(`missing required property "${name}"`);
    }
  }

  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const value = args[name];
    if (value === undefined || value === null || !property.type) {
      continue; // Absent optional values and untyped properties pass.
    }
    if (!matchesType(value, property.type)) {
      fail(`property "${name}" must be of type ${property.type}`);
    }
  }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return isString(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isObject(value) && !Array.isArray(value);
    default:
      return true;
  }
}

function errorResponse(id: JsonRpcId | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code, message } };
}
