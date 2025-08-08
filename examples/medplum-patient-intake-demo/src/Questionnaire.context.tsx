// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Questionnaire } from '@medplum/fhirtypes';
import { createContext } from 'react';

export const IntakeQuestionnaireContext = createContext<{ questionnaire?: Questionnaire }>({});
