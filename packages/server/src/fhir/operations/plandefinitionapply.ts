import { assertOk, badRequest, createReference, getReferenceString, OperationOutcomeError } from '@medplum/core';
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
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { isFhirJsonContentType, sendResponse } from '../routes';

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
 *
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function planDefinitionApplyHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;

  const [outcome1, planDefinition] = await repo.readResource<PlanDefinition>('PlanDefinition', id);
  assertOk(outcome1, planDefinition);

  const params = await validateParameters(req, res);
  if (!params) {
    return;
  }

  const actions: RequestGroupAction[] = [];
  if (planDefinition.action) {
    for (const action of planDefinition.action) {
      actions.push(await createAction(repo, params, action));
    }
  }

  const [outcome3, requestGroup] = await repo.createResource<RequestGroup>({
    resourceType: 'RequestGroup',
    instantiatesCanonical: [getReferenceString(planDefinition)],
    subject: createReference(params.subject) as Reference<Patient | Group>,
    status: 'active',
    action: actions,
  });
  assertOk(outcome3, requestGroup);
  sendResponse(res, outcome3, requestGroup);
}

/**
 * Parses and validates the operation parameters.
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns The operation parameters if available; otherwise, undefined.
 */
async function validateParameters(req: Request, res: Response): Promise<PlanDefinitionApplyParameters | undefined> {
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

  const repo = res.locals.repo as Repository;
  const [outcome2, subject] = await repo.readReference(subjectParam.valueReference as Reference<SubjectType>);
  assertOk(outcome2, subject);

  return {
    subject,
  };
}

/**
 * Creates a RequestGroup action for the given PlanDefinition action.
 * @param repo The repository configured for the current user.
 * @param params The apply operation parameters (subject, etc).
 * @param action The PlanDefinition action.
 * @return The RequestGroup action.
 */
async function createAction(
  repo: Repository,
  params: PlanDefinitionApplyParameters,
  action: PlanDefinitionAction
): Promise<RequestGroupAction> {
  if (action.definitionCanonical?.startsWith('Questionnaire/')) {
    return createQuestionnaireTask(repo, params, action);
  }
  throw new OperationOutcomeError(badRequest('Unsupported action type'));
}

/**
 * Creates a RequestGroup action for a Questionnaire.
 * @param repo The repository configured for the current user.
 * @param params The apply operation parameters (subject, etc).
 * @param action The PlanDefinition action.
 * @return The RequestGroup action.
 */
async function createQuestionnaireTask(
  repo: Repository,
  params: PlanDefinitionApplyParameters,
  action: PlanDefinitionAction
): Promise<RequestGroupAction> {
  const [outcome, task] = await repo.createResource<Task>({
    resourceType: 'Task',
    intent: 'order',
    status: 'requested',
    authoredOn: new Date().toISOString(),
    owner: createReference(params.subject),
    input: [
      {
        valueReference: {
          display: action.title,
          reference: action.definitionCanonical,
        },
      },
    ],
  });
  assertOk(outcome, task);

  return {
    title: action.title,
    resource: createReference(task),
  };
}
