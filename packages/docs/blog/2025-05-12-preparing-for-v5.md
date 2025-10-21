---
slug: preparing-for-v5
title: Preparing for Medplum v5
authors: cody
tags: [self-host, fhir-datastore, integration, compliance, auth, community]
---

As the open source healthcare developer platform of choice for innovators worldwide, Medplum continues to evolve with the rapidly changing technology landscape. We're excited to announce our upcoming major version release, Medplum v5, scheduled for October 2025. This post outlines the significant changes coming in this release to help our users prepare accordingly.

<!-- truncate -->

## Modern Runtime Dependencies

Medplum v5 makes several important dependency upgrades to provide the best performance, security, and developer experience:

### Node.js

- **Dropping support for Node 20** (which reaches end-of-life in April 2026)
- **Supporting Node 22 and 24** - taking advantage of the latest JavaScript runtime features and performance improvements
- Node 22 brings significant performance improvements with its Maglev compiler, enhanced WebSocket support, and better error handling for async middleware

### PostgreSQL

- **Dropping support for Postgres 13** (which reaches end-of-life in November 2025)
- **Adding support for Postgres 18** (releasing September 2025)
- Postgres 18 introduces major performance improvements with its new asynchronous I/O subsystem, enabling up to 2-3x faster operations for sequential scans and other common operations

### Redis

- **Dropping support for Redis 6** (reaching end-of-life)
- **Continuing support for all active Redis 7 versions**
- Redis 7 includes Redis Functions, ACLv2, command introspection, and Sharded Pub/Sub, significantly enhancing flexibility and performance

## Frontend Modernization

### React and UI Components

- **Dropping support for React 18**
- **Requiring React 19 only** - we've already migrated internally and are prepared to support one React version moving forward
- **Upgrading from Mantine 7 to Mantine 8** for our front-end components
  - Mantine 8 features improved date handling, new CSS-based organization, and enhanced typescript support

### Web Framework and Code Quality

- **Upgrading Express from v4 to v5**
  - Express 5 brings stronger Node 18+ compatibility, automatic error handling for async/await functions, and improved security
- **Replacing ESLint and Prettier with Biome**
  - This unified toolchain offers faster performance, simpler configuration, and reduced dependency overhead
  - Note: Our `@medplum/eslint-config` package will be deprecated as part of this transition

## Planning Your Migration

We recommend self-hosted customers begin preparation for these changes, particularly:

1. **Database planning**: Schedule Postgres upgrades and Redis updates with your DevOps team. These infrastructure components require careful migration planning.

2. **Application codebase**: Review any custom apps built on Medplum to ensure compatibility with newer React, Node, and Express versions.

3. **Development environment**: Consider upgrading local development environments to test with newer versions ahead of the v5 release.

## The Benefits of Upgrading

While upgrades may require some adjustment, Medplum v5 delivers significant advantages:

- **Performance**: Benefit from substantial performance improvements across the entire stack
- **Security**: Access the latest security features and mitigations in all dependencies
- **Developer experience**: Enjoy better tooling, faster build times, and modern language features
- **Future-proofing**: Set your healthcare solutions on a stable foundation for years to come

## Timeline

- **May 2025**: Blog post and initial announcements
- **September 2025**: Medplum v5 beta release
- **October 2025**: General availability release

We're committed to making this transition as smooth as possible. Our team will provide detailed migration guides, support resources, and early access testing opportunities as we approach the release date.

## Stay Connected

For questions, concerns, or feedback about the upcoming v5 release, please join the conversation on [Discord](https://discord.gg/medplum) or submit issues on [GitHub](https://github.com/medplum/medplum).

By embracing these modern technologies, Medplum continues its mission to accelerate healthcare innovation through powerful, interoperable, and developer-friendly tools.
