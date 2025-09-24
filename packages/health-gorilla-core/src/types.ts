// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isReference } from '@medplum/core';
import {
  CodeableConcept,
  Coding,
  Coverage,
  ExtractResource,
  OperationOutcome,
  Organization,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
  ResourceType,
  ServiceRequest,
} from '@medplum/fhirtypes';

export type LabOrderServiceRequest = ServiceRequest & {
  performer: [Reference<LabOrganization>];
  code: CodeableConcept;
};

export interface LabOrderTestMetadata {
  /** (optional) This attribute allows to set priority for the given test within the order. Defaults to 'routine' */
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  /** (optional) Any notes and comments related to the given test. */
  notes?: string;
  /** The AOE `Questionnaire`, if any, containing Ask at Order Entry (AOE) questions for the test.  */
  readonly aoeQuestionnaire?: Questionnaire;
  /**
   * The `QuestionnaireResponse` resource containing answers related to the given diagnostic procedure.
   * If AOE is required for the specified configuration (performer, test, specimen), but missed in the
   * request, then the whole order will be rejected. Only answered AOEs should be included into request.
   */
  aoeResponses?: QuestionnaireResponse;
}

export const BillToOptions = ['patient', 'insurance', 'customer-account'] as const;
export type BillTo = (typeof BillToOptions)[number];

export function isBillTo(value: unknown): value is BillTo {
  if (value === 'patient' || value === 'insurance' || value === 'customer-account') {
    value satisfies BillTo;
    return true;
  }
  return false;
}

export type LabOrganization = Organization & { id: string };

export type TestCoding = Coding & { code: string };

export type DiagnosisCodeableConcept = CodeableConcept & {
  coding: (Coding & Required<Pick<Coding, 'system' | 'code'>>)[];
};

export type BillingInformation = {
  billTo?: BillTo;
  patientCoverage?: [] | [Coverage] | [Coverage, Coverage] | [Coverage, Coverage, Coverage];
};

export const PRIORITY_VALUES = ['routine', 'urgent', 'asap', 'stat'] as const;

export function isPriority(value: unknown): value is NonNullable<ServiceRequest['priority']> {
  return PRIORITY_VALUES.includes(value as any);
}

export type HGAutocompleteBotInput =
  | {
      type: 'lab';
      query: string;
    }
  | {
      type: 'test';
      query: string;
      labId: string;
    }
  | {
      type: 'aoe';
      testCode: Coding;
    };

export type HGAutocompleteBotResponse =
  | {
      outcome: OperationOutcome;
      type: 'lab';
      result: Organization[];
    }
  | {
      outcome: OperationOutcome;
      type: 'test';
      result: Coding[];
    }
  | {
      outcome: OperationOutcome;
      type: 'aoe';
      result: Questionnaire | undefined;
    }
  | {
      outcome: OperationOutcome;
      type: 'error';
      args: any;
    };

export function isReferenceOfType<T extends ResourceType>(
  resourceType: T,
  value: unknown
): value is Reference<ExtractResource<T>> & { reference: string } {
  return isReference(value) && value.reference.startsWith(resourceType + '/');
}

export function assertReferenceOfType<T extends ResourceType>(
  resourceType: T,
  value: unknown
): asserts value is Reference<ExtractResource<T>> {
  if (!isReferenceOfType(resourceType, value)) {
    throw new Error(`Expected reference to be of type ${resourceType}`);
  }
}

export type WithId<T> = T & { id: string };
