# Medplum Agent — Durable Inbound HL7 Queue (SQLite)

Status: Draft implementation plan
Owner: Agent team (Derrick)
Target package: `packages/agent`
Companion changes: `packages/hl7` (Hl7Connection ACK-deferral API)

---

## 1. Background & Motivation

The Medplum Agent today buffers HL7 v2 traffic exclusively in JavaScript heap:

- `App.webSocketQueue: AgentMessage[]` — inbound channel messages waiting to be sent up to the Medplum server.
- `App.hl7Queue: AgentMessage[]` — outbound app-level ACKs waiting to be sent back to the source device.
- `AgentHl7Channel.lastSeqNo: number` — MSH.13 sequence counter when `assignSeqNo=true`.
- Pending `sendAndWait` callbacks in `Hl7MessageTracker`.

If the agent process crashes, is restarted by the upgrader, or is forcibly killed, any in‑flight inbound HL7 message is lost. Worse, in `enhanced=true` (standard enhanced mode) the underlying `Hl7Connection` already sent the sender a **commit ACK (CA)** on receipt (`packages/hl7/src/connection.ts:127-131`) — so the source system believes the message is safely persisted when in fact it never left RAM.

This plan replaces the in-memory inbound path with a durable, SQLite-backed FIFO that:

1. **Persists every inbound HL7 message on the same TCP turn** it is received, before any ACK is returned in enhanced mode.
2. **Drives per-channel serial processing** out of that table, so messages are forwarded to the Medplum server and ACKed back to the source in deterministic order, with full state observable on disk.
3. **Survives process restart** — queued rows resume; rows interrupted mid-forward are quarantined as `failed` for operator review.
4. **NACKs the source** (in enhanced mode) when storage fails or a duplicate control ID is rejected, instead of silently dropping data.

### 1.1 Goals

- Zero inbound HL7 message loss across crash/restart/upgrade once a `CA` has been returned to the sender.
- Honest enhanced-mode semantics: `CA` is only sent after the durable write commits.
- Auditable, time-ordered record of every message and its lifecycle.
- Bounded disk usage on long-running agents.
- Configuration via existing `Agent.setting[]` entries and per-channel URL query params — no new top-level FHIR fields.

### 1.2 Non-goals (this PR)

- Persisting outbound push (`agent:transmit:request`) traffic from server → device — those messages stay in memory and use the existing `Hl7ClientPool`. (Out-of-scope item §15.)
- Persisting non-channel control-plane WS messages (heartbeats, stats, logs, ping responses). They remain in `App.webSocketQueue`.
- Replacing `Hl7MessageTracker` (the outbound pending-ACK store). It continues to live in memory.

### 1.3 Decisions confirmed before drafting

| Decision | Choice |
|---|---|
| Durability scope | **Inbound only** (channel → server). Outbound stays in-memory. |
| Enhanced-mode ACK | **Defer CA until DB commit** — modify `@medplum/hl7` to expose explicit `ackCommit()` / `nackCommit()`. |
| Crash recovery | **Requeue `queued` rows; promote `processing` rows to `failed`** for manual review. |
| Duplicate control ID | **Configurable per channel** (`duplicateBehavior=reject\|idempotent`), defaulting to `idempotent`. |
| Serial processing scope | **Per channel.** Different channels proceed in parallel; within a channel, one message in-flight. |
| DB file location | **Single shared DB next to logs**, one file for the whole agent. |
| Retention | **Time + size cap**, both knobs configurable; `rejected`/`failed`/`undelivered` rows kept longer. |
| Outbound ACK correlation | **Persist on inbound row** so a crash between server response and source ACK can complete the ACK on recovery. |

---

## 2. High-level Architecture

```
                        ┌──────────────────────────────────────┐
   source device  ──►   │  AgentHl7Channel (per-port server)   │
   (HL7 over TCP)       │                                      │
                        │  on message:                         │
                        │   1. INSERT row (state=queued)       │  ┌─────────────────────────┐
                        │   2. on commit → connection.ackCommit│──►  inbound_hl7_messages   │
                        │      (sends CA in enhanced mode)     │  │  (SQLite, WAL, sync=NRM)│
                        │   3. on dup-reject / DB error →      │  └────────┬────────────────┘
                        │      connection.nackCommit (CR/AR)   │           │
                        └──────────────────┬───────────────────┘           │
                                           │ wake worker                   │
                                           ▼                               │
                        ┌──────────────────────────────────────┐           │
                        │  ChannelQueueWorker (1 per channel)  │◄──────────┘
                        │                                      │
                        │  loop:                               │
                        │   - SELECT next queued row           │
                        │   - UPDATE → processing              │
                        │   - send AgentTransmitRequest via WS │
                        │   - await agent:transmit:response    │  ┌─────────────────────────┐
                        │   - sendToRemote(app-level ACK)      │──►  Medplum server (WS)    │
                        │   - UPDATE → processed/rejected/failed│  └─────────────────────────┘
                        └──────────────────────────────────────┘
```

Key components introduced:

| New module | Responsibility |
|---|---|
| `src/queue/durable-queue.ts` | Owns the `node:sqlite` Database handle. Exposes typed CRUD: `enqueue`, `claimNext`, `markProcessed`, `markRejected`, `markFailed`, `setAckOutcome`, `recoverOnStartup`, `purge`. |
| `src/queue/schema.ts` | DDL + migration runner (versioned). |
| `src/queue/worker.ts` | `ChannelQueueWorker` — one per channel, serial dequeue loop. Wires WS responses back to the row. |
| `src/queue/types.ts` | `MessageState`, `InboundRow`, lifecycle event types. |
| `src/queue/retention.ts` | Background sweeper for time + size purge. |
| `packages/hl7/src/connection.ts` | New `setDeferredCommitAck(true)` mode + `ackCommit()` / `nackCommit(code, reason)` methods (see §6). |

---

## 3. Database Layout

### 3.1 File location

Default path:

```
<AgentLoggerConfig.logDir>/medplum-agent-queue.sqlite
```

The same `logDir` resolved by `cleanupLoggerConfig` in `src/logger.ts` is reused. Operators that override `logDir` via CLI/config get the queue alongside. The path is overridable by `Agent.setting[name=queueDbPath].valueString` (UUID-validated in `reloadConfig`). The DB file mode is `0600` (single user, writable by the agent service account).

A sidecar `medplum-agent-queue.sqlite-wal` and `-shm` are created by SQLite under WAL mode. Installer scripts and Dockerfile must include these in volume mounts / persistent paths.

### 3.2 Schema (v1)

