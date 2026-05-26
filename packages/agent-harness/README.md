# @medplum/agent-harness

Test scenario harness for the Medplum Agent. v0 — local processes only.

> ⚠️ Pre-1.0. APIs and JSON shapes will change as we iterate.

## What it does

- Spin up scenarios that combine **Agents**, **HL7 source peers** (load
  generators), and **HL7 sink peers** (downstream receivers that ACK).
- Generate Agent FHIR resource configs from **templates** (the first one,
  `push-bot`, is an Agent with one HL7 inbound channel whose target is a Bot
  that calls `Agent/$push` to forward to another agent — enhanced AA ACK mode
  + keepAlive on by default).
- Drive **load** at configurable messages-per-second per source.
- Issue **commands** at runtime: change rates, reload config, upgrade an
  agent, drop the simulated server's WS connections to test reconnect, etc.
- **Record** every event in a run and **replay** the command timeline later.

## Backends

Three implementations behind a `Backend` interface:

| Backend            | Status         | What it does                                                                                                                                                                    |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SimulatedBackend` | ✅ v0 working  | Hosts a fake WS server in-process; tracks agents in memory. No agent process is spawned — agent presence is in-memory only. Fastest path for dataplane (HL7) testing.            |
| `HybridBackend`    | ✅ v0 working  | Spawns **real** `@medplum/agent` processes pointed at an in-process `FakeMedplumServer`. The fake server speaks the agent protocol (oauth2, FHIR Agent/Endpoint reads, WS handshake, heartbeat, transmit). Restart / upgrade hooks work end-to-end without an external medplum/server. Bot execution is not yet stubbed — use `FakeMedplumServer.pushTransmit()` from the harness to drive a transmit at a target agent. |
| `RealBackend`      | ✅ v0 spawning | Spawns real `@medplum/agent` processes against a running `medplum/server`. Server-restart / upgrade simulation requires a `serverControl.restart` (and optional `.upgrade`) callback wired to your runtime (docker compose, systemctl, etc.) — without it, the matching scenario commands throw loudly. FHIR resource upsert is still a follow-up.                                                                                                                                  |

### When to pick which

- Pure dataplane / topology / load tests with no need for real agent code → **`SimulatedBackend`**.
- Real agent connect / reconnect / heartbeat / HL7 channel code, including
  realistic server-restart scenarios, but no medplum/server available →
  **`HybridBackend`**.
- End-to-end against a real medplum/server (or staging) → **`RealBackend`**.

## Agent launchers

Both `RealBackend` and `HybridBackend` delegate process lifecycle to an
`AgentLauncher`. Pick one based on your host:

| Launcher                       | Host                | Notes                                                                                                                          |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SourceAgentLauncher`          | any (dev)           | Runs `@medplum/agent` from monorepo source via `tsx`. Fastest iteration loop; works on macOS where no released binary exists. |
| `BinaryAgentLauncher`          | Linux               | Downloads `medplum-agent-{version}-linux` from the meta.medplum.com release manifest, chmods, spawns with CLI args.            |
| `WindowsInstallerAgentLauncher`| Windows / Win container | Downloads `medplum-agent-installer-{version}.exe`, writes `agent.properties`, runs `/S` silent install, manages the Windows service via `sc.exe`. Has an `unpacked-exe` mode for nanoserver-class containers without SCM. |

`pickLauncherKind()` / `createLauncher()` auto-select based on `os.platform()`
unless you override:

```ts
import { createLauncher } from '@medplum/agent-harness';

const launcher = createLauncher({
  // kind: 'source',                  // force a specific impl
  monorepoRoot: '/path/to/medplum',   // required for 'source'
  windowsMode: 'unpacked-exe',        // win-only: skip Windows service
});
```

## Run it

```sh
cd packages/agent-harness
npm run harness        # starts the HTTP control plane on :7681
```

POST a `simulated` scenario (no real agent processes — pure peer-to-peer):

```sh
curl -X POST http://127.0.0.1:7681/scenarios \
  -H 'content-type: application/json' \
  -d '{
    "name": "smoke",
    "nodes": [
      { "id": "sink", "role": "hl7-sink", "port": 0 },
      { "id": "src",  "role": "hl7-source", "targetNodeId": "sink", "mps": 10 }
    ]
  }'
```

POST a `hybrid` scenario — spawns real `@medplum/agent` processes against an
in-process fake medplum/server. No external server required:

```sh
curl -X POST http://127.0.0.1:7681/scenarios \
  -H 'content-type: application/json' \
  -d '{
    "name": "push-net",
    "backend": "hybrid",
    "nodes": [
      { "id": "agent_b", "role": "agent", "template": "push-bot",
        "inputs": { "listenPort": 9402, "forwardToNodeId": "agent_b" } },
      { "id": "agent_a", "role": "agent", "template": "push-bot",
        "inputs": { "listenPort": 9401, "forwardToNodeId": "agent_b" } }
    ]
  }'
```

The CLI auto-detects the monorepo root (so the source launcher knows where
`packages/agent` is); override with `MEDPLUM_MONOREPO_ROOT` if you're running
the harness from a checked-out package outside the medplum tree. Each spawned
agent gets an isolated `$TMPDIR` so the agent's pidfile doesn't collide when
running multiple instances on one host.

Inspect / control:

```sh
curl http://127.0.0.1:7681/scenarios
curl -X POST http://127.0.0.1:7681/scenarios/s1/commands \
  -H 'content-type: application/json' \
  -d '{"type":"simulate-server-upgrade","downtimeMs":1000}'
# abrupt restart (RST, no close frame) — models a crash
curl -X POST http://127.0.0.1:7681/scenarios/s1/commands \
  -H 'content-type: application/json' \
  -d '{"type":"simulate-server-restart","downtimeMs":500}'
curl http://127.0.0.1:7681/scenarios/s1/recording > recording.json
```

## Next iterations (intentionally not built yet)

- Wire `RealBackend` to upsert Endpoint/Bot/Agent via `MedplumClient` and spawn
  the `@medplum/agent` process.
- `Hl7SourceClient`: per-message inject + correlation back through the
  scenario topology (sent → agent → sink) for end-to-end latency stats.
- CDK package for EKS agent clusters (see `src/cdk/`).
- WebSocket / SSE live event stream from the control plane (currently
  recording is pull-only via `/recording`).
