import { allOk, createReference, getReferenceString, ProfileResource } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  OperationDefinition,
  Patient,
  PlanDefinition,
  PlanDefinitionAction,
  Reference,
  RequestGroup,
  RequestGroupAction,
  Task,
  TaskInput,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { Repository } from '../repo';
import { parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'PlanDefinition-apply',
  version: '4.0.1',
  name: 'Apply',
  status: 'draft',
  kind: 'operation',
  code: 'apply',
  resource: ['PlanDefinition'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    { name: 'planDefinition', use: 'in', min: 0, max: '1', type: 'PlanDefinition' },
    { name: 'subject', use: 'in', min: 1, max: '*', type: 'string', searchType: 'reference' },
    { name: 'encounter', use: 'in', min: 0, max: '1', type: 'string', searchType: 'reference' },
    { name: 'practitioner', use: 'in', min: 0, max: '1', type: 'string', searchType: 'reference' },
    { name: 'organization', use: 'in', min: 0, max: '1', type: 'string', searchType: 'reference' },
    { name: 'userType', use: 'in', min: 0, max: '1', type: 'CodeableConcept' },
    { name: 'userLanguage', use: 'in', min: 0, max: '1', type: 'CodeableConcept' },
    { name: 'userTaskContext', use: 'in', min: 0, max: '1', type: 'CodeableConcept' },
    { name: 'setting', use: 'in', min: 0, max: '1', type: 'CodeableConcept' },
    { name: 'settingContext', use: 'in', min: 0, max: '1', type: 'CodeableConcept' },
    { name: 'return', use: 'out', min: 1, max: '1', type: 'CarePlan' },
  ],
};

interface PlanDefinitionApplyParameters {
  readonly subject: string[];
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

  const actions: RequestGroupAction[] = [];
  if (planDefinition.action) {
    for (const action of planDefinition.action) {
      actions.push(await createAction(ctx.repo, ctx.profile, subjectRef, action));
    }
  }

  const requestGroup = await ctx.repo.createResource<RequestGroup>({
    resourceType: 'RequestGroup',
    instantiatesCanonical: [getReferenceString(planDefinition)],
    subject: subjectRef,
    status: 'active',
    intent: 'order',
    action: actions,
  });

  return [allOk, requestGroup];
}

/**
 * Creates a Task and RequestGroup action for the given PlanDefinition action.
 * @param repo - The repository configured for the current user.
 * @param requester - The user who requested the plan definition.
 * @param subject - The subject of the plan definition.
 * @param action - The PlanDefinition action.
 * @returns The RequestGroup action.
 */
async function createAction(
  repo: Repository,
  requester: Reference<ProfileResource>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction
): Promise<RequestGroupAction> {
  if (action.definitionCanonical?.startsWith('Questionnaire/')) {
    return createQuestionnaireTask(repo, requester, subject, action);
  }
  return createTask(repo, requester, subject, action);
}

/**
 * Creates a Task and RequestGroup action to complete a Questionnaire.
 * @param repo - The repository configured for the current user.
 * @param requester - The user who requested the plan definition.
 * @param subject - The subject of the plan definition.
 * @param action - The PlanDefinition action.
 * @returns The RequestGroup action.
 */
async function createQuestionnaireTask(
  repo: Repository,
  requester: Reference<ProfileResource>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction
): Promise<RequestGroupAction> {
  return createTask(repo, requester, subject, action, [
    {
      type: {
        text: 'Questionnaire',
      },
      valueReference: {
        display: action.title,
        reference: action.definitionCanonical,
      },
    },
  ]);
}

/**
 * Creates a Task and RequestGroup action for a PlanDefinition action.
 * @param repo - The repository configured for the current user.
 * @param requester - The requester profile.
 * @param subject - The subject of the plan definition.
 * @param action - The PlanDefinition action.
 * @param input - Optional input details.
 * @returns The RequestGroup action.
 */
async function createTask(
  repo: Repository,
  requester: Reference<ProfileResource>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction,
  input?: TaskInput[] | undefined
): Promise<RequestGroupAction> {
  const task = await repo.createResource<Task>({
    resourceType: 'Task',
    intent: 'order',
    status: 'requested',
    authoredOn: new Date().toISOString(),
    requester,
    for: subject,
    owner: subject,
    description: action.description,
    focus: input?.[0]?.valueReference,
    input,
  });

  return {
    title: action.title,
    resource: createReference(task),
  };
}