```sql
-- _schema: tracks migration version
CREATE TABLE IF NOT EXISTS _schema (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL          -- ms epoch
);

CREATE TABLE IF NOT EXISTS inbound_hl7_messages (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_name       TEXT    NOT NULL,             -- AgentChannel.name
  remote             TEXT    NOT NULL,             -- "ip:port" of source device
  msg_control_id     TEXT,                         -- MSH.10 (nullable: parser may have failed)
  msg_type           TEXT,                         -- MSH.9 e.g. "ADT^A01"
  body               BLOB    NOT NULL,             -- raw HL7 message bytes (post-MLLP decode)
  encoding           TEXT,                         -- iconv encoding used on receipt
  enhanced_mode      TEXT,                         -- 'standard' | 'aaMode' | NULL
  state              TEXT    NOT NULL,             -- Bot leg; see §4
  attempt_count      INTEGER NOT NULL DEFAULT 0,
  callback_id        TEXT    NOT NULL,             -- "Agent/<agentId>-<uuid>" we sent on WS
  server_response_body  BLOB,                      -- raw agent:transmit:response body when received
  server_status_code INTEGER,                      -- statusCode from agent:transmit:response
  ack_outcome        TEXT    NOT NULL DEFAULT 'pending', -- source leg, independent of state; see §4
  last_error         TEXT,
  seq_no             INTEGER,                      -- MSH.13 assigned by agent (if assignSeqNo)
  received_at        INTEGER NOT NULL,             -- ms epoch (handleMessage entry)
  committed_at       INTEGER,                      -- ms epoch — write that triggered CA
  processing_started_at INTEGER,
  processed_at       INTEGER,                      -- terminal state timestamp
  errored_at         INTEGER
) STRICT;

-- Workers walk the queue in FIFO order, filtered by channel + state.
CREATE INDEX IF NOT EXISTS idx_inbound_channel_state_id
  ON inbound_hl7_messages (channel_name, state, id);

-- Retention sweeper scans by state+terminal time.
CREATE INDEX IF NOT EXISTS idx_inbound_state_processed_at
  ON inbound_hl7_messages (state, processed_at);

-- Duplicate detection (configurable, see §8). Partial unique to avoid blocking when
-- duplicateBehavior=idempotent or when MSH.10 is null.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_dup_active
  ON inbound_hl7_messages (channel_name, msg_control_id)
  WHERE msg_control_id IS NOT NULL
    AND state IN ('queued', 'processing');

-- Correlate WS callback IDs (what the server echoes back) to rows in O(1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_inbound_callback
  ON inbound_hl7_messages (callback_id);
```

Notes:

- `STRICT` (SQLite 3.37+) enforces declared column types — `node:sqlite` ships SQLite 3.45+, so this is safe.
- `body` is stored as `BLOB`, not `TEXT`, because incoming HL7 v2 may use non-UTF-8 encodings (per `encoding` query param). Decoding for forwarding happens at process-time, after recording the wire-truth.
- `idx_inbound_callback` lets the WS response handler look up the row by `command.callback` in constant time when `agent:transmit:response` arrives.
- The partial unique index on `(channel_name, msg_control_id)` only enforces dedupe while a prior copy is still **in flight**. Once a message reaches a terminal state, a same-control-ID retry is allowed and handled by the `duplicateBehavior` policy (§8).

### 3.3 Migrations

`schema.ts` exports `MIGRATIONS: Array<{ version: number; sql: string; }>`. The Database wrapper:

1. On open, reads `MAX(version)` from `_schema`.
2. Within a single transaction, applies every higher-numbered migration in order.
3. Inserts the new version row with `applied_at = Date.now()`.

Initial migration (v1) is the DDL above. Subsequent migrations are append-only — never edited in place.

---

## 4. Message Lifecycle

A row's disposition lives on **two independent axes**, because the two network
legs fail independently:

- **Bot leg** — `state` — the message's journey to the Medplum server and back,
  plus the worker scheduling lifecycle.
- **Source leg** — `ack_outcome` — whether the app-level ACK made it back to the
  sending device.

The cell that motivates the split: the Bot can accept a message (2xx) while the
source connection has already closed, so the ACK can't be returned. That is
`processed` + `undelivered` — **not** a Bot-leg failure, and never re-dispatched
(the Bot already has it). It recovers when the source retransmits, which replays
the stored ACK (§8) and flips the row to `delivered`.

```
                ┌───────────┐
                │  (new)    │
                └─────┬─────┘
                      │ INSERT (channel.handleMessage, before CA)
                      ▼
                ┌───────────┐
   recovery ───►│  queued   │◄──── (startup: requeue prior queued)
                └─────┬─────┘
                      │ worker: claim
                      ▼
                ┌───────────┐
                │processing │
                └─┬──┬──┬───┘
   server 4xx ────┘  │  └──────── 5xx/429/timeout, or crash before write
   (permanent)       │                          │
        ▼            │                          ▼
   ┌──────────┐      │                   ┌────────────┐
   │ rejected │      │                   │   failed   │ (transient/ambiguous;
   └──────────┘      │                   └────────────┘  interrupted rows land
                     ▼                                    here on startup — §10)
   ┌─────────┐  server 2xx → state=processed; ack leg recorded separately:
   │processed│      ack_outcome = delivered (ACK sent) | undelivered (source gone)
   └────┬────┘                                    │
        │ retention sweeper                        │ source retransmit → replay
        │ (delivered/not_owed only;                │ (handleDuplicate, §8)
        │  undelivered is floor-protected)         ▼
        ▼                                   ack_outcome = delivered
     (purged)
```

**Bot-leg states** (`state`), exhaustively:

| State | Set when | Set by | Terminal? |
|---|---|---|---|
| `queued` | row inserted, before WS send; OR a retryable failure was scheduled for auto-retry (`next_attempt_at` set, see §4.1) | `DurableQueue.enqueue`, `DurableQueue.scheduleRetry` | no |
| `processing` | worker has claimed it and dispatched `agent:transmit:request` | `ChannelQueueWorker.claimNext` | no |
| `processed` | server returned 2xx (the Bot accepted it). Says nothing about the source ACK — see `ack_outcome` | `ChannelQueueWorker.markProcessed` | yes |
| `rejected` | server returned a permanent 4xx (other than 429), or a definitive upstream HL7 reject (AR/CR) in guaranteed mode — the message itself was rejected; retrying can never help | `ChannelQueueWorker.markRejected` | yes (never retried) |
| `failed` | transient/ambiguous Bot-leg failure: 5xx, 429, response timeout, dispatch error, or row found in `processing` on startup (interrupted). Default (guaranteed) mode retries all of these; normal mode retries only the transient codes and leaves the ambiguous ones here for review (see §4.1) | `ChannelQueueWorker.markFailed` + `DurableQueue.recoverOnStartup` | yes (retry/review candidate) |
| `nacked` | the row was rejected at intake (DB error, duplicate-reject, malformed) before it ever queued — audit only | `DurableQueue.enqueueRejected` | yes |

