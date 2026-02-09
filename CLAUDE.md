# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Medplum is a FHIR-based healthcare developer platform consisting of:

- **Clinical Data Repository (CDR)** - PostgreSQL-backed FHIR server
- **API Server** - Express-based REST API with FHIR R4 compliance
- **Web App** - React-based admin/clinical interface
- **SDK** - TypeScript client libraries for FHIR operations
- **Bots** - Serverless functions for custom business logic
- **React Components** - UI library for building healthcare apps

## Monorepo Structure

This is a **Turborepo monorepo** with npm workspaces. Key packages:

**Core Foundation:**

- `@medplum/fhirtypes` - Generated TypeScript definitions for all FHIR R4 resources
- `@medplum/definitions` - FHIR schemas, search parameters, ValueSets (loaded from JSON)
- `@medplum/core` - Client library, validators, FHIRPath engine, utilities

**Client/Server:**

- `@medplum/fhir-router` - FHIR URL routing and abstract repository pattern
- `@medplum/server` - Express backend with PostgreSQL/Redis
- `@medplum/mock` - MockClient and MemoryRepository for testing

**Frontend:**

- `@medplum/react-hooks` - React hooks for FHIR operations
- `@medplum/react` - Mantine-based UI component library
- `@medplum/app` - Main web application (Vite + React)

**Deployment/Tools:**

- `@medplum/cdk` - AWS CDK infrastructure as code
- `@medplum/cli` - Command-line interface
- `@medplum/agent` - On-premise agent for HL7/DICOM
- `@medplum/bot-layer` - AWS Lambda layer for bots

**Integrations:**

- `@medplum/hl7` - HL7v2 message parsing
- `@medplum/ccda` - C-CDA document handling

## Build System

### Common Commands

```bash
# Install dependencies (use exact versions from package-lock.json)
npm ci

# Build all packages (except docs and examples)
npm run build

# Build only app + server (faster for local dev)
npm run build:fast

# Build docs site
npm run build:docs

# Clean all build artifacts
npm run clean

# Lint all packages
npm run lint
npm run lint:fix

# Run all tests
npm test

# Format code
npm run prettier
```

### Package-Level Commands

Most packages support these scripts:

```bash
# Build a specific package
cd packages/<name>
npm run build

# Run tests for a specific package
npm test

# Lint a specific package
npm run lint
npm run lint:fix

# Clean build artifacts
npm run clean
```

### Server Development

```bash
cd packages/server

# Start server with hot reload (tsx watch)
npm run dev

# Run database migrations
npm run migrate

# Run server tests
npm test

# Run seed test (creates demo data)
npm run test:seed
```

### App Development

```bash
cd packages/app

# Start Vite dev server with HMR
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Analyze bundle size
npm run source-map-explorer
```

### Build Process Details

Each package build typically runs:

1. **Clean**: `rimraf dist`
2. **TypeScript**: `tsc` - Generates type definitions
3. **ESBuild**: Bundles to both CJS (`dist/cjs/`) and ESM (`dist/esm/`)
4. **API Extractor**: Generates rolled-up `.d.ts` files and API docs

Turbo handles:

- Dependency-aware build ordering (`dependsOn: ["^build"]`)
- Incremental builds (caches in `.turbo/`)
- Parallel execution across packages

## Testing

### Test Framework

All packages use **Jest 30.x** with Babel for TypeScript transformation.

### Running Tests

```bash
# Run all tests (via Turbo)
npm test

# Run tests for specific package
cd packages/core
npm test

# Run specific test file
cd packages/server
npx jest src/fhir/routes.test.ts

# Run tests in watch mode
npx jest --watch

# Run with coverage
npx jest --coverage
```

### Server Testing Notes

- **Environment**: Node.js (not jsdom)
- **Requirements**: PostgreSQL and Redis must be running (use Docker)
- **Test Sequencer**: Custom `jest.sequencer.mjs` controls test order
- **Timeout**: 30 seconds (database operations can be slow)
- **Test Files**: `packages/server/src/**/*.test.ts`

Start PostgreSQL and Redis for server tests:

