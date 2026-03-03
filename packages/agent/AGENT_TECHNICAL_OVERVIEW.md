# Medplum Agent Technical Overview

This document provides a technical deep-dive into the Medplum Agent architecture for cross-training and reference.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Channel Infrastructure](#channel-infrastructure)
3. [Upgrade Process](#upgrade-process)
4. [Config Reloading & Channel Diffing](#config-reloading--channel-diffing)
5. [Ping/Heartbeat Mechanism](#pingheartbeat-mechanism)
6. [Durable Queue (New)](#durable-queue-new)
7. [Bonus: DICOM & Bytestream Channels](#bonus-dicom--bytestream-channels)

---

## High-Level Architecture

### Overview

The Medplum Agent is an on-premise service that bridges hospital systems (HL7v2, DICOM, raw TCP) with the Medplum cloud platform via WebSocket.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Hospital Network                               │
│                                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                          │
│  │  HL7v2   │    │  DICOM   │    │   TCP    │                          │
│  │  System  │    │  PACS    │    │  Device  │                          │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘                          │
│       │               │               │                                  │
│       │ MLLP          │ DIMSE         │ Raw Bytes                       │
│       ▼               ▼               ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        MEDPLUM AGENT                             │   │
│  │                                                                  │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │  HL7 Channel │  │ DICOM Channel│  │ Bytestream   │          │   │
│  │  │   (MLLP)     │  │   (DIMSE)    │  │   Channel    │          │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │   │
│  │         │                 │                  │                   │   │
│  │         └────────────┬────┴──────────────────┘                   │   │
│  │                      ▼                                           │   │
│  │              ┌──────────────────┐                                │   │
│  │              │   Durable Queue  │ ◄── SQLite3                    │   │
│  │              │   (messages-v1)  │                                │   │
│  │              └────────┬─────────┘                                │   │
│  │                       │                                          │   │
│  │              ┌────────▼─────────┐                                │   │
│  │              │    WebSocket     │                                │   │
│  │              │    Connection    │                                │   │
│  │              └────────┬─────────┘                                │   │
│  └───────────────────────┼──────────────────────────────────────────┘   │
│                          │                                               │
└──────────────────────────┼───────────────────────────────────────────────┘
                           │ wss://
                           ▼
              ┌────────────────────────┐
              │    Medplum Server      │
              │    (Cloud/Self-Host)   │
              └────────────────────────┘
```

### Entry Points

**Main Entry (`main.ts:18-96`)**

```
┌─────────────────┐
│    main.ts      │
└────────┬────────┘
         │
         ├─── upgrade.json exists? ──► upgraderMain() ──► Run upgrade
         │
         └─── Normal startup ──► agentMain()
                                      │
                                      ▼
                               ┌──────────────┐
                               │  App Class   │
                               │  (app.ts)    │
                               └──────────────┘
```

**Agent Main (`agent-main.ts:11-95`)**

1. Parse command-line args or properties file
2. Authenticate with MedplumClient
3. Create App instance
4. Register signal handlers (SIGTERM, SIGINT)
5. Start the App

### App Class - The Central Orchestrator

**File:** `app.ts:108-1350+`

The `App` class is the heart of the agent, managing:

| Property           | Type                         | Purpose                           |
| ------------------ | ---------------------------- | --------------------------------- |
| `channels`         | `Map<string, Channel>`       | Active protocol channels          |
| `hl7DurableQueue`  | `AgentHl7DurableQueue`       | SQLite message persistence        |
| `hl7Clients`       | `Map<string, Hl7ClientPool>` | Connection pools for outbound HL7 |
| `webSocket`        | `ReconnectingWebSocket`      | Server communication              |
| `heartbeatEmitter` | `HeartbeatEmitter`           | Health check events               |

---

## Channel Infrastructure

### Channel Interface (`channel.ts:7-16`)

```typescript
interface Channel {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendToRemote(message: AgentMessage): Promise<void>;
  reloadConfig(definition: AgentChannel, endpoint: Endpoint): Promise<void>;
  getDefinition(): AgentChannel;
  getEndpoint(): Endpoint;
}
```

### Channel Type Hierarchy

```
                    ┌─────────────────┐
                    │    Channel      │  (interface)
                    │   Interface     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   BaseChannel   │  (abstract class)
                    │                 │
                    │  - app          │
                    │  - definition   │
                    │  - endpoint     │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
│ AgentHl7Channel │ │AgentDicomChannel│ │AgentByteStream  │
│                 │ │                 │ │   Channel       │
│  Protocol: MLLP │ │ Protocol: DIMSE │ │ Protocol: TCP   │
│  Port: mllp://  │ │ Port: dicom://  │ │ Port: tcp://    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Channel Type Detection (`channel.ts:52-63`)

```typescript
function getChannelType(endpoint: Endpoint): ChannelType | undefined {
  const address = endpoint.address;
  if (address?.startsWith('mllp://')) return 'HL7_V2';
  if (address?.startsWith('dicom://')) return 'DICOM';
  if (address?.startsWith('tcp://')) return 'BYTE_STREAM';
  return undefined;
}
```

### HL7 Channel Deep Dive (`hl7.ts`)

**Key Components:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentHl7Channel                             │
│                                                                  │
│  ┌─────────────┐    ┌────────────────────────────────────────┐  │
│  │  Hl7Server  │    │  connections: Map<string, Connection>  │  │
│  │   (MLLP)    │    │                                        │  │
│  └──────┬──────┘    │  ┌──────────────────────────────┐     │  │
│         │           │  │ AgentHl7ChannelConnection    │     │  │
│   listen on port    │  │  - socket                    │     │  │
│         │           │  │  - encoding                  │     │  │
│         ▼           │  │  - enhanced mode             │     │  │
│   incoming conn ────┼──│  - appLevelAck               │     │  │
│                     │  │  - assignSeqNo               │     │  │
│                     │  │  - messagesPerMin (rate)     │     │  │
│                     │  └──────────────────────────────┘     │  │
│                     └────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**URL Parameters (parsed in `configureHl7ServerAndConnections`, lines 176-208):**

| Parameter        | Description             | Values                      |
| ---------------- | ----------------------- | --------------------------- |
| `encoding`       | Character encoding      | `utf-8`, `iso-8859-1`, etc. |
| `enhanced`       | Enhanced ACK mode       | `true`, `aa`                |
| `appLevelAck`    | App-level ACK type      | `AL`, `ER`, `NE`, `SU`      |
| `assignSeqNo`    | Auto-assign seq numbers | `true`/`false`              |
| `messagesPerMin` | Rate limiting           | Integer                     |

---

## Upgrade Process

### Zero-Downtime Handoff Protocol

The agent supports seamless upgrades with automatic rollback capability for versions >= 5.0.12.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         UPGRADE TIMELINE                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  OLD AGENT (v5.0.12)              NEW AGENT (v5.0.13)                   │
│  ══════════════════               ═══════════════════                   │
│                                                                          │
│  Running normally...                                                     │
│         │                                                                │
│         │                         Installer runs                         │
│         │                              │                                 │
│         │                         Writes upgrade.json                    │
│         │                              │                                 │
│         │                         Starts new agent                       │
│         │                              │                                 │
│         │                         ┌────▼────┐                            │
│         │                         │ Startup │                            │
│         │                         └────┬────┘                            │
│         │                              │                                 │
│         │          ◄───────── Writes .handoff-ready (PID)                │
│         │                              │                                 │
│  Detects .handoff-ready               │                                 │
│         │                              │                                 │
│  Stops channels                       │                                 │
│  Closes WebSocket                     │                                 │
│  Closes HL7 pools                     │                                 │
│         │                              │                                 │
│  Writes .handoff-go ─────────────►    │                                 │
│         │                              │                                 │
│  Closes durable queue                 │                                 │
│         │                              │                                 │
│         │                         Acquires queue ownership               │
│         │                              │                                 │
│  Waits for rollback                   │                                 │
│  (10 second timeout)             Runs healthcheck                       │
│         │                              │                                 │
│         │                         ┌────▼────┐                            │
│  No rollback request             │ Success │                            │
│         │                         └────┬────┘                            │
│         ▼                              │                                 │
│      EXIT                         Deletes upgrade.json                   │
│                                        │                                 │
│                                   Sends upgrade:response                 │
│                                        │                                 │
│                                   Running normally...                    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Coordination Files

| File                    | Creator      | Purpose                                                     |
| ----------------------- | ------------ | ----------------------------------------------------------- |
| `upgrade.json`          | Installer    | Upgrade manifest (previousVersion, targetVersion, callback) |
| `.handoff-ready`        | New Agent    | Signals readiness, contains new PID                         |
| `.handoff-go`           | Old Agent    | Signals channels stopped, queue released                    |
| `.handoff-rollback`     | New Agent    | Requests rollback on failure                                |
| `.rollback-complete`    | Old Agent    | Confirms recovery complete                                  |
| `.skip-service-cleanup` | New Agent    | Prevents installer from cleaning up old service             |
| `.queue-owner`          | Active Agent | Current queue owner PID                                     |

### Rollback Scenario

```
                NEW AGENT                          OLD AGENT
                ═════════                          ═════════
                    │                                  │
             Healthcheck fails                   Waiting for
                    │                            rollback...
                    │                                  │
             Writes .handoff-rollback ─────────────►  │
                    │                                  │
                    │                            Detects rollback
                    │                                  │
                    │                            Re-initializes queue
                    │                            Restarts WebSocket
                    │                            Reloads config
                    │                            Starts channels
                    │                                  │
                    │          ◄───────── Writes .rollback-complete
                    │                                  │
             Writes .skip-service-cleanup         Running normally!
                    │
                  EXIT
```

### Key Code References

- **Startup with handoff:** `app.ts:143-279`
- **Old agent stop:** `app.ts:1111-1199`
- **Recovery from rollback:** `app.ts:1201-1242`
- **Attempt rollback:** `app.ts:537-599`
- **Queue release wait:** `queue.ts:105-149`

---

## Config Reloading & Channel Diffing

### Trigger Points

Config reload can be triggered by:

1. **Initial startup** - `app.ts:220`
2. **WebSocket message** - `agent:reloadconfig:request` (`app.ts:796-812`)
3. **Rollback recovery** - `app.ts:1213`

### Reload Flow (`reloadConfig`, `app.ts:839-901`)

```
┌────────────────────────────────────────────────────────────────────┐
│                     reloadConfig() Flow                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Fetch Agent resource (no cache)                                 │
│         │                                                           │
│         ▼                                                           │
│  2. Extract settings:                                               │
│     - keepAlive                                                     │
│     - maxClientsPerRemote                                           │
│     - logStatsFreqSecs                                              │
│         │                                                           │
│         ▼                                                           │
│  3. If keepAlive changed:                                           │
│     - Close all existing HL7 client pools                           │
│     - Stop stats tracking                                           │
│         │                                                           │
│         ▼                                                           │
│  4. If stats frequency changed:                                     │
│     - Clear previous stats interval                                 │
│         │                                                           │
│         ▼                                                           │
│  5. Configure maxClientsPerRemote:                                  │
│     Priority: explicit setting > keepAlive default > global default │
│         │                                                           │
│         ▼                                                           │
│  6. Setup stats logging interval (if freq > 0)                      │
│         │                                                           │
│         ▼                                                           │
│  7. hydrateListeners() ──► Channel diffing                          │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Channel Diffing Algorithm (`hydrateListeners`, `app.ts:943-1039`)

```typescript
// Pseudocode for channel diffing
function hydrateListeners() {
  // 1. Mark all existing channels for potential removal
  const pendingRemoval = new Set(this.channels.keys());

  // 2. Process each configured channel
  for (const channelDef of agent.channel) {
    const endpoint = await readEndpoint(channelDef.endpoint);

    // Skip disabled channels
    if (endpoint.status === 'off') continue;

    // Keep this channel (don't remove)
    pendingRemoval.delete(channelDef.name);

    // 3. Start or reload channel
    if (this.channels.has(channelDef.name)) {
      // Existing channel - reload config
      await channel.reloadConfig(channelDef, endpoint);
    } else {
      // New channel - create and start
      const channel = createChannel(channelDef, endpoint);
      await channel.start();
      this.channels.set(channelDef.name, channel);
    }
  }

  // 4. Remove channels no longer in config
  for (const name of pendingRemoval) {
    await this.channels.get(name).stop();
    this.channels.delete(name);
  }
}
```

### Visual Diff Example

```
BEFORE CONFIG                    AFTER CONFIG
═════════════                    ════════════
Channel A (port 2575)            Channel A (port 2575)  ← No change
Channel B (port 2576)            Channel B (port 2577)  ← Port changed, rebind
Channel C (port 2578)            Channel D (port 2579)  ← C removed, D added

                      DIFF RESULT
                      ═══════════
                      Channel A: reloadConfig() - no port change
                      Channel B: reloadConfig() - rebind to 2577
                      Channel C: stop() - removed
                      Channel D: create + start() - new
```

### Port Change Detection (`needToRebindToPort`, `channel.ts`)

Each channel checks if its port changed during reload:

```typescript
// In each channel's reloadConfig():
if (needToRebindToPort(this.endpoint, newEndpoint)) {
  await this.stop();
  this.endpoint = newEndpoint;
  await this.start();
} else {
  // Just update config, no rebind needed
  this.endpoint = newEndpoint;
}
```

---

## Ping/Heartbeat Mechanism

### Heartbeat System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       HEARTBEAT TIMELINE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Time    Agent                          Server                       │
│  ════    ═════                          ══════                       │
│                                                                      │
│   0s     heartbeat() called                                          │
│          outstandingHeartbeats = 0                                   │
│          Send agent:heartbeat:request ─────────►                     │
│          lastHeartbeatSentTime = now                                 │
│                                                                      │
│   2s                            ◄───────── agent:heartbeat:response  │
│          outstandingHeartbeats = 0                                   │
│          Record ping latency (2000ms)                                │
│                                                                      │
│  10s     heartbeat() called                                          │
│          outstandingHeartbeats = 0                                   │
│          Send agent:heartbeat:request ─────────►                     │
│                                                                      │
│  20s     heartbeat() called                                          │
│          outstandingHeartbeats = 1  ⚠️                               │
│          Still waiting for response...                               │
│          Increment outstandingHeartbeats = 2                         │
│          2 > MAX_MISSED_HEARTBEATS (1)                               │
│          RECONNECT WEBSOCKET                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Constants (`constants.ts`)

| Constant                | Value        | Description              |
| ----------------------- | ------------ | ------------------------ |
| `HEARTBEAT_PERIOD_MS`   | 10,000 (10s) | Heartbeat interval       |
| `MAX_MISSED_HEARTBEATS` | 1            | Reconnect after 2 missed |
| `DEFAULT_PING_TIMEOUT`  | 3,600s (1hr) | PING command timeout     |

### Heartbeat Code (`app.ts:668-690`)

```typescript
private heartbeat(): void {
  // Emit event for listeners
  this.heartbeatEmitter.emit('heartbeat');

  // If not connected, try to connect
  if (this.webSocket.readyState !== WebSocket.OPEN) {
    this.connectToServer();
    return;
  }

  // Check for missed heartbeats
  this.outstandingHeartbeats++;
  if (this.outstandingHeartbeats > MAX_MISSED_HEARTBEATS) {
    // Too many missed - reconnect
    this.webSocket.reconnect();
    this.outstandingHeartbeats = 0;
    return;
  }

  // Send heartbeat request
  this.sendToServer({ type: 'agent:heartbeat:request' });
  this.lastHeartbeatSentTime = Date.now();
}
```

### PING Command (Host Ping)

Separate from heartbeat - used to ping arbitrary hosts:

```typescript
// Triggered by agent:transmit:request with ping: true
async function tryPingHost(job: AgentTransmitRequest): Promise<void> {
  const { host, count = 1 } = parsePingRequest(job);

  // Platform-specific ping command
  const command = process.platform === 'win32' ? `ping /n ${count} ${host}` : `ping -c ${count} ${host}`;

  const result = await exec(command);
  // Send result back via WebSocket
}
```

---

## Push to Agent (Outbound HL7)

### Overview

"Push to Agent" is the mechanism for sending HL7 messages **from** Medplum **to** remote HL7 systems via the agent. This is the reverse of inbound message flow - the server initiates the transmission.

### Message Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        PUSH TO AGENT FLOW                                   │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Medplum Server                                                             │
│       │                                                                     │
│       │ WebSocket: agent:transmit:request                                   │
│       │ {                                                                   │
│       │   type: 'agent:transmit:request',                                   │
│       │   remote: 'mllp://10.0.0.50:2575',                                  │
│       │   body: 'MSH|^~\\&|...',                                            │
│       │   callback: 'uuid-123'                                              │
│       │ }                                                                   │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           AGENT                                      │   │
│  │                                                                      │   │
│  │  WebSocket message handler (app.ts:787-794)                          │   │
│  │       │                                                              │   │
│  │       │ case 'agent:transmit:request':                               │   │
│  │       │   this.pushMessage(command)                                  │   │
│  │       ▼                                                              │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │                    pushMessage()                              │   │   │
│  │  │                    (app.ts:1647-1746)                         │   │   │
│  │  │                                                               │   │   │
│  │  │  1. Parse remote URL: mllp://host:port?encoding=...           │   │   │
│  │  │  2. Get or create Hl7ClientPool for this remote               │   │   │
│  │  │  3. Get client from pool (round-robin)                        │   │   │
│  │  │  4. client.sendAndWait(message)                               │   │   │
│  │  │  5. On response: send agent:transmit:response                 │   │   │
│  │  │  6. Release client back to pool                               │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │       │                                                              │   │
│  └───────┼──────────────────────────────────────────────────────────────┘   │
│          │ MLLP                                                             │
│          ▼                                                                  │
│  ┌──────────────┐                                                           │
│  │ Remote HL7   │                                                           │
│  │   System     │                                                           │
│  └──────────────┘                                                           │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### pushMessage() Deep Dive (`app.ts:1647-1746`)

```typescript
private pushMessage(message: AgentTransmitRequest): void {
  // 1. Parse remote URL
  const address = new URL(message.remote);  // mllp://host:port?encoding=utf-8
  const encoding = address.searchParams.get('encoding');

  // 2. Get or create pool for this remote
  let pool: Hl7ClientPool;
  if (this.hl7Clients.has(message.remote)) {
    pool = this.hl7Clients.get(message.remote);
  } else {
    pool = new Hl7ClientPool({
      host: address.hostname,
      port: parseInt(address.port),
      encoding,
      keepAlive: this.keepAlive,
      maxClients: this.maxClientsPerRemote,
      log: this.log,
      heartbeatEmitter: this.heartbeatEmitter,
    });
    this.hl7Clients.set(message.remote, pool);
  }

  // 3. Get client from pool
  const client = pool.getClient();

  // 4. Send and wait for ACK
  client.sendAndWait(requestMsg)
    .then((response) => {
      // 5. Send response back to server
      this.addToWebSocketQueue({
        type: 'agent:transmit:response',
        statusCode: 200,
        body: response.toString(),
        callback: message.callback,
      });
    })
    .catch((err) => {
      // Handle error, force close on failure
      forceClose = true;
    })
    .finally(() => {
      // 6. Release client back to pool
      pool.releaseClient(client, forceClose);
    });
}
```

### Configuration Settings

Settings are read from the Agent FHIR resource:

| Setting               | Type    | Default                | Description                           |
| --------------------- | ------- | ---------------------- | ------------------------------------- |
| `keepAlive`           | boolean | `false`                | Reuse TCP connections                 |
| `maxClientsPerRemote` | integer | 10 (or 1 if keepAlive) | Max concurrent connections per remote |
| `logStatsFreqSecs`    | integer | -1 (disabled)          | Stats logging interval                |

---

## HL7 Client Pool

### Overview

The `Hl7ClientPool` manages connections to a single remote HL7 endpoint. It handles connection pooling, reuse, and lifecycle management.

**File:** `hl7-client-pool.ts`

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Hl7ClientPool                                    │
│                                                                          │
│  Configuration:                                                          │
│  - host: string           (e.g., "10.0.0.50")                           │
│  - port: number           (e.g., 2575)                                  │
│  - encoding: string       (e.g., "utf-8")                               │
│  - keepAlive: boolean     (reuse connections)                           │
│  - maxClients: number     (pool size limit)                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    clients: EnhancedHl7Client[]                  │    │
│  │                                                                  │    │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐       ┌─────────┐       │    │
│  │   │ Client  │  │ Client  │  │ Client  │  ...  │ Client  │       │    │
│  │   │   #1    │  │   #2    │  │   #3    │       │  #N     │       │    │
│  │   └────┬────┘  └────┬────┘  └────┬────┘       └────┬────┘       │    │
│  │        │            │            │                 │            │    │
│  │   ┌────▼────┐  ┌────▼────┐  ┌────▼────┐       ┌────▼────┐       │    │
│  │   │  TCP    │  │  TCP    │  │  TCP    │       │  TCP    │       │    │
│  │   │ Socket  │  │ Socket  │  │ Socket  │  ...  │ Socket  │       │    │
│  │   └─────────┘  └─────────┘  └─────────┘       └─────────┘       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  nextClientIdx: 0  ──► Round-robin selection                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pool Behavior

**keepAlive Mode (`keepAlive: true`):**

- Connections are persistent and reused
- Round-robin selection across available clients
- Pool grows up to `maxClients`, then cycles through existing ones
- Default `maxClients`: 1 (single persistent connection)

**Non-keepAlive Mode (`keepAlive: false`):**

- Connections created per-request batch
- Automatic garbage collection after `CLIENT_RELEASE_COUNTDOWN_MS` (10 seconds) of inactivity
- Default `maxClients`: 10

### Client Selection Algorithm

```typescript
private getNextClient(): EnhancedHl7Client {
  // If we're under the limit, create a new client
  if (this.clients.length < this.maxClients) {
    return this.createAndTrackClient();
  }

  // Round-robin through existing clients
  const client = this.clients[this.nextClientIdx];
  this.nextClientIdx = (this.nextClientIdx + 1) % this.clients.length;
  return client;
}
```

### Garbage Collection (Non-keepAlive Mode)

```
┌────────────────────────────────────────────────────────────────┐
│                    CLIENT GC TIMELINE                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Time 0s:   Client created, lastUsed = now                     │
│  Time 5s:   Client used again, lastUsed = now                  │
│  Time 15s:  GC runs (on heartbeat), client still fresh         │
│  Time 25s:  GC runs, (now - lastUsed) > 10s, no pending msgs   │
│             → Client closed and removed from pool               │
│                                                                 │
│  Trigger: GC runs on every heartbeat (every 10 seconds)        │
│  Threshold: CLIENT_RELEASE_COUNTDOWN_MS = 10,000ms             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Key Methods

| Method                              | Description                                    |
| ----------------------------------- | ---------------------------------------------- |
| `getClient()`                       | Get a client for sending (creates or reuses)   |
| `releaseClient(client, forceClose)` | Return client to pool (optionally force close) |
| `closeAll()`                        | Close all clients in the pool                  |
| `runClientGc()`                     | Manually run garbage collection                |
| `startTrackingStats()`              | Enable RTT tracking for all clients            |
| `getPoolStats()`                    | Get aggregated RTT statistics                  |

---

## Client Stats Tracking

### Overview

The agent tracks round-trip time (RTT) statistics for outbound HL7 messages to monitor performance and detect issues.

**Files:**

- `channel-stats-tracker.ts` - Core statistics tracking
- `enhanced-hl7-client.ts` - Client with stats integration

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      STATS TRACKING FLOW                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  EnhancedHl7Client                                                       │
│       │                                                                  │
│       │ sendAndWait(message)                                             │
│       │                                                                  │
│       ├──► stats.recordMessageSent(msgControlId)                         │
│       │         │                                                        │
│       │         ▼                                                        │
│       │    pendingMessages.set(id, Date.now())                           │
│       │                                                                  │
│       │    ... wait for ACK ...                                          │
│       │                                                                  │
│       ├──► stats.recordAckReceived(msgControlId)                         │
│       │         │                                                        │
│       │         ▼                                                        │
│       │    rtt = Date.now() - pendingMessages.get(id)                    │
│       │    completedRtts.push(rtt)                                       │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                   ChannelStatsTracker                            │    │
│  │                                                                  │    │
│  │   pendingMessages: Map<string, number>  (id → startTime)        │    │
│  │   completedRtts: number[]               (last 1000 samples)     │    │
│  │                                                                  │    │
│  │   getRttStats() → {                                              │    │
│  │     count: 847,                                                  │    │
│  │     min: 12,                                                     │    │
│  │     max: 1523,                                                   │    │
│  │     average: 145.7,                                              │    │
│  │     p50: 98,                                                     │    │
│  │     p95: 412,                                                    │    │
│  │     p99: 892,                                                    │    │
│  │     pendingCount: 3                                              │    │
│  │   }                                                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### RttStats Interface

```typescript
interface RttStats {
  count: number; // Number of completed samples
  min: number; // Minimum RTT (ms)
  max: number; // Maximum RTT (ms)
  average: number; // Mean RTT (ms)
  p50: number; // 50th percentile (median)
  p95: number; // 95th percentile
  p99: number; // 99th percentile
  pendingCount: number; // Messages awaiting ACK
}
```

### Stats Logging

When `logStatsFreqSecs` is configured, the agent periodically logs statistics:

```typescript
private logStats(): void {
  const stats = getCurrentStats();  // ping latency, connection count

  // Collect channel stats (inbound)
  const channelStats = Object.fromEntries(
    hl7Channels.map(ch => [ch.name, ch.stats?.getStats()])
  );

  // Collect client pool stats (outbound)
  const clientStats = Object.fromEntries(
    pools.map(pool => [pool.remote, pool.getPoolStats()])
  );

  this.log.info('Agent stats', {
    stats: {
      ping: stats.ping,
      durableQueueReceived: queue.countByStatus('received'),
      durableQueueSent: queue.countByStatus('sent'),
      hl7ClientCount: totalClients,
      live: this.live,
      channelStats,   // Per-channel inbound RTT
      clientStats,    // Per-remote outbound RTT
    }
  });
}
```

### Sample Log Output

```json
{
  "level": "info",
  "message": "Agent stats",
  "stats": {
    "ping": 45,
    "durableQueueReceived": 0,
    "durableQueueSent": 0,
    "durableQueueResponseQueued": 0,
    "hl7ClientCount": 2,
    "live": true,
    "outstandingHeartbeats": 0,
    "channelStats": {
      "hl7-lab-inbound": {
        "rtt": { "count": 1523, "min": 8, "max": 234, "average": 42.3, "p50": 35, "p95": 98, "p99": 156 }
      }
    },
    "clientStats": {
      "mllp://10.0.0.50:2575?encoding=utf-8": {
        "rtt": { "count": 892, "min": 15, "max": 1234, "average": 156.8, "p50": 112, "p95": 456, "p99": 890 }
      }
    }
  }
}
```

### Garbage Collection for Stale Pending Messages

Messages that never receive an ACK are cleaned up after 5 minutes:

```typescript
// Runs on heartbeat interval (every minute by default)
private cleanupOldPendingMessages(): void {
  for (const [messageId, timestamp] of this.pendingMessages) {
    if (Date.now() - timestamp > maxPendingAge) {  // 5 minutes
      this.log.warn(`Never got response for message ID '${messageId}'`);
      this.pendingMessages.delete(messageId);
    }
  }
}
```

### Configuration

| Option          | Default         | Description                                |
| --------------- | --------------- | ------------------------------------------ |
| `maxRttSamples` | 1000            | Max samples to keep in memory              |
| `maxPendingAge` | 300,000 (5 min) | Age before pending messages are cleaned up |
| `gcIntervalMs`  | 60,000 (1 min)  | How often to run GC                        |

---

## Durable Queue (New)

### Why Durable Queue?

**Problem:** If the agent crashes or restarts while processing messages, those messages are lost.

**Solution:** SQLite-based persistent queue that survives restarts and upgrades.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DURABLE QUEUE FLOW                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HL7 Message Arrives                                                     │
│         │                                                                │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │ HL7 Channel  │                                                        │
│  │  receives    │                                                        │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AgentHl7DurableQueue                          │    │
│  │                                                                  │    │
│  │   ┌─────────────────────────────────────────────────────────┐   │    │
│  │   │              messages-v1.sqlite3                         │   │    │
│  │   │                                                          │   │    │
│  │   │  id | status    | message | channel | remote | callback  │   │    │
│  │   │  ───┼───────────┼─────────┼─────────┼────────┼────────── │   │    │
│  │   │  1  | received  | MSH|... | hl7-lab | 10.0.. | abc123    │   │    │
│  │   │  2  | sent      | MSH|... | hl7-rad | 10.0.. | def456    │   │    │
│  │   │  3  | app_acked | MSH|... | hl7-lab | 10.0.. | ghi789    │   │    │
│  │   │                                                          │   │    │
│  │   └─────────────────────────────────────────────────────────┘   │    │
│  │                                                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│         │                                                                │
│         │ getNextReceivedMessage()                                       │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │  WebSocket   │                                                        │
│  │   Worker     │ ──► Sends to Medplum Server                            │
│  └──────┬───────┘                                                        │
│         │                                                                │
│         │ markAsSent()                                                   │
│         ▼                                                                │
│  Wait for response...                                                    │
│         │                                                                │
│         │ markAsAppAcked() or markAsResponseQueued()                     │
│         ▼                                                                │
│  ┌──────────────┐                                                        │
│  │ Send ACK to  │                                                        │
│  │ HL7 System   │                                                        │
│  └──────────────┘                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Message Status Lifecycle

```
                    ┌──────────┐
                    │ received │  ◄── Message stored in queue
                    └────┬─────┘
                         │
                         ▼ sent to server
                    ┌──────────┐
            ┌───────│   sent   │───────┐
            │       └──────────┘       │
            │                          │
       timeout                    success
            │                          │
            ▼                          ▼
     ┌───────────┐              ┌─────────────┐
     │ timed_out │              │ commit_acked│
     └───────────┘              └──────┬──────┘
                                       │
                               app-level ACK?
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
               No app ACK         app ACK            Response
                    │                  │              needed
                    ▼                  ▼                  │
              ┌──────────┐      ┌───────────┐            │
              │ (done)   │      │ app_acked │            │
              └──────────┘      └───────────┘            │
                                                         ▼
                                              ┌─────────────────┐
                                              │ response_queued │
                                              └────────┬────────┘
                                                       │
                                            ┌──────────┼──────────┐
                                            │          │          │
                                       timeout      error      success
                                            │          │          │
                                            ▼          ▼          ▼
                                    ┌──────────┐ ┌─────┐  ┌──────────────┐
                                    │ response │ │error│  │response_sent │
                                    │ timed_out│ └─────┘  └──────────────┘
                                    └──────────┘
```

### Database Schema (`queue.ts:60-86`)

```sql
CREATE TABLE hl7_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Message content
  message TEXT NOT NULL,
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  control_id TEXT NOT NULL,

  -- Routing info
  channel TEXT NOT NULL,
  remote TEXT NOT NULL,
  callback TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'received',

  -- Timestamps for each status
  received_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_time DATETIME,
  timed_out_time DATETIME,
  error_time DATETIME,
  commit_acked_time DATETIME,
  app_acked_time DATETIME,
  response_queued_time DATETIME,
  response_sent_time DATETIME,
  response_timed_out_time DATETIME,
  response_error_time DATETIME
);

-- Performance indexes
CREATE INDEX idx_status ON hl7_messages(status);
CREATE INDEX idx_status_received ON hl7_messages(status, received_time);
CREATE INDEX idx_callback ON hl7_messages(callback);
CREATE INDEX idx_remote ON hl7_messages(remote);
CREATE INDEX idx_channel_status ON hl7_messages(channel, status, received_time);
```

### Key Methods

| Method                               | Purpose                                    |
| ------------------------------------ | ------------------------------------------ |
| `init()`                             | Create DB, run migrations, claim ownership |
| `addMessage(...)`                    | Insert new message with 'received' status  |
| `getNextReceivedMessage()`           | Get oldest pending message                 |
| `getAllReceivedMessages()`           | Batch retrieve for bulk processing         |
| `getMessageByCallback(id)`           | Lookup by correlation ID                   |
| `markAsSent(id)`                     | Update status after WebSocket send         |
| `markAsAppAcked(id)`                 | Update after app-level ACK                 |
| `markAsResponseQueued(id, response)` | Store response for sending                 |
| `countByStatus(status)`              | Monitoring/metrics                         |
| `close()`                            | Close DB, release ownership                |

### Queue Ownership During Upgrades

```
OLD AGENT                           NEW AGENT
═════════                           ═════════
    │                                   │
Owns queue                              │
(PID in .queue-owner)                   │
    │                                   │
    │                              Starts up
    │                                   │
    │          ◄────────── Writes .handoff-ready
    │                                   │
Stops channels                          │
Writes .handoff-go                      │
Calls queue.close() ──────┐             │
    │                     │             │
    │              Removes .queue-owner │
    │                     │             │
    │                     └─────►  waitForQueueRelease()
    │                                   │
    │                              Checks .queue-owner
    │                              (doesn't exist or stale PID)
    │                                   │
    │                              queue.init()
    │                              Writes new .queue-owner
    │                                   │
Waits for rollback                 Owns queue!
    │                                   │
```

---

## Bonus: DICOM & Bytestream Channels

### DICOM Channel (`dicom.ts`)

**Purpose:** Receive DICOM images from PACS systems via DIMSE protocol.

**Architecture:**

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DICOM CHANNEL                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PACS System                                                            │
│      │                                                                  │
│      │ DIMSE C-STORE                                                    │
│      ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    AgentDicomChannel                              │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐                                             │  │
│  │  │  DIMSE Server   │  (dcmjs-dimse library)                      │  │
│  │  │  (SCP role)     │                                             │  │
│  │  └────────┬────────┘                                             │  │
│  │           │                                                       │  │
│  │           │ Association requested                                 │  │
│  │           ▼                                                       │  │
│  │  ┌─────────────────┐                                             │  │
│  │  │ DcmjsDimseScp   │  (inner handler class)                      │  │
│  │  │                 │                                             │  │
│  │  │ associationRequested() ──► Accept presentation contexts       │  │
│  │  │                 │                                             │  │
│  │  │ cStoreRequest() │                                             │  │
│  │  │      │          │                                             │  │
│  │  │      ▼          │                                             │  │
│  │  │ 1. Write to temp file (/tmp/dicom-xxx/uuid.dcm)               │  │
│  │  │ 2. Upload as Binary resource                                  │  │
│  │  │ 3. Parse DICOM → JSON (remove PixelData)                      │  │
│  │  │ 4. Send to WebSocket:                                         │  │
│  │  │    {                                                          │  │
│  │  │      association: { callingAeTitle, calledAeTitle },          │  │
│  │  │      dataset: { /* DICOM JSON */ },                           │  │
│  │  │      binary: { reference: "Binary/xxx" }                      │  │
│  │  │    }                                                          │  │
│  │  │ 5. Delete temp file                                           │  │
│  │  └─────────────────┘                                             │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**

- Uses `dicom://` URL scheme
- DICOM is receive-only (sendToRemote not implemented)
- Pixel data stripped from JSON (too large), uploaded separately as Binary
- Supports standard DICOM SOP classes

### Bytestream Channel (`bytestream.ts`)

**Purpose:** Handle arbitrary TCP byte streams with frame delimiters.

**Architecture:**

```
┌────────────────────────────────────────────────────────────────────────┐
│                      BYTESTREAM CHANNEL                                 │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  TCP Device                                                             │
│      │                                                                  │
│      │ Raw TCP bytes                                                    │
│      ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                   AgentByteStreamChannel                          │  │
│  │                                                                   │  │
│  │  URL: tcp://0.0.0.0:5000?startChar=0x0B&endChar=0x1C           │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐    ┌─────────────────────────────────────┐  │  │
│  │  │   TCP Server    │    │  connections: Map<addr, Connection> │  │  │
│  │  │   (net.Server)  │    │                                     │  │  │
│  │  └────────┬────────┘    │  ┌───────────────────────────────┐ │  │  │
│  │           │             │  │ ByteStreamChannelConnection   │ │  │  │
│  │     connection          │  │                               │ │  │  │
│  │           │             │  │  startChar: 0x0B (VT)         │ │  │  │
│  │           └─────────────│──│  endChar: 0x1C (FS)           │ │  │  │
│  │                         │  │                               │ │  │  │
│  │                         │  │  Message Parsing:             │ │  │  │
│  │                         │  │  ┌─────────────────────────┐  │ │  │  │
│  │                         │  │  │ [0x0B][data...][0x1C]   │  │ │  │  │
│  │                         │  │  │   ↑              ↑      │  │ │  │  │
│  │                         │  │  │ start          end      │  │ │  │  │
│  │                         │  │  │                         │  │ │  │  │
│  │                         │  │  │ Accumulate chunks       │  │ │  │  │
│  │                         │  │  │ between delimiters      │  │ │  │  │
│  │                         │  │  └─────────────────────────┘  │ │  │  │
│  │                         │  │                               │ │  │  │
│  │                         │  │  On complete frame:           │ │  │  │
│  │                         │  │  → addToWebSocketQueue()      │ │  │  │
│  │                         │  └───────────────────────────────┘ │  │  │
│  │                         └─────────────────────────────────────┘  │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

**URL Parameters:**

| Parameter   | Description           | Example     |
| ----------- | --------------------- | ----------- |
| `startChar` | Frame start delimiter | `0x0B` (VT) |
| `endChar`   | Frame end delimiter   | `0x1C` (FS) |

**Message Parsing Logic (`ByteStreamChannelConnection:150-206`):**

```typescript
// Simplified parsing logic
handleData(data: Buffer): void {
  for (const byte of data) {
    if (byte === this.startChar) {
      // Start of new message
      this.msgChunks = [];
      this.msgTotalLength = 0;
      this.state = 0;
    } else if (byte === this.endChar && this.state >= 0) {
      // End of message - send it
      const message = Buffer.concat(this.msgChunks);
      this.channel.addToWebSocketQueue(message);
      this.state = -1;  // Reset for next message
    } else if (this.state >= 0) {
      // Accumulate message bytes
      this.msgChunks.push(Buffer.from([byte]));
      this.msgTotalLength++;
    }
    // Else: data before start char, ignore
  }
}
```

**sendToRemote:**

```typescript
sendToRemote(message: AgentMessage): Promise<void> {
  const conn = this.connections.get(message.remote);
  const data = Buffer.from(message.body, 'hex');
  conn.socket.write(data);
}
```

---

## Quick Reference: Key Files

| File            | Lines     | Description                    |
| --------------- | --------- | ------------------------------ |
| `main.ts`       | 18-96     | Entry point, routing           |
| `agent-main.ts` | 11-95     | Agent initialization           |
| `app.ts`        | 108-1350+ | Central orchestrator           |
| `channel.ts`    | 1-83      | Channel interface & base class |
| `hl7.ts`        | 37-421    | HL7/MLLP implementation        |
| `dicom.ts`      | 16-235    | DICOM/DIMSE implementation     |
| `bytestream.ts` | 12-215    | Raw TCP implementation         |
| `queue.ts`      | 1-350+    | SQLite durable queue           |
| `upgrader.ts`   | -         | Upgrade executor               |
| `constants.ts`  | -         | Configuration constants        |

---

## Summary

The Medplum Agent is designed for:

1. **Reliability** - Durable queue ensures no message loss
2. **Zero-downtime upgrades** - Handoff protocol with rollback
3. **Flexibility** - Multiple channel types for different protocols
4. **Observability** - Heartbeat, ping, and stats monitoring
5. **Hot reloading** - Config changes without restart

Questions? Check the code references provided or explore the `packages/agent/src/` directory.
