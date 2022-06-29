import { allOk, assertOk, createReference } from '@medplum/core';
import {
  CareTeam,
  Device,
  HealthcareService,
  Organization,
  Patient,
  PlanDefinition,
  PlanDefinitionAction,
  Practitioner,
  PractitionerRole,
  RelatedPerson,
  RequestGroup,
  RequestGroupAction,
  Task,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';

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
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function planDefinitionApplyHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;

  const [outcome1, planDefinition] = await repo.readResource<PlanDefinition>('PlanDefinition', id);
  assertOk(outcome1, planDefinition);

  const [outcome2, subject] = await repo.readReference<SubjectType>({ reference: req.params.subject });
  assertOk(outcome2, subject);

  const params: PlanDefinitionApplyParameters = {
    subject,
  };

  const actions: RequestGroupAction[] = [];

  if (planDefinition.action) {
    for (const action of planDefinition.action) {
      actions.push(await createAction(repo, params, action));
    }
  }

  const [outcome3, requestGroup] = await repo.createResource<RequestGroup>({
    resourceType: 'RequestGroup',
    action: actions,
  });
  assertOk(outcome3, requestGroup);

  sendOutcome(res, allOk);
}

/**
 *
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
  throw new Error('Unsupported action type');
}

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
