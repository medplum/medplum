// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference, ServiceRequest } from '@medplum/fhirtypes';

export const getOrderDisplayText = (order: ServiceRequest): string => {
  // If there are multiple codes (2 or more), show them separated by commas
  if (order.code?.coding && order.code.coding.length >= 2) {
    return order.code.coding.map((coding) => coding.display).join(', ');
  }

  // If there's a text field and only one code, use the text field
  if (order.code?.text) {
    return order.code.text;
  }

  // Otherwise, show the first code or fallback
  return order.code?.coding?.[0]?.display || 'Lab Order';
};

export const getOrderStatusColor = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'blue';
    case 'draft':
    case 'requested':
      return 'yellow';
    case 'on-hold':
      return 'orange';
    case 'revoked':
    case 'cancelled':
    case 'entered-in-error':
      return 'red';
    case 'completed':
      return 'green';
    default:
      return 'gray';
  }
};

export const getOrderStatusDisplayText = (status: string | undefined): string => {
  switch (status) {
    case 'active':
      return 'Active';
    case 'draft':
      return 'Draft';
    case 'requested':
      return 'Requested';
    case 'on-hold':
      return 'On Hold';
    case 'revoked':
      return 'Revoked';
    case 'cancelled':
      return 'Cancelled';
    case 'entered-in-error':
      return 'Error';
    case 'completed':
      return 'Completed';
    case 'unknown':
      return 'Unknown';
    default:
      return status || 'Unknown';
  }
};

export const getQuestionnaireResponseRef = (order: ServiceRequest | undefined): Reference | undefined =>
  order?.supportingInfo?.find((ref) => ref.reference?.startsWith('QuestionnaireResponse/'));
