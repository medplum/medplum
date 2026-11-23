// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AccessPolicy, AccessPolicyIpAccessRule, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import type { SecretRotation, SecurityCheckInput } from './checks';
import { analyzeProjectSecurity, isAdminFinding, listAdmins, listClients } from './checks';

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

function member(id: string, profile: string, rest: Partial<ProjectMembership> = {}): ProjectMembership {
  return {
    resourceType: 'ProjectMembership',
    id,
    project: { reference: 'Project/p1' },
    user: { reference: `User/${id}` },
    profile: { reference: profile },
    ...rest,
  };
}

function staffMembers(count: number, adminCount: number): ProjectMembership[] {
  return Array.from({ length: count }, (_, i) =>
    member(`s${i}`, `Practitioner/pr${i}`, { accessPolicy: { reference: 'AccessPolicy/a1' }, admin: i < adminCount })
  );
}

function projectInput(
  memberships: ProjectMembership[],
  users: User[] = [],
  project: Project = { resourceType: 'Project', id: 'p1' }
): SecurityCheckInput {
  return { project, memberships, accessPolicies: [policy('a1')], users, secretRotations: new Map(), now: NOW };
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

  test.each<[string, AccessPolicyIpAccessRule[], string]>([
    ['without IP restriction', [], 'high'],
    ['with IP restriction', [{ value: '*', action: 'block' }], 'medium'],
  ])('Bot write severity %s', (_name, ipAccessRule, severity) => {
    const input = makeInput(clientMembership({ accessPolicy: { reference: 'AccessPolicy/a1' } }), [
      policy('a1', { resource: [{ resourceType: 'Bot' }], ipAccessRule }),
    ]);
    expect(analyzeProjectSecurity(input)).toMatchObject([{ id: 'client-writes-bots/m1', severity }]);
  });

  test.each<[string, string]>([
    ['Practitioner/pr1', 'no-policy'],
    ['Bot/b1', 'no-policy'],
    ['Patient/pt1', 'patient-broad-access'],
  ])('member without access policy: %s', (profile, id) => {
    expect(analyzeProjectSecurity(projectInput([member('x1', profile)]))).toMatchObject([
      { id: `${id}/x1`, severity: 'high' },
    ]);
  });

  test.each<[string, string, string[]]>([
    ['compartment policy', 'pc', []],
    ['policy that cannot be loaded', 'linked', ['policy-unresolved']],
  ])('patient with %s', (_name, policyId, expected) => {
    const input = projectInput([
      member('pt1', 'Patient/pt1', { accessPolicy: { reference: `AccessPolicy/${policyId}` } }),
    ]);
    input.accessPolicies.push(policy('pc', { resource: [{ resourceType: '*', criteria: '*?_compartment=%patient' }] }));
    expect(findingIds(input)).toEqual(expected);
  });

  test('inactive members', () => {
    const input = makeInput(clientMembership({ active: false, admin: true }), []);
    expect(findingIds(input)).toEqual([]);
    expect(listClients(input)[0].active).toBe(false);
  });

  test.each<[number, number, boolean]>([
    [3, 3, false],
    [4, 4, true],
    [8, 2, false],
    [8, 3, true],
  ])('%i staff with %i admins', (count, adminCount, flagged) => {
    const findings = analyzeProjectSecurity(projectInput(staffMembers(count, adminCount)));
    expect(findings.map((f) => f.id)).toEqual(flagged ? ['staff-admins'] : []);
    expect(findings.every(isAdminFinding)).toBe(true);
  });

  test('admin list', () => {
    const memberships = [
      member('b1', 'Bot/b1', { admin: true }),
      member('s1', 'Practitioner/pr1', { admin: true }),
      member('s2', 'Practitioner/pr2', { admin: true }),
      member('s3', 'Practitioner/pr3'),
    ];
    expect(listAdmins(memberships, { reference: 'User/s2' }).map((a) => [a.membershipId, a.isOwner])).toEqual([
      ['s2', true],
      ['b1', false],
      ['s1', false],
    ]);
  });

  test.each<[string, string[], Project['setting'], boolean]>([
    ['one shared domain', ['a@example.org', 'b@example.org'], undefined, true],
    ['two domains', ['a@example.org', 'b@example.com'], undefined, true],
    ['three domains', ['a@example.org', 'b@example.com', 'c@example.net'], undefined, false],
    ['one staff user', ['a@example.org'], undefined, false],
    [
      'setting present',
      ['a@example.org', 'b@example.org'],
      [{ name: 'allowedPractitionerEmailDomain', valueString: 'example.org' }],
      false,
    ],
  ])('email domains: %s', (_name, emails, setting, flagged) => {
    const users: User[] = emails.map((email, i) => ({
      resourceType: 'User',
      id: `s${i}`,
      firstName: 'A',
      lastName: 'B',
      email,
    }));
    const input = projectInput(staffMembers(emails.length, 0), users, { resourceType: 'Project', id: 'p1', setting });
    expect(findingIds(input)).toEqual(flagged ? ['email-domain-lock'] : []);
  });

  test.each<[number, string | undefined]>([
    [180, undefined],
    [181, 'Client "Client One" secret has not been rotated in 181 days'],
  ])('secret age of %i days', (days, title) => {
    const rotations = new Map([
      ['ClientApplication/c1', { setAt: new Date(NOW.getTime() - days * DAY), atLeast: false }],
    ]);
    const input = makeInput(
      clientMembership({ accessPolicy: { reference: 'AccessPolicy/a1' } }),
      [policy('a1', { ipAccessRule: [{ value: '*', action: 'block' }] })],
      rotations
    );
    expect(analyzeProjectSecurity(input).find((f) => f.id === 'client-secret-age/m1')?.title).toBe(title);
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
