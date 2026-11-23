// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, accessPolicySupportsInteraction, resolveId } from '@medplum/core';
import type { AccessPolicy, Project, ProjectMembership, Reference, ResourceType, User } from '@medplum/fhirtypes';

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_ORDER: SecuritySeverity[] = ['critical', 'high', 'medium', 'low'];

export const MAX_STAFF_ADMINS = 3;
export const MAX_STAFF_ADMIN_RATIO = 0.25;
export const MIN_STAFF_FOR_ADMIN_RATIO = 8;
export const SECRET_MAX_AGE_DAYS = 180;
export const STAFF_ADMINS_FINDING_ID = 'staff-admins';
const CLIENT_ADMIN_FINDING_PREFIX = 'client-admin';

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
]);

export interface SecurityFinding {
  readonly id: string;
  readonly severity: SecuritySeverity;
  readonly title: string;
  readonly description: string;
  readonly target?: Reference;
  readonly link?: string;
}

/**
 * When a client's current secret was set.
 * - `atLeast` is true when history could not be read back far enough, so `setAt` is the latest possible time.
 */
export interface SecretRotation {
  readonly setAt: Date;
  readonly atLeast: boolean;
}

/**
 * Inputs to the project security analysis.
 * - `secretRotations` maps a ClientApplication reference string to when its current secret was set.
 *   Clients whose secret is not visible to the current user are absent.
 */
export interface SecurityCheckInput {
  readonly project: Project;
  readonly memberships: ProjectMembership[];
  readonly accessPolicies: AccessPolicy[];
  readonly users: User[];
  readonly secretRotations: Map<string, SecretRotation>;
  readonly now: Date;
}

/**
 * Returns true for findings about admin privileges, which are also shown on the Admins tab.
 * @param finding - A security finding.
 * @returns True for the staff admin count, client admin and admin client Bot deploy findings.
 */
export function isAdminFinding(finding: SecurityFinding): boolean {
  return (
    finding.id === STAFF_ADMINS_FINDING_ID ||
    finding.id.startsWith(`${CLIENT_ADMIN_FINDING_PREFIX}/`) ||
    finding.id.startsWith('client-deploys-bots/')
  );
}

/**
 * A membership with project admin privileges.
 */
export interface AdminEntry {
  readonly membershipId: string;
  readonly name: string;
  readonly profileType: string;
  readonly profile: Reference;
  readonly link: string;
  readonly isOwner: boolean;
  readonly active: boolean;
  readonly accessPolicies: Reference<AccessPolicy>[];
}

/**
 * Lists every membership with project admin privileges, including users, bots and clients.
 * @param memberships - All project memberships.
 * @param owner - The project owner's User reference, if known.
 * @returns Admin memberships, owner first, then by profile type and name.
 */
export function listAdmins(memberships: ProjectMembership[], owner: Reference | undefined): AdminEntry[] {
  return memberships
    .filter((m) => m.admin)
    .map((membership) => ({
      membershipId: membership.id as string,
      name: getMembershipName(membership),
      profileType: membership.profile.reference?.split('/')[0] ?? 'Unknown',
      profile: membership.profile,
      link: getMembershipLink(membership),
      isOwner: !!owner?.reference && owner.reference === membership.user.reference,
      active: membership.active !== false,
      accessPolicies: getPolicyReferences(membership),
    }))
    .sort(
      (a, b) =>
        Number(b.isOwner) - Number(a.isOwner) ||
        a.profileType.localeCompare(b.profileType) ||
        a.name.localeCompare(b.name)
    );
}

/**
 * Security posture of one client application membership.
 * - `hasPolicy` is false when the membership has no access policy.
 * - `policiesResolved` is false when an assigned policy could not be read, for example one from a linked project.
 *   `ipRestricted` is then unknown, and `canWriteBots` is only known when true.
 * - `secretAgeDays` is undefined when the client's secret is not visible to the current user.
 *   `secretAgeIsLowerBound` is true when history ended before the secret was set, so the age is a minimum.
 */
export interface ClientEntry {
  readonly membershipId: string;
  readonly name: string;
  readonly profile: Reference;
  readonly link: string;
  readonly active: boolean;
  readonly admin: boolean;
  readonly hasPolicy: boolean;
  readonly policiesResolved: boolean;
  readonly accessPolicies: Reference<AccessPolicy>[];
  readonly ipRestricted: boolean;
  readonly canWriteBots: boolean;
  readonly secretAgeDays?: number;
  readonly secretAgeIsLowerBound: boolean;
}

