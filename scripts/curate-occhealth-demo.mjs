#!/usr/bin/env node
import { MedplumClient, normalizeErrorString } from '@medplum/core';

const DEFAULT_BASE_URL = 'https://api.ehr.hiivehealth.net/';
const DEFAULT_PROJECT_ID = '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8';
const CODE_SYSTEM = 'https://hiivecare.example/fhir/CodeSystem/medplum-ubix-demo';

const DEMO = {
  providerAccessPolicy: {
    resourceType: 'AccessPolicy',
    id: '05fa99c3-6400-4d8c-af38-8b00b890315d',
    reference: 'AccessPolicy/05fa99c3-6400-4d8c-af38-8b00b890315d',
  },
  provider: {
    resourceType: 'Practitioner',
    id: '59ea2d1d-f436-437c-a785-74850bddbfd3',
    reference: 'Practitioner/59ea2d1d-f436-437c-a785-74850bddbfd3',
    display: 'Dr Alex Demo',
  },
  patient: {
    resourceType: 'Patient',
    id: 'a3562d64-680b-4802-bc78-4b1d0d487080',
    reference: 'Patient/a3562d64-680b-4802-bc78-4b1d0d487080',
    display: 'Avery Rivera',
  },
  episode: {
    resourceType: 'EpisodeOfCare',
    id: 'e2cf8f66-b22b-4577-b858-b0481d24f0b8',
    reference: 'EpisodeOfCare/e2cf8f66-b22b-4577-b858-b0481d24f0b8',
    display: 'Exposure Incident',
  },
  task: {
    resourceType: 'Task',
    id: '6b0849f7-bd0e-42f0-a835-b441c2dccade',
    reference: 'Task/6b0849f7-bd0e-42f0-a835-b441c2dccade',
    code: 'rtw-follow-up',
    display: 'RTW case follow-up',
  },
  observation: {
    resourceType: 'Observation',
    id: '6729703e-7f98-462e-9e08-15ed2465dca1',
    reference: 'Observation/6729703e-7f98-462e-9e08-15ed2465dca1',
    code: 'return-to-work-status',
    valueString: 'pending-reevaluation',
  },
  exposure: {
    location: {
      resourceType: 'Location',
      id: 'c8b8e306-1947-4a17-95dd-082cca4fe2ba',
      reference: 'Location/c8b8e306-1947-4a17-95dd-082cca4fe2ba',
      display: 'Headquarters',
    },
    component: {
      reference: 'Organization/11d523d6-7c9f-5e18-91d5-24d67c9f1fcb',
      display: 'Component A',
    },
    patients: [
      {
        id: '371562f4-0fb6-48c3-a939-80b0e37b6087',
        reference: 'Patient/371562f4-0fb6-48c3-a939-80b0e37b6087',
        display: 'Morgan Nguyen',
        encounter: 'Encounter/eddb0ba8-1102-4300-a972-fcec5ff04c36',
        episode: 'EpisodeOfCare/4c14c6b4-4677-4270-9428-4554bcb7f77c',
        observation: 'Observation/ddb49e49-914e-4596-851f-1aadc8b5796f',
        task: 'Task/e9145aaa-b3e3-46bc-b069-2941ebde111a',
      },
      {
        id: 'a3562d64-680b-4802-bc78-4b1d0d487080',
        reference: 'Patient/a3562d64-680b-4802-bc78-4b1d0d487080',
        display: 'Avery Rivera',
        encounter: 'Encounter/808aa900-f645-46aa-a68b-2a82af81d5df',
        episode: 'EpisodeOfCare/e2cf8f66-b22b-4577-b858-b0481d24f0b8',
        observation: 'Observation/6729703e-7f98-462e-9e08-15ed2465dca1',
        task: 'Task/6b0849f7-bd0e-42f0-a835-b441c2dccade',
      },
      {
        id: '4c4d1245-4cb8-4dcf-af04-7222aa62fe58',
        reference: 'Patient/4c4d1245-4cb8-4dcf-af04-7222aa62fe58',
        display: 'Jamie Garcia',
        encounter: 'Encounter/88746778-0843-4cbb-8130-cb6a496e3508',
        episode: 'EpisodeOfCare/e0bc9ace-6dfc-49e1-a355-3132baf79a22',
        observation: 'Observation/6e8486b5-92ac-4834-ab45-5cf79a910c3e',
        task: 'Task/5ae0da57-6c85-4349-94b1-e64ba7924af5',
      },
      {
        id: '07a52c6e-149e-4164-ac3e-773483eb1b49',
        reference: 'Patient/07a52c6e-149e-4164-ac3e-773483eb1b49',
        display: 'Riley Demo',
        encounter: 'Encounter/66c0824a-d0b1-43ad-917b-a6f4fe2d73b7',
        episode: 'EpisodeOfCare/d901e625-0b28-425f-9cc4-604dcaabee91',
        observation: 'Observation/0a51e055-35e5-420f-92e4-1b642d682040',
        task: 'Task/4677e436-0d65-47b3-9ca8-1f58e5ecc86c',
      },
      {
        id: 'ab496db0-1a30-4be3-8965-d7b4ec137908',
        reference: 'Patient/ab496db0-1a30-4be3-8965-d7b4ec137908',
        display: 'Taylor Nguyen',
        encounter: 'Encounter/c9654194-fa52-494c-bd89-eb29ad57a826',
        episode: 'EpisodeOfCare/76900664-767f-4483-97b8-d66e7e3af4a4',
        observation: 'Observation/28304866-9155-4884-879b-589415c4d8c2',
        task: 'Task/625e81ad-ecba-47df-9754-9b2b3f7f3b05',
      },
      {
        id: '8dfba798-352d-42d0-a74c-4e7b5e58225b',
        reference: 'Patient/8dfba798-352d-42d0-a74c-4e7b5e58225b',
        display: 'Avery Johnson',
        encounter: 'Encounter/6fd0947b-63eb-4c32-8d8e-43d258e5ae6d',
        episode: 'EpisodeOfCare/a33d1742-db57-499c-a684-c7d4de4c451c',
        observation: 'Observation/dfba0b07-22a4-41e7-b3ce-46d7b19bd1d5',
        task: 'Task/368aad74-56be-41b5-8251-6a7be493791e',
      },
      {
        id: '30a5f507-fbca-46ac-aa70-af6b635e3fc7',
        reference: 'Patient/30a5f507-fbca-46ac-aa70-af6b635e3fc7',
        display: 'Cameron Rivera',
        encounter: 'Encounter/f56e825f-9388-4785-9b17-55e9c67d4328',
        episode: 'EpisodeOfCare/61808af4-1f4e-4294-b09f-b3cade1bc32d',
        observation: 'Observation/65cc71ef-01b3-40cb-8c07-a77b49821c9e',
        task: 'Task/ff779138-a4b5-44d8-86a6-66ac41b0ddb9',
      },
    ],
  },
};

