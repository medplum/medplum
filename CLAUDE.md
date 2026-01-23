# CLAUDE.md - Medplum Development Guide

## Project Overview

Medplum is an open-source healthcare developer platform built with full-stack TypeScript. It provides FHIR-compliant APIs, authentication, React components, and infrastructure for building healthcare applications.

## Quick Commands

```bash
# Install dependencies (uses npm workspaces)
npm ci

# Build all packages (excludes docs)
npm run build

# Build app and server only (faster)
npm run build:fast

# Run all tests
npm t

# Run tests for a specific package
cd packages/<package-name> && npm t

# Run a specific test file
npm t -- src/App.test.tsx

# Lint all packages
npm run lint

# Fix linting issues
npm run lint:fix

# Format code with Prettier
npm run prettier

# Start local services (PostgreSQL + Redis)
docker-compose up

# Start dev server
cd packages/server && npm run dev

# Start dev app
cd packages/app && npm run dev
```

## Monorepo Structure

This is an npm workspaces monorepo orchestrated by Turborepo.

| Package | Purpose |
|---------|---------|
| `packages/core` | Core SDK - FHIR client, utilities, shared logic |
| `packages/server` | Express backend - FHIR API, auth, database |
| `packages/app` | React web application (Vite) |
| `packages/react` | React component library (Mantine-based) |
| `packages/react-hooks` | Custom React hooks |
| `packages/fhirtypes` | TypeScript FHIR type definitions |
| `packages/definitions` | FHIR resource schemas and metadata |
| `packages/mock` | Mock FHIR data for testing |
| `packages/fhir-router` | FHIR URL routing |
| `packages/hl7` | HL7 client/server implementation |
| `packages/cli` | Medplum command-line interface |
| `packages/agent` | On-premise deployment agent |
| `packages/cdk` | AWS CDK infrastructure |
| `packages/docs` | Docusaurus documentation site |
| `examples/` | Example projects and implementations |

## Code Standards

### Required File Header

All source files must have this SPDX license header:

```typescript
// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
```

### TypeScript Rules

- All code must be TypeScript (strict mode)
- Explicit return types on functions
- No implicit `any` types
- Use single quotes for strings
- Max line width: 120 characters

### Linting & Formatting

- ESLint with `@medplum/eslint-config`
- Prettier with `prettier-plugin-organize-imports`
- Always run `npm run lint:fix` before committing

## Testing

- **Framework**: Jest with React Testing Library
- **Pattern**: `**/*.test.ts` and `**/*.test.tsx`
- **Coverage**: Analyzed by Sonarcloud and Coveralls

```bash
# Run with coverage
npm t -- --coverage

# Run specific test by name
npm t -- src/App.test.tsx -t 'test name'
```

## Local Development Setup

1. Start Docker services: `docker-compose up`
2. Install dependencies: `npm ci`
3. Build packages: `npm run build:fast`
4. Start server: `cd packages/server && npm run dev`
5. Start app: `cd packages/app && npm run dev`
6. Access app at http://localhost:3000/
   - Email: `admin@example.com`
   - Password: `medplum_admin`

## Database

- PostgreSQL 16 on localhost:5432
- User: `medplum`, Password: `medplum`
- Databases: `medplum` (dev), `medplum_test` (test)
- Run migrations: `cd packages/server && npm run migrate`

## Key Technologies

- **Frontend**: React 19, Vite, Mantine UI
- **Backend**: Express 5, Node.js 22+
- **Database**: PostgreSQL 16, Redis 7
- **Build**: Turborepo, npm workspaces
- **Testing**: Jest, React Testing Library
- **Infrastructure**: AWS CDK, Terraform, Kubernetes Helm