/**
 * Lists every client application membership with its access policy, IP restriction, Bot write access and secret age.
 * @param input - The project resources to analyze.
 * @returns Client entries, riskiest first: no policy, then no IP restriction, then by name.
 */
export function listClients(input: SecurityCheckInput): ClientEntry[] {
  const policiesByRef = getPoliciesByRef(input.accessPolicies);
  return input.memberships
    .filter((m) => m.profile.reference?.startsWith('ClientApplication/'))
    .map((membership) => {
      const resolved = resolvePolicies(membership, policiesByRef);
      const secretAge = getSecretAge(membership.profile, input);
      return {
        membershipId: membership.id as string,
        name: getMembershipName(membership),
        profile: membership.profile,
        link: getMembershipLink(membership),
        active: membership.active !== false,
        admin: !!membership.admin,
        hasPolicy: !!resolved,
        policiesResolved: resolved?.complete ?? true,
        accessPolicies: getPolicyReferences(membership),
        ipRestricted: !!resolved?.complete && hasIpRestriction(resolved.policies),
        canWriteBots: !resolved || canWrite(resolved.policies, 'Bot'),
        secretAgeDays: secretAge?.days,
        secretAgeIsLowerBound: secretAge?.atLeast ?? false,
      };
    })
    .sort(
      (a, b) =>
        Number(a.hasPolicy) - Number(b.hasPolicy) ||
        Number(a.ipRestricted) - Number(b.ipRestricted) ||
        a.name.localeCompare(b.name)
    );
}

/**
 * Runs all deterministic security checks against a project's configuration.
 * @param input - The project resources to analyze.
 * @returns Findings sorted by severity, most severe first.
 */
export function analyzeProjectSecurity(input: SecurityCheckInput): SecurityFinding[] {
  const policiesByRef = getPoliciesByRef(input.accessPolicies);
  const active = input.memberships.filter((m) => m.active !== false);
  const findings: SecurityFinding[] = [];

  for (const membership of active) {
    findings.push(...checkMembership(membership, policiesByRef, input));
  }
  findings.push(...checkAdmins(active));
  findings.push(...checkStaffEmails(input.project, active, input.users));

  return findings.sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.title.localeCompare(b.title)
  );
}

function checkMembership(
  membership: ProjectMembership,
  policiesByRef: Map<string, AccessPolicy>,
  input: SecurityCheckInput
): SecurityFinding[] {
  const profileType = membership.profile.reference?.split('/')[0];
  const name = getMembershipName(membership);
  const link = getMembershipLink(membership);
  const target = membership.profile;
  const resolved = resolvePolicies(membership, policiesByRef);
  const findings: SecurityFinding[] = [];

  if (profileType === 'ClientApplication') {
    if (!resolved) {
      findings.push({
        id: `client-no-policy/${membership.id}`,
        severity: 'critical',
        title: `Client "${name}" has no access policy or IP restriction`,
        description:
          'This client can read and write every resource in the project from any IP address. If its credentials leak, all project data is exposed. Assign an access policy with IP restrictions.',
        target,
        link,
      });
    } else if (!resolved.complete) {
      findings.push(getUnresolvedPolicyFinding(membership));
    } else {
      const ipRestricted = hasIpRestriction(resolved.policies);
      const canWriteBots = canWrite(resolved.policies, 'Bot');
      if (canWriteBots && !membership.admin) {
        findings.push({
          id: `client-writes-bots/${membership.id}`,
          severity: ipRestricted ? 'medium' : 'high',
          title: ipRestricted
            ? `Client "${name}" can create or modify Bots`
            : `Client "${name}" can create or modify Bots from any IP address`,
          description:
            'Bots run code inside your project. A client that can write Bots can run arbitrary code with access to your data. Remove Bot write access from the client access policy unless it deploys Bots.',
          target,
          link,
        });
      }
      if (!ipRestricted && !canWriteBots) {
        findings.push({
          id: `client-no-ip/${membership.id}`,
          severity: 'medium',
          title: `Client "${name}" has no IP restriction`,
          description:
            'This client can authenticate from any IP address. If it runs on known infrastructure, add IP access rules to its access policy.',
          target,
          link,
        });
      }
    }

    if (membership.admin && (!resolved || canWrite(resolved.policies, 'Bot'))) {
      findings.push({
        id: `client-deploys-bots/${membership.id}`,
        severity: 'critical',
        title: `Client "${name}" is a project admin and can deploy Bots`,
        description:
          'Bots run code inside your project. An admin client that can write Bots can deploy code with access to all project data. Give this client an access policy without Bot write access.',
        target,
        link,
      });
    }

    if (membership.admin) {
      findings.push({
        id: `${CLIENT_ADMIN_FINDING_PREFIX}/${membership.id}`,
        severity: 'critical',
        title: `Client "${name}" is a project admin`,
        description:
          'Admin clients can manage memberships, access policies and project settings. Remove admin unless this client needs to administer the project.',
        target,
        link,
      });
    }

    const secretAge = getSecretAge(target, input);
    if (secretAge) {
      if (secretAge.days > SECRET_MAX_AGE_DAYS) {
        findings.push({
          id: `client-secret-age/${membership.id}`,
          severity: 'medium',
          title: `Client "${name}" secret has not been rotated in ${secretAge.atLeast ? 'at least ' : ''}${secretAge.days} days`,
          description: `Rotate client secrets at least every ${SECRET_MAX_AGE_DAYS} days to limit the impact of a leaked credential.`,
          target,
          link: `/${target.reference}`,
        });
      }
    }
    return findings;
  }

  if (profileType === 'Patient') {
    if (!resolved || grantsWildcard(resolved.policies)) {
      findings.push({
        id: `patient-broad-access/${membership.id}`,
        severity: 'high',
        title: resolved ? `Patient "${name}" has a wildcard access policy` : `Patient "${name}" has no access policy`,
        description:
          'This patient can access resources belonging to other patients. Patient access policies should be limited to the patient compartment.',
        target,
        link,
      });
    } else if (!resolved.complete) {
      findings.push(getUnresolvedPolicyFinding(membership));
    }
    return findings;
  }

  if (!resolved) {
    findings.push({
      id: `no-policy/${membership.id}`,
      severity: 'high',
      title: `${profileType ?? 'Member'} "${name}" has no access policy`,
      description:
        'Members without an access policy can read and write every resource in the project. Assign an access policy that grants only what this member needs.',
      target,
      link,
    });
  }
  return findings;
}

