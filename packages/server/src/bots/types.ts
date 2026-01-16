// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type {
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

export interface StreamingChunk {
  type: string;
  content: string;
}

export type StreamingCallback = (chunk: StreamingChunk) => Promise<void>;

export interface BotExecutionContext extends BotExecutionRequest {
  readonly accessToken: string;
  readonly secrets: Record<string, ProjectSetting>;
  readonly streamingCallback?: StreamingCallback;
}

export interface BotExecutionResult {
  readonly success: boolean;
  readonly logResult: string;
  readonly returnValue?: any;
}

export interface BotStreamingResult {
  readonly streaming: true;
  readonly success: boolean;
  readonly logResult: string;
}

export type BotExecutionResponse = BotExecutionResult | BotStreamingResult;
