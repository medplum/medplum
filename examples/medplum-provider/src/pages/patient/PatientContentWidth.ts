// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext } from 'react';

/** The width of the patient page's content area, beside the patient summary, so drawers can cover just that area. */
export const PatientContentWidth = createContext<number | undefined>(undefined);