```bash
docker-compose -f docker-compose.full-stack.yml up -d postgres redis
```

### Core/React Testing Notes

- **Environment**: jsdom (browser simulation)
- **Mocking**: Uses `MockClient` and `MemoryRepository` from `@medplum/mock`
- **React Testing**: Uses `@testing-library/react`
- **Test Files**: `packages/core/src/**/*.test.ts`, `packages/react/src/**/*.test.ts`

## Architecture

### Repository Pattern

The codebase uses an abstract `FhirRepository<TClient>` interface (in `@medplum/fhir-router`) with multiple implementations:

1. **MemoryRepository** - In-memory FHIR store for testing
2. **Repository** (server) - PostgreSQL implementation with access policies

All FHIR CRUD operations go through this abstraction:

```typescript
interface FhirRepository<TClient> {
  createResource<T>(resource: T): Promise<WithId<T>>;
  readResource<T>(type: string, id: string): Promise<WithId<T>>;
  updateResource<T>(resource: T): Promise<WithId<T>>;
  deleteResource(type: string, id: string): Promise<void>;
  search<T>(searchRequest: SearchRequest<T>): Promise<Bundle<WithId<T>>>;
  withTransaction<TResult>(callback): Promise<TResult>;
}
```

### Client-Server Communication

**Client Side** (`MedplumClient` in `@medplum/core`):

- OAuth 2.0 + OpenID Connect authentication
- FHIR API methods (create, read, update, delete, search)
- Built-in LRU caching
- WebSocket subscriptions
- GraphQL support

**Server Side** (`@medplum/server`):

- Express middleware stack (CORS, auth, rate limiting)
- FHIR Router handles URL parsing and dispatches to handlers
- Request context tracking via async local storage
- PostgreSQL for data, Redis for jobs/caching
- WebSocket server for real-time subscriptions

### FHIR Data Model

**Type Generation Flow:**

1. FHIR StructureDefinitions (JSON) → `@medplum/generator`
2. Generator creates TypeScript types → `@medplum/fhirtypes`
3. Runtime validation uses schemas from `@medplum/definitions`
4. `@medplum/core` provides `validateResource()` using schemas

**Search Implementation:**

- Search requests parsed to `SearchRequest` objects
- Server: Converted to SQL queries with index tables
- Mock: In-memory filtering with `matchesSearchRequest()`

### Bot Execution

Bots are serverless functions stored as FHIR `Bot` resources:

**Execution Environments:**

1. **VM Context** (default) - In-process with `vm.createContext()`, 10s timeout
2. **AWS Lambda** - Production environment with `@medplum/bot-layer`

**Invocation:**

- POST `/fhir/R4/Bot/:id/$execute`
- Triggered by Subscriptions (via BullMQ worker)
- Scheduled execution via cron

### Background Jobs

Uses **BullMQ** with Redis for async processing:

**Workers** (in `packages/server/src/workers/`):

- Subscription delivery (REST hooks, bots)
- Cron-scheduled bots
- Search reindexing
- Bulk data export
- Async batch operations

### Access Control

Multi-level security model:

1. **Project Isolation** - All resources belong to a Project
2. **Membership** - User → ProjectMembership → AccessPolicy
3. **Access Policies** - FHIR-based resource-level rules with FHIRPath criteria
4. **Enforcement** - Repository checks policies before every operation

## Code Patterns

### Import Organization

Imports are auto-organized by Prettier plugin (`prettier-plugin-organize-imports`).

### TypeScript Configuration

- **Strict mode enabled**: All packages use strict TypeScript
- **Module system**: ESNext with bundler resolution
- **Project references**: For cross-package type checking
- **Node version**: Requires Node 22.18+ or 24.2+

### Testing Patterns

**Unit tests:**

```typescript
import { MockClient } from '@medplum/mock';

test('example test', async () => {
  const medplum = new MockClient();
  const patient = await medplum.createResource({ resourceType: 'Patient', name: [{ given: ['Alice'] }] });
  expect(patient.id).toBeDefined();
});
```

**Server integration tests:**