const REQUIRED_EPISODE_INTERACTIONS = ['read', 'search', 'history', 'vread'];
const CLOSED_TASK_STATUSES = new Set(['completed', 'cancelled', 'failed', 'rejected', 'entered-in-error']);
const CURATED_COMPONENT_CODES = new Set([
  'restriction-type',
  'restriction-summary',
  'restriction-limit',
  'restriction-effective-date',
  'restriction-expiration-date',
  'restriction-reevaluation-date',
]);

const RESTRICTION_COMPONENTS = [
  component('restriction-type', 'Restriction type', {
    valueCodeableConcept: {
      coding: [{ system: CODE_SYSTEM, code: 'field-duty-restricted', display: 'Field duty restricted' }],
      text: 'Field duty restricted',
    },
  }),
  component('restriction-summary', 'Restriction summary', {
    valueString: 'No field deployment; administrative duty only until reevaluation.',
  }),
  component('restriction-limit', 'Restriction limit', {
    valueString: 'Avoid exposure response and prolonged standing over 2 hours.',
  }),
  component('restriction-effective-date', 'Restriction effective date', {
    valueDateTime: '2026-05-12',
  }),
  component('restriction-expiration-date', 'Restriction expiration date', {
    valueDateTime: '2026-05-26',
  }),
  component('restriction-reevaluation-date', 'Restriction reevaluation date', {
    valueDateTime: '2026-05-26',
  }),
];

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

