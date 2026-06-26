---
sidebar_position: 9
---

# Using Agent Search Parameters in Bulk Operations

Several of the Medplum Agent operations can act on more than one agent at a time. Instead of targeting a single agent by ID, you invoke the operation against the `Agent` _type_ endpoint and use `Agent` search parameters to select which agents the operation should run against.

This page collects common "recipes" for selecting agents with search parameters, so you don't have to look up the same query patterns on each individual operation page.

## Operations that support search parameters

The following operations accept `Agent` search parameters to select their operation targets when invoked against the type-level endpoint (`[base]/Agent/$operation`):

- [`$bulk-status`](./bulk-status.md)
- [`$fetch-logs`](./fetch-logs.md)
- [`$stats`](./stats.md)
- [`$upgrade`](./upgrade.md)

In each case, the operation is run against _every_ agent matched by the query, and the response is a `Bundle` of `Parameters`, one entry per matched agent.

:::info[Single vs. multiple agents]

The `$status` operation is single-agent only and does **not** accept search parameters. To query the status of multiple agents at once, use [`$bulk-status`](./bulk-status.md).

:::

## Available `Agent` search parameters

The `Agent` resource defines the following resource-specific search parameters:

- `name` — the agent's name (string search; matches by prefix)
- `identifier` — an `Agent.identifier` (token search)
- `status` — the agent's status, e.g. `active` or `off` (token search)

In addition, the standard "global" search parameters apply, including:

- `_id` — the agent's logical ID
- `_tag` — a tag on `Agent.meta.tag`
- `_lastUpdated` — when the agent resource was last updated
- `_count` and `_offset` — for paging through large result sets

:::note[Default and maximum page size]

When `_count` is omitted, these operations act on at most the **default page size of 20 agents** — they do _not_ automatically run against every matching agent. The maximum allowed `_count` is `100`; requesting a larger `_count` returns an `OperationOutcome` error. To operate on more agents than fit on a single page, use `_count` and `_offset` to page through the results — see [Paging through agents](#paging-through-agents) below.

:::

## Recipes

The recipes below use [`$bulk-status`](./bulk-status.md) as an example, but the same query patterns work for any operation that supports search parameters — just swap in the operation you want to run (`$fetch-logs`, `$stats`, `$upgrade`, etc.).

### All active agents

Select agents whose status is `active` — the most common multi-agent query. Note that without a `_count`, this acts on at most the default page of 20 agents (see [Paging through agents](#paging-through-agents) to cover more):

```bash
medplum get 'Agent/$bulk-status?status=active'
```

### Agents matching a name prefix

Select all agents whose name starts with a given prefix:

```bash
medplum get 'Agent/$bulk-status?name=Production+Agent'
```

### Agents with a given tag

Select all agents tagged with a particular value (useful for grouping agents by site, region, or deployment group):

```bash
medplum get 'Agent/$bulk-status?_tag=Group+A'
```

### Combining search parameters

Search parameters can be combined to narrow the selection. For example, all `active` agents in `Group A`:

```bash
medplum get 'Agent/$bulk-status?status=active&_tag=Group+A'
```

### Paging through agents

When operating on a large number of agents, page through them in batches using `_count` and `_offset`:

```bash
medplum get 'Agent/$bulk-status?_count=50&_offset=0'
medplum get 'Agent/$bulk-status?_count=50&_offset=50'
```

## Targeting a single agent by name or identifier

In addition to selecting an agent by its logical ID (`[base]/Agent/[id]/$operation`), you can target a single agent against the type-level endpoint by using a search parameter that you expect to be unique, most commonly `name` or `identifier`:

```bash
medplum get 'Agent/$bulk-status?name=Test+Agent+1'
```

```bash
medplum get 'Agent/$fetch-logs?identifier=agent-007'
```

:::caution[These are conventions, not guarantees]

Using `name` or `identifier` to target a "single" agent is only a convention. Neither `name` nor `identifier` is required to be unique across agents in a project — if the same name or identifier is shared by multiple agents, the operation will match and run against **all** of them, and the response will be a `Bundle` with an entry for each matched agent rather than a single result.

If you need to operate on exactly one specific agent, target it by its logical ID instead:

```bash
medplum get 'Agent/93f8b2fb-65a3-4977-a175-71b73b26fde7/$bulk-status'
```

:::

:::tip[CLI]

Many of these operations can also be invoked using the Medplum CLI. See the [agent CLI commands](./agent-cli-commands.md) for details.

:::
