// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient, WithId } from '@medplum/core';
import { getStatus, isGone, isNotFound, OperationOutcomeError } from '@medplum/core';
import type { Basic } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { GOOGLE_CALENDAR_NAMESPACE } from './constants';
import { assertCurrentProject } from './project';
import { publishStatus } from './public-status';
import { readState, repairCheckpoint, withState } from './state';

export const LEASE_URL = `${GOOGLE_CALENDAR_NAMESPACE}/worker-lease`;
// Hosted worker Bots are limited to 600 seconds; leave five minutes for termination/in-flight requests.
export const LEASE_MS = 15 * 60_000;
export const WORK_MS = 8 * 60_000;

export class ConnectionBusyError extends Error {
  constructor() {
    super('Calendar connection is busy; retry this delivery');
  }
}

export function ifMatch(basic: { meta?: { versionId?: string } }): { headers: Record<string, string> } {
  if (!basic.meta?.versionId) {
    throw new Error('A version is required for a calendar state write');
  }
  return { headers: { 'If-Match': `W/"${basic.meta.versionId}"` } };
}

export class ConnectionLease {
  readonly deadline: number;
  constructor(
    readonly medplum: MedplumClient,
    readonly id: string,
    readonly token: string,
    readonly originalVersion: string,
    private readonly now: () => number = Date.now
  ) {
    this.deadline = now() + WORK_MS;
  }

  async read(completing = false): Promise<WithId<Basic>> {
    if (!completing && this.now() >= this.deadline) {
      throw new Error('Calendar worker deadline reached; retry from durable state');
    }
    const basic = await this.medplum.readResource('Basic', this.id, { cache: 'no-cache' });
    const lease = basic.extension?.find((e) => e.url === LEASE_URL);
    if (
      lease?.extension?.find((e) => e.url === 'owner')?.valueString !== this.token ||
      Date.parse(lease?.extension?.find((e) => e.url === 'expires')?.valueInstant ?? '') <= this.now()
    ) {
      throw new Error('Calendar worker lost its connection lease');
    }
    return basic;
  }

  async check(): Promise<void> {
    await this.read();
  }

  async mutate(change: (basic: WithId<Basic>) => Basic): Promise<WithId<Basic>> {
    // Webhook request markers may change while a worker runs. Rebase only on a failed CAS.
    for (let attempt = 0; ; attempt++) {
      const basic = await this.read();
      try {
        return await this.medplum.updateResource(change(basic), ifMatch(basic));
      } catch (err) {
        if (attempt >= 4 || !isVersionConflict(err)) {
          throw err;
        }
      }
    }
  }
}

export function isVersionConflict(err: unknown): boolean {
  return err instanceof OperationOutcomeError && [409, 412].includes(getStatus(err.outcome));
}

export async function withConnectionLease<T>(
  medplum: MedplumClient,
  id: string,
  work: (lease: ConnectionLease) => Promise<T>,
  now: () => number = Date.now
): Promise<T> {
  const basic = repairCheckpoint(await medplum.readResource('Basic', id, { cache: 'no-cache' }));
  await assertCurrentProject(medplum, basic);
  const previous = basic.extension?.find((e) => e.url === LEASE_URL);
  const expires = previous?.extension?.find((e) => e.url === 'expires')?.valueInstant;
  if (previous && (!expires || !Number.isFinite(Date.parse(expires)) || Date.parse(expires) > now())) {
    throw new ConnectionBusyError();
  }
  const token = randomUUID();
  try {
    await medplum.updateResource(
      {
        ...basic,
        extension: [
          ...(basic.extension ?? []).filter((e) => e.url !== LEASE_URL),
          {
            url: LEASE_URL,
            extension: [
              { url: 'owner', valueString: token },
              { url: 'expires', valueInstant: new Date(now() + LEASE_MS).toISOString() },
            ],
          },
        ],
      },
      ifMatch(basic)
    );
  } catch (err) {
    if (isVersionConflict(err)) {
      throw new ConnectionBusyError();
    }
    throw err;
  }
  const lease = new ConnectionLease(medplum, id, token, basic.meta?.versionId as string, now);
  try {
    const result = await work(lease);
    try {
      await lease.read(true);
    } catch (err) {
      if (!(err instanceof OperationOutcomeError && (isNotFound(err.outcome) || isGone(err.outcome)))) {
        throw err;
      }
    }
    return result;
  } finally {
    const release = async (): Promise<void> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = repairCheckpoint(await medplum.readResource('Basic', id, { cache: 'no-cache' }));
        const owner = current.extension
          ?.find((e) => e.url === LEASE_URL)
          ?.extension?.find((e) => e.url === 'owner')?.valueString;
        const expiry = current.extension
          ?.find((e) => e.url === LEASE_URL)
          ?.extension?.find((e) => e.url === 'expires')?.valueInstant;
        if (owner !== token || Date.parse(expiry ?? '') <= now()) {
          break;
        }
        try {
          // Publish before releasing the lock so an older worker cannot overwrite a newer summary.
          let pending = false;
          try {
            await publishStatus(medplum, current);
          } catch {
            pending = true;
            console.warn('Calendar status publication failed; retry queued without holding the lease');
          }
          await medplum.updateResource(
            withState(
              { ...current, extension: current.extension?.filter((e) => e.url !== LEASE_URL) },
              { ...readState(current), statusPublishPending: pending || undefined }
            ),
            ifMatch(current)
          );
          break;
        } catch (err) {
          if (attempt === 4 || !isVersionConflict(err)) {
            throw err;
          }
        }
      }
    };
    try {
      await release();
    } catch (err) {
      // A successful disconnect deletes the connection. Other failures leave the lease to expire.
      if (!(err instanceof OperationOutcomeError && (isNotFound(err.outcome) || isGone(err.outcome)))) {
        console.warn('Calendar lease release failed; the lease remains until expiry');
      }
    }
  }
}
