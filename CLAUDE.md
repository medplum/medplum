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
  createResource<T>(resource: T): Promise<WithId<T>>
  readResource<T>(type: string, id: string): Promise<WithId<T>>
  updateResource<T>(resource: T): Promise<WithId<T>>
  deleteResource(type: string, id: string): Promise<void>
  search<T>(searchRequest: SearchRequest<T>): Promise<Bundle<WithId<T>>>
  withTransaction<TResult>(callback): Promise<TResult>
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
