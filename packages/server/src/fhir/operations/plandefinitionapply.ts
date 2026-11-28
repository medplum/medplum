// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, TypedValue, WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  capitalize,
  concatUrls,
  createReference,
  deepClone,
  EMPTY,
  evalFhirPathTyped,
  getElementDefinition,
  getExtension,
  getReferenceString,
  isReference,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  toJsBoolean,
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
  Extension,
  ExtractResource,
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
const APPLY_TRANSACTION_OPTIONS = {
  resourceTypes: [
    'Questionnaire',
    'ActivityDefinition',
    'PlanDefinition',
    'Task',
    'ServiceRequest',
    'RequestGroup',
    'CarePlan',
  ],
  source: 'planDefinitionApplyHandler',
} as const;
const TASK_OWNER_RESOURCE_TYPES = [
  'Practitioner',
  'PractitionerRole',
  'Organization',
  'CareTeam',
  'HealthcareService',
  'Patient',
  'Device',
  'RelatedPerson',
] as const;

type TaskOwner = Reference<ExtractResource<(typeof TASK_OWNER_RESOURCE_TYPES)[number]>>;

interface PlanDefinitionApplyParameters {
  readonly subject: string[];
  readonly encounter?: string;
  readonly practitioner?: string;
  readonly organization?: string;
}

interface TaskElements {
  readonly owner?: TaskOwner;
  readonly performerType?: CodeableConcept;
}

interface TaskElementsContext {
  readonly subject: Reference<Patient>;
  readonly practitioner?: Reference<Practitioner>;
  readonly organization?: Reference<Organization>;
}

interface PlanDefinitionApplyContext {
  readonly subject: WithId<Patient>;
  readonly subjectRef: Reference<Patient>;
  readonly encounterRef?: Reference<Encounter>;
  readonly practitionerRef?: Reference<Practitioner>;
  readonly organizationRef?: Reference<Organization>;
  readonly conditionVariables: Record<string, TypedValue>;
  readonly visitedPlanDefinitions: Set<string>;
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

  const encounter = params.encounter
    ? await ctx.repo.readReference<Encounter>({ reference: params.encounter })
    : undefined;
  const encounterRef = encounter ? createReference(encounter) : undefined;

  const practitioner = params.practitioner
    ? await ctx.repo.readReference<Practitioner>({ reference: params.practitioner })
    : undefined;
  const practitionerRef = practitioner ? createReference(practitioner) : undefined;

  const organization = params.organization
    ? await ctx.repo.readReference<Organization>({ reference: params.organization })
    : undefined;
  const organizationRef = organization ? createReference(organization) : undefined;

  const applyContext: PlanDefinitionApplyContext = {
    subject,
    subjectRef,
    encounterRef,
    practitionerRef,
    organizationRef,
    conditionVariables: {
      '%subject': toTypedValue(subject),
      '%patient': toTypedValue((subject as Resource).resourceType === 'Patient' ? subject : undefined),
      '%encounter': toTypedValue(encounter),
      '%practitioner': toTypedValue(practitioner),
      '%organization': toTypedValue(organization),
    },
    visitedPlanDefinitions: new Set([getReferenceString(planDefinition)]),
  };

  const carePlan = await ctx.repo.withTransaction(async (txRepo) => {
    const actions = await createActions(txRepo, planDefinition, ctx.profile, planDefinition.action, applyContext);

    const requestGroup = await txRepo.createResource<RequestGroup>({
      resourceType: 'RequestGroup',
      instantiatesCanonical: planDefinition.url ? [planDefinition.url] : undefined,
      instantiatesUri: planDefinition.url
        ? undefined
        : [concatUrls(getConfig().baseUrl, getReferenceString(planDefinition))],
      subject: subjectRef,
      status: 'active',
      intent: 'order',
      action: actions.length > 0 ? actions : undefined,
      encounter: encounterRef,
    });

    return txRepo.createResource<CarePlan>({
      resourceType: 'CarePlan',
      status: 'active',
      subject: subjectRef,
      intent: 'plan',
      instantiatesCanonical: planDefinition.url ? [planDefinition.url] : undefined,
      instantiatesUri: planDefinition.url
        ? undefined
        : [concatUrls(getConfig().baseUrl, getReferenceString(planDefinition))],
      activity: [{ reference: createReference(requestGroup) }],
    });
  }, APPLY_TRANSACTION_OPTIONS);

