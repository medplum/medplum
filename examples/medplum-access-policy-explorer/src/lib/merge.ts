// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { projectAdminResourceTypes, readInteractions } from '@medplum/core';
import type {
  AccessPolicy,
  AccessPolicyResource,
  ProjectMembershipAccessParameter,
  Reference,
} from '@medplum/fhirtypes';

/**
 * One entry of a membership's `access` list (or its legacy `accessPolicy`), with the policy already loaded.
 */
export interface AccessRow {
  /** Display label for the policy, usually its name. */
  readonly label: string;
  readonly policy: AccessPolicy;
  readonly parameters: ProjectMembershipAccessParameter[];
}

export type EntrySourceKind = 'policy' | 'legacy' | 'default' | 'admin' | 'bot-system';

export interface EntrySource {
  readonly kind: EntrySourceKind;
  readonly label: string;
  /** Index into the `AccessRow` list, for entries that came from a policy. */
  readonly rowIndex?: number;
  /** Index of the entry within its original policy's `resource` array. */
  readonly entryIndex?: number;
}

export interface MergedEntry {
  /** Position in the merged `resource` array. Earlier entries win. */
  readonly index: number;
  readonly entry: AccessPolicyResource;
  readonly source: EntrySource;
}

export interface MergeOptions {
  /** Reference string for the membership's profile, e.g. `Practitioner/123`. Fills `%profile` and default `%patient`. */
  readonly profile?: string;
  /** Project ID, used for the project admin rules. */
  readonly projectId?: string;
  /** Whether the membership is a project admin. */
  readonly admin?: boolean;
  /** Apply the `Bot.system` readonly rule that the server adds for non-super-admin projects. */
  readonly botSystemReadonly?: boolean;
}

export interface MergeWarning {
  readonly message: string;
  readonly rowIndex?: number;
}

export interface MergeResult {
  readonly entries: MergedEntry[];
  readonly compartment?: Reference;
  readonly warnings: MergeWarning[];
}

const DEFAULT_RESOURCE_TYPES = ['SearchParameter', 'StructureDefinition'];
const UNRESOLVED_VARIABLE = /%[A-Za-z_][\w-]*(\.id)?/g;

/**
 * Combines access policies the same way the Medplum server does at login.
 *
 * Mirrors `buildAccessPolicy`, `applyProjectAdminAccessPolicy` and `applyBotSystemReadonly` in
 * `packages/server/src/fhir/accesspolicy.ts`, but keeps track of where each merged entry came from.
 * SMART scopes and super admin projects are not modeled.
 * @param rows - The access entries, in membership order (legacy `accessPolicy` first, then `access`).
 * @param options - Membership context.
 * @returns The merged entries, effective compartment, and warnings.
 */
export function mergeAccessPolicies(rows: readonly AccessRow[], options: MergeOptions = {}): MergeResult {
  const warnings: MergeWarning[] = [];
  let entries: { entry: AccessPolicyResource; source: EntrySource }[] = [];
  let compartment: Reference | undefined;
  const compartmentSources: string[] = [];

  rows.forEach((row, rowIndex) => {
    const replaced = substituteParameters(row.policy, row.parameters, options.profile);
    for (const variable of findUnresolvedVariables(replaced)) {
      warnings.push({
        rowIndex,
        message: `"${row.label}" still contains ${variable} after parameter substitution; the server will match it literally.`,
      });
    }
    if (replaced.compartment) {
      compartment = replaced.compartment;
      compartmentSources.push(row.label);
    }
    replaced.resource?.forEach((entry, entryIndex) => {
      const copy = { ...entry };
      if (!copy.interaction && copy.readonly) {
        copy.interaction = [...readInteractions];
      }
      entries.push({ entry: copy, source: { kind: 'policy', label: row.label, rowIndex, entryIndex } });
    });
  });

  if (compartmentSources.length > 1) {
    warnings.push({
      message: `Multiple policies set a compartment (${compartmentSources.join(', ')}); only the last one, "${compartmentSources.at(-1)}", is kept.`,
    });
  }

  if (rows.length === 0) {
    entries.push({
      entry: { resourceType: '*' },
      source: { kind: 'legacy', label: 'No access policy (legacy full access)' },
    });
  }

  for (const resourceType of DEFAULT_RESOURCE_TYPES) {
    if (!entries.some((e) => e.entry.resourceType === resourceType)) {
      entries.push({ entry: { resourceType, readonly: true }, source: { kind: 'default', label: 'Server default' } });
    }
  }

  entries = applyProjectAdminRules(entries, options);

  if (options.botSystemReadonly ?? true) {
    entries = entries.flatMap((e) => {
      if (e.entry.resourceType === 'Bot') {
        return [{ ...e, entry: withReadonlyField(e.entry, 'system') }];
      }
      if (e.entry.resourceType === '*') {
        const botEntry: AccessPolicyResource = { ...e.entry, resourceType: 'Bot' };
        if (e.entry.criteria) {
          botEntry.criteria = e.entry.criteria.replace(/^\*\?/, 'Bot?');
        }
        return [
          { entry: withReadonlyField(botEntry, 'system'), source: { ...e.source, kind: 'bot-system' as const } },
          e,
        ];
      }
      return [e];
    });
  }

  return {
    entries: entries.map((e, index) => ({ ...e, index })),
    compartment,
    warnings,
  };
}

