import type { Project } from '@medplum/fhirtypes';

/**
 * Brand theme configuration loaded from Medplum Project.setting
 */
export interface BrandTheme {
  /** Brand display name */
  name: string;
  /** Brand identifier (healthtalk, coachi, medsafe, medrecord) */
  id: string;
  /** Primary brand color in OKLCH format */
  primaryColor: string;
  /** Primary foreground color */
  primaryForeground: string;
  /** Accent color */
  accentColor: string;
  /** Accent foreground color */
  accentForeground: string;
  /** Logo URL (optional) */
  logoUrl?: string;
  /** Favicon URL (optional) */
  faviconUrl?: string;
  /** Enabled features for this brand */
  features: string[];
}

/**
 * Default theme values when Project.setting is not configured
 */
const DEFAULT_THEME: BrandTheme = {
  name: 'MEDrecord',
  id: 'medrecord',
  primaryColor: 'oklch(0.5 0.2 270)',
  primaryForeground: 'oklch(0.985 0 0)',
  accentColor: 'oklch(0.92 0.05 270)',
  accentForeground: 'oklch(0.25 0.1 270)',
  features: [],
};

/**
 * Brand-specific default themes
 */
const BRAND_DEFAULTS: Record<string, Partial<BrandTheme>> = {
  healthtalk: {
    name: 'HealthTalk',
    primaryColor: 'oklch(0.55 0.2 250)',
    primaryForeground: 'oklch(0.985 0 0)',
    accentColor: 'oklch(0.92 0.05 250)',
    accentForeground: 'oklch(0.25 0.1 250)',
  },
  coachi: {
    name: 'Coachi',
    primaryColor: 'oklch(0.55 0.18 145)',
    primaryForeground: 'oklch(0.985 0 0)',
    accentColor: 'oklch(0.92 0.05 145)',
    accentForeground: 'oklch(0.25 0.1 145)',
  },
  medsafe: {
    name: 'MedSafe',
    primaryColor: 'oklch(0.55 0.15 185)',
    primaryForeground: 'oklch(0.985 0 0)',
    accentColor: 'oklch(0.92 0.05 185)',
    accentForeground: 'oklch(0.25 0.1 185)',
  },
  medrecord: {
    name: 'MEDrecord',
    primaryColor: 'oklch(0.5 0.2 270)',
    primaryForeground: 'oklch(0.985 0 0)',
    accentColor: 'oklch(0.92 0.05 270)',
    accentForeground: 'oklch(0.25 0.1 270)',
  },
};

/**
 * Extract a setting value from Medplum Project.setting array
 */
function getProjectSetting(project: Project | undefined, name: string): string | undefined {
  return project?.setting?.find((s) => s.name === name)?.valueString;
}

/**
 * Extract brand theme configuration from Medplum Project.setting
 * 
 * Expected Project.setting keys:
 * - brand.id: Brand identifier (healthtalk, coachi, medsafe, medrecord)
 * - brand.name: Display name
 * - brand.primaryColor: Primary color in OKLCH format
 * - brand.primaryForeground: Primary foreground color
 * - brand.accentColor: Accent color
 * - brand.accentForeground: Accent foreground color
 * - brand.logoUrl: Logo URL
 * - brand.faviconUrl: Favicon URL
 * - brand.features: Comma-separated list of enabled features
 * 
 * @param project - Medplum Project resource
 * @param fallbackBrandId - Fallback brand ID if not specified in Project.setting
 * @returns Complete brand theme configuration
 */
export function getProjectTheme(project?: Project, fallbackBrandId?: string): BrandTheme {
  const brandId = getProjectSetting(project, 'brand.id') ?? fallbackBrandId ?? 'medrecord';
  const brandDefaults = BRAND_DEFAULTS[brandId] ?? {};
  
  const featuresStr = getProjectSetting(project, 'brand.features');
  const features = featuresStr 
    ? featuresStr.split(',').map((f) => f.trim()).filter(Boolean)
    : [];

  return {
    id: brandId,
    name: getProjectSetting(project, 'brand.name') ?? brandDefaults.name ?? DEFAULT_THEME.name,
    primaryColor: getProjectSetting(project, 'brand.primaryColor') ?? brandDefaults.primaryColor ?? DEFAULT_THEME.primaryColor,
    primaryForeground: getProjectSetting(project, 'brand.primaryForeground') ?? brandDefaults.primaryForeground ?? DEFAULT_THEME.primaryForeground,
    accentColor: getProjectSetting(project, 'brand.accentColor') ?? brandDefaults.accentColor ?? DEFAULT_THEME.accentColor,
    accentForeground: getProjectSetting(project, 'brand.accentForeground') ?? brandDefaults.accentForeground ?? DEFAULT_THEME.accentForeground,
    logoUrl: getProjectSetting(project, 'brand.logoUrl'),
    faviconUrl: getProjectSetting(project, 'brand.faviconUrl'),
    features,
  };
}

/**
 * Generate CSS custom properties from brand theme
 * 
 * @param theme - Brand theme configuration
 * @returns CSS custom properties string for use in <style> tag
 */
export function generateThemeCSS(theme: BrandTheme): string {
  return `
:root {
  --primary: ${theme.primaryColor};
  --primary-foreground: ${theme.primaryForeground};
  --accent: ${theme.accentColor};
  --accent-foreground: ${theme.accentForeground};
  --sidebar-primary: ${theme.primaryColor};
  --sidebar-primary-foreground: ${theme.primaryForeground};
}
`.trim();
}

/**
 * Check if a feature is enabled for the current brand
 * 
 * @param theme - Brand theme configuration
 * @param feature - Feature name to check
 * @returns true if feature is enabled
 */
export function isFeatureEnabled(theme: BrandTheme, feature: string): boolean {
  return theme.features.includes(feature);
}
