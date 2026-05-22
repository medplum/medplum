// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SimulatedBackend } from '../backends/simulated/simulated-backend';
import type { ScenarioSpec } from '../types';
import { Scenario } from './scenario';

/**
 * v0 smoke test: an hl7-source drives a few messages directly into an
 * hl7-sink. This exercises the topology resolver, peer harnesses, lifecycle,
 * recorder, and simulate-server-upgrade (without involving any real Agent
 * resources — the agent dataplane is a follow-up).
 */
describe('Scenario (smoke)', () => {
  it('runs a source -> sink scenario and records events', async () => {
    const spec: ScenarioSpec = {
      name: 'smoke',
      nodes: [
        { id: 'sink', role: 'hl7-sink', port: 0, ackCode: 'AA' },
        { id: 'src', role: 'hl7-source', targetNodeId: 'sink', mps: 50 },
      ],
    };
    const scenario = new Scenario(spec, new SimulatedBackend());
    await scenario.start();
    expect(scenario.getStatus()).toBe('running');

    // Let the source push for ~300ms (~15 msgs at 50mps).
    await new Promise((r) => setTimeout(r, 300));

    // simulate a server upgrade — for this topology it should not affect the
    // dataplane, but the event must show up in the recording.
    await scenario.issueCommand({ type: 'simulate-server-upgrade', downtimeMs: 50 });

    // Pause load
    await scenario.issueCommand({ type: 'set-mps', nodeId: 'src', mps: 0 });

    await scenario.stop();
    expect(scenario.getStatus()).toBe('stopped');

    const recording = scenario.recorder.snapshot();
    const types = recording.events.map((e) => e.type);
    expect(types).toContain('scenario.started');
    expect(types).toContain('source.sent');
    expect(types).toContain('sink.message');
    expect(types).toContain('server.upgrade.start');
    expect(types).toContain('server.upgrade.end');
    expect(types).toContain('scenario.stopped');
  });
});