main().catch((error) => {
  console.error(normalizeErrorString(error));
  process.exitCode = 1;
});

async function main() {
  const medplum = await createMedplumClientFromEnv();
  const changes = [];

  const accessPolicy = await medplum.readResource('AccessPolicy', DEMO.providerAccessPolicy.id);
  changes.push(
    await applyResourceUpdate(medplum, ensureEpisodeOfCareAccess(accessPolicy), accessPolicy, 'provider policy')
  );

  const task = await medplum.readResource('Task', DEMO.task.id);
  changes.push(await applyResourceUpdate(medplum, ensureCuratedTask(task), task, 'curated RTW task'));

  const observation = await medplum.readResource('Observation', DEMO.observation.id);
  changes.push(
    await applyResourceUpdate(medplum, ensureCuratedObservation(observation), observation, 'curated RTW observation')
  );

  const validation = await validateCuratedState(medplum);
  printSummary(changes, validation);

  if (args.validateOnly && changes.some((change) => change.status === 'needs update')) {
    throw new Error('Curated demo state requires updates. Run without --validate-only to repair it.');
  }

  if (validation.failures.length > 0) {
    throw new Error(`Curated demo validation failed: ${validation.failures.join('; ')}`);
  }
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    help: false,
    json: false,
    validateOnly: false,
  };
  const knownArgs = new Set(['--dry-run', '--help', '--json', '--validate-only']);

  for (const arg of argv) {
    if (!knownArgs.has(arg)) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    }
    if (arg === '--help') {
      parsed.help = true;
    }
    if (arg === '--json') {
      parsed.json = true;
    }
    if (arg === '--validate-only') {
      parsed.validateOnly = true;
    }
  }

  if (parsed.dryRun && parsed.validateOnly) {
    throw new Error('Use either --dry-run or --validate-only, not both.');
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/curate-occhealth-demo.mjs [--dry-run] [--validate-only] [--json]

Repairs and validates the DHS OHS Industry Day curated RTW case.

Environment:
  MEDPLUM_BASE_URL              Defaults to ${DEFAULT_BASE_URL}
  MEDPLUM_PROJECT_ID            Defaults to ${DEFAULT_PROJECT_ID}
  MEDPLUM_ACCESS_TOKEN          Existing privileged access token
  MEDPLUM_CLIENT_ID             Privileged client application ID
  MEDPLUM_CLIENT_SECRET         Privileged client application secret
  MEDPLUM_PROVIDER_ACCESS_TOKEN Optional provider token for access-policy read validation

Examples:
  MEDPLUM_ACCESS_TOKEN=... node scripts/curate-occhealth-demo.mjs
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... node scripts/curate-occhealth-demo.mjs --validate-only
  node scripts/curate-occhealth-demo.mjs --help`);
}

async function createMedplumClientFromEnv() {
  const baseUrl = process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL;
  const medplum = new MedplumClient({ baseUrl, cacheTime: 0, accessToken: process.env.MEDPLUM_ACCESS_TOKEN });

  if (process.env.MEDPLUM_ACCESS_TOKEN) {
    return medplum;
  }

  if (process.env.MEDPLUM_CLIENT_ID && process.env.MEDPLUM_CLIENT_SECRET) {
    await medplum.startClientLogin(process.env.MEDPLUM_CLIENT_ID, process.env.MEDPLUM_CLIENT_SECRET);
    return medplum;
  }

  throw new Error('Set MEDPLUM_ACCESS_TOKEN or MEDPLUM_CLIENT_ID/MEDPLUM_CLIENT_SECRET before running.');
}

function ensureEpisodeOfCareAccess(accessPolicy) {
  const updated = cloneResource(accessPolicy);
  updated.resource ||= [];

  let episodeRule = updated.resource.find((resourceRule) => resourceRule.resourceType === 'EpisodeOfCare');
  if (!episodeRule) {
    episodeRule = { resourceType: 'EpisodeOfCare', interaction: [] };
    updated.resource.push(episodeRule);
  }

  const interactions = new Set(episodeRule.interaction || []);
  for (const interaction of REQUIRED_EPISODE_INTERACTIONS) {
    interactions.add(interaction);
  }
  episodeRule.interaction = Array.from(interactions);

  return updated;
}

function ensureCuratedTask(task) {
  const updated = cloneResource(task);
  updated.status = CLOSED_TASK_STATUSES.has(updated.status) ? 'requested' : updated.status || 'requested';
  updated.intent ||= 'order';
  updated.code = codeableConcept(DEMO.task.code, DEMO.task.display);
  updated.owner = { reference: DEMO.provider.reference, display: DEMO.provider.display };
  updated.for = { reference: DEMO.patient.reference, display: DEMO.patient.display };
  updated.focus = { reference: DEMO.episode.reference, display: DEMO.episode.display };
  return updated;
}

function ensureCuratedObservation(observation) {
  const updated = cloneResource(observation);
  updated.status ||= 'final';
  updated.code = codeableConcept(DEMO.observation.code, 'Return-to-work status');
  updated.subject = { reference: DEMO.patient.reference, display: DEMO.patient.display };
  updated.focus = mergeReferences(updated.focus, { reference: DEMO.episode.reference, display: DEMO.episode.display });
  updated.valueString = DEMO.observation.valueString;
  updated.component = [
    ...(updated.component || []).filter((existingComponent) => {
      const code = firstCode(existingComponent.code);
      return !CURATED_COMPONENT_CODES.has(code);
    }),
    ...RESTRICTION_COMPONENTS,
  ];
  return updated;
}

async function applyResourceUpdate(medplum, desiredResource, currentResource, label) {
  if (sameJson(currentResource, desiredResource)) {
    return { label, status: 'unchanged' };
  }

  if (args.validateOnly) {
    return { label, status: 'needs update' };
  }

  if (args.dryRun) {
    return { label, status: 'would update' };
  }

  await medplum.updateResource(desiredResource);
  return { label, status: 'updated' };
}

async function validateCuratedState(medplum) {
  const failures = [];
  const warnings = [];

  const [accessPolicy, patient, provider, episode, task, observation] = await Promise.all([
    medplum.readResource('AccessPolicy', DEMO.providerAccessPolicy.id),
    medplum.readResource('Patient', DEMO.patient.id),
    medplum.readResource('Practitioner', DEMO.provider.id),
    medplum.readResource('EpisodeOfCare', DEMO.episode.id),
    medplum.readResource('Task', DEMO.task.id),
    medplum.readResource('Observation', DEMO.observation.id),
  ]);

  const episodeRule = (accessPolicy.resource || []).find(
    (resourceRule) => resourceRule.resourceType === 'EpisodeOfCare'
  );
  for (const interaction of REQUIRED_EPISODE_INTERACTIONS) {
    if (!episodeRule?.interaction?.includes(interaction)) {
      failures.push(`provider access policy missing EpisodeOfCare ${interaction}`);
    }
  }

  if (task.owner?.reference !== DEMO.provider.reference) {
    failures.push(`curated task owner is ${task.owner?.reference || 'unset'}`);
  }
  if (task.focus?.reference !== DEMO.episode.reference) {
    failures.push(`curated task focus is ${task.focus?.reference || 'unset'}`);
  }
  if (task.for?.reference !== DEMO.patient.reference) {
    failures.push(`curated task patient is ${task.for?.reference || 'unset'}`);
  }
  if (CLOSED_TASK_STATUSES.has(task.status)) {
    failures.push(`curated task status is closed: ${task.status}`);
  }

  if (observation.subject?.reference !== DEMO.patient.reference) {
    failures.push(`RTW observation subject is ${observation.subject?.reference || 'unset'}`);
  }
  if (!referenceListIncludes(observation.focus, DEMO.episode.reference)) {
    failures.push(`RTW observation does not focus ${DEMO.episode.reference}`);
  }
  if (observation.valueString !== DEMO.observation.valueString) {
    failures.push(`RTW observation value is ${observation.valueString || 'unset'}`);
  }

  for (const requiredComponent of RESTRICTION_COMPONENTS) {
    const code = firstCode(requiredComponent.code);
    const actualComponent = (observation.component || []).find((candidate) => firstCode(candidate.code) === code);
    if (!actualComponent || !sameComponentValue(actualComponent, requiredComponent)) {
      failures.push(`RTW observation missing or mismatched component ${code}`);
    }
  }

  const taskCount = await getProviderOpenTaskCount(medplum);
  if (taskCount === undefined) {
    warnings.push('could not calculate provider open task count');
  }

  const providerReadChecks = await validateProviderReadAccess();
  failures.push(...providerReadChecks.failures);
  warnings.push(...providerReadChecks.warnings);

  const exposureChecks = await validateExposureCohort(medplum);
  failures.push(...exposureChecks.failures);
  warnings.push(...exposureChecks.warnings);

  return {
    failures,
    warnings,
    resources: {
      patient: patient.id,
      provider: provider.id,
      episode: episode.id,
      task: task.id,
      observation: observation.id,
      providerOpenTaskCount: taskCount,
      exposureDutyLocation: DEMO.exposure.location.id,
      exposureAffectedEmployeeCount: exposureChecks.affectedEmployeeCount,
      exposureOpenTaskCount: exposureChecks.openTaskCount,
    },
  };
}

async function validateExposureCohort(medplum) {
  const failures = [];
  const warnings = [];
  const location = await readRequired(medplum, DEMO.exposure.location.reference, failures);
  if (location?.name !== DEMO.exposure.location.display) {
    failures.push(`exposure location is ${location?.name || 'missing'}`);
  }
  if (location?.managingOrganization?.reference !== DEMO.exposure.component.reference) {
    warnings.push(`exposure location component is ${location?.managingOrganization?.reference || 'unset'}`);
  }

  let affectedEmployeeCount = 0;
  let openTaskCount = 0;

  for (const cohortPatient of DEMO.exposure.patients) {
    const [patient, encounter, episode, observation, task] = await Promise.all([
      readRequired(medplum, cohortPatient.reference, failures),
      readRequired(medplum, cohortPatient.encounter, failures),
      readRequired(medplum, cohortPatient.episode, failures),
      readRequired(medplum, cohortPatient.observation, failures),
      readRequired(medplum, cohortPatient.task, failures),
    ]);

    if (patient) {
      affectedEmployeeCount += 1;
    }
    if (encounter?.subject?.reference !== cohortPatient.reference) {
      failures.push(
        `${cohortPatient.display} exposure encounter subject is ${encounter?.subject?.reference || 'unset'}`
      );
    }
    if (encounter?.location?.[0]?.location?.reference !== DEMO.exposure.location.reference) {
      failures.push(
        `${cohortPatient.display} exposure encounter location is ${encounter?.location?.[0]?.location?.reference || 'unset'}`
      );
    }
    if (episode?.patient?.reference !== cohortPatient.reference) {
      failures.push(`${cohortPatient.display} exposure episode patient is ${episode?.patient?.reference || 'unset'}`);
    }
    if (observation?.subject?.reference !== cohortPatient.reference) {
      failures.push(
        `${cohortPatient.display} RTW observation subject is ${observation?.subject?.reference || 'unset'}`
      );
    }
    if (task?.for?.reference !== cohortPatient.reference) {
      failures.push(`${cohortPatient.display} RTW task patient is ${task?.for?.reference || 'unset'}`);
    }
    if (task && !CLOSED_TASK_STATUSES.has(task.status)) {
      openTaskCount += 1;
    }
  }

  return { affectedEmployeeCount, failures, openTaskCount, warnings };
}

async function readRequired(medplum, reference, failures) {
  const [resourceType, id] = reference.split('/');
  try {
    return await medplum.readResource(resourceType, id);
  } catch (error) {
    failures.push(`cannot read ${reference}: ${normalizeErrorString(error)}`);
    return undefined;
  }
}

async function validateProviderReadAccess() {
  const accessToken = process.env.MEDPLUM_PROVIDER_ACCESS_TOKEN;
  if (!accessToken) {
    return { failures: [], warnings: ['provider token validation skipped; MEDPLUM_PROVIDER_ACCESS_TOKEN not set'] };
  }

  const providerClient = new MedplumClient({
    baseUrl: process.env.MEDPLUM_BASE_URL || DEFAULT_BASE_URL,
    cacheTime: 0,
    accessToken,
  });

  const failures = [];
  for (const resource of [DEMO.episode, DEMO.task, DEMO.observation]) {
    try {
      await providerClient.readResource(resource.resourceType, resource.id);
    } catch (error) {
      failures.push(`provider token cannot read ${resource.reference}: ${normalizeErrorString(error)}`);
    }
  }

  return { failures, warnings: [] };
}

async function getProviderOpenTaskCount(medplum) {
  try {
    const tasks = await medplum.searchResources(
      'Task',
      new URLSearchParams([
        ['owner', DEMO.provider.reference],
        ['_count', '200'],
      ])
    );
    return tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status)).length;
  } catch {
    return undefined;
  }
}

function printSummary(changes, validation) {
  const summary = { changes, validation };
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const change of changes) {
    console.log(`${change.status}: ${change.label}`);
  }
  console.log(`provider open task count: ${validation.resources.providerOpenTaskCount ?? 'unknown'}`);
  console.log(`exposure cohort employees: ${validation.resources.exposureAffectedEmployeeCount ?? 'unknown'}`);
  console.log(`exposure open follow-ups: ${validation.resources.exposureOpenTaskCount ?? 'unknown'}`);

  for (const warning of validation.warnings) {
    console.warn(`warning: ${warning}`);
  }
  if (validation.failures.length === 0) {
    console.log('validation: ok');
  }
}

function component(code, display, value) {
  return {
    code: codeableConcept(code, display),
    ...value,
  };
}

function codeableConcept(code, display) {
  return {
    coding: [{ system: CODE_SYSTEM, code, display }],
    text: display,
  };
}

function firstCode(codeableConceptValue) {
  return codeableConceptValue?.coding?.[0]?.code;
}

function mergeReferences(existingReferences, reference) {
  const references = Array.isArray(existingReferences) ? existingReferences : [];
  const withoutReference = references.filter((candidate) => candidate.reference !== reference.reference);
  return [reference, ...withoutReference];
}

function referenceListIncludes(references, reference) {
  return Array.isArray(references) && references.some((candidate) => candidate.reference === reference);
}

function sameComponentValue(actualComponent, expectedComponent) {
  for (const key of ['valueCodeableConcept', 'valueString', 'valueDateTime']) {
    if (expectedComponent[key] !== undefined && !sameJson(actualComponent[key], expectedComponent[key])) {
      return false;
    }
  }
  return true;
}

function cloneResource(resource) {
  return JSON.parse(JSON.stringify(resource));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
