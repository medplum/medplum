// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import {
  Agent,
  Bot,
  ClientApplication,
  Device,
  Patient,
  Practitioner,
  ProjectMembership,
  ProjectSetting,
  Reference,
  RelatedPerson,
  Subscription,
} from '@medplum/fhirtypes';

export interface BotExecutionRequest {
  readonly bot: WithId<Bot>;
  readonly runAs: WithId<ProjectMembership>;
  readonly requester?: Reference<Bot | ClientApplication | Patient | Practitioner | RelatedPerson>;
  readonly input: any;
  readonly contentType: string;
  readonly subscription?: Subscription;
  readonly agent?: Agent;
  readonly device?: Device;
  readonly remoteAddress?: string;
  readonly forwardedFor?: string;
  readonly requestTime?: string;
  readonly traceId?: string;
  /** Headers from the original request, when invoked by HTTP request */
  readonly headers?: Record<string, string | string[] | undefined>;
  /** Default headers to add to MedplumClient, such as HTTP cookies */
  readonly defaultHeaders?: Record<string, string>;
}

export interface BotExecutionContext extends BotExecutionRequest {
  readonly accessToken: string;
  readonly secrets: Record<string, ProjectSetting>;
}

export interface BotExecutionResult {
  readonly success: boolean;
  readonly logResult: string;
  readonly returnValue?: any;
}
