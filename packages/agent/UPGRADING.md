# Medplum Agent Upgrade Process

This document describes the zero-downtime upgrade process for the Medplum Agent, including both the historical approach (pre-durable-queue) and the current approach (post-durable-queue).

## Table of Contents

1. [Overview](#overview)
2. [Historical Zero-Downtime Upgrade (Pre-5.1.0)](#historical-zero-downtime-upgrade-pre-510)
3. [Current Zero-Downtime Upgrade (Post-5.1.0)](#current-zero-downtime-upgrade-post-510)
4. [Upgrade Healthcheck](#upgrade-healthcheck)
5. [Automatic Rollback](#automatic-rollback)
6. [Key Differences](#key-differences)
7. [Backward Compatibility](#backward-compatibility)
8. [Troubleshooting](#troubleshooting)

## Overview

The Medplum Agent supports zero-downtime upgrades on Windows, allowing the agent to be upgraded without interrupting HL7 message processing. The upgrade process involves coordination between:

- **The running (old) agent**: The currently running agent that will be replaced
- **The upgrader process**: A child process spawned by the old agent to download and run the installer
- **The installer (NSIS)**: The Windows installer that installs the new agent version
- **The new agent**: The newly installed agent that will take over

### Key Files

| File | Purpose |
|------|---------|
| `upgrade.json` | Upgrade manifest containing version info and callback |
| `agent.properties` | Agent configuration (preserved across upgrades) |
| `.handoff-ready` | Signal from new agent: "ready to take over" (5.1.0+) |
| `.handoff-go` | Signal from old agent: "channels stopped, go ahead" (5.1.0+) |
| `.handoff-rollback` | Signal from new agent: "I failed, please recover" (5.1.0+) |
| `.rollback-complete` | Signal from old agent: "I've recovered" (5.1.0+) |
| `.skip-service-cleanup` | Signal to `--remove-old-services`: "Don't delete old service" (5.1.0+) |
| `.queue-owner` | Queue ownership marker containing owner PID (5.1.0+) |
| `medplum-agent.pid` | PID file for the main agent process |
| `medplum-upgrading-agent.pid` | PID file for agent in upgrade finalization |
| `medplum-agent-upgrader.pid` | PID file for the upgrader process |

## Historical Zero-Downtime Upgrade (Pre-5.1.0)

This section describes how upgrades worked before the durable queue was introduced. This method relies on **port binding** as the primary coordination mechanism.

### Architecture

```
                                    ┌─────────────────────────────────────┐
                                    │           Old Agent Process         │
                                    │  - Bound to HL7 ports               │
                                    │  - Processing messages              │
                                    └─────────────┬───────────────────────┘
                                                  │
                                                  │ 1. Receives upgrade request
                                                  │ 2. Spawns upgrader
                                                  │ 3. Writes upgrade.json
                                                  │ 4. Disconnects IPC
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Upgrader Process                                  │
│  - Downloads installer from GitHub                                          │
│  - Runs installer silently                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  │ 5. Runs installer
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NSIS Installer                                    │
│  - Copies new binaries                                                      │
│  - Creates new Windows service (MedplumAgent_<version>)                     │
│  - Creates upgrade.json if missing                                          │
│  - Starts new service                                                       │
│  - Waits for upgrade.json deletion                                          │
│  - Calls --remove-old-services                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                  │
                                                  │ 6. Starts new service
                                                  ▼
                                    ┌─────────────────────────────────────┐
                                    │          New Agent Process          │
                                    │  - Attempts to bind to ports        │
                                    │  - Retries until ports available    │
                                    │  - Deletes upgrade.json             │
                                    └─────────────────────────────────────┘
                                                  │
                                                  │ 7. upgrade.json deleted
                                                  ▼
                                    ┌─────────────────────────────────────┐
                                    │    Installer continues cleanup      │
                                    │  - Runs --remove-old-services       │
                                    │  - Stops old agent service          │
                                    │  - Deletes old service              │
                                    └─────────────────────────────────────┘
```

### Step-by-Step Process

#### Phase 1: Initiation (Old Agent)

1. **Receive upgrade request**: The old agent receives an `agent:upgrade:request` message via WebSocket from the Medplum server.

2. **Validate request**: Check if upgrade is already in progress, validate target version.

3. **Spawn upgrader process**: The agent spawns itself with `--upgrade [version]` flag:
   ```typescript
   spawn(command, ['--upgrade', version], {
     detached: true,
     stdio: ['ignore', logFile, logFile, 'ipc'],
   });
   ```

4. **Write upgrade manifest**: Create `upgrade.json` with upgrade details:
   ```json
   {
     "previousVersion": "5.0.0-abc123",
     "targetVersion": "5.1.0",
     "callback": "uuid-callback-id"
   }
   ```

5. **Disconnect IPC**: The old agent disconnects IPC from the upgrader, allowing the upgrader to proceed independently.

#### Phase 2: Download and Install (Upgrader)

6. **Wait for IPC disconnect**: The upgrader waits for the old agent to disconnect IPC (5 second timeout).

7. **Download installer**: If not already cached, download the installer from GitHub releases.

8. **Run installer silently**: Execute the NSIS installer with `/S` flag for silent mode.

#### Phase 3: Service Creation (Installer)

9. **Copy new files**: The installer copies the new agent binary and supporting files.

10. **Create versioned service**: Create a new Windows service with version-specific name:
    ```
    MedplumAgent_5.1.0-def456
    ```

11. **Create upgrade.json if missing**: If `upgrade.json` doesn't exist (installer run manually), create a minimal one:
    ```json
    { "previousVersion": "UNKNOWN", "targetVersion": "5.1.0", "callback": null }
    ```

12. **Start new service**: Start the newly created Windows service.

#### Phase 4: Port Binding Race (New Agent)

13. **New agent starts**: The new agent process starts via the Windows service.

14. **Attempt port binding**: The new agent attempts to bind to its configured HL7 ports.

15. **Retry on failure**: If ports are still held by the old agent, the binding fails. The new agent keeps retrying (the exact behavior depends on the channel implementation).

16. **Delete upgrade.json**: Once the new agent has bound to ports (or started its binding loop), it deletes `upgrade.json` to signal the installer.

#### Phase 5: Cleanup (Installer)

17. **Detect upgrade.json deletion**: The installer polls for `upgrade.json` deletion:
    ```nsis
    ${Do}
        ${If} ${FileExists} "$INSTDIR\upgrade.json"
            Sleep 500
        ${Else}
            ${Break}
        ${EndIf}
    ${Loop}
    ```

18. **Remove old services**: Call the new agent with `--remove-old-services`:
    ```nsis
    ExecWait "$\"$INSTDIR\${SERVICE_FILE_NAME}$\" --remove-old-services"
    ```

19. **Stop and delete old service**: The `--remove-old-services` command stops and deletes all services except the current version:
    ```typescript
    execSync(`net stop ${serviceName}`);
    execSync(`sc.exe delete ${serviceName}`);
    ```

#### Phase 6: Finalization (New Agent)

20. **Send success response**: The new agent sends an `agent:upgrade:response` to the Medplum server via WebSocket.

21. **Cleanup PID files**: Remove `medplum-upgrading-agent.pid`.

### Coordination Mechanisms

| Mechanism | Purpose |
|-----------|---------|
| Port binding | Old agent holds ports; new agent retries until available |
| `upgrade.json` | Signals installer to wait, then proceed with cleanup |
| Versioned services | Allows both agents to run as separate Windows services |
| PID files | Prevents duplicate upgrade processes |

### Limitations

- **Race condition window**: Brief period where ports are released but old agent hasn't fully stopped
- **No explicit handoff**: New agent can't know exactly when old agent has stopped
- **Memory-only state**: Any in-flight messages are lost during upgrade

## Current Zero-Downtime Upgrade (Post-5.1.0)

The introduction of the **durable queue** (SQLite-based message persistence) required changes to the upgrade process. SQLite databases require exclusive file access, so we needed explicit coordination to ensure only one agent accesses the database at a time.

### New Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Old Agent Process                                   │
│  - Bound to HL7 ports                                                      │
│  - Owns durable queue (.queue-owner)                                       │
│  - Processing messages                                                     │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
                                  │ 1-5. Same as before (upgrader, installer)
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        New Agent Process                                   │
│  6. Reads upgrade.json, checks previousVersion                             │
│  7. If >= 5.1.0: Write .handoff-ready                                      │
│  8. Wait for .handoff-go signal                                            │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
                                  │ .handoff-ready created
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Old Agent (on SIGTERM)                              │
│  9. Detects .handoff-ready exists                                          │
│  10. Stops channels, closes WebSocket                                      │
│  11. Writes .handoff-go signal                                             │
│  12. Closes durable queue (releases .queue-owner)                          │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │
                                  │ .handoff-go created, .queue-owner removed
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        New Agent (continues)                               │
│  13. Receives .handoff-go signal                                           │
│  14. Waits for .queue-owner removal                                        │
│  15. Initializes durable queue (claims .queue-owner)                       │
│  16. Starts channels, binds to ports                                       │
│  17. Deletes upgrade.json                                                  │
│  18. Cleans up handoff files                                               │
└────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Process

#### Phase 1-2: Same as Historical

Steps 1-8 remain the same (upgrade request, upgrader, installer, service creation).

#### Phase 3: Handoff Coordination (New Agent Start)

9. **Read upgrade manifest**: New agent reads `upgrade.json`:
   ```typescript
   const upgradeDetails = JSON.parse(readFileSync(UPGRADE_MANIFEST_PATH, 'utf-8'));
   ```

10. **Check previous version**: Determine if the old agent supports the handoff protocol:
    ```typescript
    const previousVersionSupportsHandoff =
      upgradeDetails.previousVersion !== 'UNKNOWN' &&
      semver.valid(upgradeDetails.previousVersion) !== null &&
      semver.gte(upgradeDetails.previousVersion, MIN_HANDOFF_PROTOCOL_VERSION);
    ```

11. **Signal readiness**: If handoff protocol supported, create `.handoff-ready`:
    ```typescript
    writeFileSync(HANDOFF_READY_PATH, process.pid.toString());
    ```

12. **Wait for go signal**: Poll for `.handoff-go` file (30 second timeout):
    ```typescript
    while (!existsSync(HANDOFF_GO_PATH)) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Upgrade aborted: handoff signal not received');
      }
      await sleep(10);
    }
    ```

#### Phase 4: Graceful Shutdown (Old Agent)

13. **Detect handoff request**: Old agent's `stop()` method checks for `.handoff-ready`:
    ```typescript
    const isUpgradeHandoff = existsSync(HANDOFF_READY_PATH);
    ```

14. **Stop channels**: Close all HL7 channels and WebSocket connections.

15. **Signal go**: Write `.handoff-go` to tell new agent it can proceed:
    ```typescript
    writeFileSync(HANDOFF_GO_PATH, Date.now().toString());
    ```

16. **Close durable queue**: Release the SQLite database:
    ```typescript
    this.hl7DurableQueue.close();
    ```
    This also removes the `.queue-owner` file.

#### Phase 5: Queue Takeover (New Agent)

17. **Receive go signal**: New agent detects `.handoff-go` exists.

18. **Wait for queue release**: Wait for `.queue-owner` file to be removed:
    ```typescript
    await waitForQueueRelease(this.log);
    ```

19. **Initialize queue**: Open SQLite database and claim ownership:
    ```typescript
    this.hl7DurableQueue.init();
    // Writes PID to .queue-owner
    ```

20. **Start channels**: Bind to ports and start processing messages.

#### Phase 6: Finalization

21. **Delete upgrade.json**: Signal installer to proceed with cleanup.

22. **Clean up handoff files**: Remove `.handoff-ready` and `.handoff-go`.

23. **Send success response**: Report upgrade success to Medplum server.

### Handoff Signals

| File | Written By | Read By | Contents | Meaning |
|------|------------|---------|----------|---------|
| `.handoff-ready` | New agent | Old agent | PID | "I'm ready to take over" |
| `.handoff-go` | Old agent | New agent | Timestamp | "Channels stopped, go ahead" |
| `.queue-owner` | Queue owner | Both | PID | "I own the database" |

### Queue Ownership Protocol

The `.queue-owner` file ensures exclusive database access:

```typescript
// In AgentHl7DurableQueue.init()
writeFileSync(QUEUE_OWNER_PATH, process.pid.toString());

// In AgentHl7DurableQueue.close()
unlinkSync(QUEUE_OWNER_PATH);
```

The `waitForQueueRelease()` function handles waiting:

```typescript
export async function waitForQueueRelease(log: ILogger, timeoutMs = 30000): Promise<void> {
  if (!existsSync(QUEUE_OWNER_PATH)) {
    return; // No owner, safe to proceed
  }

  while (existsSync(QUEUE_OWNER_PATH)) {
    // Check if owner process is still running
    const ownerPid = parseInt(readFileSync(QUEUE_OWNER_PATH, 'utf8'), 10);
    if (!checkProcessExists(ownerPid)) {
      unlinkSync(QUEUE_OWNER_PATH); // Stale marker
      return;
    }

    if (Date.now() - startTime > timeoutMs) {
      // Timeout - force remove stale marker
      unlinkSync(QUEUE_OWNER_PATH);
      return;
    }

    await sleep(50);
  }
}
```

## Upgrade Healthcheck

After the new agent starts its channels, it runs a healthcheck to verify the upgrade was successful. This allows early detection of failures and enables automatic rollback.

### Healthcheck Modes

1. **Default Mode (Temporary Auto-ACK Server)**
   - Creates a temporary HL7 server on an OS-assigned port
   - Sends a test ADT^A01 message to itself
   - Server auto-ACKs using `buildAck()`
   - Verifies ACK code is AA or CA

2. **Configured Endpoint Mode**
   - Set via Agent setting: `upgradeHealthcheckEndpoint`
   - Uses an existing channel endpoint
   - Follows normal HL7 message flow
   - Tests end-to-end connectivity

3. **Magic Channel Mode**
   - Define a channel named `_medplum_healthcheck`
   - If no bot is configured, auto-ACKs
   - If bot is configured, follows normal flow

### Configuration Example

```json
{
  "resourceType": "Agent",
  "setting": [
    {
      "name": "upgradeHealthcheckEndpoint",
      "valueString": "mllp://localhost:2575"
    }
  ]
}
```

### Healthcheck Flow

```
New Agent:
  1. Start channels
  2. Run healthcheck:
     a. Create temp server OR use configured endpoint
     b. Send ADT^A01 test message
     c. Wait for ACK (10 second timeout)
     d. Verify ACK code is AA or CA
  3. If passed: continue to finalize upgrade
  4. If failed: trigger rollback
```

## Automatic Rollback

When an upgrade fails (healthcheck failure, startup error, etc.), the new agent attempts to automatically roll back to the previous version.

### Rollback Triggers

1. **Healthcheck failure** - ACK not received or invalid ACK code
2. **Startup errors** - Queue initialization failure, WebSocket connection failure, channel binding failure
3. **Any error before `maybeFinalizeUpgrade()`** - Ensures rollback happens before the upgrade is considered complete

### Rollback Flow (Post-5.1.0 with Handoff)

When upgrading from a version that supports the handoff protocol:

```
New Agent (failure detected):
  1. Stop channels and close queue
  2. Write .handoff-rollback signal
  3. Wait for .rollback-complete (10 second timeout)

Old Agent (sees .handoff-rollback):
  4. Re-initialize queue
  5. Restart channels
  6. Restart heartbeat
  7. Write .rollback-complete signal

New Agent (sees .rollback-complete):
  8. Write .skip-service-cleanup flag
  9. Delete upgrade.json
  10. Exit process

Installer (continues):
  11. Call --remove-old-services
  12. Sees .skip-service-cleanup → exits without deleting services

Result: Old agent is running normally, new service is dead
```

### Rollback Flow (Service Restart Fallback)

When handoff-based rollback fails or isn't available:

```
New Agent (failure detected):
  1. Stop channels and close queue
  2. Try: net start MedplumAgent_<previousVersion>
  3. If service starts:
     a. Write .skip-service-cleanup flag
     b. Delete upgrade.json
     c. Exit process
  4. If service fails to start:
     a. Log error
     b. Re-throw original error
     c. New agent may continue in degraded state
```

### Rollback Signals

| File | Writer | Reader | Contents | Meaning |
|------|--------|--------|----------|---------|
| `.handoff-rollback` | New agent | Old agent | JSON with PID and timestamp | "I failed, please take over" |
| `.rollback-complete` | Old agent | New agent | Timestamp or error JSON | "I've recovered" |
| `.skip-service-cleanup` | New agent | `--remove-old-services` | Timestamp | "Don't delete old service" |

### Important Notes

1. **Rollback Window**: Rollback can only occur before `upgrade.json` is deleted. Once deleted, the installer proceeds with service cleanup.

2. **Timeout**: The old agent waits 10 seconds for a rollback request before fully exiting. The new agent waits 10 seconds for rollback confirmation.

3. **No Retry**: Rollback is attempted once. If handoff rollback fails, service restart is tried. If both fail, the new agent continues (possibly in a degraded state).

4. **Pre-5.1.0**: Rollback to versions before 5.1.0 uses service restart only (no handoff protocol).

## Key Differences

| Aspect | Historical (Pre-5.1.0) | Current (Post-5.1.0) |
|--------|------------------------|----------------------|
| **Coordination** | Port binding (implicit) | File-based signals (explicit) |
| **Message persistence** | None (in-memory only) | SQLite durable queue |
| **Database handoff** | N/A | `.queue-owner` + handoff signals |
| **Failure behavior** | New agent keeps retrying | New agent aborts if no signal |
| **Healthcheck** | None | Auto-ACK server or configured endpoint |
| **Automatic rollback** | None | Via handoff protocol or service restart |
| **Backward compat** | N/A | Falls back to historical method |

### Timing Comparison

**Historical:**
```
Old Agent: [processing] ────────────────────────────> [stops]
New Agent:         [starts] ─> [retry bind] ─────────────────> [bound]
                   └─ ports busy ─┘            └─ ports free ─┘
```

**Current:**
```
Old Agent: [processing] ──> [sees .handoff-ready] ──> [stops channels] ──> [writes .handoff-go] ──> [closes queue]
New Agent:         [writes .handoff-ready] ──> [waits] ──> [sees .handoff-go] ──> [init queue] ──> [starts]
```

## Backward Compatibility

The current implementation maintains backward compatibility with both upgrade directions:

### Upgrading FROM Pre-5.1.0 TO 5.1.0+

When `upgrade.json` contains:
- `previousVersion: "UNKNOWN"` (set by installer), or
- `previousVersion: "<5.1.0"`

The new agent:
1. Skips the handoff protocol
2. Relies on installer-based coordination (historical method)
3. Proceeds directly to queue initialization

```typescript
if (upgradeDetails.previousVersion !== 'UNKNOWN' &&
    semver.valid(upgradeDetails.previousVersion) !== null &&
    semver.gte(upgradeDetails.previousVersion, MIN_HANDOFF_PROTOCOL_VERSION)) {
  // Use handoff protocol
} else {
  // Use installer-based coordination
}
```

### Upgrading FROM 5.1.0+ TO Newer

Normal handoff protocol is used.

### Downgrading FROM 5.1.0+ TO 4.2.4-5.0.x

When downgrading to a version that supports zero-downtime upgrades but not the handoff protocol, the new agent detects this via `upgrade.json` (the `targetVersion` is pre-handoff) and follows the **legacy zero-downtime protocol**:

1. The post-5.1.0 agent writes `upgrade.json` with `previousVersion: "5.1.x"` and `targetVersion: "5.0.x"`
2. The upgrader runs the pre-5.1.0 installer
3. The installer creates and starts the new (older) service
4. The new agent (post-5.1.0 binary or pre-5.1.0 binary) reads `upgrade.json`:
   - Sees `targetVersion < MIN_HANDOFF_PROTOCOL_VERSION` but `>= 4.2.4`
   - Enters the **legacy zero-downtime upgrade path** (skips handoff protocol)
5. Legacy path:
   a. Starts WebSocket connection (independent of local ports)
   b. Calls `maybeFinalizeUpgrade()` to delete `upgrade.json` — this unblocks the installer
   c. Installer proceeds to call `--remove-old-services`, which stops the old (post-5.1.0) agent
   d. Old agent's `stop()` runs normally (no `.handoff-ready` exists, so no handoff signals)
   e. Old agent releases the durable queue and ports
   f. New agent calls `waitForQueueRelease()`, then initializes the queue
   g. New agent calls `reloadConfig()` to bind channels (ports are now free)

This is safe because pre-handoff versions don't use the durable queue, so there is no competition for `.queue-owner` files. The old agent keeps its channels running until the installer stops its service, matching the behavior of the historical zero-downtime protocol.

### Downgrading FROM 5.1.0+ TO Pre-4.2.4

For versions before zero-downtime upgrades existed, the upgrader handles this specially:

1. Stops and uninstalls current service first (causes brief downtime)
2. Creates a mock service to opt into the installer's upgrade path
3. Runs the older installer

```typescript
if (semver.lt(version, '4.2.4')) {
  spawnSync(__filename, ['--remove-old-services', '--all']);
  execSync('sc.exe create MedplumAgent binPath=cmd.exe');
}
```

This scenario **does incur downtime** because pre-4.2.4 agents don't support running alongside another version.

## Troubleshooting

### Upgrade Stuck / Not Completing

1. **Check for stale files**:
   ```powershell
   dir "C:\Program Files\Medplum Agent\*.json"
   dir "C:\Program Files\Medplum Agent\.handoff-*"
   dir "C:\Program Files\Medplum Agent\.queue-owner"
   ```

2. **Check running services**:
   ```powershell
   sc query type= service state= all | findstr "MedplumAgent"
   ```

3. **Check log files**:
   - `upgrader-logs-*.txt`
   - `stop-service-logs-*.txt`
   - Windows Event Viewer

### Handoff Signal Not Received

If the new agent aborts with "handoff signal not received":

1. The old agent may have crashed before sending the signal
2. Check if old agent process is still running
3. Manually remove `.handoff-ready` and retry upgrade

### Queue Lock Issues

If you see "Database is locked" or similar:

1. Check `.queue-owner` file contents for PID
2. Verify if that PID is still running
3. If stale, remove `.queue-owner` file
4. Restart the agent service

### Rollback Issues

If automatic rollback isn't working:

1. **Check for rollback files**:
   ```powershell
   dir "C:\Program Files\Medplum Agent\.handoff-rollback"
   dir "C:\Program Files\Medplum Agent\.rollback-complete"
   dir "C:\Program Files\Medplum Agent\.skip-service-cleanup"
   ```

2. **Old agent didn't receive rollback signal**:
   - Old agent may have exited before the timeout
   - Check if old agent process is running

3. **Rollback succeeded but new service still running**:
   - The `.skip-service-cleanup` flag may not have been written
   - Manually stop and delete the new service

### Healthcheck Failures

If upgrades are rolling back due to healthcheck failures:

1. **Check if channels are starting correctly**:
   - Review agent logs for port binding errors
   - Verify network configuration

2. **Verify healthcheck endpoint** (if configured):
   - Ensure the endpoint is reachable
   - Check if the target service is responding

3. **Disable healthcheck temporarily** (for debugging):
   - Remove `upgradeHealthcheckEndpoint` setting
   - Remove any `_medplum_healthcheck` channel

### Manual Recovery

To manually recover from a failed upgrade:

```powershell
# Stop all agent services
net stop "MedplumAgent_*"

# Remove stale files
del "C:\Program Files\Medplum Agent\upgrade.json"
del "C:\Program Files\Medplum Agent\.handoff-ready"
del "C:\Program Files\Medplum Agent\.handoff-go"
del "C:\Program Files\Medplum Agent\.handoff-rollback"
del "C:\Program Files\Medplum Agent\.rollback-complete"
del "C:\Program Files\Medplum Agent\.skip-service-cleanup"
del "C:\Program Files\Medplum Agent\.queue-owner"

# Start the latest service
net start "MedplumAgent_<version>"
```
