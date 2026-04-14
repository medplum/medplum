// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { append, ContentType, EMPTY, getStatus, isAccepted, isRedirect } from '@medplum/core';
import type { Extension, OperationOutcome } from '@medplum/fhirtypes';
import type { Response } from 'express';
import type { Result, ValidationError } from 'express-validator';
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
  let extension: Extension[] | undefined;
  const tracingExt = buildTracingExtension();
  if (tracingExt) {
    extension = append(extension, tracingExt);
  }
  for (const ext of outcome.extension ?? EMPTY) {
    extension = append(extension, ext);
  }
  return res
    .status(getStatus(outcome))
    .type(ContentType.FHIR_JSON)
    .json({ ...outcome, extension } as OperationOutcome);
}
