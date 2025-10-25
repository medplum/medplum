---
slug: so-youre-thinking-about-forking
title: So You’re Thinking About Forking
authors: cody
tags: [self-host, fhir-datastore, integration, compliance, auth, community]
---

Forking can look like the fastest path to control, but it often becomes a long‑term maintenance tax. Here’s a pragmatic checklist to decide—and alternatives that usually win.

<!-- truncate -->

> **TL;DR** Forking feels like freedom; more often it is technical debt in disguise. Before you spin up a divergent codebase, walk through the checklist below and consider proven collaboration patterns that deliver 90 % of the control with 10 % of the cost.

## The Temptation to Fork

Every open‑source maintainer eventually receives the same message: *“We love your project, but we need feature X immediately—so we’re considering a fork.”* The allure is clear:

- **Unblocked roadmap** No need to wait for upstream review cycles.
- **Rapid experimentation** Freedom to rewrite modules, tweak schemas, or cut corners.
- **Perceived leverage** A fork can feel like an insurance policy against future licence or direction changes.

Yet the freedom is rarely free.

## What a Fork Really Means

| Hidden Cost             | Why It Hurts Over Time                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Merge fatigue**       | Every upstream security patch, performance fix, or new feature now requires repeated cherry‑picks and conflict resolution. |
| **Security surface**    | Divergent codepaths double the CVE tracking burden and slow incident response.                                             |
| **Community isolation** | Third‑party plugins, docs, and Stack Overflow answers increasingly apply to the _mainline_, not your fork.                 |
| **Talent attraction**   | Engineers prefer contributing to widely‑used projects; recruiting for a niche fork is tougher.                             |

At Medplum, we have seen partners launch forks with convinced leadership support—only to merge back within months after realising the hidden cost curve.

## When a Fork _Is_ Justified

There **are** legitimate scenarios:

1. **Project abandonment** No active maintainers, unmerged PRs, stale security issues.
2. **License retreat** Upstream changes from permissive to restrictive terms.
3. **Irreconcilable governance clash** The core team rejects a domain‑specific regulatory requirement that your business legally must meet.

If none of the above apply, pause before you type `git clone`.

## Alternatives That Usually Win

### Contribute Upstream

Large features land faster than you think when paired with a well‑structured proposal, passing tests, and open communication. For context, Medplum has merged >1 000 community PRs, including entire modules such as the upcoming Kafka subscription channel.

### Maintain a Thin Extension Layer

Build your business logic in a **backend‑for‑frontend (BFF)** or dedicated microservice, leaving the core FHIR server untouched. You keep velocity while upstream remains a drop‑in upgrade.

### Sponsor Roadmap Work

If a feature is strategic but non‑differentiating—think sharding, compliance, or new spec versions—directly funding upstream development is often faster and cheaper than hiring a fork team.

## Case Study: Four Years of Medplum Evolution

- **250+ releases** Semantic‑versioned, backwards‑compatible upgrades every two weeks.
- **New capabilities** Subscriptions, bots, Azure/GCP execution targets, sharding, DoseSpot integration.
- **Regulatory alignment** HIPAA, US Core, USCDI updates shipped continuously.

A downstream fork would have needed to replicate every one of these changes—or risk falling behind on performance and compliance.

## A 30‑Minute Fork Decision Checklist

1. **List blockers** Write down the features or constraints driving the fork discussion.
2. **Search the tracker** Is someone already working on your need? Comment and collaborate.
3. **Draft a proposal PR** Even a work‑in‑progress branch sparks upstream feedback.
4. **Estimate ownership cost** How many engineer‑months per year will merges, CI, and CVE triage consume? Multiply by three.
5. **Schedule an architecture chat** Most maintainers (Medplum included) are happy to roadmap with partners—often unlocking an upstream path.

## Conclusion & Next Steps

Forking should be the _exception_, not the default. The open‑source ecosystem thrives when contributors pull in the same direction, sharing maintenance and innovation. Before you commit to life on a fork:

- Open an issue outlining your blockers.
- Gauge maintainer responsiveness on a small PR.
- Consider a thin extension or sponsored roadmap work.

**Our door is always open.** If you’re weighing a fork—or just need architectural advice—reach out in the Medplum Slack, book office hours, or send us a pull request.

> _Move fast—but merge faster._
