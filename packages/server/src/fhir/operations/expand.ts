import { badRequest } from '@medplum/core';
import { ValueSet } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { asyncWrap } from '../../async';
import { getClient } from '../../database';
import { sendOutcome } from '../outcomes';
import { Operator, SelectQuery } from '../sql';

// Implements FHIR "Value Set Expansion"
// https://www.hl7.org/fhir/operation-valueset-expand.html

// Follows IHTSDO Snowstorm reference implementation
// https://github.com/IHTSDO/snowstorm/blob/master/docs/fhir-resources/valueset-expansion.md

// Currently only supports a limited subset
// 1) The "url" parameter to identify the value set
// 2) The "filter" parameter for text search
// 3) Optional offset for pagination (default is zero for beginning)
// 4) Optional count for pagination (default is 10, can be 1-20)

export const expandOperator = asyncWrap(async (req: Request, res: Response) => {
  let url = req.query.url as string | undefined;
  if (!url) {
    sendOutcome(res, badRequest('Missing url'));
    return;
  }
  const pipeIndex = url.indexOf('|');
  if (pipeIndex >= 0) {
    url = url.substring(0, pipeIndex);
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
  const elements = await new SelectQuery('ValueSetElement')
    .column('system')
    .column('code')
    .column('display')
    .where('valueSet', Operator.EQUALS, url)
    .where('display', Operator.LIKE, '%' + filter + '%')
    .orderBy('display')
    .offset(offset)
    .limit(count)
    .execute(client)
    .then((result) =>
      result.map((row) => ({
        system: row.system,
        code: row.code,
        display: row.display,
      }))
    );

  return res.status(200).json({
    resourceType: 'ValueSet',
    url,
    expansion: {
      offset,
      contains: elements,
    },
  } as ValueSet);
});