  return [allOk, carePlan];
}

/**
 * Evaluates and creates RequestGroup actions (and associated Tasks) for a list of PlanDefinition actions.
 * @param repo - The repository configured for the current user.
 * @param planDefinition - The owning plan definition.
 * @param requester - The user who requested the plan definition.
 * @param actions - The PlanDefinition actions to evaluate.
 * @param context - The `$apply` evaluation context.
 * @returns The resulting applicable RequestGroup actions.
 */
async function createActions(
  repo: Repository,
  planDefinition: PlanDefinition,
  requester: Reference<ProfileResource | Bot | ClientApplication>,
  actions: PlanDefinitionAction[] | undefined,
  context: PlanDefinitionApplyContext
): Promise<RequestGroupAction[]> {
  const result: RequestGroupAction[] = [];
  for (const action of actions ?? EMPTY) {
    const created = await createAction(repo, planDefinition, requester, action, context);
    if (created) {
      result.push(created);
    }
  }
  return result;
}

/**
 * Checks whether all `applicability` conditions on a PlanDefinition action evaluate to truthy.
 * Non-applicability conditions (such as `start` or `stop`) are ignored at `$apply` time.
 * @param action - The PlanDefinition action.
 * @param context - The `$apply` evaluation context.
 * @returns True if the action is applicable; false otherwise.
 */
function isActionApplicable(action: PlanDefinitionAction, context: PlanDefinitionApplyContext): boolean {
  for (const condition of action.condition ?? EMPTY) {
    if (condition.kind !== 'applicability') {
      continue;
    }
    const language = condition.expression?.language;
    if (language && language !== 'text/fhirpath') {
      throw new OperationOutcomeError(
        badRequest(`PlanDefinition.action.condition expression uses unsupported language: ${language}`)
      );
    }
    const expression = condition.expression?.expression;
    if (!expression) {
      continue;
    }
    let result: TypedValue[];
    try {
      result = evalFhirPathTyped(expression, [toTypedValue(context.subject)], context.conditionVariables);
    } catch (err) {
      throw new OperationOutcomeError(
        badRequest(`Invalid PlanDefinition.action.condition expression "${expression}": ${normalizeErrorString(err)}`)
      );
    }
    if (!toJsBoolean(result)) {
      return false;
    }
  }
  return true;
}

/**
 * Builds a grouping RequestGroupAction without creating a backing Task.
 * @param action - The source PlanDefinition action.
 * @param childActions - Evaluated child RequestGroup actions.
 * @param fallbackTitle - Optional fallback title (for referenced sub-PlanDefinitions).
 * @returns The grouping RequestGroupAction.
 */
function buildGroupRequestGroupAction(
  action: PlanDefinitionAction,
  childActions: RequestGroupAction[],
  fallbackTitle?: string
): RequestGroupAction {
  const remainingConditions = action.condition?.filter((c) => c.kind !== 'applicability');
  return {
    title: action.title ?? fallbackTitle,
    description: action.description,
    condition: remainingConditions?.length ? remainingConditions : undefined,
    groupingBehavior: action.groupingBehavior,
    selectionBehavior: action.selectionBehavior,
    requiredBehavior: action.requiredBehavior,
    precheckBehavior: action.precheckBehavior,
    cardinalityBehavior: action.cardinalityBehavior,
    action: childActions,
  };
}

/**
 * Creates a Task and RequestGroup action for the given PlanDefinition action, or skips it when inapplicable.
 * @param repo - The repository configured for the current user.
 * @param planDefinition - The plan definition.
 * @param requester - The user who requested the plan definition.
 * @param action - The PlanDefinition action.
 * @param context - The `$apply` evaluation context.
 * @returns The RequestGroup action, or undefined if excluded by `condition`.
 */
