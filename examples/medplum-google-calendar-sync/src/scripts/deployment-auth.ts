// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { execFileSync } from 'node:child_process';
import { currentProjectId } from '../common/project';

/**
 * Capture CLI authentication in memory; never print the token or subprocess output.
 * @param baseUrl - API server selected for deployment.
 * @param profile - Named Medplum CLI profile.
 * @returns The access token captured from the CLI.
 */
export function cliAccessToken(baseUrl: string, profile = 'default'): string {
  let token: string;
  try {
    token = execFileSync('medplum', ['--base-url', baseUrl, '--profile', profile, 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }).trim();
  } catch {
    throw new Error('Medplum CLI authentication failed. Run medplum login for the selected profile and retry.');
  }
  if (!token || /\s/.test(token)) {
    throw new Error('Medplum CLI returned no usable access token. Run medplum login and retry.');
  }
  return token;
}

/**
 * Every deployment, including preflight, must match an explicitly selected project.
 * @param medplum - Authenticated deployment client.
 * @param expected - Explicit target project ID.
 */
export async function assertDeploymentProject(medplum: MedplumClient, expected: string): Promise<void> {
  if ((await currentProjectId(medplum)) !== expected) {
    throw new Error('Authenticated project differs from PROJECT_ID; no deployment was attempted');
  }
}
