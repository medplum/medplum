// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AccessPolicy, AccessPolicyIpAccessRule, ProjectMembership } from '@medplum/fhirtypes';
import type { SecretRotation, SecurityCheckInput } from './checks';
import { analyzeProjectSecurity, listClients } from './checks';

const NOW = new Date('2026-11-23T00:00:00Z');
const DAY = 86_400_000;

function policy(id: string, rest: Partial<AccessPolicy> = {}): AccessPolicy {
  return { resourceType: 'AccessPolicy', id, resource: [{ resourceType: 'Patient' }], ...rest };
}

function clientMembership(rest: Partial<ProjectMembership> = {}): ProjectMembership {
  return {
    resourceType: 'ProjectMembership',
    id: 'm1',
    project: { reference: 'Project/p1' },
    user: { reference: 'ClientApplication/c1' },
    profile: { reference: 'ClientApplication/c1', display: 'Client One' },
    ...rest,
  };
}

function makeInput(
  membership: ProjectMembership,
  accessPolicies: AccessPolicy[],
  secretRotations = new Map<string, SecretRotation>()
): SecurityCheckInput {
  return {
    project: { resourceType: 'Project', id: 'p1' },
    memberships: [membership],
    accessPolicies,
    users: [],
    secretRotations,
    now: NOW,
  };
}

function findingIds(input: SecurityCheckInput): string[] {
  return analyzeProjectSecurity(input).map((f) => f.id.split('/')[0]);
}

describe('security checks', () => {
  test.each<[string, AccessPolicyIpAccessRule[], boolean]>([
    ['single allow rule', [{ value: '10.0.0.1', action: 'allow' }], false],
    ['single block rule', [{ value: '1.2.3.4', action: 'block' }], false],
    [
      'allow then block *',
      [
        { value: '10.0.0.1', action: 'allow' },
        { value: '*', action: 'block' },
      ],
      true,
    ],
    [
      'allow * before block *',
      [
        { value: '*', action: 'allow' },
        { value: '*', action: 'block' },
      ],
      false,
    ],
  ])('IP restriction: %s', (_name, ipAccessRule, restricted) => {
    const input = makeInput(clientMembership({ accessPolicy: { reference: 'AccessPolicy/a1' } }), [
      policy('a1', { ipAccessRule }),
    ]);
    expect(listClients(input)[0].ipRestricted).toBe(restricted);
    expect(findingIds(input).includes('client-no-ip')).toBe(!restricted);
  });

  test('IP rules are evaluated across policies in membership order', () => {
    const input = makeInput(
      clientMembership({
        accessPolicy: { reference: 'AccessPolicy/a1' },
        access: [{ policy: { reference: 'AccessPolicy/a2' } }],
      }),
      [
        policy('a1', { ipAccessRule: [{ value: '*', action: 'allow' }] }),
        policy('a2', { ipAccessRule: [{ value: '*', action: 'block' }] }),
      ]
    );
    expect(listClients(input)[0].ipRestricted).toBe(false);
  });

  test.each<[string, AccessPolicy['resource'], boolean]>([
    ['readonly without interaction', [{ resourceType: 'Bot', readonly: true }], false],
    ['interaction list with readonly', [{ resourceType: 'Bot', readonly: true, interaction: ['update'] }], true],
    ['wildcard resource type', [{ resourceType: '*' }], true],
  ])('Bot write: %s', (_name, resource, canWriteBots) => {
    const input = makeInput(clientMembership({ accessPolicy: { reference: 'AccessPolicy/a1' } }), [
      policy('a1', { resource }),
    ]);
    expect(listClients(input)[0].canWriteBots).toBe(canWriteBots);
    expect(findingIds(input).includes('client-writes-bots')).toBe(canWriteBots);
  });

  test('client with no access policy is critical', () => {
    const input = makeInput(clientMembership(), []);
    expect(analyzeProjectSecurity(input)[0]).toMatchObject({ id: 'client-no-policy/m1', severity: 'critical' });
    expect(listClients(input)[0]).toMatchObject({
      hasPolicy: false,
      policiesResolved: true,
      ipRestricted: false,
      canWriteBots: true,
    });
  });

  test('client admin', () => {
    const input = makeInput(clientMembership({ admin: true, accessPolicy: { reference: 'AccessPolicy/a1' } }), [
      policy('a1', { ipAccessRule: [{ value: '*', action: 'block' }] }),
    ]);
    expect(findingIds(input)).toEqual(['client-admin']);
  });

  test('policy that cannot be loaded', () => {
    const input = makeInput(clientMembership({ accessPolicy: { reference: 'AccessPolicy/linked' } }), []);
    expect(listClients(input)[0]).toMatchObject({ hasPolicy: true, policiesResolved: false, canWriteBots: false });
    expect(findingIds(input)).toEqual(['policy-unresolved']);
  });

  test('Bot write with one policy that cannot be loaded', () => {
    const input = makeInput(
      clientMembership({
        accessPolicy: { reference: 'AccessPolicy/a1' },
        access: [{ policy: { reference: 'AccessPolicy/linked' } }],
      }),
      [policy('a1', { resource: [{ resourceType: 'Bot' }] })]
    );
    expect(listClients(input)[0]).toMatchObject({ policiesResolved: false, canWriteBots: true });
  });

  test('secret age with partial history', () => {
    const rotations = new Map([
      ['ClientApplication/c1', { setAt: new Date(NOW.getTime() - 200 * DAY), atLeast: true }],
    ]);
    const input = makeInput(clientMembership(), [], rotations);
    expect(listClients(input)[0]).toMatchObject({ secretAgeDays: 200, secretAgeIsLowerBound: true });
    expect(analyzeProjectSecurity(input).find((f) => f.id === 'client-secret-age/m1')?.title).toContain(
      'at least 200 days'
    );
  });

  test('staff admins, email domains and patient access', () => {
    const staff: ProjectMembership[] = [1, 2, 3, 4].map((n) => ({
      resourceType: 'ProjectMembership',
      id: `s${n}`,
      project: { reference: 'Project/p1' },
      user: { reference: `User/u${n}` },
      profile: { reference: `Practitioner/pr${n}` },
      accessPolicy: { reference: 'AccessPolicy/a1' },
      admin: true,
    }));
    const patient: ProjectMembership = {
      resourceType: 'ProjectMembership',
      id: 'pt1',
      project: { reference: 'Project/p1' },
      user: { reference: 'User/u9' },
      profile: { reference: 'Patient/pt1' },
      accessPolicy: { reference: 'AccessPolicy/wide' },
    };
    const input: SecurityCheckInput = {
      project: { resourceType: 'Project', id: 'p1' },
      memberships: [...staff, patient],
      accessPolicies: [policy('a1'), policy('wide', { resource: [{ resourceType: '*' }] })],
      users: [1, 2, 3, 4].map((n) => ({
        resourceType: 'User',
        id: `u${n}`,
        firstName: 'Staff',
        lastName: `${n}`,
        email: `user${n}@example.org`,
      })),
      secretRotations: new Map(),
      now: NOW,
    };
    expect(findingIds(input).sort((a, b) => a.localeCompare(b))).toEqual([
      'email-domain-lock',
      'patient-broad-access',
      'staff-admins',
    ]);
  });
});
