#!/usr/bin/env node
import { MedplumClient, normalizeErrorString } from '@medplum/core';

const DEFAULT_BASE_URL = 'https://api.ehr.hiivehealth.net/';
const DEFAULT_PROJECT_ID = '7e472dfd-3ab9-4b75-adac-38e0c5c5d6c8';
const CODE_SYSTEM = 'https://hiivecare.example/fhir/CodeSystem/medplum-ubix-demo';
const INCIDENT_QUESTIONNAIRE_NAME = 'OccupationalIncidentIntakeQuestionnaire';
const INCIDENT_QUESTIONNAIRE_TITLE = 'Occupational incident intake';
const VISIT_CARE_TEMPLATE_URL = 'https://hiivecare.example/fhir/PlanDefinition/occupational-exposure-follow-up-visit';
const SUPERVISOR_MEMBERSHIP_IDENTIFIER = 'supervisor-hr-demo-membership';

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
  supervisor: {
    email: 'ubix.supervisor.hr@example.com',
    firstName: 'Jordan',
    lastName: 'Lee',
    display: 'Jordan Lee, HR reviewer',
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

const REQUIRED_PROVIDER_RESOURCE_INTERACTIONS = {
  ActivityDefinition: ['read', 'search', 'history', 'vread'],
  Appointment: ['read', 'search', 'create', 'update', 'history', 'vread'],
  CarePlan: ['read', 'search', 'create', 'update', 'history', 'vread'],
  ChargeItem: ['read', 'search', 'create', 'update', 'history', 'vread'],
  ClinicalImpression: ['read', 'search', 'create', 'update', 'history', 'vread'],
  Encounter: ['read', 'search', 'create', 'update', 'history', 'vread'],
  EpisodeOfCare: ['read', 'search', 'create', 'update', 'history', 'vread'],
  Observation: ['read', 'search', 'create', 'update', 'history', 'vread'],
  PlanDefinition: ['read', 'search', 'history', 'vread'],
  Questionnaire: ['read', 'search', 'history', 'vread'],
  QuestionnaireResponse: ['read', 'search', 'create', 'update', 'history', 'vread'],
  RequestGroup: ['read', 'search', 'create', 'update', 'history', 'vread'],
  Schedule: ['read', 'search', 'history', 'vread'],
  ServiceRequest: ['read', 'search', 'create', 'update', 'history', 'vread'],
  Slot: ['read', 'search', 'create', 'update', 'history', 'vread'],
  Task: ['read', 'search', 'create', 'update', 'history', 'vread'],
};
const INCIDENT_QUESTIONNAIRE_LINK_IDS = [
  'incidentType',
  'component',
  'dutyLocation',
  'jobRole',
  'incidentDateTime',
  'incidentDescription',
  'returnToWorkStatus',
  'restrictionType',
  'restrictionSummary',
  'restrictionLimit',
  'restrictionEffectiveDate',
  'restrictionExpirationDate',
  'restrictionReevaluationDate',
];
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

const INCIDENT_QUESTIONNAIRE_ITEMS = {
  incidentType: questionnaireChoiceItem('incidentType', 'Incident type', [
    ['work-related-injury', 'Work-related injury'],
    ['occupational-illness', 'Occupational illness'],
    ['exposure-incident', 'Exposure incident'],
    ['near-miss', 'Near miss'],
    ['critical-incident', 'Critical incident'],
  ]),
  component: questionnaireChoiceItem('component', 'Work unit / agency component', [
    ['component-a', 'Office of Health Security'],
    ['component-b', 'Field Operations'],
    ['component-c', 'Mission Support'],
  ]),
  dutyLocation: questionnaireChoiceItem('dutyLocation', 'Duty location', [
    ['headquarters', 'Headquarters'],
    ['field-office', 'Field office'],
    ['processing-center', 'Processing center'],
  ]),
  jobRole: questionnaireChoiceItem('jobRole', 'Job role', [
    ['field-response', 'Field response'],
    ['clinical-staff', 'Clinical staff'],
    ['program-analyst', 'Program analyst'],
  ]),
  incidentDateTime: {
    linkId: 'incidentDateTime',
    text: 'Incident date and time',
    type: 'dateTime',
    required: true,
  },
  incidentDescription: {
    linkId: 'incidentDescription',
    text: 'Incident description',
    type: 'text',
  },
  returnToWorkStatus: questionnaireChoiceItem('returnToWorkStatus', 'Return-to-work status', [
    ['full-duty', 'Full duty'],
    ['restricted-duty', 'Restricted duty'],
    ['not-fit', 'Not fit'],
    ['pending-reevaluation', 'Pending reevaluation'],
  ]),
  restrictionType: questionnaireChoiceItem('restrictionType', 'Restriction type', [
    ['no-restrictions', 'No restrictions'],
    ['field-duty-restricted', 'Field duty restricted'],
    ['limited-lifting', 'Limited lifting'],
    ['ppe-required', 'PPE required'],
    ['not-cleared', 'Not cleared'],
  ]),
  restrictionSummary: {
    linkId: 'restrictionSummary',
    text: 'Restriction summary',
    type: 'text',
  },
  restrictionLimit: {
    linkId: 'restrictionLimit',
    text: 'Restriction limit',
    type: 'text',
  },
  restrictionEffectiveDate: {
    linkId: 'restrictionEffectiveDate',
    text: 'Restriction effective date',
    type: 'date',
  },
  restrictionExpirationDate: {
    linkId: 'restrictionExpirationDate',
    text: 'Restriction expiration date',
    type: 'date',
  },
  restrictionReevaluationDate: {
    linkId: 'restrictionReevaluationDate',
    text: 'Restriction reevaluation date',
    type: 'date',
  },
};

const VISIT_CARE_TEMPLATE = {
  resourceType: 'PlanDefinition',
  url: VISIT_CARE_TEMPLATE_URL,
  name: 'OccupationalExposureFollowUpVisit',
  title: 'Occupational exposure follow-up visit',
  status: 'active',
  type: {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/plan-definition-type',
        code: 'order-set',
        display: 'Order Set',
      },
    ],
    text: 'Order Set',
  },
  description: 'Demo care template for occupational exposure follow-up visits and return-to-work review.',
  action: [
    {
      id: 'review-incident-history',
      title: 'Review exposure incident history',
      description: 'Review the documented exposure event, encounter context, and affected work location.',
    },
    {
      id: 'assess-return-to-work-status',
      title: 'Assess return-to-work status',
      description: 'Confirm current RTW status, restrictions, and reevaluation timing.',
    },
    {
      id: 'document-follow-up-plan',
      title: 'Document follow-up plan',
      description: 'Capture next steps for clearance, restrictions, or additional occupational health follow-up.',
    },
  ],
};

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

  const accessPolicy = await runStep('read provider access policy', () =>
    medplum.readResource('AccessPolicy', DEMO.providerAccessPolicy.id)
  );
  changes.push(
    await runStep('repair provider access policy', () =>
      applyResourceUpdate(medplum, ensureProviderAccessPolicy(accessPolicy), accessPolicy, 'provider policy')
    )
  );

  changes.push(await runStep('upsert incident questionnaire', () => applyIncidentQuestionnaireUpsert(medplum)));
  changes.push(await runStep('upsert visit care template', () => applyVisitCareTemplateUpsert(medplum)));

  const supervisorPolicyResult = await runStep('upsert supervisor/HR access policy', () =>
    applySupervisorAccessPolicyUpsert(medplum)
  );
  changes.push(supervisorPolicyResult.change);
  if (supervisorPolicyResult.resource?.id) {
    changes.push(
      await runStep('upsert supervisor/HR login', () =>
        applySupervisorLoginUpsert(medplum, supervisorPolicyResult.resource)
      )
    );
  }

  const task = await runStep('read curated RTW task', () => medplum.readResource('Task', DEMO.task.id));
  changes.push(
    await runStep('repair curated RTW task', () =>
      applyResourceUpdate(medplum, ensureCuratedTask(task), task, 'curated RTW task')
    )
  );

  const observation = await runStep('read curated RTW observation', () =>
    medplum.readResource('Observation', DEMO.observation.id)
  );
  changes.push(
    await runStep('repair curated RTW observation', () =>
      applyResourceUpdate(medplum, ensureCuratedObservation(observation), observation, 'curated RTW observation')
    )
  );

  const validation = await runStep('validate curated demo state', () => validateCuratedState(medplum));
  printSummary(changes, validation);

  if (args.validateOnly && changes.some((change) => change.status === 'needs update')) {
    throw new Error('Curated demo state requires updates. Run without --validate-only to repair it.');
  }

  if (validation.failures.length > 0) {
    throw new Error(`Curated demo validation failed: ${validation.failures.join('; ')}`);
  }
}

