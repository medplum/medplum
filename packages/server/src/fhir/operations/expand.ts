import { badRequest, Operator as SearchOperator } from '@medplum/core';
import { ValueSet, ValueSetComposeInclude } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getClient } from '../../database';
import { sendOutcome } from '../outcomes';
import { systemRepo } from '../repo';
import { Operator, SelectQuery } from '../sql';

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
  const systems = new Set<string>();
  const codes = new Set<string>();
  buildValueSetSystems(valueSet, systems, codes);
  if (systems.size === 0) {
    sendOutcome(res, badRequest('No systems found'));
    return;
  }

  const filter = req.query.filter || '';

  let offset = 0;
  if (req.query.offset) {
    offset = Math.max(0, parseInt(req.query.offset as string));
  }

  let count = 10;
  if (req.query.count) {
    count = Math.max(1, Math.min(20, parseInt(req.query.count as string)));
  }

  const client = getClient();
  const query = new SelectQuery('ValueSetElement')
    .raw('DISTINCT "code"')
    .column('system')
    .column('display')
    .where('system', Operator.IN, systems)
    .where('display', Operator.LIKE, '%' + filter + '%')
    .orderBy('display')
    .offset(offset)
    .limit(count);

  if (codes.size > 0) {
    query.where('code', Operator.IN, codes);
  }

  const rows = await query.execute(client);
  const elements = rows.map((row) => ({
    system: row.system,
    code: row.code,
    display: row.display,
  }));

  return res.status(200).json({
    resourceType: 'ValueSet',
    url,
    expansion: {
      offset,
      contains: elements,
    },
  } as ValueSet);
});

async function getValueSetByUrl(url: string): Promise<ValueSet | undefined> {
  const result = await systemRepo.search<ValueSet>({
    resourceType: 'ValueSet',
    count: 1,
    filters: [{ code: 'url', operator: SearchOperator.EQUALS, value: url }],
  });
  return result?.entry?.[0]?.resource;
}

function buildValueSetSystems(valueSet: ValueSet, systems: Set<string>, codes: Set<string>): void {
  if (valueSet.compose?.include) {
    for (const include of valueSet.compose.include) {
      processInclude(include, systems, codes);
    }
  }
}

function processInclude(include: ValueSetComposeInclude, systems: Set<string>, codes: Set<string>): void {
  if (include.system) {
    systems.add(include.system);
  }
  if (include.concept) {
    for (const concept of include.concept) {
      if (concept.code) {
        codes.add(concept.code);
      }
    }
  }
}
