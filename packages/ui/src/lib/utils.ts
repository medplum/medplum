import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * @example
 * cn('px-4 py-2', 'px-6') // returns 'py-2 px-6'
 * cn('bg-primary', conditional && 'bg-secondary') // conditional classes
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Brand configuration type for runtime brand detection.
 */
export interface BrandConfig {
  id: string;
  name: string;
  theme: string;
}

/**
 * Available brands in the MEDrecord ecosystem.
 */
export const BRANDS = {
  healthtalk: { id: 'healthtalk', name: 'HealthTalk', theme: 'healthtalk' },
  coachi: { id: 'coachi', name: 'Coachi', theme: 'coachi' },
  medsafe: { id: 'medsafe', name: 'MedSafe', theme: 'medsafe' },
  medrecord: { id: 'medrecord', name: 'MEDrecord', theme: 'medrecord' },
  helpdoc: { id: 'helpdoc', name: 'HelpDoc', theme: 'helpdoc' },
} as const satisfies Record<string, BrandConfig>;

export type BrandId = keyof typeof BRANDS;

/**
 * Get brand configuration by ID.
 */
export function getBrand(brandId: string): BrandConfig | undefined {
  return BRANDS[brandId as BrandId];
}