async function runStep(label, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`${label}: ${normalizeErrorString(error)}`);
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
  MEDPLUM_SUPERVISOR_PASSWORD   Password to create the supervisor/HR demo login when missing

Examples:
  MEDPLUM_ACCESS_TOKEN=... node scripts/curate-occhealth-demo.mjs
  MEDPLUM_CLIENT_ID=... MEDPLUM_CLIENT_SECRET=... MEDPLUM_SUPERVISOR_PASSWORD=... node scripts/curate-occhealth-demo.mjs
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

async function applyIncidentQuestionnaireUpsert(medplum) {
  const questionnaires = await medplum.searchResources(
    'Questionnaire',
    new URLSearchParams([
      ['name', INCIDENT_QUESTIONNAIRE_NAME],
      ['_count', '20'],
      ['_sort', '-_lastUpdated'],
    ])
  );
  const currentQuestionnaire = selectIncidentQuestionnaire(questionnaires);
  const desiredQuestionnaire = buildIncidentQuestionnaire(currentQuestionnaire);
  const label = 'occupational incident questionnaire';

  if (!currentQuestionnaire) {
    if (args.validateOnly) {
      return { label, status: 'needs update' };
    }
    if (args.dryRun) {
      return { label, status: 'would create' };
    }
    await medplum.createResource(desiredQuestionnaire);
    return { label, status: 'created' };
  }

  return applyResourceUpdate(medplum, desiredQuestionnaire, currentQuestionnaire, label);
}