function substituteParameters(
  policy: AccessPolicy,
  parameters: readonly ProjectMembershipAccessParameter[],
  profile: string | undefined
): AccessPolicy {
  const params = [...parameters];
  if (profile) {
    params.push({ name: 'profile', valueReference: { reference: profile } });
    if (!params.some((p) => p.name === 'patient')) {
      params.push({ name: 'patient', valueReference: { reference: profile } });
    }
  }
  let json = JSON.stringify(policy);
  for (const param of params) {
    if (param.valueString) {
      json = json.replaceAll(`%${param.name}`, param.valueString);
    } else if (param.valueReference?.reference) {
      const reference = param.valueReference.reference;
      json = json.replaceAll(`%${param.name}.id`, reference.split('/').at(-1) ?? '');
      json = json.replaceAll(`%${param.name}`, reference);
    }
  }
  return JSON.parse(json) as AccessPolicy;
}

function findUnresolvedVariables(policy: AccessPolicy): string[] {
  const found = new Set<string>();
  const strings = [
    policy.compartment?.reference,
    ...(policy.resource ?? []).flatMap((r) => [r.criteria, r.compartment?.reference]),
  ];
  for (const value of strings) {
    for (const match of value?.matchAll(UNRESOLVED_VARIABLE) ?? []) {
      found.add(match[0]);
    }
  }
  return [...found];
}

function applyProjectAdminRules(
  entries: { entry: AccessPolicyResource; source: EntrySource }[],
  options: MergeOptions
): { entry: AccessPolicyResource; source: EntrySource }[] {
  const nonAdminTypes = (e: { entry: AccessPolicyResource }): boolean =>
    !projectAdminResourceTypes.includes(e.entry.resourceType);
  const project = options.projectId ?? '<project>';

  if (options.admin) {
    const admin = (entry: AccessPolicyResource): { entry: AccessPolicyResource; source: EntrySource } => ({
      entry,
      source: { kind: 'admin', label: 'Project admin rules' },
    });
    const ownProject: AccessPolicyResource['writeConstraint'] = [
      {
        language: 'text/fhirpath',
        expression: `%before.exists() or project.empty() or project.reference = 'Project/${project}'`,
      },
    ];
    return [
      ...entries.filter(nonAdminTypes),
      admin({ resourceType: 'AccessPolicy', criteria: `AccessPolicy?_project=${project}` }),
      admin({
        resourceType: 'Project',
        criteria: `Project?_id=${project}`,
        readonlyFields: ['active', 'features', 'link', 'systemSetting'],
        hiddenFields: ['superAdmin', 'systemSecret', 'strictMode'],
        interaction: ['read', 'vread', 'update', 'history', 'create', 'search'],
      }),
      admin({
        resourceType: 'Project',
        hiddenFields: ['superAdmin', 'setting', 'systemSetting', 'secret', 'systemSecret', 'strictMode'],
        interaction: ['read', 'vread', 'history', 'search'],
      }),
      admin({
        resourceType: 'ProjectMembership',
        criteria: `ProjectMembership?_project=${project}`,
        readonlyFields: ['project', 'user'],
        writeConstraint: ownProject,
      }),
      admin({
        resourceType: 'UserSecurityRequest',
        criteria: `UserSecurityRequest?_project=${project}`,
        interaction: [...readInteractions],
      }),
      admin({
        resourceType: 'User',
        criteria: `User?_project=${project}`,
        hiddenFields: ['passwordHash', 'mfaSecret'],
        readonlyFields: ['email', 'emailVerified', 'mfaEnrolled', 'project'],
        writeConstraint: ownProject,
      }),
      admin({ resourceType: 'Cron', criteria: `Cron?_project=${project}` }),
      admin({ resourceType: 'Package', interaction: [...readInteractions] }),
      admin({ resourceType: 'PackageRelease', interaction: [...readInteractions] }),
      admin({ resourceType: 'PackageInstallation', interaction: [...readInteractions] }),
    ];
  }

  // Non-admins keep read access to AccessPolicy (including via wildcard), but nothing else on admin types
  const policyReads = entries
    .filter((e) => e.entry.resourceType === 'AccessPolicy' || e.entry.resourceType === '*')
    .map((e) => ({
      entry: {
        ...e.entry,
        resourceType: 'AccessPolicy',
        criteria: e.entry.criteria?.replace(/^\*\?/, 'AccessPolicy?'),
        interaction: e.entry.interaction?.filter((i) => readInteractions.includes(i)) ?? [...readInteractions],
      },
      source: {
        ...e.source,
        kind: 'admin' as const,
        label: `${e.source.label} (AccessPolicy read-only for non-admins)`,
      },
    }));
  return [...entries.filter(nonAdminTypes), ...policyReads];
}

function withReadonlyField(entry: AccessPolicyResource, field: string): AccessPolicyResource {
  if (entry.readonlyFields?.includes(field) || entry.hiddenFields?.includes(field)) {
    return entry;
  }
  return { ...entry, readonlyFields: [...(entry.readonlyFields ?? []), field] };
}
