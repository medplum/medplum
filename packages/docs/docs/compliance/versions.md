---
sidebar_position: 3
---

# Medplum Version Policy

## Overview

Medplum follows semantic versioning (semver) for all components of our healthcare developer platform. This document outlines our version release strategy, support timeline, and upgrade requirements to help organizations plan their deployment and maintenance schedules effectively.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 361">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="246" y="30" text-anchor="middle">Oct 2025</text>
  <line x1="246" y1="40" x2="246" y2="346" stroke="#000" stroke-width="2"/>
  <text x="407" y="30" text-anchor="middle">Jan 2026</text>
  <line x1="407" y1="40" x2="407" y2="346" stroke="#000" stroke-width="2"/>
  <text x="568" y="30" text-anchor="middle">Apr 2026</text>
  <line x1="568" y1="40" x2="568" y2="346" stroke="#000" stroke-width="2"/>
  <text x="729" y="30" text-anchor="middle">Jul 2026</text>
  <line x1="729" y1="40" x2="729" y2="346" stroke="#000" stroke-width="2"/>
  <text x="889" y="30" text-anchor="middle">Oct 2026</text>
  <line x1="889" y1="40" x2="889" y2="346" stroke="#000" stroke-width="2"/>
  <text x="1050" y="30" text-anchor="middle">Jan 2027</text>
  <line x1="1050" y1="40" x2="1050" y2="346" stroke="#000" stroke-width="2"/>
  <text x="1211" y="30" text-anchor="middle">Apr 2027</text>
  <line x1="1211" y1="40" x2="1211" y2="346" stroke="#000" stroke-width="2"/>
  <text x="1372" y="30" text-anchor="middle">Jul 2027</text>
  <line x1="1372" y1="40" x2="1372" y2="346" stroke="#000" stroke-width="2"/>
  <text x="1533" y="30" text-anchor="middle">Oct 2027</text>
  <line x1="1533" y1="40" x2="1533" y2="346" stroke="#000" stroke-width="2"/>
  <text x="20" y="94" text-anchor="start" font-size="22">Main</text>
  <text x="20" y="162" text-anchor="start" font-size="22">Medplum 4</text>
  <text x="20" y="233" text-anchor="start" font-size="22">Medplum 5</text>
  <text x="20" y="303" text-anchor="start" font-size="22">Medplum 6</text>
  <rect x="165" y="64" width="1406" height="47" fill="#1c7ed6"/>
  <text x="177" y="95.5" text-anchor="start" font-size="22" font-weight="700" fill="#fff">UNSTABLE</text>
  <rect x="165" y="134" width="724" height="47" fill="#adb5bd"/>
  <text x="177" y="165.5" text-anchor="start" font-size="22" font-weight="700" fill="#fff">MAINTENANCE</text>
  <rect x="165" y="205" width="724" height="47" fill="#9c36b5"/>
  <text x="177" y="236.5" text-anchor="start" font-size="22" font-weight="700" fill="#fff">ACTIVE</text>
  <rect x="889" y="205" width="684" height="47" fill="#adb5bd"/>
  <text x="901" y="236.5" text-anchor="start" font-size="22" font-weight="700" fill="#fff">MAINTENANCE</text>
  <rect x="889" y="275" width="684" height="47" fill="#9c36b5"/>
  <text x="901" y="306.5" text-anchor="start" font-size="22" font-weight="700" fill="#fff">ACTIVE</text>
</svg>


## Component Versioning

All Medplum components are released in lockstep with the same version number:

- API Server
- Client SDKs
- React Component Library
- Agent
- Supporting tools and utilities

> **Release-artifact consistency:** Every deliverable (Docker images, npm packages, Helm charts, Terraform modules, etc.) is published with the _identical_ semver tag for a given release to avoid cross-version drift.

## Release Schedule

### Major Versions (X.0.0)

- Released annually in Q4
- Support lifecycle consists of:
  - 1 year **Active** status with full support and feature updates
  - 1 year **Maintenance** status with critical updates only
  - **Enterprise extension:** security-only patch releases for an additional 12 months (36 months total from GA)<sup>1</sup>
- Primarily driven by updates to core dependencies
- Include any necessary breaking changes, concentrated into the annual release
- _Availability of a new major in Q4 does **not** require immediate adoption; customers may remain on the previous major for its entire Active + Maintenance (+ Enterprise extension, if applicable) window._

