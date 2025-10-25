// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createContext } from 'react';

export const FormContext = createContext<{ submitting: boolean }>({
  submitting: false,
});
FormContext.displayName = 'FormContext';