/**
 * Flags projects with more staff admins than the thresholds allow. Individual admins are listed by `listAdmins`.
 * @param memberships - Active project memberships.
 * @returns A single finding when there are too many staff admins, otherwise none.
 */
function checkAdmins(memberships: ProjectMembership[]): SecurityFinding[] {
  const staff = memberships.filter((m) => m.profile.reference?.startsWith('Practitioner/'));
  const staffAdminCount = staff.filter((m) => m.admin).length;
  const tooMany =
    staffAdminCount > MAX_STAFF_ADMINS ||
    (staff.length >= MIN_STAFF_FOR_ADMIN_RATIO && staffAdminCount / staff.length > MAX_STAFF_ADMIN_RATIO);
  if (!tooMany) {
    return [];
  }
  return [
    {
      id: STAFF_ADMINS_FINDING_ID,
      severity: 'medium',
      title: `${staffAdminCount} of ${staff.length} staff members are project admins`,
      description:
        'Admins can manage memberships, access policies and project settings. Review the Admins tab and remove admin from members who do not need it.',
    },
  ];
}

/**
 * Checks staff email addresses.
 * - Flags staff users on public email providers, whether or not the project has a domain lock.
 * - Suggests a domain lock when staff company addresses share one or two domains and no lock is set.
 * @param project - The project, with its settings.
 * @param memberships - Active project memberships.
 * @param users - The project's staff users.
 * @returns Email findings.
 */
function checkStaffEmails(project: Project, memberships: ProjectMembership[], users: User[]): SecurityFinding[] {
  const staffUserIds = new Set(
    memberships.filter((m) => m.profile.reference?.startsWith('Practitioner/')).map((m) => resolveId(m.user))
  );
  const publicEmails: string[] = [];
  const domains = new Set<string>();
  for (const user of users) {
    if (!staffUserIds.has(user.id) || !user.email) {
      continue;
    }
    const domain = user.email.slice(user.email.lastIndexOf('@') + 1).toLowerCase();
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
      publicEmails.push(user.email);
    } else {
      domains.add(domain);
    }
  }

  const findings: SecurityFinding[] = [];
  if (publicEmails.length > 0) {
    publicEmails.sort((a, b) => a.localeCompare(b));
    findings.push({
      id: 'staff-public-email',
      severity: 'medium',
      title: `${publicEmails.length} staff ${publicEmails.length === 1 ? 'user has' : 'users have'} a public email address`,
      description: `Staff accounts on public email providers cannot be limited by an email domain lock. Use company email addresses for staff accounts: ${publicEmails.join(', ')}.`,
      link: '/admin/users',
    });
  }

  const locked = project.setting?.some((s) => s.name === 'allowedPractitionerEmailDomain' && s.valueString);
  if (!locked && staffUserIds.size >= 2 && domains.size > 0 && domains.size <= 2) {
    const list = [...domains].sort((a, b) => a.localeCompare(b)).join(', ');
    findings.push({
      id: 'email-domain-lock',
      severity: 'medium',
      title: 'Staff email domains are not locked down',
      description: `Staff users have ${list} email addresses. Add an "allowedPractitionerEmailDomain" project setting for each so that only these domains can be invited.`,
      link: '/admin/settings',
    });
  }
  return findings;
}

