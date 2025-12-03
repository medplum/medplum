// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import {
  allOk,
  concatUrls,
  createReference,
  evalFhirPathTyped,
  getExtension,
  getReferenceString,
  Operator,
  toTypedValue,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  ActivityDefinition,
  Bot,
  CarePlan,
  ClientApplication,
  CodeableConcept,
  Encounter,
  Organization,
  Patient,
  PlanDefinition,
  PlanDefinitionAction,
  Practitioner,
  Questionnaire,
  Reference,
  RequestGroup,
  RequestGroupAction,
  Resource,
  ServiceRequest,
  Task,
  TaskInput,
} from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import type { Repository } from '../repo';
import { getOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

const TASK_ELEMENTS_URL = 'https://medplum.com/fhir/StructureDefinition/task-elements';
const operation = getOperationDefinition('PlanDefinition', 'apply');

interface PlanDefinitionApplyParameters {
  readonly subject: string[];
  readonly encounter?: string;
  readonly practitioner?: string;
  readonly organization?: string;
}

/**
 * Handles a PlanDefinition $apply request.
 *
 * The operation converts a PlanDefinition to a RequestGroup.
 *
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function planDefinitionApplyHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const planDefinition = await ctx.repo.readResource<PlanDefinition>('PlanDefinition', id);
  const params = parseInputParameters<PlanDefinitionApplyParameters>(operation, req);
  const subject = await ctx.repo.readReference<Patient>({ reference: params.subject[0] });
  const subjectRef = createReference(subject);

  let encounterRef: Reference<Encounter> | undefined = undefined;
  if (params.encounter) {
    const encounter = await ctx.repo.readReference<Encounter>({ reference: params.encounter });
    encounterRef = createReference(encounter);
  }

  let practitionerRef: Reference<Practitioner> | undefined = undefined;
  if (params.practitioner) {
    const practitioner = await ctx.repo.readReference<Practitioner>({ reference: params.practitioner });
    practitionerRef = createReference(practitioner);
  }

  let organizationRef: Reference<Organization> | undefined = undefined;
  if (params.organization) {
    const organization = await ctx.repo.readReference<Organization>({ reference: params.organization });
    organizationRef = createReference(organization);
  }

  const actions: RequestGroupAction[] = [];
  if (planDefinition.action) {
    for (const action of planDefinition.action) {
      actions.push(
        await createAction(
          ctx.repo,
          planDefinition,
          ctx.profile,
          subjectRef,
          action,
          encounterRef,
          practitionerRef,
          organizationRef
        )
      );
    }
  }

  const requestGroup = await ctx.repo.createResource<RequestGroup>({
    resourceType: 'RequestGroup',
    instantiatesCanonical: planDefinition.url ? [planDefinition.url] : undefined,
    instantiatesUri: !planDefinition.url
      ? [concatUrls(getConfig().baseUrl, getReferenceString(planDefinition))]
      : undefined,
    subject: subjectRef,
    status: 'active',
    intent: 'order',
    action: actions,
    encounter: encounterRef,
  });

  const carePlan = await ctx.repo.createResource<CarePlan>({
    resourceType: 'CarePlan',
    status: 'active',
    subject: subjectRef,
    intent: 'plan',
    instantiatesCanonical: planDefinition.url ? [planDefinition.url] : undefined,
    instantiatesUri: !planDefinition.url
      ? [concatUrls(getConfig().baseUrl, getReferenceString(planDefinition))]
      : undefined,
    activity: [{ reference: createReference(requestGroup) }],
  });

  return [allOk, carePlan];
}

/**
 * Creates a Task and RequestGroup action for the given PlanDefinition action.
 * @param repo - The repository configured for the current user.
 * @param planDefinition - The plan definition.
 * @param requester - The user who requested the plan definition.
 * @param subject - The subject of the plan definition.
 * @param action - The PlanDefinition action.
 * @param encounter - Optional encounter reference.
 * @param practitioner - Optional practitioner reference.
 * @param organization - Optional organization reference.
 * @returns The RequestGroup action.
 */
async function createAction(
  repo: Repository,
  planDefinition: PlanDefinition,
  requester: Reference<ProfileResource | Bot | ClientApplication>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction,
  encounter?: Reference<Encounter>,
  practitioner?: Reference<Practitioner>,
  organization?: Reference<Organization>
): Promise<RequestGroupAction> {
  let definition: WithId<Resource> | undefined;
  if (action.definitionCanonical) {
    definition = await readCanonical(repo, action.definitionCanonical);
  }

  switch (definition?.resourceType) {
    case 'Questionnaire':
      return createTask(repo, planDefinition, requester, subject, action, encounter, undefined, undefined, [
        {
          type: { text: 'Questionnaire' },
          valueReference: {
            display: action.title,
            reference: getReferenceString(definition),
          },
        },
      ]);
    case 'ActivityDefinition':
      return createActivityDefinitionTask(
        repo,
        planDefinition,
        requester,
        subject,
        action,
        definition,
        encounter,
        practitioner,
        organization
      );
    default:
      return createTask(repo, planDefinition, requester, subject, action, encounter);
  }
}

/**
 * Creates a Task and RequestGroup action to request a resource.
 * @param repo - The repository configured for the current user.
 * @param planDefinition - The plan definition.
 * @param requester - The user who requested the plan definition.
 * @param subject - The subject of the plan definition.
 * @param action - The PlanDefinition action.
 * @param activityDefinition - The resolved ActivityDefinition resource.
 * @param encounter - Optional encounter reference.
 * @param practitioner - Optional practitioner reference.
 * @param organization - Optional organization reference.
 * @returns The RequestGroup action.
 */
async function createActivityDefinitionTask(
  repo: Repository,
  planDefinition: PlanDefinition,
  requester: Reference<Bot | ClientApplication | ProfileResource>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction,
  activityDefinition: WithId<ActivityDefinition>,
  encounter: Reference<Encounter> | undefined,
  practitioner?: Reference<Practitioner>,
  organization?: Reference<Organization>
): Promise<RequestGroupAction> {
  const parameters = {
    practitioner: practitioner,
    organization: organization,
    subject: subject,
  };

  const taskElementsExtension = getExtension(activityDefinition, TASK_ELEMENTS_URL);
  const ownerExtension = getExtension(taskElementsExtension, 'owner');
  let owner: Reference<Practitioner | Organization> | undefined = undefined;
  if (ownerExtension) {
    const expression = ownerExtension.valueExpression?.expression;
    if (expression) {
      const parametersValue = toTypedValue(parameters);
      const result = evalFhirPathTyped(expression, [parametersValue], {
        '%practitioner': toTypedValue(practitioner),
        '%organization': toTypedValue(organization),
        '%subject': toTypedValue(subject),
      });
      if (result.length !== 0) {
        const resultValue = result[0].value;
        if (resultValue && typeof resultValue === 'object' && 'reference' in resultValue) {
          owner = resultValue as Reference<Practitioner | Organization>;
        }
      }
    }
  }

  const performerTypeExtension = getExtension(taskElementsExtension, 'performerType');
  const performerType: CodeableConcept | undefined = performerTypeExtension
    ? performerTypeExtension.valueCodeableConcept
    : undefined;

  switch (activityDefinition.kind) {
    case 'ServiceRequest': {
      const serviceRequest = await repo.createResource({
        resourceType: 'ServiceRequest',
        status: 'draft',
        intent: activityDefinition.intent as ServiceRequest['intent'],
        subject: subject,
        requester: requester as ServiceRequest['requester'],
        encounter: encounter,
        code: activityDefinition.code,
        extension: activityDefinition.extension,
      });

      return createTask(repo, planDefinition, requester, subject, action, encounter, owner, performerType, [
        {
          type: {
            text: 'ServiceRequest',
          },
          valueReference: {
            display: action.title,
            reference: getReferenceString(serviceRequest),
          },
        },
      ]);
    }

    default:
      return createTask(repo, planDefinition, requester, subject, action, encounter, owner, performerType);
  }
}

/**
 * Creates a Task and RequestGroup action for a PlanDefinition action.
 * @param repo - The repository configured for the current user.
 * @param planDefinition - The plan definition.
 * @param requester - The requester profile.
 * @param subject - The subject of the plan definition.
 * @param action - The PlanDefinition action.
 * @param encounter - Optional encounter reference.
 * @param owner - Optional owner reference.
 * @param performerType - Optional performer type.
 * @param input - Optional input details.
 * @returns The RequestGroup action.
 */
async function createTask(
  repo: Repository,
  planDefinition: PlanDefinition,
  requester: Reference<ProfileResource | Bot | ClientApplication>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction,
  encounter?: Reference<Encounter>,
  owner?: Reference<Practitioner | Organization>,
  performerType?: CodeableConcept,
  input?: TaskInput[]
): Promise<RequestGroupAction> {
  const task = await repo.createResource<Task>({
    resourceType: 'Task',
    code: {
      text: action.title,
    },
    performerType: performerType ? [performerType] : undefined,
    intent: 'order',
    status: 'requested',
    authoredOn: new Date().toISOString(),
    requester: requester as Task['requester'],
    for: subject,
    encounter: encounter,
    owner: owner,
    description: action.description,
    focus: input?.[0]?.valueReference,
    input,
    basedOn: [
      {
        reference: getReferenceString(planDefinition),
        display: planDefinition.title,
      },
    ],
  });
  return {
    title: action.title,
    resource: createReference(task),
  };
}

async function readCanonical<T extends Questionnaire | ActivityDefinition | PlanDefinition>(
  repo: Repository,
  canonical: string
): Promise<WithId<T> | undefined> {
  if (!canonical) {
    return undefined;
  }

  return repo.searchOne({
    resourceType: 'ActivityDefinition',
    types: ['ActivityDefinition', 'PlanDefinition', 'Questionnaire'],
    filters: [{ code: 'url', operator: Operator.EQUALS, value: canonical }],
  });
}