async function applyVisitCareTemplateUpsert(medplum) {
  const label = 'occupational visit care template';
  const templates = await medplum.searchResources(
    'PlanDefinition',
    new URLSearchParams([
      ['url', VISIT_CARE_TEMPLATE_URL],
      ['_count', '1'],
    ])
  );
  const currentTemplate = templates[0];
  const desiredTemplate = {
    ...(currentTemplate || {}),
    ...VISIT_CARE_TEMPLATE,
  };

  if (!currentTemplate) {
    if (args.validateOnly) {
      return { label, status: 'needs update' };
    }
    if (args.dryRun) {
      return { label, status: 'would create' };
    }
    await medplum.createResource(desiredTemplate);
    return { label, status: 'created' };
  }

  return applyResourceUpdate(medplum, desiredTemplate, currentTemplate, label);
}

async function applySupervisorAccessPolicyUpsert(medplum) {
  const label = 'supervisor/HR minimum-necessary policy';
  const currentPolicy = await findSupervisorAccessPolicy(medplum);
  const desiredPolicy = buildSupervisorAccessPolicy(currentPolicy);

  if (!currentPolicy) {
    if (args.validateOnly) {
      return { change: { label, status: 'needs update' }, resource: undefined };
    }
    if (args.dryRun) {
      return { change: { label, status: 'would create' }, resource: desiredPolicy };
    }
    const createdPolicy = await medplum.createResource(desiredPolicy);
    return { change: { label, status: 'created' }, resource: createdPolicy };
  }

  const change = await applyResourceUpdate(medplum, desiredPolicy, currentPolicy, label);
  return { change, resource: desiredPolicy };
}

