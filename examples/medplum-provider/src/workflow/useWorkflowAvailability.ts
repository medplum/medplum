// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import type { WorkflowDefinition, WorkflowDependency } from './dependencies';
import { WORKFLOWS } from './dependencies';

/**
 * Probes a set of workflow dependencies and returns the ones that are missing.
 *
 * Each bot dependency is checked with a cheap `Bot?identifier=…` search — deduplicated and cached
 * by the {@link MedplumClient} request cache for the session, and never executes the bot. A
 * transient failure is treated as "present" so a network blip never blocks a workflow.
 *
 * Limitation: an empty search result is indistinguishable from "no read access". If the current
 * user's `AccessPolicy` hides `Bot` resources, the search returns empty (not an error) even when
 * the bot is linked. Callers therefore only probe for project admins, who can always read bots —
 * see {@link useWorkflowAvailability}.
 * @param medplum - The Medplum client used to look up bots by identifier.
 * @param dependencies - The dependencies to probe.
 * @returns The subset of `dependencies` confirmed missing.
 */
async function findMissingDependencies(
  medplum: MedplumClient,
  dependencies: readonly WorkflowDependency[]
): Promise<WorkflowDependency[]> {
  const results = await Promise.allSettled(
    dependencies.map((dependency) => medplum.searchOne('Bot', { identifier: dependency.identifier }))
  );
  // A dependency is missing only when its probe succeeded and found no bot. A rejected probe is a
  // transient failure and shouldn't block the workflow, so we treat it as present.
  return dependencies.filter((_, index) => {
    const result = results[index];
    return result.status === 'fulfilled' && !result.value;
  });
}

export interface WorkflowAvailability {
  /** True while the dependency probes are in flight. */
  readonly loading: boolean;
  /** True once every dependency is confirmed present. */
  readonly available: boolean;
  /** Dependencies confirmed missing (empty while loading or when available). */
  readonly missing: readonly WorkflowDependency[];
}

/**
 * Probes whether every hard dependency of `workflow` is present in the current project.
 *
 * Only project admins are probed. For anyone else an empty `Bot` search is ambiguous — an
 * `AccessPolicy` that hides `Bot` looks exactly like an unlinked integration — and wrongly blocking
 * a clinician out of a core workflow is worse than letting them reach the underlying error. So
 * non-admins are always reported as available, and the workflow behaves as it did before gating.
 *
 * Recovery after an admin links a missing project happens on the next mount / page refresh; there
 * is no live subscription. See issue #9824.
 * @param workflow - The workflow whose dependencies to probe. Must be a stable reference — pass a
 * {@link WORKFLOWS} entry.
 * @returns The workflow's availability and which dependencies (if any) are missing.
 */
export function useWorkflowAvailability(workflow: WorkflowDefinition): WorkflowAvailability {
  const medplum = useMedplum();
  const enabled = medplum.isProjectAdmin();
  const [state, setState] = useState<{
    workflow: WorkflowDefinition;
    enabled: boolean;
    loading: boolean;
    missing: WorkflowDependency[];
  }>(() => ({ workflow, enabled, loading: enabled, missing: [] }));

  // When the workflow (or the user's admin status) changes, reset to "probing" during render so a
  // stale verdict is never shown. This is React's recommended alternative to resetting state with a
  // synchronous setState in an effect.
  if (state.workflow !== workflow || state.enabled !== enabled) {
    setState({ workflow, enabled, loading: enabled, missing: [] });
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;
    // `findMissingDependencies` settles every probe itself and never rejects.
    findMissingDependencies(medplum, workflow.dependencies)
      .then((missing) => {
        if (!cancelled) {
          setState({ workflow, enabled, loading: false, missing });
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [medplum, workflow, enabled]);

  return {
    loading: state.loading,
    available: !state.loading && state.missing.length === 0,
    missing: state.missing,
  };
}

export interface WorkflowWithMissingDependencies {
  readonly workflow: WorkflowDefinition;
  readonly missing: readonly WorkflowDependency[];
}

export interface AllWorkflowDependencies {
  readonly loading: boolean;
  /** Only workflows that have at least one missing dependency. */
  readonly blockedWorkflows: readonly WorkflowWithMissingDependencies[];
}

/**
 * Probes every gated workflow's dependencies at once. Intended for an admin-facing summary (e.g.
 * the Get Started page) so administrators see all missing project dependencies up front.
 * @param options - Probe options.
 * @param options.enabled - When false, skips probing entirely (default true). Used so non-admins
 * never trigger the scan, since they see per-workflow guidance at the gate instead of a summary.
 * @returns The blocked workflows and their missing dependencies.
 */
export function useMissingWorkflowDependencies(options?: { enabled?: boolean }): AllWorkflowDependencies {
  const enabled = options?.enabled ?? true;
  const medplum = useMedplum();
  const [state, setState] = useState<{
    enabled: boolean;
    loading: boolean;
    blockedWorkflows: WorkflowWithMissingDependencies[];
  }>(() => ({ enabled, loading: enabled, blockedWorkflows: [] }));

  // Reset during render when `enabled` toggles, mirroring the render-phase reset above.
  if (state.enabled !== enabled) {
    setState({ enabled, loading: enabled, blockedWorkflows: [] });
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;
    // `findMissingDependencies` settles every probe itself and never rejects.
    Promise.all(
      Object.values(WORKFLOWS).map(async (workflow) => ({
        workflow,
        missing: await findMissingDependencies(medplum, workflow.dependencies),
      }))
    )
      .then((results) => {
        if (!cancelled) {
          setState({
            enabled,
            loading: false,
            blockedWorkflows: results.filter((result) => result.missing.length > 0),
          });
        }
      })
      .catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [medplum, enabled]);

  return { loading: state.loading, blockedWorkflows: state.blockedWorkflows };
}
