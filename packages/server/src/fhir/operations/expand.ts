import { badRequest, Operator as SearchOperator } from '@medplum/core';
import { ValueSet, ValueSetComposeInclude } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getClient } from '../../database';
import { sendOutcome } from '../outcomes';
import { systemRepo } from '../repo';
import { Condition, Conjunction, Disjunction, Expression, Operator, SelectQuery } from '../sql';

// Implements FHIR "Value Set Expansion"
// https://www.hl7.org/fhir/operation-valueset-expand.html

// Currently only supports a limited subset
// 1) The "url" parameter to identify the value set
// 2) The "filter" parameter for text search
// 3) Optional offset for pagination (default is zero for beginning)
// 4) Optional count for pagination (default is 10, can be 1-20)

export const expandOperator = asyncWrap(async (req: Request, res: Response) => {
  let url = req.query.url as string | undefined;
  if (typeof url !== 'string') {
    sendOutcome(res, badRequest('Missing url'));
    return;
  }

  const filter = req.query.filter;
  if (filter !== undefined && typeof filter !== 'string') {
    sendOutcome(res, badRequest('Invalid filter'));
    return;
  }

  const pipeIndex = url.indexOf('|');
  if (pipeIndex >= 0) {
    url = url.substring(0, pipeIndex);
  }

  // First, get the ValueSet resource
  const valueSet = await getValueSetByUrl(url);
  if (!valueSet) {
    sendOutcome(res, badRequest('ValueSet not found'));
    return;
  }

  // Build a collection of all systems to include
  const systemExpressions = buildValueSetSystems(valueSet);
  if (systemExpressions.length === 0) {
    sendOutcome(res, badRequest('No systems found'));
    return;
  }

  let offset = 0;
  if (req.query.offset) {
    offset = Math.max(0, parseInt(req.query.offset as string, 10));
  }

  let count = 10;
  if (req.query.count) {
    count = Math.max(1, Math.min(20, parseInt(req.query.count as string, 10)));
  }

  const client = getClient();
  const query = new SelectQuery('ValueSetElement')
    .distinctOn('system')
    .distinctOn('code')
    .distinctOn('display')
    .column('system')
    .column('code')
    .column('display')
    .whereExpr(new Disjunction(systemExpressions))
    .orderBy('display')
    .offset(offset)
    .limit(count);

  if (filter) {
    query.where(
      'display_tsv',
      Operator.TSVECTOR_ENGLISH,
      filter
        .replace(/[^\p{Letter}\p{Number}]/gu, ' ')
        .trim()
        .split(/\s+/)
        .map((token) => token + ':*')
        .join(' & ')
    );
  }

  const rows = await query.execute(client);
  const elements = rows.map((row) => ({
    system: row.system,
    code: row.code,
    display: row.display ?? undefined, // if display is NULL, we want to filter it out before sending this to the client
  }));

  res.status(200).json({
    resourceType: 'ValueSet',
    url,
    expansion: {
      offset,
      contains: elements,
    },
  } as ValueSet);
});

function getValueSetByUrl(url: string): Promise<ValueSet | undefined> {
  return systemRepo.searchOne<ValueSet>({
    resourceType: 'ValueSet',
    filters: [{ code: 'url', operator: SearchOperator.EQUALS, value: url }],
  });
}

function buildValueSetSystems(valueSet: ValueSet): Expression[] {
  const result: Expression[] = [];
  if (valueSet.compose?.include) {
    for (const include of valueSet.compose.include) {
      processInclude(result, include);
    }
  }
  return result;
}

function processInclude(systemExpressions: Expression[], include: ValueSetComposeInclude): void {
  if (!include.system) {
    return;
  }

  const systemExpression = new Condition('system', Operator.EQUALS, include.system as string);

  if (include.concept) {
    const codeExpressions: Expression[] = [];
    for (const concept of include.concept) {
      codeExpressions.push(new Condition('code', Operator.EQUALS, concept.code as string));
    }
    systemExpressions.push(new Conjunction([systemExpression, new Disjunction(codeExpressions)]));
  } else {
    systemExpressions.push(systemExpression);
  }
}
