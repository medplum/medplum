// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, getStatus, isAccepted, isRedirect } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { Response } from 'express';
import { Result, ValidationError } from 'express-validator';
import { randomUUID } from 'node:crypto';
import { buildTracingExtension } from '../context';

export function invalidRequest(errors: Result<ValidationError>): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: errors
      .array()
      .flatMap((error) => {
        if (error.type === 'alternative') {
          return error.nestedErrors;
        }
        return error;
      })
      .map((error) => ({
        severity: 'error',
        code: 'invalid',
        expression: getValidationErrorExpression(error),
        details: { text: error.msg },
      })),
  };
}

function getValidationErrorExpression(error: ValidationError): string[] | undefined {
  // ValidationError can be AlternativeValidationError | GroupedAlternativeValidationError | UnknownFieldsError | FieldValidationError
  if (error.type === 'field') {
    return [error.path];
  }
  return undefined;
}

export function sendOutcome(res: Response, outcome: OperationOutcome): Response {
  if (isAccepted(outcome) && outcome.issue?.[0].diagnostics) {
    res.set('Content-Location', outcome.issue[0].diagnostics);
  }
  if (isRedirect(outcome)) {
    const uri = outcome.issue[0].details?.coding?.find((c) => c.system === 'urn:ietf:rfc:3986')?.code;
    if (uri) {
      res.set('Location', uri);
    }
  }
  return res
    .status(getStatus(outcome))
    .type(ContentType.FHIR_JSON)
    .json({
      ...outcome,
      extension: buildTracingExtension(),
    } as OperationOutcome);
}