function getPoliciesByRef(accessPolicies: AccessPolicy[]): Map<string, AccessPolicy> {
  return new Map(accessPolicies.map((p) => [`AccessPolicy/${p.id}`, p]));
}

function getPolicyReferences(membership: ProjectMembership): Reference<AccessPolicy>[] {
  return [membership.accessPolicy, ...(membership.access?.map((a) => a.policy) ?? [])].filter(
    (r): r is Reference<AccessPolicy> => !!r?.reference
  );
}

function getSecretAge(client: Reference, input: SecurityCheckInput): { days: number; atLeast: boolean } | undefined {
  const rotation = input.secretRotations.get(client.reference ?? '');
  if (!rotation) {
    return undefined;
  }
  return {
    days: Math.floor((input.now.getTime() - rotation.setAt.getTime()) / 86_400_000),
    atLeast: rotation.atLeast,
  };
}

/**
 * The access policies assigned to a membership that could be read.
 * - `complete` is false when at least one assigned policy could not be loaded, for example one from a linked project.
 */
interface ResolvedPolicies {
  readonly policies: AccessPolicy[];
  readonly complete: boolean;
}

/**
 * Looks up a membership's assigned access policies in membership order.
 * @param membership - The project membership.
 * @param policiesByRef - Readable access policies keyed by reference string.
 * @returns The resolved policies, or undefined when the membership has no access policy at all.
 */
function resolvePolicies(
  membership: ProjectMembership,
  policiesByRef: Map<string, AccessPolicy>
): ResolvedPolicies | undefined {
  const refs = getPolicyReferences(membership);
  if (refs.length === 0) {
    return undefined;
  }
  const policies = refs.map((r) => policiesByRef.get(r.reference as string)).filter((p): p is AccessPolicy => !!p);
  return { policies, complete: policies.length === refs.length };
}

function getUnresolvedPolicyFinding(membership: ProjectMembership): SecurityFinding {
  return {
    id: `policy-unresolved/${membership.id}`,
    severity: 'medium',
    title: `Access policy for "${getMembershipName(membership)}" could not be fully evaluated`,
    description:
      'At least one access policy assigned to this member could not be read, for example because it belongs to a linked project. Its IP restrictions and permissions were not checked. Review it in the project that owns it.',
    target: membership.profile,
    link: getMembershipLink(membership),
  };
}

/**
 * Returns true when the first wildcard IP access rule is a block rule.
 * @param policies - The membership's access policies, in membership order.
 * @returns True if the first wildcard rule blocks.
 */
function hasIpRestriction(policies: AccessPolicy[]): boolean {
  const wildcard = policies.flatMap((p) => p.ipAccessRule ?? []).find((r) => r.value === '*');
  return wildcard?.action === 'block';
}

function canWrite(policies: AccessPolicy[], resourceType: ResourceType): boolean {
  return policies.some(
    (p) =>
      accessPolicySupportsInteraction(p, AccessPolicyInteraction.CREATE, resourceType) ||
      accessPolicySupportsInteraction(p, AccessPolicyInteraction.UPDATE, resourceType)
  );
}

function grantsWildcard(policies: AccessPolicy[]): boolean {
  return policies.some((p) => p.resource?.some((r) => r.resourceType === '*' && !r.criteria));
}

function getMembershipName(membership: ProjectMembership): string {
  return membership.profile.display ?? membership.userName ?? membership.profile.reference ?? 'Unknown';
}

function getMembershipLink(membership: ProjectMembership): string {
  const profileType = membership.profile.reference?.split('/')[0];
  if (profileType === 'ClientApplication') {
    return `/admin/clients/${membership.id}`;
  }
  if (profileType === 'Bot') {
    return `/admin/bots/${membership.id}`;
  }
  return `/admin/users/${membership.id}`;
}
