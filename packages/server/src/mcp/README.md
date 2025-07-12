# Medplum MCP

What is [Model Context Protocol (MCP)](https://modelcontextprotocol.org/)?

> MCP is an open protocol that standardizes how applications provide context to LLMs. Think of MCP like a USB-C port for AI applications. Just as USB-C provides a standardized way to connect your devices to various peripherals and accessories, MCP provides a standardized way to connect AI models to different data sources and tools.

## Testing with MCP Inspector

Start the inspector:

```bash
npx @modelcontextprotocol/inspector
```

### Testing Streamable HTTP

Set "Transport Type" to "Streamable HTTP" (recommended transport).

Set "URL" to the `/mcp/stream` path on your server, e.g. `http://localhost:8103/mcp/stream`.

### Testing SSE

Set "Transport Type" to "SSE" (required by Claude and ChatGPT).

Set "URL" to the `/mcp/sse` path on your server, e.g. `http://localhost:8103/mcp/sse`.