async function applySupervisorLoginUpsert(medplum, supervisorPolicy) {
  const label = 'supervisor/HR login';
  const currentMembership = await findSupervisorMembership(medplum);

  if (!currentMembership) {
    if (args.validateOnly) {
      return { label, status: 'needs update' };
    }
    if (args.dryRun) {
      return { label, status: 'would create' };
    }

    const password = process.env.MEDPLUM_SUPERVISOR_PASSWORD;
    if (!password) {
      throw new Error(
        `Supervisor/HR login is missing. Set MEDPLUM_SUPERVISOR_PASSWORD to create ${DEMO.supervisor.email}.`
      );
    }

    const supervisorProfile = await medplum.createResourceIfNoneExist(
      {
        resourceType: 'RelatedPerson',
        meta: {
          project: process.env.MEDPLUM_PROJECT_ID || DEFAULT_PROJECT_ID,
        },
        patient: { reference: DEMO.patient.reference },
        name: [
          {
            given: [DEMO.supervisor.firstName],
            family: DEMO.supervisor.lastName,
          },
        ],
        telecom: [
          {
            system: 'email',
            use: 'work',
            value: DEMO.supervisor.email,
          },
        ],
      },
      `_project=${encodeURIComponent(process.env.MEDPLUM_PROJECT_ID || DEFAULT_PROJECT_ID)}&patient=${encodeURIComponent(DEMO.patient.reference)}&email=${encodeURIComponent(DEMO.supervisor.email)}`
    );

    let membership;
    try {
      membership = await medplum.invite(process.env.MEDPLUM_PROJECT_ID || DEFAULT_PROJECT_ID, {
        resourceType: 'RelatedPerson',
        firstName: DEMO.supervisor.firstName,
        lastName: DEMO.supervisor.lastName,
        email: DEMO.supervisor.email,
        externalId: SUPERVISOR_MEMBERSHIP_IDENTIFIER,
        password,
        sendEmail: false,
        upsert: true,
        membership: {
          identifier: [demoIdentifier(SUPERVISOR_MEMBERSHIP_IDENTIFIER)],
          profile: { reference: `RelatedPerson/${supervisorProfile.id}` },
          accessPolicy: accessPolicyReference(supervisorPolicy),
          admin: false,
        },
      });
    } catch (error) {
      const errorText = normalizeErrorString(error);
      if (/Forbidden/i.test(errorText)) {
        throw new Error(
          'Authenticated credentials cannot call Medplum admin invite. Use a super-admin/project-admin login or token and rerun curation.'
        );
      }
      throw error;
    }

    if (membership.resourceType === 'OperationOutcome') {
      throw new Error(`Could not create supervisor/HR login: ${normalizeErrorString(membership)}`);
    }
    return { label, status: 'created' };
  }

  return applyResourceUpdate(
    medplum,
    ensureSupervisorMembership(currentMembership, supervisorPolicy),
    currentMembership,
    label
  );
}

async function findSupervisorAccessPolicy(medplum) {
  const policies = await medplum.searchResources(
    'AccessPolicy',
    new URLSearchParams([
      ['_count', '200'],
    ])
  );
  return policies.find((policy) => policy.name === 'Ubix Demo Supervisor/HR Minimum Necessary');
}

async function findSupervisorMembership(medplum) {
  const memberships = await medplum.searchResources(
    'ProjectMembership',
    new URLSearchParams([
      ['_count', '200'],
    ])
  );
  return memberships.find(
    (membership) =>
      hasDemoIdentifier(membership, SUPERVISOR_MEMBERSHIP_IDENTIFIER) ||
      membership.userName === DEMO.supervisor.email
  );
}

