import { ValueSet } from '@medplum/core';
import { Request, Response } from 'express';
import { asyncWrap } from '../async';
import { getKnex } from '../database';
import { badRequest } from './outcomes';

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
  const url = req.query.url as string | undefined;
  if (!url) {
    return res.status(400).send(badRequest('Missing url'));
  }

  const filter = req.query.filter as string | undefined;
  if (!filter) {
    return res.status(400).send(badRequest('Missing filter'));
  }

  let offset = 0;
  if (req.query.offset) {
    offset = Math.max(0, parseInt(req.query.offset as string));
  }

  let count = 10;
  if (req.query.count) {
    count = Math.max(1, Math.min(20, parseInt(req.query.count as string)));
  }

  const knex = getKnex();
  const elements = await knex.select('code', 'display')
    .from('ValueSetElement')
    .where('system', url)
    .andWhere('display', 'LIKE', '%' + filter + '%')
    .offset(offset)
    .limit(count)
    .then(result => result.map(row => ({
      system: url,
      code: row[0],
      display: row[1]
    })));

  return res.status(200)
    .json({
      resourceType: 'ValueSet',
      url,
      expansion: {
        total: 100,
        offset,
        contains: elements
      }
    } as ValueSet);
});