```typescript
import { initAppServices, shutdownApp } from './app';
import { initTestAuth } from './test.setup';

describe('Feature', () => {
  beforeAll(async () => {
    await initAppServices();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('example', async () => {
    const { repo, accessToken } = await initTestAuth();
    // Test with real database...
  });
});
```

### Validation

Resources are validated at multiple levels:

1. **Compile-time** - TypeScript type checking
2. **Runtime schema** - `validateResource(resource)` using FHIR StructureDefinitions
3. **Business logic** - Custom validators in server
4. **Access policies** - Permission checks via FhirRepository

### Error Handling

FHIR operations return `OperationOutcome` for errors:

```typescript
interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue: OperationOutcomeIssue[];
}
```

Utilities in `@medplum/core`:

- `createReference(resource)` - Create a FHIR reference
- `getStatus(outcome)` - Extract HTTP status code
- `isOperationOutcome(value)` - Type guard
- `normalizeErrorString(error)` - Convert errors to strings

## Development Workflows

### Adding FHIR Resource Changes

1. Update FHIR definitions in `packages/definitions/fhir/r4/`
2. Regenerate types:
   ```bash
   cd packages/generator
   npm run fhirtypes
   ```
3. Build all packages: `npm run build`

### Adding New Features

1. **Core logic** → `packages/core/src/`
2. **Server endpoints** → `packages/server/src/fhir/` or `packages/server/src/`
3. **React components** → `packages/react/src/`
4. **Documentation** → `packages/docs/docs/`
5. **Examples** → `examples/`

Always add tests alongside new features.

### Code Style

- **Prettier** is the formatter (run `npm run prettier`)
- **ESLint** enforces rules (run `npm run lint`)
- Single quotes, 120 char line width, trailing commas (ES5)
- Organize imports automatically

### Database Migrations

Migrations are in `packages/server/src/migrations/`:

```bash
cd packages/server

# Run migrations
npm run migrate

# Create new migration (manually)
# Add to packages/server/src/migrations/schema/vXXXX.ts
# Register in packages/server/src/migrations/migrate-main.ts
```

### Working with Docker

Full stack development:

```bash
# Start all services (PostgreSQL, Redis, S3, etc.)
docker-compose -f docker-compose.full-stack.yml up -d

# Stop services
docker-compose -f docker-compose.full-stack.yml down
```

## Package Dependencies

Core dependency graph (simplified):

```
fhirtypes (base types)
  ↓
definitions (schemas)
  ↓
core (client, utilities)
  ↓
fhir-router (routing, abstract repo)
  ↓
├── mock (testing)
├── server (PostgreSQL impl)
├── react-hooks
│   ↓
│   react (UI components)
│   ↓
│   app (web app)
└── cli, agent, bot-layer
```

When making changes:

- Changes to `core` require rebuilding all downstream packages
- Use `npm run build:fast` to only rebuild `app` and `server`
- Turbo caches unchanged packages

## Common Issues

### Build Failures

- **"Cannot find module"**: Run `npm ci` then `npm run build`
- **Type errors across packages**: Clean and rebuild: `npm run clean && npm run build`
- **Turbo cache issues**: Delete `.turbo/` and rebuild

### Test Failures

- **Server tests fail**: Ensure PostgreSQL and Redis are running
- **Timeout errors**: Some tests need 30s timeout (already configured)
- **Port conflicts**: Check if server is running on port 8103

### Module Resolution

- All packages use `"type": "module"` (ESM)
- Dual package exports (CJS + ESM)
- Use `.mjs` for ESM, `.cjs` for CommonJS, `.ts` for source

## Documentation

- **Main docs**: `packages/docs/docs/` (Docusaurus/MDX)
- **API docs**: Generated by API Extractor into `dist/docs/`
- **Examples**: `examples/` directory has 20+ sample apps
- **Contributing guide**: https://www.medplum.com/docs/contributing

## CI/CD

GitHub Actions workflows in `.github/workflows/`:

- **build.yml** - Run on every PR (build, lint, test)
- **publish.yml** - Publish to npm on releases
- Uses Turbo remote caching for speed
- Matrix testing on Node 22 and 24

