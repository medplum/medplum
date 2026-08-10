---
sidebar_position: 21
---

# High Throughput HL7 Channel Configuration

This is the end-to-end guide to configuring a Medplum Agent HL7 channel for a high-volume feed: what actually limits throughput, which knob addresses which limit, and a reference configuration you can copy.

## What are the bottlenecks of high throughput HL7 connections?

A "slow" HL7 interface is almost never slow because of the network. A single MLLP socket on a LAN can move tens of thousands of small messages per second. The bottleneck is the **protocol's request/response discipline**, and it shows up in three places.

### 1. The connection is a single-threaded, strictly-ordered pipe

In [Original Acknowledgement Mode](./acknowledgement-modes.md#original-acknowledgement-mode), the sender transmits one message and then **blocks on that socket** until it receives an application ACK. Nothing else moves on that connection until the receiver has finished its entire processing pipeline — parse, validate, business logic, database commits, downstream calls.

That makes end-to-end throughput a direct function of per-message processing latency:

```
throughput ≈ 1 / (processing latency + round trip)
```

At 250 ms of Bot processing, that's 4 msg/sec. Not 4 msg/sec per stream — 4 msg/sec for the **entire interface**. Adding CPU, memory, or bandwidth changes nothing, because none of those are the constraint. The constraint is that the protocol permits exactly one message in flight.

### 2. A "single feed" is really many independent streams, multiplexed onto one wire

This is the part that matters most, and it's the part HL7v2 gives you no vocabulary for.

A hospital ADT feed is not one stream of causally-related events. It's the interleaving of thousands of unrelated streams:

```
MSH … ADT^A08  PID|…|MRN-00412|…   ← patient A, admit update
MSH … ORU^R01  PID|…|MRN-98773|…   ← patient B, lab result
MSH … ADT^A03  PID|…|MRN-00412|…   ← patient A, discharge  (must follow A's A08)
MSH … ADT^A01  PID|…|MRN-55019|…   ← patient C, admission
MSH … ORU^R01  PID|…|MRN-98773|…   ← patient B, corrected result (must follow B's first)
```

Ordering genuinely matters **within** a patient: an A08 update applied after an A03 discharge, or a corrected lab result applied before the original, produces a wrong chart. Ordering is almost always irrelevant **between** patients: nothing about patient C's admission depends on patient A's discharge.

So the true ordering requirement of the feed is a set of thousands of small independent FIFO queues. What the protocol gives you is **one** FIFO queue, and no way to say which messages belong to which stream. Every message waits behind every other message, including thousands it has no relationship to whatsoever.

That's the core mismatch: **HL7v2's single-connection FIFO semantics are strictly stronger than the ordering the data actually requires, and that excess strength is paid for entirely in throughput.**

### 3. Backpressure is not durability

The blocking ACK does buy something real: the sender knows the message was handled, and holds it until then. Any solution that unblocks the sender has to replace that guarantee with something else, or it converts a throughput problem into a data-loss problem. Any serious answer here has to solve throughput **and** durability together.

---

## The solutions, and what each one actually buys

### Solution 1: Enhanced ACK mode — unblocks the sender

[Enhanced Acknowledgement Mode](./acknowledgement-modes.md) splits the single ACK into two: a fast **Commit Accept (CA)** sent as soon as the message is safely stored, and a later **Application ACK (AA/AE/AR)** sent once processing actually finishes. The socket is released at the CA, so the sender can transmit the next message immediately.

```
mllp://0.0.0.0:9001?enhanced=true
```

**What this fixes:** the sender is no longer blocked on your processing latency. Messages arrive as fast as the sender can push them.

**What this does not fix:** how fast _you_ drain them. Enhanced mode moves the queue from "in the sender's outbox" to "in your queue." If your channel still processes one message at a time, you have the same 4 msg/sec drain rate — you've just built a backlog faster. Under sustained load the queue grows without bound.

Enhanced mode is necessary but not sufficient. **It only becomes a throughput win when you can drain the queue in parallel.**

### Solution 2: AA mode — enhanced throughput when you can't configure the peer

Standard enhanced mode requires the _sender_ to be configured for the two-step handshake (MSH-15/MSH-16). Frequently you can't do that: the sender is a partner's or client's Mirth Connect instance, a vendor appliance, or a legacy system whose interface team is a change-request away.

[AA Mode](./acknowledgement-modes.md#aa-mode-simplified-enhanced-mode) solves this. The Agent immediately returns a plain **Application Accept (AA)** — an ordinary code every HL7 system already understands — and processes asynchronously.

```
mllp://0.0.0.0:9001?enhanced=aa
```

**Use AA mode when:**

- You're receiving from a partner's or client's Mirth (or any third-party interface engine) and they can't easily enable enhanced ACK mode on their sending channel.
- You have no control over the remote system's configuration at all.
- Your workflow doesn't need application-level failure feedback delivered back over the wire.

**The trade-off:** the AA is sent before processing, so you can never send back an AE or AR. The sender always sees success. You must handle processing failures on your side — which is exactly what the durable queue and its retry policy are for (below). See the [AA Mode documentation](./acknowledgement-modes.md#aa-mode-simplified-enhanced-mode) for full details.

### Solution 3: The durable queue — makes the fast ACK honest

Added in **Medplum Agent version 5.1.22**; auto-retry in **5.1.25**.

Enabling `durableQueue` puts a local SQLite queue on the Agent between the MLLP socket and the Bot.

```json
{ "name": "durableQueue", "valueBoolean": true }
```

With the queue on, the Agent takes ownership of the commit ACK and sends CA (or AA) **only after the message is committed to disk**. A message that has been ACKed is on durable storage and survives an Agent crash, a restart, or an upgrade; on startup the Agent recovers interrupted rows and resumes.

The queue is also the prerequisite for everything that follows: retries, and parallel draining. `maxWorkers` and `logicalChannelKey` have no effect without it, and the Agent logs a warning if you set them with the queue off.

The queue additionally gives you:

- **Auto-retry with exponential backoff and jitter.** Default mode is `guaranteed` — retry indefinitely until upstream answers, accepting possible duplicate delivery. `normal` retries only transient failures, capped at 10 attempts. `none` disables retry.
- **Duplicate handling.** Same `(channel, MSH-10)` arriving while a prior row is still in flight is handled per `duplicateBehavior`: `idempotent` (default — replay the prior ACK when the bytes match) or `reject`.
- **Retention.** A sweeper prunes terminal rows on time and size bounds.

### Solution 4: Logical channels — the actual throughput fix

Added in **Medplum Agent version 5.1.29**.

This is the piece that addresses bottleneck #2 directly.

HL7v2 has no notion of a stream identifier — there is no "partition key" field, no session, no correlation ID. But the information is right there in the message: for most feeds, _the patient identifier is the stream identifier_. Messages about different patients are independent, and messages about the same patient must stay ordered.

So Medplum lets you declare it. A **logical channel key** is a spec naming one or more HL7 fields; the Agent computes the key from each message and uses it to partition the queue:

```
mllp://0.0.0.0:9001?enhanced=true&logicalChannelKey=PID-3.1&maxWorkers=64
```

One physical MLLP channel becomes N independent logical channels — one per distinct key value — each preserving strict FIFO order internally, all draining concurrently.

**Ordering guarantee:**

- **Within a logical channel:** strict FIFO, exactly as before. Two messages with the same key never process concurrently or out of order.
- **Across logical channels:** no ordering. That's the point.

**How it works.** A row's partition is computed at _claim_ time, not at intake, so it can never go stale across retries, requeues, restarts, or a spec change. A single per-channel dispatcher claims the lowest-id queued row, computes its key synchronously, and checks whether an earlier message in that same partition is still unsettled. If so, the row is parked as `delayed` and woken when its blocker settles; otherwise it goes straight to a free worker. Because the claim-and-gate is one synchronous critical section with exactly one claimer, two messages of the same logical channel can never be dispatched concurrently.

**Key spec syntax.** Comma-separated HL7 field paths in conventional notation, `SEGMENT-field[.component[.subcomponent]]`, all 1-based:

| Spec                | Partitions by                    | Use when                                                      |
| :------------------ | :------------------------------- | :------------------------------------------------------------ |
| `PID-3.1`           | Patient ID                       | The common case — ADT, ORU, ORM feeds keyed on the patient    |
| `PID-3.1,PID-3.4`   | Patient ID + assigning authority | MRNs are only unique within an issuing facility               |
| `MSH-4`             | Sending facility                 | Coarse partitioning across a multi-facility feed              |
| `MSH-4,MSH-9.2`     | Sending facility + trigger event | Isolate slow message types from fast ones                     |
| `PV1-19`            | Visit number                     | Ordering is per-encounter rather than per-patient             |
| _(empty — default)_ | Nothing; one serialized queue    | Ordering is globally required, or you haven't validated a key |

Validation is all-or-nothing: if any token is malformed the whole spec is rejected with a warning and the previous spec stays in effect, so a typo degrades to your last-known-good partitioning rather than to a wrong one. A message missing the addressed field contributes an empty value — all such messages share one partition, so pick a field your feed reliably populates.

**Choosing a key is a clinical-safety decision, not just a performance one.** The correctness requirement is: _any two messages that must be applied in order must produce the same key._ Before deploying, check for cross-patient dependencies in your feed — merge/link messages (`ADT^A18`, `ADT^A40`), messages that reference a prior message's assigned identifier, and any Bot logic that reads state written by a different patient's message. When in doubt, partition coarser (`MSH-4`) or not at all.

### Solution 5: Worker pool sizing

`maxWorkers` sets how many messages a channel may have in flight at once. Each worker holds exactly one message and does nothing but await the server round trip — it's I/O-bound, not CPU-bound — so the pool size you want is roughly:

```
maxWorkers ≈ target throughput (msg/sec) × per-message latency (sec)
```

At a 300 msg/sec target and 200 ms per message, that's 60 in flight; round to **64**. Overshooting is cheap (idle workers cost almost nothing); undershooting caps you below the target. The value is clamped to a maximum of **500**.

Note that pool size does not multiply claim cost: a single dispatcher owns the claim side, issuing one claim per enqueue and one per freed worker slot regardless of `maxWorkers`.

Two constraints on the pool:

- `maxWorkers > 1` requires `durableQueue: true`. Without it the setting is ignored and the Agent warns.
- `maxWorkers > 1` combined with `assignSeqNo=true` warns: sequence numbers are assigned in arrival order, but delivery across partitions is concurrent, so upstream will see them out of order.

### Solution 6: Outbound connection pooling (`keepAlive` + `maxClientsPerRemote`)

Everything above concerns inbound traffic. If your Bots also push HL7 downstream via [`Agent/$push`](./push.md), the outbound side has its own version of the same bottleneck: one connection to a remote host means one message in flight to it.

- **`keepAlive: true`** reuses TCP connections instead of dialing per message, removing connection setup from the per-message path.
- **`maxClientsPerRemote`** sets how many concurrent client connections the Agent maintains per remote host. Default is **5**, but it drops to **1** when `keepAlive` is enabled unless you set it explicitly — so if you enable `keepAlive` for a high-volume outbound feed, **set `maxClientsPerRemote` explicitly** or you will silently serialize.

A value of **25** is a reasonable starting point for a high-volume outbound feed, paired with a parallel inbound pool. As with `maxWorkers`, size it to `throughput × latency`, and confirm the receiving system will accept that many concurrent connections — many interface engines cap inbound connections per source.

### Solution 7: Rate limiting (`messagesPerMin`)

Sometimes the goal is not maximum throughput but _survivable_ throughput. If a downstream system or your own database can't absorb a burst, `messagesPerMin` smooths the flow by enforcing a minimum interval between processed messages. This pairs naturally with enhanced mode: accept fast, drain at a controlled rate.

---

## Reference configuration

An `Agent` configured for a high-volume feed: durable queue on, partitioned by patient ID, 64 workers inbound, keep-alive with 25 outbound connections per remote. Requires **Medplum Agent version 5.1.29** or later.

```json
{
  "resourceType": "Agent",
  "name": "High Throughput Agent",
  "status": "active",
  "setting": [
    {
      "name": "keepAlive",
      "valueBoolean": true
    },
    {
      "name": "durableQueue",
      "valueBoolean": true
    },
    {
      "name": "channelMaxWorkers",
      "valueInteger": 64
    },
    {
      "name": "channelLogicalChannelKey",
      "valueString": "PID-3.1"
    },
    {
      "name": "maxClientsPerRemote",
      "valueInteger": 25
    },
    {
      "name": "logStatsFreqSecs",
      "valueInteger": 60
    }
  ],
  "channel": [
    {
      "name": "inbound-hl7",
      "endpoint": {
        "reference": "Endpoint/00000000-0000-0000-0000-000000000000",
        "display": "Inbound HL7 Endpoint"
      },
      "targetReference": {
        "reference": "Bot/00000000-0000-0000-0000-000000000000",
        "display": "Inbound HL7 Bot"
      }
    },
    {
      "name": "inbound-astm",
      "endpoint": {
        "reference": "Endpoint/00000000-0000-0000-0000-000000000000",
        "display": "Inbound ASTM Endpoint"
      },
      "targetReference": {
        "reference": "Bot/00000000-0000-0000-0000-000000000000",
        "display": "Inbound ASTM Bot"
      }
    }
  ]
}
```

The `channelMaxWorkers` and `channelLogicalChannelKey` settings are **agent-wide defaults** applied to every HL7 channel. Any channel can override them with endpoint URL parameters — useful when one channel carries a feed you haven't validated a partition key for.

The matching `Endpoint.address`, using standard enhanced mode:

```json
{
  "resourceType": "Endpoint",
  "status": "active",
  "connectionType": {
    "system": "http://terminology.hl7.org/CodeSystem/endpoint-connection-type",
    "code": "hl7v2-mllp",
    "display": "HL7 v2 MLLP"
  },
  "name": "Inbound HL7 Endpoint",
  "payloadType": [
    {
      "coding": [
        {
          "system": "http://terminology.hl7.org/CodeSystem/endpoint-payload-type",
          "code": "any",
          "display": "Any"
        }
      ]
    }
  ],
  "address": "mllp://0.0.0.0:9001?enhanced=true"
}
```

Or, when the sending system can't be configured for the two-step handshake (a partner's Mirth, a vendor appliance):

```
mllp://0.0.0.0:9001?enhanced=aa
```

Per-channel overrides of the agent-wide defaults go on the same URL:

```
mllp://0.0.0.0:9001?enhanced=true&logicalChannelKey=MSH-4&maxWorkers=16
```

---

## Configuration reference

### Agent settings (`Agent.setting`)

Minimum Agent versions: `durableQueue` and the `queue*` settings **5.1.22**; `channelRetryMode` and the `channelAutoRetry*` settings **5.1.25**; `channelMaxWorkers` and `channelLogicalChannelKey` **5.1.29**. See the [feature matrix](./features.md) for the rest.

| Setting                             | Type      | Default                               | Purpose                                                                                                   |
| :---------------------------------- | :-------- | :------------------------------------ | :-------------------------------------------------------------------------------------------------------- |
| `durableQueue`                      | `boolean` | `false`                               | Master switch for the on-disk queue. Required for retries, `maxWorkers`, and `logicalChannelKey`.         |
| `channelMaxWorkers`                 | `integer` | `1`                                   | Default in-flight messages per HL7 channel. Clamped to 500.                                               |
| `channelLogicalChannelKey`          | `string`  | _(none)_                              | Default partition-key spec for HL7 channels, e.g. `PID-3.1`.                                              |
| `keepAlive`                         | `boolean` | `false`                               | Reuse TCP connections for inbound and outbound traffic.                                                   |
| `maxClientsPerRemote`               | `integer` | `5` (`1` if `keepAlive`)              | Concurrent outbound client connections per remote host.                                                   |
| `logStatsFreqSecs`                  | `integer` | _(off)_                               | Emit a periodic stats log line every N seconds.                                                           |
| `queueDbPath`                       | `string`  | `<logDir>/medplum-agent-queue.sqlite` | Queue DB location. Cannot be changed while the queue is open — disable, then re-enable with the new path. |
| `queueRetentionDays`                | `integer` | `7`                                   | How long `processed` rows are kept.                                                                       |
| `queueRetentionMaxMb`               | `integer` | `512`                                 | Soft cap on queue DB size, in MiB.                                                                        |
| `queueErroredRetentionDays`         | `integer` | `90`                                  | Floor on retention for `errored` / `nacked` rows.                                                         |
| `queueSweepIntervalSecs`            | `integer` | `3600`                                | How often the retention sweeper runs.                                                                     |
| `channelRetryMode`                  | `string`  | `guaranteed`                          | Default retry mode: `none`, `normal`, or `guaranteed`.                                                    |
| `channelAutoRetryBaseDelayMs`       | `integer` | `1000`                                | First backoff delay.                                                                                      |
| `channelAutoRetryMaxDelayMs`        | `integer` | `60000`                               | Backoff ceiling.                                                                                          |
| `channelAutoRetryMaxAttempts`       | `integer` | `0` (unlimited) / `10` in `normal`    | Attempt cap. Setting a nonzero value under `guaranteed` warns and voids the guarantee.                    |
| `channelAutoRetryBackoffMultiplier` | `decimal` | `2`                                   | Exponential backoff multiplier.                                                                           |

### Endpoint URL parameters (`Endpoint.address`)

Per-channel; where both exist, the URL parameter wins over the agent-wide setting, field by field.

Minimum Agent versions: `duplicateBehavior` **5.1.22**; the `retryMode` / `autoRetry*` params **5.1.25**; `logicalChannelKey` and `maxWorkers` **5.1.29**. See the [feature matrix](./features.md) for the rest.

| Parameter                    | Values                         | Default       | Purpose                                                                  |
| :--------------------------- | :----------------------------- | :------------ | :----------------------------------------------------------------------- |
| `enhanced`                   | `true`, `aa`                   | _(off)_       | `true` = standard two-step CA/AA; `aa` = immediate AA, no async app ACK. |
| `logicalChannelKey`          | HL7 field spec                 | _(none)_      | Partition key, e.g. `PID-3.1` or `MSH-4,MSH-9.2`.                        |
| `maxWorkers`                 | `1`–`500`                      | `1`           | In-flight messages for this channel.                                     |
| `messagesPerMin`             | integer                        | _(unlimited)_ | Smooths processing to at most N messages per minute.                     |
| `appLevelAck`                | `AL`, `NE`, `ER`, `SU`         | `AL`          | Which application ACKs to forward in standard enhanced mode.             |
| `duplicateBehavior`          | `idempotent`, `reject`         | `idempotent`  | Handling of a repeated `MSH-10` while a prior row is in flight.          |
| `retryMode`                  | `none`, `normal`, `guaranteed` | `guaranteed`  | Retry aggressiveness for queue → Bot delivery.                           |
| `autoRetryBaseDelayMs`       | integer ≥ 1                    | `1000`        | First backoff delay.                                                     |
| `autoRetryMaxDelayMs`        | integer ≥ 1                    | `60000`       | Backoff ceiling.                                                         |
| `autoRetryMaxAttempts`       | integer ≥ 0                    | `0` / `10`    | Attempt cap (`0` = unlimited).                                           |
| `autoRetryBackoffMultiplier` | number ≥ 1                     | `2`           | Exponential backoff multiplier.                                          |
| `encoding`                   | e.g. `utf-8`, `latin1`         | `utf-8`       | Wire encoding.                                                           |
| `assignSeqNo`                | `true`, `false`                | `false`       | Assign sequence numbers. Warns when combined with `maxWorkers > 1`.      |

---

## Rollout and verification

Order matters — each step depends on the one before it.

1. **Turn on the durable queue first, alone.** `durableQueue: true` with `maxWorkers` still at 1. Nothing about throughput changes; you're establishing durability and confirming the queue DB has somewhere persistent to live. Verify the DB file appears and the Agent logs that it acquired the queue lease.
2. **Enable enhanced mode.** `enhanced=true` if the sender supports the two-step handshake, `enhanced=aa` if it doesn't. Confirm the sender is satisfied with the ACKs it receives. At this point the sender is unblocked but you're still draining serially — expect the queue to build under load. That's the expected intermediate state, not a failure.
3. **Validate your partition key against real traffic before enabling it.** Sample a representative window of your feed and confirm every ordering dependency you care about falls within a single key value. This is the step that protects data correctness; don't skip it.
4. **Set `logicalChannelKey`, then raise `maxWorkers`.** Both, together — either alone is the wrong configuration. Start conservative (8–16), watch queue depth drain, then raise toward `throughput × latency`.
5. **Size the outbound pool** if your Bots push downstream: `keepAlive: true` plus an explicit `maxClientsPerRemote`.

**What to watch.** [`Agent/$stats`](./stats.md) reports connection counts, queue depths, and RTT metrics on demand; `logStatsFreqSecs` writes the same picture to the Agent log on an interval. The signal that matters is **queue depth over time**: flat or draining means the pool is keeping up; monotonically rising means you are still accepting faster than you drain, and either `maxWorkers` is too low, your partition key is too coarse (too few distinct values to parallelize across), or the real constraint has moved downstream into the Bot or the server.

If raising `maxWorkers` stops helping, check the key's cardinality first. A key that yields only a handful of distinct values — `MSH-4` on a single-facility feed, for example — caps your effective concurrency at that number no matter how large the pool is.

## See also

- [Acknowledgement Modes](./acknowledgement-modes.md) — full treatment of Original, Enhanced, and AA modes
- [Agent Features](./features.md) — feature/version compatibility matrix
- [`Agent/$stats`](./stats.md) — runtime statistics
- [`Agent/$push`](./push.md) — outbound message delivery
- [Troubleshooting](./troubleshooting.md)
