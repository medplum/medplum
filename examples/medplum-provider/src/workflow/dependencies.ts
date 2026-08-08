// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A hard dependency that a Provider workflow needs in order to function. A missing dependency
 * usually means a Medplum "shared project" (integration bots, terminology, or profiles) has not
 * been linked into the current project. See issue #9824.
 */
export interface BotDependency {
  readonly kind: 'bot';
  /** FHIR search token (`system|value`) used to look the Bot up by identifier. */
  readonly identifier: string;
  /** Human-readable name shown to admins, e.g. "Health Gorilla lab ordering". */
  readonly label: string;
  /** Optional link to setup documentation. */
  readonly docsUrl?: string;
}

export type WorkflowDependency = BotDependency;

export interface WorkflowDefinition {
  readonly id: string;
  readonly label: string;
  readonly dependencies: readonly WorkflowDependency[];
}

/**
 * The hard dependencies for each gated Provider workflow. A workflow is *blocked* when any of its
 * dependencies are missing; blocked workflows show guidance instead of letting the user in.
 *
 * Only *core* workflows belong here — capabilities a user expects as a baseline part of the app and
 * would be confused to find broken (e.g. ordering labs). The missing dependency is surfaced upfront
 * (the Get Started banner) and gated in-context. Optional, integration-only features — a capability
 * that exists solely because an integration is present, such as insurance eligibility checks,
 * DoseSpot, or ScriptSure — do NOT belong here; they are handled in-context (hidden or a soft
 * upsell) and never complain upfront.
 *
 * Likewise, fields that merely lose autocomplete suggestions (a missing ValueSet on a field that
 * still accepts custom values) degrade gracefully inline and are intentionally NOT gated here.
 */
export const WORKFLOWS = {
  'order-labs': {
    id: 'order-labs',
    label: 'Order Labs',
    dependencies: [
      {
        kind: 'bot',
        identifier: 'https://www.medplum.com/integrations/bot-identifier|health-gorilla-labs/send-to-health-gorilla',
        label: 'Health Gorilla lab ordering',
        docsUrl: 'https://www.medplum.com/docs/integration/health-gorilla',
      },
    ],
  },
} as const satisfies Record<string, WorkflowDefinition>;

export type WorkflowId = keyof typeof WORKFLOWS;
