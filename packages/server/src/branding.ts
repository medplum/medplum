// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';

/**
 * Returns the app name that a project has configured for user-facing content,
 * or undefined if the project has not been white-labeled. Controlled by the
 * `appName` project setting.
 * @param project - The project to read the setting from.
 * @returns The configured app name, or undefined if unset or blank.
 */
export function getProjectAppName(project: Project | undefined): string | undefined {
  return project?.setting?.find((s) => s.name === 'appName')?.valueString?.trim() || undefined;
}
