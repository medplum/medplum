// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { isObject, isString } from '@medplum/core';

export function dicomPersonNameToString(dicomPersonName: unknown): string | undefined {
  if (Array.isArray(dicomPersonName) && dicomPersonName.length > 0) {
    const first = dicomPersonName[0];
    if (isObject(first) && isString(first.Alphabetic)) {
      return first.Alphabetic.trim();
    }
  }
  return undefined;
}

export function dicomDateToFhirDate(dicomDate: unknown): string | undefined {
  // DICOM date format is YYYYMMDD, while FHIR date format is YYYY-MM-DD
  if (isString(dicomDate) && dicomDate.length === 8) {
    return `${dicomDate.substring(0, 4)}-${dicomDate.substring(4, 6)}-${dicomDate.substring(6, 8)}`;
  }
  return undefined;
}

export function dicomTimeToFhirTime(dicomTime: unknown): string | undefined {
  // DICOM time format is HHMMSS, while FHIR time format is HH:MM:SS
  if (isString(dicomTime) && dicomTime.length >= 6) {
    return `${dicomTime.substring(0, 2)}:${dicomTime.substring(2, 4)}:${dicomTime.substring(4, 6)}`;
  }
  return undefined;
}
