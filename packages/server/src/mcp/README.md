# Medplum MCP

What is [Model Context Protocol (MCP)](https://modelcontextprotocol.org/)?

> MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

## Implementation

MCP is implemented natively in `protocol.ts` rather than via `@modelcontextprotocol/sdk`.
`server.ts` registers the Medplum tools and `routes.ts` is the Express wiring.

Supported methods are `initialize`, `notifications/initialized`, `ping`, `tools/list`, and
`tools/call`; anything else returns JSON-RPC `Method not found`. Only the Streamable HTTP transport
is supported, at `/mcp/stream`, and the deprecated SSE transport returns `410 Gone`.

The server is stateless — each request is independently authenticated and dispatched, with no
session id — so it cannot enforce that `initialize` precedes `tools/list` or `tools/call`. That check
would require sticky routing or shared storage for no security benefit, since authentication and
authorization run on every request regardless.

See the comments in `protocol.ts` for protocol version negotiation and error handling.

## Testing with MCP Inspector

Start the inspector:

```bash
npx @modelcontextprotocol/inspector
```

Set "Transport Type" to "Streamable HTTP", and set "URL" to the `/mcp/stream` path on your server,
e.g. `http://localhost:8103/mcp/stream`.
