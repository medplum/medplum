// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, OperationOutcomeError, serverError } from '@medplum/core';
import type { Practitioner, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig } from './config/loader';
import {
  buildTracingExtension,
  getAuthenticatedContext,
  getRequestContext,
  RequestContext,
  RevokedAuthStateError,
  runInAuthenticatedContext,
  runInRequestContext,
  tryGetRequestContext,
  tryRunInRequestContext,
} from './context';
import type { SystemRepository } from './fhir/repo';
import { getGlobalSystemRepo, Repository } from './fhir/repo';
import type { AuthState } from './oauth/middleware';
import { requestContextStore } from './request-context-store';
import { createTestProject, withTestContext } from './test.setup';

describe('RequestContext', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  test('tryGetRequestContext', async () => {
    expect(tryGetRequestContext()).toBeUndefined();
    await withTestContext(() => expect(tryGetRequestContext()).toBeDefined());
  });

  test('getRequestContext', async () => {
    expect(() => getRequestContext()).toThrow('No request context available');
    await withTestContext(() => expect(getRequestContext()).toBeDefined());
  });

  test('getAuthenticatedContext', async () => {
    expect(() => getAuthenticatedContext()).toThrow('No request context available');

    requestContextStore.run(new RequestContext('request', 'trace'), () => {
      expect(() => getAuthenticatedContext()).toThrow('Request is not authenticated');
    });

    await withTestContext(() => {
      expect(() => getAuthenticatedContext()).toThrow('Request is not authenticated');
    });
  });

  test('tryRunInRequestContext', () => {
    tryRunInRequestContext(undefined, undefined, () => {
      expect(tryGetRequestContext()).toBeUndefined();
    });
    tryRunInRequestContext('request', 'trace', () => {
      expect(tryGetRequestContext()).toBeDefined();
    });
  });

  test('runInRequestContext generates missing IDs', () => {
    runInRequestContext(undefined, undefined, () => {
      expect(getRequestContext()).toMatchObject({ requestId: expect.any(String), traceId: expect.any(String) });
    });
    runInRequestContext('request', 'trace', () => {
      expect(getRequestContext()).toMatchObject({ requestId: 'request', traceId: 'trace' });
    });
  });

  describe('buildTracingExtension', () => {
    test('outside of RequestContext', () => {
      expect(() => buildTracingExtension()).not.toThrow();
    });

    test('with both traceId and requestId', async () => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual({
            extension: [
              {
                url: 'requestId',
                valueId: 'a-request-id',
              },
              {
                url: 'traceId',
                valueId: 'a-trace-id',
              },
            ],
            url: 'https://medplum.com/fhir/StructureDefinition/tracing',
          });
        },
        { requestId: 'a-request-id', traceId: 'a-trace-id' }
      );
    });

    test.each([
      ['a-request-id', ''],
      ['a-request-id', undefined],
    ])('with missing traceId', async (requestId: string | undefined, traceId: string | undefined) => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual({
            extension: [
              {
                url: 'requestId',
                valueId: requestId,
              },
            ],
            url: 'https://medplum.com/fhir/StructureDefinition/tracing',
          });
        },
        { requestId, traceId }
      );
    });
    test.each([
      ['', 'a-trace-id'],
      [undefined, 'a-trace-id'],
    ])('with missing requestId', async (requestId: string | undefined, traceId: string | undefined) => {
      await withTestContext(
        () => {
          expect(buildTracingExtension()).toStrictEqual({
            extension: [
              {
                url: 'traceId',
                valueId: traceId,
              },
            ],
            url: 'https://medplum.com/fhir/StructureDefinition/tracing',
          });
        },
        { requestId, traceId }
      );
    });
    test.each([
      ['', ''],
      [undefined, undefined],
    ])(
      'with both traceId and requestId missing',
      async (requestId: string | undefined, traceId: string | undefined) => {
        await withTestContext(
          () => {
            expect(buildTracingExtension()).toBeUndefined();
          },
          { requestId, traceId }
        );
      }
    );
  });

  describe('runInAuthenticatedContext', () => {
    let authState: AuthState;
    let systemRepo: SystemRepository;

    beforeAll(async () => {
      await initAppServices(await loadTestConfig());
      const { login, project, membership, repo } = await createTestProject({
        withClient: true,
        withAccessToken: true,
        withRepo: true,
      });
      authState = { login, project, membership, userConfig: { resourceType: 'UserConfiguration' } };
      systemRepo = repo.getSystemRepo();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await shutdownApp();
    });

    // An extra membership in the shared project, for tests that revoke one without breaking the others
    async function createMembership(
      membership?: Partial<ProjectMembership>
    ): Promise<{ profile: WithId<Practitioner>; membership: WithId<ProjectMembership> }> {
      const profile = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });
      return {
        profile,
        membership: await systemRepo.createResource<ProjectMembership>({
          resourceType: 'ProjectMembership',
          project: createReference(authState.project),
          user: { reference: `User/${randomUUID()}` },
          profile: createReference(profile),
          ...membership,
        }),
      };
    }

    test('Runs with the current project and membership, not the serialized ones', async () => {
      await systemRepo.updateResource<Project>({ ...authState.project, name: 'Renamed' });
      await systemRepo.updateResource<ProjectMembership>({ ...authState.membership, admin: true });

      const { project, membership } = await runInAuthenticatedContext(
        authState,
        undefined,
        undefined,
        undefined,
        () => {
          const ctx = getAuthenticatedContext();
          return { project: ctx.repo.currentProject(), membership: ctx.membership };
        }
      );
      expect(project?.name).toBe('Renamed');
      expect(membership.admin).toBe(true);
    });

    test('Rejects a deleted membership as revoked without running', async () => {
      const { membership } = await createMembership();
      await systemRepo.deleteResource('ProjectMembership', membership.id);

      const fn = vi.fn();
      await expect(
        runInAuthenticatedContext({ ...authState, membership }, undefined, undefined, undefined, fn)
      ).rejects.toBeInstanceOf(RevokedAuthStateError);
      expect(fn).not.toHaveBeenCalled();
    });

    test('Rejects an inactive on-behalf-of membership as revoked', async () => {
      const { profile: onBehalfOf, membership: onBehalfOfMembership } = await createMembership({ active: false });

      const err = await runInAuthenticatedContext(
        { ...authState, onBehalfOf, onBehalfOfMembership },
        undefined,
        undefined,
        undefined,
        () => undefined
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RevokedAuthStateError);
      expect((err as RevokedAuthStateError).outcome.issue[0].details?.text).toBe('Profile not active');
    });

    test('Rejects an on-behalf-of membership whose own project is inactive', async () => {
      const otherProject = await getGlobalSystemRepo().createResource<Project>({
        resourceType: 'Project',
        active: false,
      });
      const { profile: onBehalfOf, membership: onBehalfOfMembership } = await createMembership({
        project: createReference(otherProject),
      });

      const err = await runInAuthenticatedContext(
        { ...authState, onBehalfOf, onBehalfOfMembership },
        undefined,
        undefined,
        undefined,
        () => undefined
      ).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RevokedAuthStateError);
      expect((err as RevokedAuthStateError).outcome.issue[0].details?.text).toBe('Project not active');
    });

    test('Rethrows other read failures unchanged so the job can be retried', async () => {
      const dbErr = new OperationOutcomeError(serverError(new Error('database unavailable')));
      vi.spyOn(Repository.prototype, 'readResource').mockRejectedValueOnce(dbErr);

      await expect(runInAuthenticatedContext(authState, undefined, undefined, undefined, () => undefined)).rejects.toBe(
        dbErr
      );
    });
  });
});