function selectIncidentQuestionnaire(questionnaires) {
  return questionnaires
    .filter((questionnaire) => questionnaire.name === INCIDENT_QUESTIONNAIRE_NAME)
    .sort((left, right) => incidentQuestionnaireScore(right) - incidentQuestionnaireScore(left))[0];
}

function buildIncidentQuestionnaire(source) {
  return {
    ...(source || { resourceType: 'Questionnaire', status: 'active' }),
    name: INCIDENT_QUESTIONNAIRE_NAME,
    title: INCIDENT_QUESTIONNAIRE_TITLE,
    status: source?.status || 'active',
    item: INCIDENT_QUESTIONNAIRE_LINK_IDS.map((linkId) =>
      normalizeIncidentQuestionnaireItem(source?.item || [], linkId)
    ),
  };
}

function normalizeIncidentQuestionnaireItem(existingItems, linkId) {
  const fallback = INCIDENT_QUESTIONNAIRE_ITEMS[linkId];
  const existing = existingItems.find((item) => item.linkId === linkId);
  if (!existing) {
    return fallback;
  }
  if (fallback.type === 'choice') {
    return {
      ...existing,
      type: 'choice',
      text: fallback.linkId === 'component' ? fallback.text : existing.text || fallback.text,
      answerOption: fallback.answerOption || existing.answerOption,
    };
  }
  return { ...fallback, ...existing, text: existing.text || fallback.text };
}

function incidentQuestionnaireScore(questionnaire) {
  const itemLinkIds = new Set(questionnaire.item?.map((item) => item.linkId));
  const linkIdScore = INCIDENT_QUESTIONNAIRE_LINK_IDS.filter((linkId) => itemLinkIds.has(linkId)).length * 10;
  const choiceScore = (questionnaire.item || []).filter((item) => item.type === 'choice').length;
  return linkIdScore + choiceScore;
}

function buildSupervisorAccessPolicy(currentPolicy) {
  const { identifier: _identifier, ...policyBase } = currentPolicy || {};
  const patientIds = DEMO.exposure.patients.map((patient) => patient.id).join(',');
  const exposureEncounterIds = DEMO.exposure.patients
    .map((patient) => patient.encounter?.split('/')[1])
    .filter(Boolean)
    .join(',');
  const exposureEpisodeIds = DEMO.exposure.patients
    .map((patient) => patient.episode?.split('/')[1])
    .filter(Boolean)
    .join(',');
  const exposureObservationIds = DEMO.exposure.patients
    .map((patient) => patient.observation?.split('/')[1])
    .filter(Boolean)
    .join(',');
  const exposureTaskIds = DEMO.exposure.patients
    .map((patient) => patient.task?.split('/')[1])
    .filter(Boolean)
    .join(',');
  const componentId = DEMO.exposure.component.reference.split('/')[1];

  return {
    ...policyBase,
    resourceType: 'AccessPolicy',
    name: 'Ubix Demo Supervisor/HR Minimum Necessary',
    resource: [
      minimumNecessaryRule('Patient', `_id=${patientIds}`, [
        'address',
        'birthDate',
        'communication',
        'contact',
        'deceasedBoolean',
        'deceasedDateTime',
        'gender',
        'generalPractitioner',
        'identifier',
        'maritalStatus',
        'photo',
        'telecom',
      ]),
      minimumNecessaryRule('Location', `_id=${DEMO.exposure.location.id}`),
      minimumNecessaryRule('Organization', componentId ? `_id=${componentId}` : undefined),
      minimumNecessaryRule('Encounter', `_id=${exposureEncounterIds}`, [
        'diagnosis',
        'reasonCode',
        'hospitalization',
        'participant',
        'account',
      ]),
      minimumNecessaryRule('EpisodeOfCare', `_id=${exposureEpisodeIds}`, [
        'diagnosis',
        'referralRequest',
        'careManager',
      ]),
      minimumNecessaryRule('Observation', `_id=${exposureObservationIds}`, [
        'note',
        'interpretation',
        'method',
        'specimen',
        'device',
        'performer',
      ]),
      minimumNecessaryRule('Task', `_id=${exposureTaskIds}`, ['note', 'input', 'output', 'owner']),
      minimumNecessaryRule('RelatedPerson'),
      minimumNecessaryRule('UserConfiguration'),
    ].filter(Boolean),
  };
}

