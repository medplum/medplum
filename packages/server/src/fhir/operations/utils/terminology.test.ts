// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type { CodeSystem, CodeSystemProperty, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { initAppServices, shutdownApp } from '../../../app';
import { loadTestConfig } from '../../../config/loader';
import { r4ProjectId } from '../../../constants';
import { createTestProject, withTestContext } from '../../../test.setup';
import { getGlobalSystemRepo } from '../../repo';
import { SelectQuery, SqlBuilder } from '../../sql';
import { addDescendants, findTerminologyResource, parentProperty } from './terminology';

describe('Terminology query builders', () => {
  const codeSystem = {
    resourceType: 'CodeSystem',
    id: '11111111-1111-1111-1111-111111111111',
    url: 'http://example.com/cs',
    hierarchyMeaning: 'is-a',
  } as WithId<CodeSystem>;
  const property = {
    id: '22222222-2222-2222-2222-222222222222',
    code: 'parent',
    uri: parentProperty,
    type: 'code',
  } as WithId<CodeSystemProperty>;

  test('addDescendants emits a literal `target > 0` predicate to use the partial reverse index', () => {
    // Column list must match the CTE's base term, which selects the root's canonical row
    const query = new SelectQuery('Coding')
      .column('id')
      .column('code')
      .column('display')
      .where('system', '=', codeSystem.id);
    const descendantQuery = addDescendants(query, codeSystem, property, 'ROOT');

    const sql = new SqlBuilder();
    descendantQuery.buildSql(sql);
    const text = sql.toString();

    // The subtree is seeded from the root's canonical row, so the CTE holds one row per concept
    expect(text).toContain('"synonymOf" IS NULL');

    // The recursive join must carry a `target > 0` bound, emitted as a SQL literal so the query planner can prove
    // the partial `Coding_Property_reverse_rel_lookup_idx` (target > 0) predicate at plan time.
    expect(text).toMatch(/"[^"]+"\."target" > 0/);
    // The `0` must be a literal, not a bound parameter (a generic plan couldn't prove the predicate otherwise).
    expect(sql.getValues()).not.toContain(0);
  });
});

describe('findTerminologyResource', () => {
  const systemRepo = getGlobalSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  function createCodeSystem(projectId: string, codeSystem: Partial<CodeSystem>): Promise<WithId<CodeSystem>> {
    return systemRepo.createResource<CodeSystem>({
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      ...codeSystem,
      meta: { project: projectId },
    });
  }

  function linkTo(...projects: WithId<Project>[]): Partial<Project> {
    return { link: projects.map((project) => ({ project: createReference(project) })) };
  }

  test('Prefers current Project over linked Project with newer version and date', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const { project: linked } = await createTestProject();
      await createCodeSystem(linked.id, { url, version: '9.9.9', date: '2030-01-01' });

      const { project, repo } = await createTestProject({ withRepo: true, project: linkTo(linked) });
      const own = await createCodeSystem(project.id, { url, version: '1.0.0', date: '2020-01-01' });

      await expect(findTerminologyResource(repo, 'CodeSystem', url)).resolves.toMatchObject({ id: own.id });
    }));

  test('Prefers linked Projects in link order', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const { project: p1 } = await createTestProject();
      const { project: p2 } = await createTestProject();
      const { project: p3 } = await createTestProject();
      const cs1 = await createCodeSystem(p1.id, { url });
      const cs2 = await createCodeSystem(p2.id, { url });
      const cs3 = await createCodeSystem(p3.id, { url });

      const { repo: firstRepo } = await createTestProject({ withRepo: true, project: linkTo(p1, p2, p3) });
      await expect(findTerminologyResource(firstRepo, 'CodeSystem', url)).resolves.toMatchObject({ id: cs1.id });

      const { repo: secondRepo } = await createTestProject({ withRepo: true, project: linkTo(p3, p1, p2) });
      await expect(findTerminologyResource(secondRepo, 'CodeSystem', url)).resolves.toMatchObject({ id: cs3.id });

      expect(cs2.id).toBeDefined();
    }));

  test('Falls back to base FHIR resource when no Project-local resource exists', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const base = await createCodeSystem(r4ProjectId, { url });
      const { project: linked } = await createTestProject();

      const { repo: unlinkedRepo } = await createTestProject({ withRepo: true });
      await expect(findTerminologyResource(unlinkedRepo, 'CodeSystem', url)).resolves.toMatchObject({ id: base.id });

      // A linked Project's resource outranks the base FHIR one
      const linkedCodeSystem = await createCodeSystem(linked.id, { url });
      const { repo: linkedRepo } = await createTestProject({ withRepo: true, project: linkTo(linked) });
      await expect(findTerminologyResource(linkedRepo, 'CodeSystem', url)).resolves.toMatchObject({
        id: linkedCodeSystem.id,
      });
    }));

  test('ownProjectOnly selects the current Project resource ranked below a linked one', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const { project: linked } = await createTestProject();
      await createCodeSystem(linked.id, { url, content: 'complete' });

      const { project, repo } = await createTestProject({ withRepo: true, project: linkTo(linked) });
      const own = await createCodeSystem(project.id, { url, content: 'fragment' });

      await expect(findTerminologyResource(repo, 'CodeSystem', url, { ownProjectOnly: true })).resolves.toMatchObject({
        id: own.id,
      });
    }));

  test('Removes extended metadata from the resolved resource', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const { project, repo } = await createTestProject({ withRepo: true, extendedMode: false });
      await createCodeSystem(project.id, { url });

      const resolved = await findTerminologyResource(repo, 'CodeSystem', url);
      expect(resolved.meta?.project).toBeUndefined();
      expect(resolved.meta?.author).toBeUndefined();
      expect(resolved.meta?.compartment).toBeUndefined();

      const { repo: extendedRepo } = await createTestProject({ withRepo: true, project: linkTo(project) });
      const extended = await findTerminologyResource(extendedRepo, 'CodeSystem', url);
      expect(extended.meta?.project).toStrictEqual(project.id);
    }));

  test('Excludes retired resources', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const { project, repo } = await createTestProject({ withRepo: true });
      await createCodeSystem(project.id, { url, status: 'retired' });

      await expect(findTerminologyResource(repo, 'CodeSystem', url)).rejects.toThrow(`CodeSystem ${url} not found`);
    }));

  test('Throws when the resource does not exist', () =>
    withTestContext(async () => {
      const url = 'http://example.com/cs-' + randomUUID();
      const { repo } = await createTestProject({ withRepo: true });

      await expect(findTerminologyResource(repo, 'CodeSystem', url)).rejects.toThrow(`CodeSystem ${url} not found`);
    }));
});
