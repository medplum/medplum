import type { ComponentType } from 'react';
import type { BlockSettings } from '../types';

export type ComponentCategory =
  | 'clinical'
  | 'data'
  | 'communication'
  | 'scheduling'
  | 'tasks'
  | 'layout'
  | 'navigation'
  | 'display';

export interface PropertySchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'color' | 'select' | 'json';
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
  description?: string;
  group?: string;
}

export interface ComponentRegistration {
  type: string;
  name: string;
  description: string;
  category: ComponentCategory;
  icon: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  defaultProps: Record<string, unknown>;
  defaultSettings: Partial<BlockSettings>;
  propertySchema: PropertySchema[];
  isContainer?: boolean;
  acceptsChildren?: string[];
}

const registry = new Map<string, ComponentRegistration>();

export function registerComponent(registration: ComponentRegistration): void {
  registry.set(registration.type, registration);
}

export function getComponent(type: string): ComponentRegistration | undefined {
  return registry.get(type);
}

export function getAllComponents(): ComponentRegistration[] {
  return Array.from(registry.values());
}

export function getComponentsByCategory(category: ComponentCategory): ComponentRegistration[] {
  return getAllComponents().filter((c) => c.category === category);
}