function ensureSupervisorMembership(membership, supervisorPolicy) {
  const updated = cloneResource(membership);
  updated.active = true;
  updated.admin = false;
  updated.userName = DEMO.supervisor.email;
  updated.identifier = mergeIdentifiers(updated.identifier, demoIdentifier(SUPERVISOR_MEMBERSHIP_IDENTIFIER));
  updated.accessPolicy = accessPolicyReference(supervisorPolicy);
  return updated;
}

function minimumNecessaryRule(resourceType, criteria, hiddenFields) {
  return {
    resourceType,
    ...(criteria && { criteria: criteria.startsWith(`${resourceType}?`) ? criteria : `${resourceType}?${criteria}` }),
    interaction: ['read', 'search', 'history', 'vread'],
    ...(hiddenFields?.length && { hiddenFields }),
  };
}

function ensureProviderAccessPolicy(accessPolicy) {
  const updated = cloneResource(accessPolicy);
  updated.resource ||= [];

  for (const [resourceType, requiredInteractions] of Object.entries(REQUIRED_PROVIDER_RESOURCE_INTERACTIONS)) {
    let resourceRule = updated.resource.find((candidate) => candidate.resourceType === resourceType);
    if (!resourceRule) {
      resourceRule = { resourceType, interaction: [] };
      updated.resource.push(resourceRule);
    }

    const interactions = new Set(resourceRule.interaction || []);
    for (const interaction of requiredInteractions) {
      interactions.add(interaction);
    }
    resourceRule.interaction = Array.from(interactions);
  }

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

  for (const [resourceType, requiredInteractions] of Object.entries(REQUIRED_PROVIDER_RESOURCE_INTERACTIONS)) {
    const resourceRule = (accessPolicy.resource || []).find((candidate) => candidate.resourceType === resourceType);
    for (const interaction of requiredInteractions) {
      if (!resourceRule?.interaction?.includes(interaction)) {
        failures.push(`provider access policy missing ${resourceType} ${interaction}`);
      }
    }
  }

  const incidentQuestionnaires = await medplum.searchResources(
    'Questionnaire',
    new URLSearchParams([
      ['name', INCIDENT_QUESTIONNAIRE_NAME],
      ['_count', '20'],
      ['_sort', '-_lastUpdated'],
    ])
  );
  const incidentQuestionnaire = selectIncidentQuestionnaire(incidentQuestionnaires);
  if (!incidentQuestionnaire) {
    failures.push(`${INCIDENT_QUESTIONNAIRE_NAME} is missing`);
  } else {
    const questionnaireLinkIds = new Set(incidentQuestionnaire.item?.map((item) => item.linkId));
    for (const linkId of INCIDENT_QUESTIONNAIRE_LINK_IDS) {
      if (!questionnaireLinkIds.has(linkId)) {
        failures.push(`${INCIDENT_QUESTIONNAIRE_NAME} missing item ${linkId}`);
      }
    }
  }

  const visitCareTemplates = await medplum.searchResources(
    'PlanDefinition',
    new URLSearchParams([
      ['url', VISIT_CARE_TEMPLATE_URL],
      ['_count', '1'],
    ])
  );
  const visitCareTemplate = visitCareTemplates[0];
  if (!visitCareTemplate) {
    failures.push('occupational visit care template is missing');
  } else if (!visitCareTemplate.action?.length) {
    failures.push('occupational visit care template has no actions');
  }

  const supervisorPolicy = await findSupervisorAccessPolicy(medplum);
  if (!supervisorPolicy) {
    failures.push('supervisor/HR access policy is missing');
  } else {
    validateSupervisorAccessPolicy(supervisorPolicy, failures);
  }

  const supervisorMembership = await findSupervisorMembership(medplum);
  if (!supervisorMembership) {
    failures.push(`supervisor/HR login is missing for ${DEMO.supervisor.email}`);
  } else if (supervisorPolicy?.id) {
    if (supervisorMembership.accessPolicy?.reference !== `AccessPolicy/${supervisorPolicy.id}`) {
      failures.push(`supervisor/HR login access policy is ${supervisorMembership.accessPolicy?.reference || 'unset'}`);
    }
    if (!supervisorMembership.profile?.reference?.startsWith('RelatedPerson/')) {
      failures.push(`supervisor/HR login profile is ${supervisorMembership.profile?.reference || 'unset'}`);
    }
    if (supervisorMembership.admin) {
      failures.push('supervisor/HR login should not be a project admin');
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
      visitCareTemplate: visitCareTemplate?.id,
      supervisorAccessPolicy: supervisorPolicy?.id,
      supervisorLogin: supervisorMembership?.userName || DEMO.supervisor.email,
    },
  };
}