## Build and Development Commands

```bash
# Install dependencies (uses npm workspaces)
npm ci

# Build all packages (excludes docs and examples for speed)
npm run build

# Build only app and server (fastest for development)
npm run build:fast

# Run all tests
npm t

# Run tests for a single package
cd packages/core && npm t

# Run a specific test file
npm t -- src/App.test.tsx

# Run a specific test by name
npm t -- src/App.test.tsx -t 'Click logo'

# Run tests with coverage
npm t -- --coverage

# Lint all packages
npm run lint

# Fix lint issues
npm run lint:fix

# Format code with Prettier
npm run prettier
```

## Running the Stack Locally

1. Start PostgreSQL and Redis via Docker:

   ```bash
   docker compose up
   ```

2. Start the API server (in a separate terminal):

   ```bash
   cd packages/server && npm run dev
   ```

3. Start the web app (in a separate terminal):
   ```bash
   cd packages/app && npm run dev
   ```

- Server runs at http://localhost:8103 (healthcheck at /healthcheck)
- App runs at http://localhost:3000
- Default login: admin@example.com / medplum_admin

## Architecture Overview

Medplum is a full-stack TypeScript FHIR platform built as a monorepo using npm workspaces and Turborepo.

### Core Package Dependency Chain

```
@medplum/fhirtypes     → TypeScript types for all FHIR resources (generated)
@medplum/definitions   → FHIR specification data (SearchParameters, StructureDefinitions)
@medplum/core          → Core library: MedplumClient, FHIRPath, search parsing, utilities
@medplum/fhir-router   → FHIR URL routing and GraphQL schema
@medplum/server        → Express API server with PostgreSQL/Redis
```

### Key Packages

- **core**: The main client library (`MedplumClient`), FHIRPath evaluation, search query parsing, FHIR validation. Used by both server and client apps.
- **server**: Express-based FHIR R4 server. Key directories:
  - `src/fhir/` - FHIR operations, search, SQL query building
  - `src/auth/` - Authentication and authorization
  - `src/oauth/` - OAuth2/OIDC implementation
  - `src/workers/` - Background job processing (BullMQ)
- **react**: React component library using Mantine UI for FHIR resources
- **react-hooks**: React hooks for Medplum client integration
- **app**: Main web application (React + Vite)

### Server Architecture

The server uses PostgreSQL with a denormalized schema for FHIR resources:

- Each FHIR resource type has its own table (e.g., `Patient`, `Observation`)
- Tables have columns for each search parameter plus `id` (UUID) and `content` (JSONB)
- Lookup tables handle complex search matching (e.g., `HumanName`, `*_Token` tables)
- Search queries are built using `SqlBuilder` which composes SQL expressions

### FHIR Search Flow

1. Query string parsed into `SearchRequest` object (`@medplum/core/search`)
2. `SearchRequest` converted to SQL via `SqlBuilder` (`packages/server/src/fhir/sql.ts`)
3. Access control filters added based on Project and AccessPolicy
4. Results returned with proper pagination links

### Background Jobs

Uses BullMQ with Redis for:

- Subscription notifications
- Bot execution
- Async operations (reindex, bulk export)

## Testing

- Jest is the test runner for all packages
- Server tests require PostgreSQL and Redis running (`docker compose up`)
- React components use React Testing Library
- Mock client available in `@medplum/mock` for testing without a server

## Agent Architecture

The `@medplum/agent` package is an on-premise agent that bridges hospital/clinic networks with the Medplum cloud server. It enables bidirectional communication with legacy healthcare systems using HL7v2, DICOM, and raw TCP protocols.

### High-Level Flow

```
[Hospital System] <--HL7/DICOM/TCP--> [Medplum Agent] <--WebSocket--> [Medplum Server] <--Bot Execution-->
```

1. Agent connects to server via WebSocket (`/ws/agent`) and authenticates
2. Agent listens on configured local ports for incoming HL7/DICOM/TCP connections
3. When a message arrives, agent forwards it to server via WebSocket
4. Server executes the configured Bot to process the message
5. Bot response is sent back through the WebSocket to the agent
6. Agent forwards the response to the original sender

