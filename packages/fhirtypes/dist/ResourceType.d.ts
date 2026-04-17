// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { Resource } from './Resource.d.ts';

export type ResourceType = Resource['resourceType'];
export type ExtractResource<K extends ResourceType> = Extract<Resource, { resourceType: K }>;