function validateSupervisorAccessPolicy(accessPolicy, failures) {
  const desiredPolicy = buildSupervisorAccessPolicy(accessPolicy);
  const desiredRulesByResourceType = new Map(desiredPolicy.resource.map((rule) => [rule.resourceType, rule]));

  for (const [resourceType, desiredRule] of desiredRulesByResourceType.entries()) {
    const actualRule = (accessPolicy.resource || []).find((rule) => rule.resourceType === resourceType);
    if (!actualRule) {
      failures.push(`supervisor/HR access policy missing ${resourceType}`);
      continue;
    }
    if (desiredRule.criteria && actualRule.criteria !== desiredRule.criteria) {
      failures.push(`supervisor/HR access policy ${resourceType} criteria mismatch`);
    }
    for (const interaction of desiredRule.interaction || []) {
      if (!actualRule.interaction?.includes(interaction)) {
        failures.push(`supervisor/HR access policy missing ${resourceType} ${interaction}`);
      }
    }
    for (const hiddenField of desiredRule.hiddenFields || []) {
      if (!actualRule.hiddenFields?.includes(hiddenField)) {
        failures.push(`supervisor/HR access policy ${resourceType} does not hide ${hiddenField}`);
      }
    }
  }
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
  console.log(`supervisor/HR login: ${validation.resources.supervisorLogin ?? 'missing'}`);
  console.log(`supervisor/HR policy: ${validation.resources.supervisorAccessPolicy ?? 'missing'}`);
  console.log(`visit care template: ${validation.resources.visitCareTemplate ?? 'missing'}`);
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

function questionnaireChoiceItem(linkId, text, options) {
  return {
    linkId,
    text,
    type: 'choice',
    required: ['incidentType', 'component', 'dutyLocation'].includes(linkId),
    answerOption: options.map(([code, display]) => ({ valueCoding: { system: CODE_SYSTEM, code, display } })),
  };
}

function codeableConcept(code, display) {
  return {
    coding: [{ system: CODE_SYSTEM, code, display }],
    text: display,
  };
}

function demoIdentifier(value) {
  return { system: CODE_SYSTEM, value };
}

function hasDemoIdentifier(resource, value) {
  return resource?.identifier?.some(
    (identifier) => identifier.system === CODE_SYSTEM && identifier.value === value
  );
}

function mergeIdentifiers(existingIdentifiers, identifier) {
  const identifiers = Array.isArray(existingIdentifiers) ? existingIdentifiers : [];
  const withoutIdentifier = identifiers.filter(
    (candidate) => candidate.system !== identifier.system || candidate.value !== identifier.value
  );
  return [identifier, ...withoutIdentifier];
}

function accessPolicyReference(accessPolicy) {
  return {
    reference: `AccessPolicy/${accessPolicy.id}`,
    display: accessPolicy.name,
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
