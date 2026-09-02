// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotResponseStream, WithId } from '@medplum/core';
import type {
  Agent,
  AsyncJob,
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
  /** Optional response stream when invoked with SSE (Server Side Events) */
  readonly responseStream?: BotResponseStream;
}

export interface BotExecutionContext extends BotExecutionRequest {
  readonly accessToken: string;
  readonly secrets: Record<string, ProjectSetting>;
}

export interface BotExecutionResult {
  /**
   * true if Medplum invoked the configured runtime, the handler completed without throwing,
   * and the handler did not return a non-OK `OperationOutcome`
   * false runtime failed, handler threw, execution was rejected or timed out, or handler
   * returned a non-OK `OperationOutcome`
   */
  readonly success: boolean;
  readonly logResult: string;
  readonly returnValue?: any;
  /**
   * The `AsyncJob` handle for runtimes that start work and return, rather than running it to
   * completion. Set by MicroVM bots; the caller responds with 202 and this job's status URL.
   */
  readonly asyncJob?: WithId<AsyncJob>;
}
