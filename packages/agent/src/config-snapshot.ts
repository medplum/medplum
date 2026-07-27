// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { Agent, Endpoint } from '@medplum/fhirtypes';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

/** File name of the last-good config snapshot, written alongside the agent's logs. */
export const APPLIED_CONFIG_FILENAME = 'medplum-agent-applied-config.json';

/**
 * The last config the agent applied end to end -- every channel validated, started, and bound.
 *
 * It exists so the agent has somewhere to fall back to when the server can't tell it what to
 * run: on a boot where the server is unreachable or its config no longer validates, the agent
 * comes up on this instead of coming up with no channels at all. It also records, for an
 * operator, exactly what the agent is running and when it started running it -- which can
 * differ from what the server currently holds.
 *
 * Endpoints are stored resolved, so replaying a snapshot needs no server round trip.
 */
export interface AppliedConfigSnapshot {
  /** When this config finished being applied, ISO 8601. */
  appliedAt: string;
  /** The agent version that applied it. */
  agentVersion: string;
  agent: Agent;
  endpoints: Endpoint[];
}

/**
 * Writes the snapshot to a temp file and renames it into place, so a reader never sees a
 * partially written file -- `rename(2)` within a directory is atomic.
 *
 * Never throws: failing to record what we just applied must not fail an otherwise successful
 * config reload.
 *
 * @param path - Destination path.
 * @param snapshot - The snapshot to write.
 * @param log - Logger for reporting a failed write.
 */
export function writeSnapshotAtomic(path: string, snapshot: AppliedConfigSnapshot, log: ILogger): void {
  const tempPath = `${path}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(snapshot, undefined, 2), { encoding: 'utf8', flag: 'w' });
    renameSync(tempPath, path);
  } catch (err) {
    log.error(`Failed to save the applied agent config to ${path}: ${normalizeErrorString(err)}`);
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch (cleanupErr) {
      log.debug(`Failed to clean up ${tempPath}: ${normalizeErrorString(cleanupErr)}`);
    }
  }
}

/**
 * Reads the last-good config snapshot.
 *
 * Returns `undefined` for anything unusable -- missing, unparseable, or missing the fields we
 * need. That doubles as the torn-write mitigation, which is why no fsync or backup copy is
 * needed: a half-written file simply reads as "no snapshot".
 *
 * @param path - Path to read.
 * @param agentId - The agent the snapshot must belong to.
 * @param log - Logger for reporting a corrupt snapshot.
 * @returns The snapshot, or `undefined` if there isn't a usable one.
 */
export function readSnapshot(path: string, agentId: string, log: ILogger): AppliedConfigSnapshot | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const snapshot = JSON.parse(readFileSync(path, { encoding: 'utf8' })) as AppliedConfigSnapshot;
    if (snapshot?.agent?.resourceType !== 'Agent' || !Array.isArray(snapshot.endpoints)) {
      log.warn(`Ignoring malformed agent config snapshot at ${path}`);
      return undefined;
    }
    // Two agents pointed at the same directory would otherwise be able to boot each other's
    // channels -- binding ports and forwarding messages on behalf of an agent they are not.
    if (snapshot.agent.id !== agentId) {
      log.warn(
        `Ignoring agent config snapshot at ${path}: it belongs to agent '${snapshot.agent.id}', not '${agentId}'`
      );
      return undefined;
    }
    return snapshot;
  } catch (err) {
    log.warn(`Unable to read the agent config snapshot at ${path}: ${normalizeErrorString(err)}`);
    return undefined;
  }
}
