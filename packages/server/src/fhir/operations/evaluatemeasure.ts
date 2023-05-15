import { Operator, badRequest, created, parseSearchDefinition } from '@medplum/core';
import {
  Measure,
  MeasureGroup,
  MeasureGroupPopulation,
  MeasureReport,
  MeasureReportGroup,
  MeasureReportGroupPopulation,
  Resource,
} from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { sendOutcome } from '../outcomes';
import { Repository } from '../repo';
import { isFhirJsonContentType, sendResponse } from '../routes';

interface EvaluateMeasureParameters {
  readonly periodStart: string;
  readonly periodEnd: string;
}

/**
 * Handles a Measure $evaluate-measure operation request.
 *
 * The operation is used to calculate an eMeasure and obtain the results.
 *
 * We currently only support:
 * 1. The "instance" level operation using Measure by ID
 * 2. The "reportType" of "summary"
 * 4. Period using "periodStart" and "periodEnd"
 *
 * We do not support:
 * 1. subject parameter
 * 2. provider parameter
 * 3. "reportType" of "patient-list"
 * 4. location parameter
 *
 * See: https://hl7.org/fhir/measure-operation-evaluate-measure.html
 *
 * @param req The HTTP request.
 * @param res The HTTP response.
 */
export async function evaluateMeasureHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const repo = res.locals.repo as Repository;
  const measure = await repo.readResource<Measure>('Measure', id);

  const params = await validateParameters(req, res);
  if (!params) {
    return;
  }

  const measureReport = await evaluateMeasure(repo, params, measure);
  await sendResponse(res, created, measureReport);
}

/**
 * Parses and validates the operation parameters.
 * See: https://hl7.org/fhir/plandefinition-operation-apply.html
 * @param req The HTTP request.
 * @param res The HTTP response.
 * @returns The operation parameters if available; otherwise, undefined.
 */
async function validateParameters(req: Request, res: Response): Promise<EvaluateMeasureParameters | undefined> {
  if (!isFhirJsonContentType(req)) {
    res.status(400).send('Unsupported content type');
    return undefined;
  }

  const body = req.body as Resource;
  if (body.resourceType !== 'Parameters') {
    sendOutcome(res, badRequest('Incorrect parameters type'));
    return undefined;
  }

  const periodStartParam = body.parameter?.find((param) => param.name === 'periodStart');
  if (!periodStartParam?.valueDate) {
    sendOutcome(res, badRequest('Missing periodStart parameter'));
    return undefined;
  }

  const periodEndParam = body.parameter?.find((param) => param.name === 'periodEnd');
  if (!periodEndParam?.valueDate) {
    sendOutcome(res, badRequest('Missing periodEnd parameter'));
    return undefined;
  }

  return {
    periodStart: periodStartParam.valueDate,
    periodEnd: periodEndParam.valueDate,
  };
}

/**
 * Evaluates a Measure and returns a MeasureReport.
 * @param repo The current user repository.
 * @param params Validated parameters to the evaluate-measure operation.
 * @param measure The Measure resource.
 * @returns The MeasureReport resource.
 */
async function evaluateMeasure(
  repo: Repository,
  params: EvaluateMeasureParameters,
  measure: Measure
): Promise<MeasureReport> {
  const report: MeasureReport = {
    resourceType: 'MeasureReport',
    status: 'complete',
    type: 'summary',
    measure: measure.url,
    date: new Date().toISOString(),
    period: {
      start: params.periodStart,
      end: params.periodEnd,
    },
  };

  if (measure.group) {
    report.group = await Promise.all(measure.group.map((g) => evaluateMeasureGroup(repo, params, g)));
  }

  return repo.createResource<MeasureReport>(report);
}

/**
 * Evaluates a Measure group and returns a MeasureReport group.
 * @param repo The current user repository.
 * @param params Validated parameters to the evaluate-measure operation.
 * @param groupDefinition A group definition from the Measure resource.
 * @returns The populated group element for the MeasureReport resource.
 */
async function evaluateMeasureGroup(
  repo: Repository,
  params: EvaluateMeasureParameters,
  groupDefinition: MeasureGroup
): Promise<MeasureReportGroup> {
  const result: MeasureReportGroup = {
    code: groupDefinition.code,
  };

  if (groupDefinition.population) {
    result.population = await Promise.all(groupDefinition.population.map((p) => evaluatePopulation(repo, params, p)));
  }

  return result;
}

/**
 * Evaluates a Measure population and returns a MeasureReport population.
 * @param repo The current user repository.
 * @param params Validated parameters to the evaluate-measure operation.
 * @param populationDefinition A population definition from the Measure resource.
 * @returns The populated population element for the MeasureReport resource.
 */
async function evaluatePopulation(
  repo: Repository,
  params: EvaluateMeasureParameters,
  populationDefinition: MeasureGroupPopulation
): Promise<MeasureReportGroupPopulation> {
  const result: MeasureReportGroupPopulation = {
    code: populationDefinition.code,
  };
  if (populationDefinition.criteria?.expression) {
    result.count = await evaluateCount(repo, populationDefinition.criteria.expression, params);
  }
  return result;
}

/**
 * Evaluates a FHIR query and returns the count of matching resources.
 * @param repo The current user repository.
 * @param criteria The criteria expression.
 * @param params Validated parameters to the evaluate-measure operation.
 * @returns The count of matching resources if available; otherwise, undefined.
 */
async function evaluateCount(
  repo: Repository,
  criteria: string,
  params: EvaluateMeasureParameters
): Promise<number | undefined> {
  const searchDefinition = parseSearchDefinition(criteria);
  searchDefinition.total = 'accurate';

  if (!searchDefinition.filters) {
    searchDefinition.filters = [];
  }

  searchDefinition.filters.push({
    code: '_lastUpdated',
    operator: Operator.GREATER_THAN_OR_EQUALS,
    value: params.periodStart,
  });

  searchDefinition.filters.push({
    code: '_lastUpdated',
    operator: Operator.LESS_THAN_OR_EQUALS,
    value: params.periodEnd,
  });

  const bundle = await repo.search(searchDefinition);
  return bundle.total;
}