async function createAction(
  repo: Repository,
  planDefinition: PlanDefinition,
  requester: Reference<ProfileResource | Bot | ClientApplication>,
  action: PlanDefinitionAction,
  context: PlanDefinitionApplyContext
): Promise<RequestGroupAction | undefined> {
  if (!isActionApplicable(action, context)) {
    return undefined;
  }

  let definition: WithId<Resource> | undefined;
  if (action.definitionCanonical) {
    definition = await readCanonical(repo, action.definitionCanonical);
  }

  if (definition?.resourceType === 'PlanDefinition') {
    const subPlanRef = getReferenceString(definition);
    if (context.visitedPlanDefinitions.has(subPlanRef)) {
      throw new OperationOutcomeError(badRequest(`Circular PlanDefinition reference detected: ${subPlanRef}`));
    }
    const subContext: PlanDefinitionApplyContext = {
      ...context,
      visitedPlanDefinitions: new Set([...context.visitedPlanDefinitions, subPlanRef]),
    };
    const subPlanActions = await createActions(repo, definition, requester, definition.action, subContext);
    const inlineChildActions = await createActions(repo, planDefinition, requester, action.action, subContext);
    const combinedActions = [...subPlanActions, ...inlineChildActions];
    if (combinedActions.length === 0) {
      return undefined;
    }
    return buildGroupRequestGroupAction(action, combinedActions, definition.title);
  }

  const childActions = await createActions(repo, planDefinition, requester, action.action, context);
  if (!action.definitionCanonical && action.action?.length) {
    if (childActions.length === 0) {
      return undefined;
    }
    return buildGroupRequestGroupAction(action, childActions);
  }

  const taskContext: TaskElementsContext = {
    subject: context.subjectRef,
    practitioner: context.practitionerRef,
    organization: context.organizationRef,
  };
  const actionElements = resolveTaskElements(action, taskContext);
  let rgAction: RequestGroupAction;

  switch (definition?.resourceType) {
    case 'Questionnaire':
      rgAction = await createTask(
        repo,
        planDefinition,
        requester,
        context.subjectRef,
        action,
        context.encounterRef,
        actionElements.owner,
        actionElements.performerType,
        [
          {
            type: { text: 'Questionnaire' },
            valueReference: {
              display: action.title,
              reference: getReferenceString(definition),
            },
          },
        ]
      );
      break;
    case 'ActivityDefinition':
      rgAction = await createActivityDefinitionTask(
        repo,
        planDefinition,
        requester,
        context.subjectRef,
        action,
        definition,
        context.encounterRef,
        taskContext,
        actionElements
      );
      break;
    default:
      rgAction = await createTask(
        repo,
        planDefinition,
        requester,
        context.subjectRef,
        action,
        context.encounterRef,
        actionElements.owner,
        actionElements.performerType
      );
      break;
  }

  if (childActions.length > 0) {
    // RequestGroup.action enforces FHIR invariant rqg-1: a single action cannot carry both `resource` and nested `action`.
    return buildGroupRequestGroupAction(action, [rgAction, ...childActions]);
  }
  return rgAction;
}

/**
 * Resolves Task `owner` and `performerType` from a `task-elements` extension on the given element.
 * @param source - The PlanDefinition action or ActivityDefinition that may carry the extension.
 * @param context - The `$apply` parameters exposed to the FHIRPath expression.
 * @returns The resolved Task elements; fields are undefined when not configured.
 */
function resolveTaskElements(
  source: PlanDefinitionAction | ActivityDefinition | undefined,
  context: TaskElementsContext
): TaskElements {
  const taskElementsExtension = getExtension(source, TASK_ELEMENTS_URL);
  return {
    owner: resolveTaskOwner(taskElementsExtension, context),
    performerType: resolveTaskPerformerType(taskElementsExtension),
  };
}

