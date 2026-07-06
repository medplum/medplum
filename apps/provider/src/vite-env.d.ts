// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MEDPLUM_INSTANCE_MODE?: 'marketplace' | 'api';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
