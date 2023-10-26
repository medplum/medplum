import { allOk, badRequest, createReference, getReferenceString, ProfileResource } from '@medplum/core';
import {
  CareTeam,
  Device,
  Group,
  HealthcareService,
  Organization,
  Patient,
  PlanDefinition,
  PlanDefinitionAction,
  Practitioner,
  PractitionerRole,
  Reference,
  RelatedPerson,
  RequestGroup,
  RequestGroupAction,
  Resource,
  Task,
  TaskInput,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { isFhirJsonContentType, sendResponse } from '../routes';
import { getAuthenticatedContext } from '../../context';

type SubjectType =
  | CareTeam
  | Device
  | HealthcareService
  | Organization
  | Patient
  | Practitioner
  | PractitionerRole
  | RelatedPerson;

interface PlanDefinitionApplyParameters {
  readonly subject: SubjectType;
}

/**
 * Handles a PlanDefinition $apply request.
 *
 * The operation converts a PlanDefinition to a RequestGroup.
 *
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function planDefinitionApplyHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;

  const planDefinition = await ctx.repo.readResource<PlanDefinition>('PlanDefinition', id);

  const params = await validateParameters(req, res);
  if (!params) {
    return;
  }

  const actions: RequestGroupAction[] = [];
  if (planDefinition.action) {
    for (const action of planDefinition.action) {
      actions.push(await createAction(ctx.repo, ctx.profile, params, action));
    }
  }

  const requestGroup = await ctx.repo.createResource<RequestGroup>({
    resourceType: 'RequestGroup',
    instantiatesCanonical: [getReferenceString(planDefinition)],
    subject: createReference(params.subject) as Reference<Patient | Group>,
    status: 'active',
    intent: 'order',
    action: actions,
  });
  await sendResponse(res, allOk, requestGroup);
}

/**
 * Parses and validates the operation parameters.
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 * @returns The operation parameters if available; otherwise, undefined.
 */
async function validateParameters(req: Request, res: Response): Promise<PlanDefinitionApplyParameters | undefined> {
  const ctx = getAuthenticatedContext();
  if (!isFhirJsonContentType(req)) {
    res.status(400).send('Unsupported content type');
    return undefined;
  }

  const body = req.body as Resource;
  if (body.resourceType !== 'Parameters') {
    sendOutcome(res, badRequest('Incorrect parameters type'));
    return undefined;
  }

  const subjectParam = body.parameter?.find((param) => param.name === 'subject');
  if (!subjectParam?.valueReference) {
    sendOutcome(res, badRequest('Missing subject parameter'));
    return undefined;
  }

  const subject = await ctx.repo.readReference(subjectParam.valueReference as Reference<SubjectType>);

  return {
    subject,
  };
}

/**
 * Creates a Task and RequestGroup action for the given PlanDefinition action.
 * @param repo - The repository configured for the current user.
 * @param requester - The user who requested the plan definition.
 * @param params - The apply operation parameters (subject, etc).
 * @param action - The PlanDefinition action.
 * @returns The RequestGroup action.
 */
async function createAction(
  repo: Repository,
  requester: Reference<ProfileResource>,
  params: PlanDefinitionApplyParameters,
  action: PlanDefinitionAction
): Promise<RequestGroupAction> {
  if (action.definitionCanonical?.startsWith('Questionnaire/')) {
    return createQuestionnaireTask(repo, requester, params, action);
  }
  return createTask(repo, requester, params, action);
}

/**
 * Creates a Task and RequestGroup action to complete a Questionnaire.
 * @param repo - The repository configured for the current user.
 * @param requester - The user who requested the plan definition.
 * @param params - The apply operation parameters (subject, etc).
 * @param action - The PlanDefinition action.
 * @returns The RequestGroup action.
 */
async function createQuestionnaireTask(
  repo: Repository,
  requester: Reference<ProfileResource>,
  params: PlanDefinitionApplyParameters,
  action: PlanDefinitionAction
): Promise<RequestGroupAction> {
  return createTask(repo, requester, params, action, [
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
 * @param params - The apply operation parameters (subject, etc).
 * @param action - The PlanDefinition action.
 * @param input - Optional input details.
 * @returns The RequestGroup action.
 */
async function createTask(
  repo: Repository,
  requester: Reference<ProfileResource>,
  params: PlanDefinitionApplyParameters,
  action: PlanDefinitionAction,
  input?: TaskInput[] | undefined
): Promise<RequestGroupAction> {
  const task = await repo.createResource<Task>({
    resourceType: 'Task',
    intent: 'order',
    status: 'requested',
    authoredOn: new Date().toISOString(),
    requester,
    for: createReference(params.subject),
    owner: createReference(params.subject),
    description: action.description,
    focus: input?.[0]?.valueReference,
    input,
  });

  return {
    title: action.title,
    resource: createReference(task),
  };
}