/**
 * Resolves the Task `owner` from the `owner` sub-extension of a `task-elements` extension.
 * The sub-extension holds either a `valueReference` to one of the supported Task owner types,
 * or a `valueExpression` FHIRPath expression evaluated against the `$apply` parameters.
 * @param taskElementsExtension - The `task-elements` extension, if present.
 * @param context - The `$apply` parameters exposed to the FHIRPath expression.
 * @returns The owner reference, or undefined when not configured or when the expression yields no reference.
 */
function resolveTaskOwner(
  taskElementsExtension: Extension | undefined,
  context: TaskElementsContext
): TaskOwner | undefined {
  const ownerExtension = getExtension(taskElementsExtension, 'owner');
  if (ownerExtension?.valueReference) {
    return validateTaskOwnerReference(ownerExtension.valueReference);
  }
  if (ownerExtension?.valueExpression?.expression) {
    const result = evalFhirPathTyped(ownerExtension.valueExpression.expression, [toTypedValue(context)], {
      '%practitioner': toTypedValue(context.practitioner),
      '%organization': toTypedValue(context.organization),
      '%subject': toTypedValue(context.subject),
    });
    const resultValue = result[0]?.value;
    if (isReference(resultValue)) {
      return validateTaskOwnerReference(resultValue);
    }
  }
  return undefined;
}

/**
 * Resolves the Task `performerType` from the `performerType` sub-extension of a `task-elements` extension.
 * @param taskElementsExtension - The `task-elements` extension, if present.
 * @returns The literal CodeableConcept, or undefined when not configured.
 */
function resolveTaskPerformerType(taskElementsExtension: Extension | undefined): CodeableConcept | undefined {
  return getExtension(taskElementsExtension, 'performerType')?.valueCodeableConcept;
}

/**
 * Validates a `task-elements` owner reference.
 * @param reference - The owner reference, from `valueReference` or from the evaluated `valueExpression`.
 * @returns The reference, when it is a literal `ResourceType/id` reference to one of `TASK_OWNER_RESOURCE_TYPES`.
 */
