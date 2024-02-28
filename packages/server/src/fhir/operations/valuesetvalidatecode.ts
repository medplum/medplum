import { asyncWrap } from '../../async';
import { Request, Response } from 'express';
import { parseInputParameters } from './utils/parameters';
import { getOperationDefinition } from './definitions';
import { CodeableConcept, Coding, ValueSet } from '@medplum/fhirtypes';
import { sendOutcome } from '../outcomes';
import { badRequest } from '@medplum/core';
import { findTerminologyResource } from './expand';

const operation = getOperationDefinition('ValueSet', 'validate-code');

type ValueSetValidateCodeParameters = {
  url?: string;
  code?: string;
  system?: string;
  coding?: Coding;
  codeableConcept?: CodeableConcept;
  display?: string;
  abstract?: boolean;
};

// Implements FHIR "Value Set Expansion"
// https://www.hl7.org/fhir/operation-valueset-expand.html

// Currently only supports a limited subset
// 1) The "url" parameter to identify the value set
// 2) The "filter" parameter for text search
// 3) Optional offset for pagination (default is zero for beginning)
// 4) Optional count for pagination (default is 10, can be 1-1000)

export const expandOperator = asyncWrap(async (req: Request, res: Response) => {
  const params = parseInputParameters<ValueSetValidateCodeParameters>(operation, req);

  if (!params.url) {
    sendOutcome(res, badRequest('Missing ValueSet URL'));
    return;
  }

  const codings = [];
  if (params.system && params.code) {
    codings.push({ system: params.system, code: params.code, display: params.display });
  } else if (params.coding) {
    codings.push(params.coding);
  } else if (params.codeableConcept?.coding) {
    codings.push(...params.codeableConcept.coding);
  } else {
    sendOutcome(res, badRequest('No coding specified'));
    return;
  }

  const valueSet = await findTerminologyResource<ValueSet>('ValueSet', params.url);
});