<sup>1</sup> The 36-month security-patch commitment applies to licensed **Enterprise** customers and is not promised for free/open-source users.

### Minor Versions (X.Y.0)

- Released 2-3 times per year
- Require server maintenance including potential database migrations
- Must be deployed sequentially (cannot skip minor versions)
- Include backwards-compatible feature additions and improvements
- _The `medplum upgrade` / `medplum aws upgrade` tool automatically chains sequential minors (e.g., 5.0 → 5.3) and supports transactional rollback._

### Patch Versions (X.Y.Z)

- Released approximately weekly
- Include bug fixes and non-breaking feature additions
- Can be deployed directly without intermediate steps

### Security Patch SLA

| Severity (CVSS v3) | Publication deadline |
| ------------------ | -------------------- |
| Critical (≥ 9.0)   | ≤ 7 calendar days    |
| High 7.0–8.9       | ≤ 14 calendar days   |

## Dependency Support

### Scheduled Release Dependencies

#### Node.js

- Supports current "Active" and "Maintenance" [LTS Node.js versions](https://nodejs.org/en/about/previous-releases)
- All unit and integration tests are run against supported versions
- Follows Node.js even-numbered LTS release schedule (20.x, 22.x, 24.x, etc.)

#### PostgreSQL

- Supports all [PostgreSQL LTS versions](https://www.postgresql.org/support/versioning/) that overlap with Medplum "Active" releases
- Integration tests are run against all supported versions
- Typically covers 4 major PostgreSQL versions

### Other Major Dependencies

Dependencies without predefined release schedules (e.g., Redis, React, Mantine) follow these support guidelines:

- The major version of each dependency supported at the start of a Medplum major version will continue to be supported throughout that Medplum version's lifecycle
- Support requirements are re-evaluated during each major Medplum version release
- Example: If Redis v6 is supported at the release of Medplum v4.0.0, it will continue to receive support throughout Medplum v4.x.x's lifecycle
- _Baseline versions are otherwise frozen for that major; bumps occur only to remediate critical CVEs and will be announced ≥ 30 days in advance._

## FHIR Roadmap Alignment

| Medplum Series | Default FHIR Version   | Notes                                                 |
| -------------- | ---------------------- | ----------------------------------------------------- |
| 4.x            | R4 (US Core / USCDI)   | Current GA                                            |
| 5.x            | **R4 remains default** | R5 work is paused; any R5 work is experimental/opt-in |
| Future 6.x     | R6 (planned)           | Migration path will follow USRSC guidance             |

## Deprecation & Removal Policy

A feature marked **deprecated** in minor _N_ will **not** be removed until major _N + 1_.

## Deployment Requirements

### Self-Hosted Deployments

- Must use supported versions of Node.js and PostgreSQL
- Required to use Medplum CLI for version upgrades
- Must perform sequential minor version upgrades for proper data migration (handled automatically by the upgrade tooling)
- Automated tooling provided for migration processes

### Enterprise Considerations

#### Compliance Requirements

- HIPAA compliance requires maintaining supported software versions
- SOC 2 requirements include regular security updates and version maintenance
- ONC certification is only valid for "Active" versions
- Enterprise customers should maintain upgrade schedules aligned with support windows

#### Maintenance Support

During the "Maintenance" year of a major version, updates are limited to:

- Security vulnerabilities and patches
- Critical bug fixes
- Enterprise customer stability requirements

#### Advance Change Notice

Medplum provides ≥ 30 days written notice for:

- Breaking changes introduced in a major release
- Newly introduced deprecations
- Baseline dependency bumps for CVE remediation

Notice channels: email to named enterprise contacts, GitHub release notes, and the Medplum Slack `#announcements` channel.

## Version Lifecycle Example

Using version 4.0.0 as an example:

- Q4 2024: Version 4.0.0 released, enters "Active" status
- Q4 2025: Version 5.0.0 released, version 4.x.x enters "Maintenance" status
- Q4 2026: Version 4.x.x enters **Enterprise security-patch-only** window
- Q4 2027: Version 4.x.x reaches end-of-life

## Recommended Practices

1. Production deployments should maintain current "Active" versions when possible
2. Plan major version upgrades annually during the Q4 release window
3. Schedule minor version upgrades within 30 days of release
4. Monitor the Medplum changelog for security updates and patch releases
5. Use Medplum CLI for all version upgrades to ensure proper migration handling
