// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { medplumEslintConfig } from '@medplum/eslint-config';
// eslint-disable-next-line import/no-unresolved -- Node resolves this package export; eslint-plugin-import does not.
import { defineConfig } from 'eslint/config';
export default defineConfig(medplumEslintConfig);
