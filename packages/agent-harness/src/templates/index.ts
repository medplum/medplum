// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AgentTemplate } from '../types';
import { pushBotTemplate } from './push-bot';

const registry = new Map<string, AgentTemplate>();

export function registerTemplate(t: AgentTemplate): void {
  registry.set(t.name, t);
}

export function getTemplate(name: string): AgentTemplate {
  const t = registry.get(name);
  if (!t) {
    throw new Error(`Unknown agent template: ${name}. Known: ${[...registry.keys()].join(', ')}`);
  }
  return t;
}

export function listTemplates(): AgentTemplate[] {
  return [...registry.values()];
}

registerTemplate(pushBotTemplate);

export { pushBotTemplate };
