---
sidebar_position: 4
tags:
  - subscription
  - self-hosting
---

# Server-Scoped Subscriptions

A server-scoped `Subscription` fires for rest-hook changes across **every project on the server**, not just its own project. It's useful for project-per-tenant deployments that need one central, server-wide data-processing flow.

:::info Self-hosted only

This feature requires the [Super Admin](/docs/self-hosting/super-admin-guide) project and a server config flag, both of which are only available when you run your own Medplum server. It is **not** available on hosted Medplum (`app.medplum.com`).

:::

## How It Works

A server-scoped Subscription is a `Subscription` with no `meta.project` (a project-less system resource). When enabled, the subscription worker evaluates both a resource's own-project Subscriptions and all project-less ones, for changes in every project.

- **Access policies** are skipped for these Subscriptions, since they aren't bound to a project. This is safe: only a super admin can create a project-less resource, and they're only evaluated when the flag is on.
- **AuditEvents** from these firings are themselves project-less and live in the system scope.

## Enabling and Using

Both are required:

1. Set `serverScopedSubscriptionsEnabled` to `true` in your [server config](/docs/self-hosting/server-config#serverscopedsubscriptionsenabled) (default `false`), then restart the server.
2. Sign in as a member of the [Super Admin](/docs/self-hosting/super-admin-guide) project and create a `Subscription` with **no** `meta.project`. Being a super admin is what grants the privilege — the Subscription itself must not be assigned to any project (not even the Super Admin project); leaving `meta.project` unset is what makes it project-less and server-scoped:

```json
{
  "resourceType": "Subscription",
  "reason": "Central processing for all tenants",
  "status": "active",
  "criteria": "Patient",
  "channel": {
    "type": "rest-hook",
    "endpoint": "https://example.com/central-hook"
  }
}
```

With the flag off, project-less Subscriptions are ignored. For single-project flows, use an ordinary [Subscription](/docs/subscriptions) instead.