function validateTaskOwnerReference(reference: Reference): TaskOwner {
  const [resourceType, id] = reference.reference?.split('/') ?? [];
  if (!id || !(TASK_OWNER_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    throw new OperationOutcomeError(
      badRequest(
        `task-elements owner must reference one of ${TASK_OWNER_RESOURCE_TYPES.join(', ')} (got ${reference.reference ?? 'no reference'})`
      )
    );
  }
  return reference as TaskOwner;
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
 * @param context - The `$apply` parameters exposed to task-elements expressions.
 * @param actionElements - Task elements resolved from the PlanDefinition action, which take precedence.
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
  context: TaskElementsContext,
  actionElements: TaskElements
): Promise<RequestGroupAction> {
  const { practitioner, organization } = context;
  const definitionExtension = getExtension(activityDefinition, TASK_ELEMENTS_URL);
  const owner = actionElements.owner ?? resolveTaskOwner(definitionExtension, context);
  const performerType = actionElements.performerType ?? resolveTaskPerformerType(definitionExtension);

  switch (activityDefinition.kind) {
    case 'ServiceRequest': {
      const serviceRequest: ServiceRequest = deepClone({
        resourceType: 'ServiceRequest',
        status: 'draft',
        intent: activityDefinition.intent as ServiceRequest['intent'],
        subject: subject,
        requester: requester as ServiceRequest['requester'],
        encounter: encounter,
        code: activityDefinition.code,
        extension: activityDefinition.extension,
      });

      applyDynamicValues(serviceRequest as unknown as Record<string, unknown>, 'ServiceRequest', activityDefinition, {
        '%practitioner': toTypedValue(practitioner),
        '%organization': toTypedValue(organization),
        '%subject': toTypedValue(subject),
        '%encounter': toTypedValue(encounter),
      });

      const persisted = await repo.createResource(serviceRequest);

      return createTask(
        repo,
        planDefinition,
        persisted.requester ?? requester,
        subject,
        action,
        encounter,
        owner,
        performerType,
        [
          {
            type: {
              text: 'ServiceRequest',
            },
            valueReference: {
              display: action.title,
              reference: getReferenceString(persisted),
            },
          },
        ]
      );
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
  requester: Reference<ProfileResource | Bot | ClientApplication> | NonNullable<ServiceRequest['requester']>,
  subject: Reference<Patient>,
  action: PlanDefinitionAction,
  encounter?: Reference<Encounter>,
  owner?: TaskOwner,
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

export function applyDynamicValues(
  target: Record<string, unknown>,
  resourceType: string,
  activityDefinition: ActivityDefinition,
  variables: Record<string, TypedValue>
): void {
  for (const dv of activityDefinition.dynamicValue ?? EMPTY) {
    const expression = dv.expression?.expression;
    if (!expression || !dv.path) {
      continue;
    }
    const language = dv.expression?.language;
    if (language && language !== 'text/fhirpath') {
      throw new OperationOutcomeError(
        badRequest(
          `ActivityDefinition.dynamicValue expression uses unsupported language: ${language} (path: ${dv.path})`
        )
      );
    }
    const result = evalFhirPathTyped(expression, [toTypedValue(target)], variables);
    setValueAtPath(target, resourceType, dv.path, result);
  }
}

function setValueAtPath(
  target: Record<string, unknown>,
  resourceType: string,
  path: string,
  values: TypedValue[]
): void {
  if (values.length === 0) {
    return;
  }
  const pathSegments = path.split('.');
  let currentNode: Record<string, unknown> = target;
  let currentFhirType = resourceType;
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const segmentKey = pathSegments[i];
    if (segmentKey === '__proto__' || segmentKey === 'prototype' || segmentKey === 'constructor') {
      return;
    }
    const element = getElementDefinition(currentFhirType, segmentKey);
    if (!element) {
      return;
    }
    if (currentNode[segmentKey] === undefined) {
      currentNode[segmentKey] = element.isArray ? [{}] : {};
    }
    currentNode = (element.isArray ? (currentNode[segmentKey] as object[])[0] : currentNode[segmentKey]) as Record<
      string,
      unknown
    >;
    currentFhirType = element.type[0].code;
  }
  const finalSegmentKey = pathSegments[pathSegments.length - 1];
  if (finalSegmentKey === '__proto__' || finalSegmentKey === 'prototype' || finalSegmentKey === 'constructor') {
    return;
  }
  const finalElement = getElementDefinition(currentFhirType, finalSegmentKey);
  if (!finalElement) {
    return;
  }
  const writeKey = finalSegmentKey.includes('[x]')
    ? finalSegmentKey.replace('[x]', capitalize(values[0].type))
    : finalSegmentKey;
  currentNode[writeKey] = deepClone(finalElement.isArray ? values.map((v) => v.value) : values[0].value);
}

/**
 * Resolves a canonical URL to a definition resource.
 * Several versions of a definition can share a url, so the most recently updated `active` one is preferred,
 * falling back to the most recently updated definition of any status.
 * Resource types are checked in order (ActivityDefinition, PlanDefinition, Questionnaire), and versions are only
 * compared within the first type that has a match.
 * @param repo - The repository.
 * @param canonical - The canonical URL from the action's `definitionCanonical`.
 * @returns The matching definition, if any.
 */
async function readCanonical<T extends Questionnaire | ActivityDefinition | PlanDefinition>(
  repo: Repository,
  canonical: string
): Promise<WithId<T> | undefined> {
  if (!canonical) {
    return undefined;
  }

  for (const resourceType of ['ActivityDefinition', 'PlanDefinition', 'Questionnaire'] as const) {
    const definitions = await repo.searchResources<T>({
      resourceType,
      filters: [{ code: 'url', operator: Operator.EQUALS, value: canonical }],
      sortRules: [{ code: '_lastUpdated', descending: true }],
    });
    if (definitions.length > 0) {
      return definitions.find((definition) => definition.status === 'active') ?? definitions[0];
    }
  }
  return undefined;
}