**Source-leg outcomes** (`ack_outcome`), exhaustively:

| Outcome | Meaning | Set by |
|---|---|---|
| `pending` | owed but not yet resolved (the default while queued/processing; also left on interrupted `failed` rows where the leg is genuinely unknown) | default / `recoverOnStartup` |
| `delivered` | the source received the app-level ACK (incl. policy-suppressed no-op sends); also set when a retransmit replays a previously-undelivered ACK | `markProcessed(…, DELIVERED)` / `setAckOutcome` |
| `undelivered` | the Bot accepted the message but the ACK couldn't reach the source (connection closed) — the actionable signal | `markProcessed(…, UNDELIVERED)` |
| `not_owed` | no app-level ACK will be delivered: intake-`nacked`, or the Bot leg ended `rejected`/`failed` | `enqueueRejected` / `markRejected` / `markFailed` |

`nacked` is distinct from the Bot-leg failures. `rejected`/`failed` rows have a
`committed_at` (we successfully ACKed CA, then later failed downstream).
`nacked` rows have `ack_outcome='not_owed'` with a non-AA code and no
`committed_at` — they exist for forensics but were never told to the sender as
committed.

The split is also what keeps the (future) Path-2 retry layer safe: it re-dispatches
`failed` rows only, never `rejected` (can't help) and never `processed` +
`undelivered` (the Bot already has it — re-dispatching would double-process
upstream and loop against the dead source). If the worker crashes between the
server response and sending the app-level ACK, the row is in `processing` on
restart and goes to `failed` (`interrupted`); it preserves `server_response_body`
and `server_status_code` so an operator can manually replay the ACK if needed.

> **Why the retry layer gates on the error code, not the `failed` state (§4.1):**
> `failed` is not uniform — it spans *transient* codes (`server-error`/5xx,
> `server-rate-limited`/429) and *ambiguous* codes (`response-timeout`,
> `interrupted`, `worker-stopped`, `dispatch-failed`). Only the **transient** codes
> are safe to auto-redispatch: for them the request provably did not produce a
> result, so retrying can't double-process. The **ambiguous** codes mean the server
> *may* have processed the message and the result/response was lost —
> auto-redispatching risks duplicate upstream processing. So the retry policy gates
> on the error code, not on the `failed` state alone: auto-retry transient codes;
> leave ambiguous ones for operator review (or unblock them with server-side
> callback-keyed dedupe — see the risk table in §16 — which would make redispatch
> idempotent and therefore safe for the ambiguous codes too). The `QueueErrorCode`
> enum records the transient-vs-ambiguous classification for exactly this purpose,
> and `RETRYABLE_ERROR_CODES` is the transient subset the worker keys off of.

### 4.1 Auto-retry and guaranteed delivery

Every post-commit failure is classified at the failure site with a `QueueErrorCode` (stored in `error_code` — never derived by parsing `last_error`). The retry policy keys off this code, **not** the `failed` state, because `failed` holds both transient and ambiguous codes.

> **The default is guaranteed-delivery mode** (the right column below). This is a deliberate, historical choice: the Medplum server's agent WebSocket transmit handler (`packages/server/src/ws/agent.ts`) collapses **every** Bot-execution failure to HTTP `400` and does not disambiguate a permanent rejection from a transient/ephemeral one. With no reliable transient-vs-permanent signal from the server, the only safe default is to assume any error might be ephemeral and keep retrying — otherwise a genuinely retryable failure would be silently dropped, defeating the durable queue. The cost is possible duplicate delivery. Operators who need exactly-once should either opt out per channel (`guaranteedDelivery=false`, the left column) or **dedupe in their Bot** — e.g. record processed message control IDs (MSH-10) on a FHIR resource such as `MessageHeader` and skip a control ID that has already been handled. Once the server differentiates status codes (5xx/429 for transient, 4xx for permanent — the agent already classifies these, see `classifyStatusCode`), normal mode becomes a safe default again.

| Code | Class | Normal mode | Guaranteed mode | Meaning |
|---|---|---|---|---|
| `server-error` | transient | retry | retry | server returned 5xx |
| `server-rate-limited` | transient | retry | retry | server returned 429 |
| `response-timeout` | ambiguous | terminal → `failed` | retry | timed out waiting for the server response; delivery unknown |
| `interrupted` | ambiguous | terminal → `failed` | requeued at startup | row found in `processing` at startup |
| `worker-stopped` | ambiguous | terminal → `failed` | retry | in-flight dispatch cancelled by worker shutdown |
| `dispatch-failed` | ambiguous | terminal → `failed` | retry | dispatch failed for an unclassified reason |
| `server-rejected` | permanent | terminal → `rejected` | retry | server returned non-429 4xx with no definitive HL7 ACK |
| `upstream-error` | (guaranteed only) | n/a | retry | upstream answered MSA-1 of AE/CE (application/commit error) |
| `upstream-rejected` | permanent | n/a | terminal → `rejected` | upstream answered MSA-1 of AR/CR — definitive reject |

A failed *source ACK* (the Bot accepted the message but we couldn't return the ACK) is deliberately absent from this table: it is **not** a Bot-leg failure and never enters the retry path. It is recorded on the `ack_outcome` axis as `processed` + `undelivered` and recovers via a source retransmit (§8) — re-dispatching would double-process.

**Normal mode** (`guaranteedDelivery=false`, opt-out): only the **transient** codes in `RETRYABLE_ERROR_CODES` retry — a retry can never cause duplicate delivery, because the server provably never accepted the message. The ambiguous codes stay in `failed` for operator review (never silently re-dispatched), and permanent codes land in `rejected`. Note that with today's 400-only server (above), normal mode treats nearly every Bot failure as a permanent `rejected` and its transient auto-retry is effectively dormant — which is exactly why it is *not* the default. This mode becomes the safe default once the server differentiates status codes.

**Guaranteed-delivery mode** (`guaranteedDelivery`, **on by default** — see the note above): the channel keeps dispatching until upstream gives a definitive HL7 answer for the message — MSA-1 of AA/CA (→ `processed`) or AR/CR (→ `rejected`) — explicitly accepting duplicate-delivery risk on the way, **including for the ambiguous codes**. The worker parses MSA-1 from the server response body; AE/CE and all transport/HTTP failures retry. The channel's setting is snapshotted onto each row at intake (`guaranteed_delivery` column) so `recoverOnStartup` — which runs before channel policies are resolved — requeues interrupted guaranteed rows instead of failing them: the guarantee survives restarts. Requires `autoRetry`; `guaranteedDelivery` with `autoRetry=false` is forced off (warned only when set explicitly, since the default-on value is dropped silently). It implies `maxAttempts = 0` (unlimited); an explicitly configured nonzero `autoRetryMaxAttempts` conflicts — we warn and respect the cap, at which point delivery is no longer strictly guaranteed.

On a retry decision, `ChannelQueueWorker.handleFailure` calls `DurableQueue.scheduleRetry`: the row returns to `queued` with `next_attempt_at = now + min(maxDelayMs, baseDelayMs * multiplier^(attempt-1))`. Otherwise the row lands on its terminal state by classification — `rejected` for permanent codes, `failed` for everything else — with `error_code` recorded either way.

Retries are **head-of-line blocking**: `claimNext` still selects the lowest-id `queued` row but returns nothing while that head row's `next_attempt_at` is in the future, so younger rows cannot skip ahead — preserving the per-channel FIFO guarantee (§1.1). A poison message blocks its channel only until `maxAttempts` exhausts (indefinitely in guaranteed mode — that is the contract). `attempt_count` keeps its meaning ("times the message could have reached the server"); `scheduleRetry` does not touch it because `claimNext` already counted the attempt.

---

## 5. SQLite Configuration (`node:sqlite`)

`node:sqlite` is shipped stable in Node 24 and behind `--experimental-sqlite` in Node 22.18+; `package.json` already requires `^22.18.0 || >=24.2.0`. For Node 22 we'll set `NODE_OPTIONS=--experimental-sqlite` in the SEA bootstrap, or detect at runtime and surface a clear error.

```ts
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(dbPath, { open: true, enableForeignKeyConstraints: true });

// PRAGMAs ordered for max single-writer throughput + crash safety.
db.exec(`
  PRAGMA journal_mode = WAL;        -- writer doesn't block readers
  PRAGMA synchronous  = NORMAL;     -- fsync only at checkpoint; with WAL this is durable across
                                    -- process crash, only at risk for power loss between checkpoints.
                                    -- The HL7 sender's CA contract requires durability across our
                                    -- crash (which we have); power loss is an OS/HW concern.
  PRAGMA temp_store   = MEMORY;
  PRAGMA cache_size   = -65536;     -- 64 MiB page cache
  PRAGMA mmap_size    = 268435456;  -- 256 MiB mmap (read path)
  PRAGMA wal_autocheckpoint = 1000; -- pages
  PRAGMA busy_timeout = 5000;       -- ms — defensive; we only have one writer process
  PRAGMA foreign_keys = ON;
`);
```

Notes:

- **One Database handle for the whole process.** `node:sqlite` is synchronous; opening one connection and using prepared statements is faster than pooling. All channel workers and the channel intake share it.
- **Writer concurrency**: SQLite allows only one writer at a time; with WAL, readers don't block. Our write rate is bounded by inbound HL7 message rate; even 5–10k msgs/sec sustained is well within SQLite WAL throughput. Workers and intake are serialized at the SQL layer, which is exactly what we want for FIFO ordering.
- **Prepared statements** are created once at queue construction time and reused. All hot paths use them (`enqueueStmt`, `claimNextStmt`, `markProcessedStmt`, `markBotFailedStmt`, `setAckOutcomeStmt`, `findByCallbackStmt`).
- **Checkpoint cadence**: WAL auto-checkpoints every 1000 pages (~4 MB). For very busy agents, we add a periodic `PRAGMA wal_checkpoint(TRUNCATE)` every 60s in the retention sweeper to keep the WAL file bounded.
- **Synchronous IO**: `node:sqlite` is synchronous and runs on the main thread. The hot path (`enqueue` + commit) is a single INSERT, typically <1 ms on local SSD — acceptable for the message handler. If profiling shows tail latency issues we can move the writer to a Worker Thread, but YAGNI for v1.

### 5.1 Why not better-sqlite3?

The user requested `node:sqlite` specifically. It's the same C library, comparable performance, and ships with Node — eliminating one native dependency that would have to be cross-compiled per platform for the agent's SEA build. This is a meaningful packaging simplification.

---

## 6. Enhanced-mode ACK Deferral (`@medplum/hl7` changes)

### 6.1 Current behavior (to be changed)

`packages/hl7/src/connection.ts:123-135` runs as a listener on `'message'`:

```ts
if (this.enhancedMode === 'standard') {
  response = event.message.buildAck({ ackCode: 'CA' });
} else if (this.enhancedMode === 'aaMode') {
  response = event.message.buildAck({ ackCode: 'AA' });
}
if (response) {
  this.send(response);
  this.dispatchEvent(new Hl7EnhancedAckSentEvent(this, response));
}
```

This fires synchronously, before any application code, every time the parser yields a message. There's no hook to defer it.

### 6.2 Proposed API

Add to `Hl7Connection`:

```ts
/**
 * When true, the connection will NOT auto-send CA/AA on message receipt.
 * The application MUST call `ackCommit(message)` or `nackCommit(message, code, reason)`
 * after persisting the message. Only meaningful when enhancedMode is set.
 */
setDeferredCommitAck(deferred: boolean): void;

/**
 * Send the configured commit ACK (CA in standard, AA in aaMode) for `message`.
 * Idempotent: a second call for the same MSH.10 is a no-op.
 */
ackCommit(message: Hl7Message): void;

/**
 * Send a negative commit ACK, with an optional human-readable reason recorded
 * in MSA.3. The *error* codes are retryable (the peer may retransmit and could
 * succeed); the *reject* codes are terminal (a retransmit fails identically):
 *   'CE' — Commit Error (standard enhanced): retryable, e.g. a transient storage error.
 *   'AE' — App-level Error (aaMode): retryable.
 *   'CR' — Commit Reject (standard enhanced): terminal, e.g. a rejected duplicate.
 *   'AR' — App-level Reject (aaMode): terminal.
 * Retryable codes do NOT consume the already-acked slot, so the eventual
 * successful retry can still send its commit ACK.
 */
nackCommit(message: Hl7Message, code: 'CR' | 'CE' | 'AR' | 'AE', reason?: string): void;
```

Implementation:

1. The `'message'` listener checks `this.deferredCommitAck`. If true, it skips the auto-send block but still goes through the `pendingMessages` / `returnAck` logic for outbound `sendAndWait` paths (which is unaffected — that's an inbound vs. outbound concern).
2. `ackCommit` / `nackCommit` reuse `event.message.buildAck({ ackCode, ... })` and call `this.send()`. They dispatch `Hl7EnhancedAckSentEvent` so existing observers (`channel.handleEnhancedAckSent` in `hl7.ts:267`) keep working.
3. A short-lived `Set<string>` of "already CA-acked MSH.10s" prevents double-ACK if `ackCommit` is called twice (e.g. enqueue retry that internally idempotent-resolves).

### 6.3 Backward compatibility

`deferredCommitAck` defaults to `false`. All existing callers (and `enhanced=true` channels not yet opted into the durable queue) keep their current behavior. The agent opts in per channel only when `durableQueue` is enabled (see §7).

### 6.4 aaMode subtlety

In `enhancedMode=aaMode`, the sender expects an **AA** as the immediate ACK; there is no separate app-level AA that follows. With deferral on:

- On successful commit, send AA.
- On a *storage* failure, send AE (Application Error) — the retryable code. The failure is transient (disk full, DB locked), so we want the sender to retransmit; because we never committed, the resend is accepted fresh. On a terminal *rejection* (duplicate), send AR — a hard reject the sender must not retry.

We document this behavior change clearly in the channel URL `enhanced=aa` docs.

---

## 7. Configuration Surface

Existing `Agent.setting[]` array continues to be the project-settings carrier. New entries:

| Setting name | Type | Default | Meaning |
|---|---|---|---|
| `durableQueue` | `valueBoolean` | `true` (after rollout) / `false` (initial release, behind flag) | Master switch. When `false`, agent behaves exactly as today (in-memory queues, immediate CA). When `true`, all HL7 channels route through SQLite. |
| `queueDbPath` | `valueString` | `<logDir>/medplum-agent-queue.sqlite` | Absolute path override for the DB file. |
| `queueRetentionDays` | `valueInteger` | `7` | Delete fully-done `processed` rows (ACK delivered/not-owed) older than this. |
| `queueRetentionMaxMb` | `valueInteger` | `512` | Soft cap on DB size. When exceeded, sweeper deletes oldest fully-done `processed` first, then oldest floor-protected rows — `rejected`/`failed`/`nacked` and `processed`+`undelivered` (with safeguard: minimum errored-floor retention regardless of size cap). |
| `queueErroredRetentionDays` | `valueInteger` | `90` | Floor for `rejected`/`failed`/`nacked` and `processed`+`undelivered` retention. |
| `queueSweepIntervalSecs` | `valueInteger` | `3600` | How often the retention sweeper runs. |
| `channelAutoRetry` | `valueBoolean` | `true` | Agent-wide default for auto-retry of retryable dispatch failures (§4.1). On by default; set `false` to opt out. |
| `channelGuaranteedDelivery` | `valueBoolean` | `true` | Agent-wide default for guaranteed-delivery mode (§4.1). On by default while the server returns 400 for every failure (see §4.1); set `false` to opt into normal mode and dedupe in your Bot. Requires auto-retry. |
| `channelAutoRetryBaseDelayMs` | `valueInteger` | `1000` | Delay before the first retry. |
| `channelAutoRetryMaxDelayMs` | `valueInteger` | `60000` | Cap on the computed backoff delay. |
| `channelAutoRetryMaxAttempts` | `valueInteger` | `0` when guaranteed (the default); `10` in normal mode | Total dispatch attempts before a retryable failure becomes terminal; `0` = retry indefinitely. |
| `channelAutoRetryBackoffMultiplier` | `valueDecimal` | `2` | Exponential base; `1` = fixed-interval retry. |

Per-channel URL query parameters (parsed in `configureHl7ServerAndConnections`, like existing `enhanced`, `encoding`, etc.):

| Param | Values | Default | Meaning |
|---|---|---|---|
| `duplicateBehavior` | `reject` \| `idempotent` | `idempotent` | What to do when a row with the same `(channel, MSH.10)` is still in `queued` or `processing`. `reject` sends `CR` (enhanced) / `AR` (aaMode) and inserts a `nacked` row; `idempotent` returns the prior stored ACK (or a synthetic AA) and does not re-insert. |
| `autoRetry` | `true` \| `false` | agent setting | Per-channel override of `channelAutoRetry`. Auto-retry requires the durable queue; configuring it explicitly with the queue off logs a warning and has no effect. |
| `guaranteedDelivery` | `true` \| `false` | agent setting (default `true`) | Per-channel override of `channelGuaranteedDelivery` (§4.1). Conflicts: `autoRetry=false` wins (guaranteedDelivery forced off — warned only if it was set explicitly, since the default-on value is dropped silently); explicit nonzero `autoRetryMaxAttempts` wins over the implied unlimited attempts (warn, respect the cap). |
| `autoRetryBaseDelayMs` | number ≥ 1 | agent setting | Per-channel override of `channelAutoRetryBaseDelayMs`. |
| `autoRetryMaxDelayMs` | number ≥ 1 | agent setting | Per-channel override of `channelAutoRetryMaxDelayMs`. |
| `autoRetryMaxAttempts` | number ≥ 0 | agent setting | Per-channel override of `channelAutoRetryMaxAttempts`; `0` = retry indefinitely. |
| `autoRetryBackoffMultiplier` | number ≥ 1 | agent setting | Per-channel override of `channelAutoRetryBackoffMultiplier`. |

Auto-retry resolution is per-field: endpoint URL param → agent `channelAutoRetry*` setting → built-in default (see `resolveRetryPolicy` in `hl7.ts`). Invalid values warn and fall through to the next layer.

`Agent.setting` is the established pattern (see memory `[[feedback_project_settings_pattern]]`).

---

## 8. Inbound Flow (Annotated)

The runtime path replacing today's `AgentHl7ChannelConnection.handleMessage` (`hl7.ts:228-260`).

```
1. Hl7Server parses bytes off the wire.
2. Hl7Connection fires 'message' (deferred CA mode → no auto-CA yet).
3. AgentHl7ChannelConnection.handleMessage:
   a. Parse MSH.10 (control ID), MSH.9 (type), MSH.13 (seq, if assignSeqNo).
   b. Generate callbackId = "Agent/<agentId>-<uuid>".
   c. queue.enqueueOrHandleDuplicate({...}) — synchronous SQLite call.
        - On unique-index conflict + duplicateBehavior=idempotent: load prior row,
          replay its stored ACK to the source (if available) via connection.ackCommit
          or send synthetic AA, do NOT re-insert, return early. No CA via the deferred
          API needed — we're literally re-asserting the prior commit promise.
        - On unique-index conflict + duplicateBehavior=reject: connection.nackCommit(
          msg, 'CR', 'duplicate control id'); INSERT a `nacked` audit row; return.
        - On other DB error: connection.nackCommit(msg, 'CE', errorMessage)
          (retryable — a storage error is transient, so the peer may retransmit);
          attempt INSERT of a `nacked` row best-effort (different DB handle session
          to avoid cascading on a transient error). Return.
   d. On successful INSERT → connection.ackCommit(message). Source now holds a
      durable CA. committed_at column set.
   e. Notify the channel's ChannelQueueWorker that work is available (in-memory wake
      signal, see §9).
4. Worker picks it up serially (see §9).
```

Failure handling matrix:

| Failure point | Source sees | Row state |
|---|---|---|
| Body parse fails before INSERT (no MSH.10) | `CR`/`AR` (nackCommit with 'malformed') in enhanced mode; nothing in standard mode (current behavior) | `nacked` (with `msg_control_id=NULL`, `last_error='unparseable'`) — best effort |
| INSERT fails (disk full, permission, corrupted DB) | `CE`/`AE` (nackCommit with 'storage error') — retryable, so the peer can retransmit | best-effort `nacked` write to a separate journal log file (DB is presumed unwritable) |
| Duplicate (reject mode) | `CR`/`AR` (nackCommit with 'duplicate') — terminal | `nacked` |
| Duplicate (idempotent mode) | prior stored ACK (or synthetic AA) | none (no new row) |
| INSERT succeeds | `CA`/`AA` (ackCommit) | `queued` |

---

## 9. Per-channel Worker

```ts
class ChannelQueueWorker {
  constructor(
    private readonly channelName: string,
    private readonly app: App,
    private readonly queue: DurableQueue,
  );

  // Called from channel intake after a successful enqueue.
  // Idempotent: if a tick is in flight or scheduled, no-op.
  notify(): void;

  // Called when an agent:transmit:response arrives (in app.ts WS handler).
  onServerResponse(row: InboundRow, response: AgentTransmitResponse): void;

  start(): void;
  stop(): Promise<void>;
}
```

Worker tick algorithm:

```
loop:
  if stopped: return
  row = queue.claimNext(channelName)        // single UPDATE ... RETURNING the next
                                             // queued row, sets state=processing,
                                             // processing_started_at, attempt_count++
  if row is null: await notification or 250 ms timeout → continue
  pendingResponse = new Deferred<AgentTransmitResponse>()
  workerPending.set(row.callback_id, { row, pendingResponse })
  app.addToWebSocketQueue({
    type: 'agent:transmit:request',
    channel: row.channel_name,
    remote: row.remote,
    contentType: ContentType.HL7_V2,
    body: row.body.toString(row.encoding ?? 'utf8'),
    callback: row.callback_id,
    accessToken: 'placeholder',
  })

  try:
    response = await pendingResponse.promise   // resolved by app.ts when WS reply arrives,
                                               // looked up by callback_id
    queue.recordServerResponse(row.id, response.statusCode, response.body)
    if response.statusCode >= 400:
      // Bot-leg failure: permanent 4xx → rejected (never retried);
      // 5xx/429 → failed (transient, retry/review). Both: ack not owed.
      if classify(response.statusCode) == ServerRejected:
        queue.markRejected(row.id, response.body, 'server-rejected')
      else:
        queue.markFailed(row.id, response.body, classify(response.statusCode))
      continue
    // Bot accepted (2xx): the row is `processed` regardless of the source leg.
    // Forward the app-level ACK back to the source and record the SOURCE-LEG
    // outcome independently — a closed connection is `undelivered`, never a
    // Bot-leg error, and is never re-dispatched (recovers via source retransmit).
    channel = app.channels.get(row.channel_name) as AgentHl7Channel
    sentOk = channel.sendToRemote(response)    // synchronous-returning bool
    queue.markProcessed(row.id, sentOk ? DELIVERED : UNDELIVERED)
  catch err:
    // Dispatch-leg failure (timeout, worker-stopped, unclassified) is always
    // transient/ambiguous → failed, never rejected.
    queue.markFailed(row.id, normalizeErrorString(err), DispatchFailed)
```

Notes:

- **One worker per channel**, owned by `AgentHl7Channel`. Started in `start()`, stopped in `stop()`. Channel close drains its worker before closing the TCP server.
- **Cross-process correlation by `callback_id`**, not by message control ID — the server echoes whatever `callback` we send. We mint a UUID-based callback per row, indexed.
- **WS dispatch is queued** (not synchronous) — `addToWebSocketQueue` still drives the existing `webSocketQueue` for actual transport. The durable queue is the *source of truth*; the in-memory WS queue is just a fan-out buffer that gets re-filled from SQLite on restart for `queued` rows.
- **On WS disconnect** while a row is `processing`, the worker checks whether its `agent:transmit:request` is still sitting unsent in the in-memory WS queue. If it is, the server provably never saw it — the request is removed and the row is returned to `queued` (`DurableQueue.requeue`, which also un-counts the attempt), so it retries on reconnect with zero duplicate-delivery risk. If the request already went out on the wire, delivery is ambiguous (the server may have processed it and the response was lost) and the row is left to the response timeout → `failed` — same conservative stance as `recoverOnStartup`.
- **Backpressure**: while the WS is disconnected (`app.isLive() === false`), the worker loop idles without claiming rows — no dispatch is started, no response timer runs. Rows accumulate in `queued` — that's exactly the point. On `agent:connect:response` the app notifies every channel worker so draining starts immediately.

### 9.1 Wiring server responses back to rows

`app.ts` `case 'agent:transmit:response'` becomes:

```ts
case 'agent:transmit:response': {
  // First, try the durable-queue path: any callback that maps to a known row.
  const claimed = this.queueWorkers?.routeServerResponse?.(command);
  if (claimed) break;
  // Fallback: legacy ping path or other non-durable callbacks → existing logic.
  if (this.config?.status !== 'active') { ... } else { this.addToHl7Queue(command); }
  break;
}
```

`routeServerResponse` does a single indexed `SELECT id, channel_name FROM inbound_hl7_messages WHERE callback_id = ?`, finds the channel worker, and resolves its `pendingResponse`.

---

## 10. Crash Recovery

`DurableQueue.recoverOnStartup()` runs once after migrations, before any channel starts:

```sql
-- 1. Any row in `processing` is suspect — we don't know if the Bot processed it
--    or whether the source ACK was owed/sent. It lands in `failed` (interrupted),
--    the retry/review bucket, with ack_outcome left `pending` (genuinely unknown).
UPDATE inbound_hl7_messages
   SET state = 'failed',
       errored_at = $now,
       last_error = COALESCE(last_error, 'interrupted: process restart while processing'),
       error_code = COALESCE(error_code, 'interrupted')
 WHERE state = 'processing';

-- 2. `queued` rows resume automatically — the worker will pick them up.
-- (No DDL change; just here for clarity.)
```

Recovery emits a single info log: `Recovered N queued rows; M rows promoted to failed (interrupted)`.

Operator playbook for `failed`/`rejected` rows (documented in `packages/agent/README.md`):

- Inspect: `sqlite3 medplum-agent-queue.sqlite "SELECT id, channel_name, msg_control_id, state, error_code, last_error FROM inbound_hl7_messages WHERE state IN ('failed','rejected') AND errored_at > <recent>;"`
- Find messages processed upstream but whose ACK never reached the source: `... WHERE state='processed' AND ack_outcome='undelivered';`
- Replay: a future `medplum-agent-replay <id>` CLI (out of scope for v1) would reset state to `queued`. For v1 we document the SQL: `UPDATE inbound_hl7_messages SET state='queued', attempt_count=0 WHERE id=?;` (only `failed` rows — never `rejected`, and never `processed`+`undelivered`, whose Bot leg already succeeded).

---

## 11. Retention & Disk Management

`RetentionSweeper` runs on `queueSweepIntervalSecs` interval (default 1h):

```sql
-- Phase 1: delete FULLY-DONE processed rows beyond the retention window. A
-- processed row whose ACK never reached the source (ack_outcome='undelivered')
-- is NOT fully done — it's protected here and falls under the errored floor.
DELETE FROM inbound_hl7_messages
 WHERE state = 'processed'
   AND ack_outcome != 'undelivered'
   AND processed_at < $now - $retentionMs;

-- Phase 2: if DB still over size cap, delete oldest fully-done processed rows
-- until under. (Bounded loop; we never touch rejected/failed/nacked/undelivered here.)

-- Phase 3: only if still over cap AND the oldest floor-protected row is older
-- than the floor, delete oldest beyond floor — rejected/failed/nacked, plus
-- processed rows still `undelivered`. Ordered by COALESCE(errored_at, processed_at).
DELETE FROM inbound_hl7_messages
 WHERE (state IN ('rejected', 'failed', 'nacked')
        OR (state = 'processed' AND ack_outcome = 'undelivered'))
   AND COALESCE(errored_at, processed_at) < $now - $erroredRetentionMs
   AND id IN (SELECT id FROM ... LIMIT N);

-- Phase 4: checkpoint WAL to actually reclaim space.
PRAGMA wal_checkpoint(TRUNCATE);

-- Phase 5: opportunistic VACUUM if fragmentation > threshold (run rarely).
```

Disk-size measurement: `SELECT page_count * page_size FROM pragma_page_count, pragma_page_size`.

The sweeper logs counts deleted per phase and current DB size for observability.

---

## 12. Observability

### 12.1 Stats (extends `App.getStats()`)

Add to `AgentStats` (defined in `@medplum/core`):

```ts
durableQueue?: {
  enabled: boolean;
  dbSizeBytes: number;
  countsByState: { queued: number; processing: number; processed: number; rejected: number; failed: number; nacked: number };
  channelDepth: Record<string, { queued: number; processing: number; oldestQueuedAgeMs: number | null }>;
  lastSweepAt: number | null;
  lastSweepDeleted: { processed: number; errored: number };
};
```

Surfaced via the existing `agent:stats:request` flow (no protocol change required because `AgentStats` is `{ [k]: unknown }`-extensible).

### 12.2 Logging

- INFO: enqueue (msg control id + row id), commit-ack sent, server response received, processed.
- WARN: duplicate rejected, duplicate idempotent-replayed, ACK to source failed.
- ERROR: storage error (DB write failed), unexpected state, recovery promoted rows.

Reuses existing `ILogger` (`channelLog` for per-message, `log` for queue/sweeper meta).

### 12.3 Existing channel stats integration

`ChannelStatsTracker` (`channel-stats-tracker.ts`) already tracks messages sent/ACK received. We extend it with `messagesPersisted` and `messagesPromotedToErrored` counters that snapshot from the queue on each heartbeat — no double counting because they're orthogonal dimensions.

---

## 13. Code Changes (file-by-file)

**New:**
- `packages/agent/src/queue/types.ts` — `MessageState`, `InboundRow`, etc.
- `packages/agent/src/queue/schema.ts` — DDL + `MIGRATIONS`.
- `packages/agent/src/queue/durable-queue.ts` — `DurableQueue` class (opens DB, prepared statements, all CRUD).
- `packages/agent/src/queue/worker.ts` — `ChannelQueueWorker`.
- `packages/agent/src/queue/retention.ts` — `RetentionSweeper`.
- `packages/agent/src/queue/durable-queue.test.ts` — unit tests (see §14).
- `packages/agent/src/queue/worker.test.ts` — worker behavior tests.
- `packages/agent/src/queue/retention.test.ts` — retention/purge tests.

**Modified:**
- `packages/hl7/src/connection.ts` — add `setDeferredCommitAck`, `ackCommit`, `nackCommit`, internal `ackedControlIds: Set<string>` (sized-bounded, e.g. last 10k), suppress auto-CA when deferred.
- `packages/hl7/src/connection.test.ts` — cover deferred mode, double-ack idempotency, AR/CR semantics in aaMode.
- `packages/hl7/src/index.ts` — export new types.
- `packages/agent/src/app.ts` —
  - On construction, open `DurableQueue` if `durableQueue` setting is on.
  - In WS message handler, route `agent:transmit:response` through the worker first (§9.1).
  - On `stop()`, drain workers, close DB, close retention sweeper.
  - In `reloadConfig`, propagate `queueDbPath`, retention settings, etc.
- `packages/agent/src/hl7.ts` —
  - `AgentHl7Channel.start()` instantiates a `ChannelQueueWorker`; `stop()` drains it.
  - `configureHl7ServerAndConnections()` calls `setDeferredCommitAck(true)` on each `Hl7Connection` when `app.queue` exists.
  - Parse new `duplicateBehavior` query param (default `idempotent`).
  - `AgentHl7ChannelConnection.handleMessage()` becomes the §8 flow: persist → ackCommit → notify worker. `sendToRemote()` returns `boolean` so the worker can detect failure.
- `packages/agent/src/channel.ts` (`BaseChannel`) — extend interface with `sendToRemote(msg): boolean` (returns success).
- `packages/agent/package.json` — no new deps (Node built-in). Ensure SEA bootstrap passes `--experimental-sqlite` on Node 22.
- `packages/agent/esbuild.mjs` — mark `node:sqlite` as external (it is by default for `node:` prefix).

**Docs:**
- `packages/agent/README.md` — section "Durable queue" with operator runbook (recovery, replay, DB inspection).

---

## 14. Test Strategy

### 14.1 Unit tests

`durable-queue.test.ts`:
- enqueue + read back, with binary body roundtrip.
- duplicate insert in `reject` mode throws `SqliteError` with `SQLITE_CONSTRAINT_UNIQUE`.
- duplicate insert in `idempotent` mode returns prior row.
- `claimNext` returns FIFO order per channel; ignores other channels' rows.
- `claimNext` returns `null` when no `queued` rows for that channel.
- `markProcessed` / `markRejected` / `markFailed` / `setAckOutcome` / `recordServerResponse` set the right state, ack_outcome, and timestamps and don't disturb other rows.
- `recoverOnStartup` promotes `processing` → `failed` (interrupted, ack_outcome left `pending`), leaves `queued` untouched, is idempotent (re-running yields zero changes).
- Schema migration: open against an empty file (v0) → ends at v1. Re-open is a no-op.

`worker.test.ts`:
- Single-channel happy path: enqueue 5 → worker processes in order → all `processed` + `delivered`.
- Server returns permanent 4xx → row goes to `rejected` (ack `not_owed`); 5xx/429 → `failed`; worker proceeds to next.
- WS not live → worker idles without claiming; rows stay `queued` and drain on reconnect.
- WS disconnect with the transmit request still unsent → row requeued (attempt un-counted); after the request was sent → left to the response timeout → `failed`.
- Source ACK send fails / throws (`sendToRemote` returns false) → row stays `processed` with ack_outcome `undelivered` (NOT a Bot-leg error); loop continues.
- Worker stop drains in-flight (waits for pending deferred to settle or timeout, then stops claiming).

`retention.test.ts`:
- Time-based deletion of fully-done `processed` rows; spares `failed` AND `processed`+`undelivered`.
- Size-based cap forces deletion past time window, but respects the errored floor for `rejected`/`failed`/`nacked` and `processed`+`undelivered`.
- Sweep is no-op when below thresholds.

`@medplum/hl7 connection.test.ts`:
- Deferred mode: auto-CA suppressed; `ackCommit` sends CA; `nackCommit` sends CR.
- Double `ackCommit` for same MSH.10 → only one ACK on wire.
- aaMode + deferred: `ackCommit` sends AA, `nackCommit` sends AR.

### 14.2 Integration tests

Extend `packages/agent/src/hl7.test.ts`:
- Spin up an in-process HL7 client + agent + mock Medplum WS server.
- Send 10 messages with `enhanced=true&durableQueue=true`: assert CA arrives after row commits (insert SQLite trigger or pre-INSERT hook into a test queue to assert ordering).
- Simulate DB write failure (point at a read-only path, or mock the prepared statement to throw): assert source receives CR, no row in DB.
- Simulate process restart mid-flight: stop the App while a row is `processing`, restart with same DB path, assert it surfaces as `failed` (interrupted) and queued ones complete.
- ACK delivery failure: Bot returns 2xx but the source connection has closed → row is `processed`+`undelivered`, never re-dispatched (upstream hit exactly once); a retransmit replays the stored ACK and flips it to `delivered`.
- Duplicate MSH.10 in both modes.

### 14.3 Manual test plan

- 10k-message soak: feed messages from a test HL7 sender at a steady rate; verify zero loss across `kill -9` of the agent process.
- Disk-full simulation (tmpfs-mounted DB dir, fill up): assert source sees CR, agent logs ERROR, no crash.
- Long-running retention: artificially backdate `processed_at` on rows, run sweeper, verify deletions match policy.

---

## 15. Rollout Plan

1. **Phase 0 — Land behind feature flag (default off).** Ship `durableQueue` setting defaulting to `false`. Existing agents see zero behavior change.
2. **Phase 1 — Internal canary.** Enable on a single Medplum-internal agent / staging tenant. Monitor stats, disk growth, recovery behavior.
3. **Phase 2 — Opt-in for select customers.** Documentation update, support article. Customers turn it on via `Agent.setting`.
4. **Phase 3 — Default on for new agents.** New agents created get `durableQueue=true` by default; existing agents continue with their current setting.
5. **Phase 4 — Deprecate non-durable inbound path.** Two minor versions after Phase 3, remove the in-memory inbound path entirely.

Backward compatibility:
- Older Medplum servers do not need any change. Callbacks and message shapes are unchanged.
- Older agents talking to a newer server: unaffected. The durable queue is purely agent-internal.

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `node:sqlite` instability on Node 22 (experimental flag) | Detect at startup; surface clear error if module is unavailable. Internal canary on Node 24 (stable) first. Document version requirement. |
| Synchronous SQLite on main thread → tail latency under load | Bench enqueue p99 in soak test. If unacceptable, move queue to a Worker Thread with a `MessagePort` interface (designed-in by keeping `DurableQueue` behind a narrow interface). |
| Disk fills with `rejected`/`failed`/`undelivered` rows | Hard floor on errored retention + alert log when DB > 80% of `queueRetentionMaxMb`. |
| Source retries (same MSH.10) after legitimate prior success | `duplicateBehavior=idempotent` (default) replays prior ACK; no double-forwarding. Also recovers a `processed`+`undelivered` row — the replay lands the missed ACK and flips it to `delivered`. |
| Ambiguous delivery (request sent, connection dropped before response) | **Guaranteed-delivery mode (the default, §4.1):** retried, duplication risk explicitly accepted — the at-least-once contract while the server can't disambiguate errors; dedupe in the Bot (e.g. MSH-10 on a `MessageHeader`) for exactly-once. **Normal mode (opt-out):** not retried automatically — the row goes to `failed` for operator review (same stance as `recoverOnStartup`), because the server may already have processed it and re-dispatch would double-process. Only provably-unsent requests are requeued on disconnect. Future: callback-keyed dedupe in the server would make ambiguous auto-retry safe everywhere and normal mode the safe default. |
| DB corruption | WAL + `PRAGMA synchronous=NORMAL` is durable across our crash. For HW power-loss, operators can set `synchronous=FULL` via the `queueSqliteSyncMode` setting (added if requested) at a throughput cost. |
| Loss of `rejected`/`failed` rows surfaced to nobody | Stats endpoint reports `countsByState`; documented in operator runbook. Future: emit an `agent:error` WS message when a row first transitions to `rejected`/`failed`. |

---

## 17. Out of Scope (future work)

- Outbound (server → device) push durability (separate `outbound_hl7_messages` table + retry policy).
- Persisting the control-plane WS queue (heartbeats, stats, logs).
- A `medplum-agent-replay` CLI for one-shot replay of `failed` rows.
- A small admin REST endpoint on the agent (e.g. `localhost:7777/queue/stats`) for operator inspection without SQLite shell.
- Migrating `Hl7MessageTracker` (outbound pending ACKs) into SQLite.
- Cross-channel reordering metrics (e.g. per-remote ordering guarantees).

---

## 18. Open questions for review

- ~~Should `nacked` and `errored` be unified into one terminal `failed` state?~~ **Resolved (opposite direction):** the single `errored` bucket was *split* — the Bot leg (`state`: `processed`/`rejected`/`failed`) and the source leg (`ack_outcome`: `delivered`/`undelivered`/`not_owed`) are now tracked on independent axes, so "Bot accepted but ACK undelivered" is its own queryable cell and the retry layer can key cleanly off `failed`. `nacked` stays distinct (intake reject, excluded from dedupe).
- Do we want a per-channel `queueDepthLimit` that, when exceeded, refuses new messages with `CR` so we apply backpressure instead of unbounded queueing?
- Worth surfacing `oldestQueuedAgeMs` as a heartbeat alarm condition? (Likely yes — silent backlog is the worst failure mode.)
