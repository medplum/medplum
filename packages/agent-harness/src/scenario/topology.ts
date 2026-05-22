// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Hl7SourceNodeSpec, NodeSpec, ScenarioSpec } from '../types';

/**
 * Validate that a scenario spec is internally consistent.
 *
 * Checks:
 *   - node ids are unique
 *   - every hl7-source references an existing node
 *   - mps is non-negative
 *
 * Does NOT validate template-specific inputs — templates do that themselves
 * during materialization.
 */
export function validateScenario(spec: ScenarioSpec): void {
  const seen = new Set<string>();
  for (const node of spec.nodes) {
    if (seen.has(node.id)) {
      throw new Error(`scenario '${spec.name}': duplicate node id '${node.id}'`);
    }
    seen.add(node.id);
  }
  for (const node of spec.nodes) {
    if (node.role === 'hl7-source') {
      const src = node as Hl7SourceNodeSpec;
      if (src.mps < 0) {
        throw new Error(`hl7-source[${src.id}].mps must be >= 0`);
      }
      const target = spec.nodes.find((n) => n.id === src.targetNodeId);
      if (!target) {
        throw new Error(`hl7-source[${src.id}].targetNodeId '${src.targetNodeId}' not found`);
      }
      if (target.role === 'hl7-source') {
        throw new Error(`hl7-source[${src.id}] cannot target another hl7-source`);
      }
    }
  }
}

export function getNode<T extends NodeSpec = NodeSpec>(spec: ScenarioSpec, id: string): T {
  const node = spec.nodes.find((n) => n.id === id);
  if (!node) {
    throw new Error(`scenario '${spec.name}': no node with id '${id}'`);
  }
  return node as T;
}