### Key Components

- **App** (`src/app.ts`): Main application class that manages WebSocket connection to server, channels, and message queues. Handles heartbeats, config reloading, and agent upgrades.

- **Channel Types** (`src/channel.ts`): Abstract base for protocol handlers
  - `AgentHl7Channel` (`src/hl7.ts`): MLLP server for HL7v2 messages. Supports enhanced acknowledgment modes.
  - `AgentDicomChannel` (`src/dicom.ts`): DIMSE server for DICOM C-STORE/C-ECHO. Uploads received images as Binary resources.
  - `AgentByteStreamChannel` (`src/bytestream.ts`): Raw TCP for arbitrary byte streams.

- **Hl7ClientPool** (`src/hl7-client-pool.ts`): Connection pooling for outbound HL7 connections with configurable keep-alive.

### HL7 Enhanced Acknowledgment Modes

The HL7 channel supports enhanced acknowledgment modes per the HL7v2 specification. This is configured via the `enhanced` query parameter on the endpoint URL.

**Enhanced Mode Types** (`@medplum/hl7` - `EnhancedMode` type):

- `undefined` (default): Standard mode - no immediate ACK, waits for application response
- `'standard'`: Sends immediate Commit ACK (CA), then forwards application-level ACK later
- `'aaMode'`: Sends immediate Application ACK (AA), ignores later application-level ACKs

**Application-Level ACK Modes** (configured via `appLevelAck` query param, based on MSH-16):

- `AL` (Always): Always forward application ACKs to remote system (default)
- `NE` (Never): Never forward application ACKs
- `ER` (Error): Only forward on error (AE/AR), not on success (AA)
- `SU` (Success): Only forward on success (AA)

**Example endpoint URLs:**

```
mllp://0.0.0.0:2575?enhanced=true                    # Standard enhanced mode
mllp://0.0.0.0:2575?enhanced=aa                      # AA mode (immediate AA)
mllp://0.0.0.0:2575?enhanced=true&appLevelAck=ER    # Enhanced + only forward errors
```

**Flow in standard enhanced mode:**

1. Message received from hospital system
2. Agent immediately sends Commit ACK (CA) back to sender
3. Message forwarded to server, Bot processes it
4. Bot returns application-level ACK (AA/AE/AR)
5. Based on `appLevelAck` setting, ACK may be forwarded to original sender

### Configuration

Agent configuration is stored in a FHIR `Agent` resource with:

- `channel[]`: Array of channel definitions, each with a name and endpoint reference
- `setting[]`: Agent-level settings (keepAlive, maxClientsPerRemote, logStatsFreqSecs)

Each channel's `Endpoint` resource specifies the protocol via URL scheme:

- `mllp://0.0.0.0:2575` - HL7v2 over MLLP
- `dicom://0.0.0.0:4104` - DICOM
- `tcp://0.0.0.0:8080` - Raw TCP

### Server-Side Handling

The server (`packages/server/src/agent/websockets.ts`) handles agent WebSocket connections:

1. Authenticates agent via access token
2. Subscribes to Redis channel for the agent (enables push messages to agent)
3. On `agent:transmit:request`: executes the configured Bot and returns response
4. Uses Redis pub/sub for async responses (callbacks)

### Message Types

Agent-server communication uses typed JSON messages:

- `agent:connect:request/response` - Authentication handshake
- `agent:heartbeat:request/response` - Keep-alive with version info
- `agent:transmit:request/response` - Message transmission
- `agent:reloadconfig:request/response` - Hot reload configuration
- `agent:upgrade:request/response` - Remote agent upgrades (Windows only)

### Running the Agent

```bash
cd packages/agent
npm run agent
```

Or with the built executable, configured via environment variables or command-line args for agent ID and credentials.

## Code Style

- TypeScript throughout
- ESLint with custom config in `@medplum/eslint-config`
- Prettier for formatting (single quotes, trailing commas, 120 char width)
- All packages use ES modules (`"type": "module"`)
