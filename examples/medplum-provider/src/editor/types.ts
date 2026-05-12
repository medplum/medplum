export type EditorNodeId = string;

// ─── Block & Section Settings ───────────────────────────────────────

export interface BlockSettings {
  width?: number | 'fill' | 'auto';
  height?: number | 'fill' | 'auto';
  padding?: number;
  margin?: number;
}

export interface SectionSettings {
  width?: number | 'fill';
  minWidth?: number;
  maxWidth?: number;
  direction?: 'horizontal' | 'vertical';
  gap?: number;
  padding?: number;
  backgroundColor?: string;
  border?: boolean;
  overflow?: 'auto' | 'hidden' | 'visible';
}

export interface PageSettings {
  maxWidth?: number;
  padding?: number;
  backgroundColor?: string;
  layout: 'full-width' | 'sidebar-content' | 'content-only';
}

// ─── Block ──────────────────────────────────────────────────────────

export interface EditorBlock {
  id: EditorNodeId;
  name: string;
  componentType: string;
  props: Record<string, unknown>;
  settings: BlockSettings;
  visible?: boolean;
  locked?: boolean;
  children?: EditorBlock[];
}

// ─── Section ────────────────────────────────────────────────────────

export type SectionType = 'sidebar' | 'content' | 'tabs' | 'header' | 'split' | 'stack' | 'custom';

export interface EditorSection {
  id: EditorNodeId;
  name: string;
  type: SectionType;
  blocks: EditorBlock[];
  settings: SectionSettings;
  locked?: boolean;
  collapsed?: boolean;
}

// ─── Page ───────────────────────────────────────────────────────────

export interface EditorPage {
  id: EditorNodeId;
  name: string;
  routePattern: string;
  icon?: string;
  sections: EditorSection[];
  settings: PageSettings;
}

// ─── Theme ──────────────────────────────────────────────────────────

export interface ThemeColors {
  primary: string;
  accent1: string;
  accent2: string;
  background1: string;
  background2: string;
  textPrimary: string;
  textSecondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

export interface ThemeTypography {
  fontFamily: string;
  headingFontFamily?: string;
  fontSizes: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  headingSizes: {
    h1: { fontSize: string; fontWeight: string; lineHeight: string };
    h2: { fontSize: string; fontWeight: string; lineHeight: string };
    h3: { fontSize: string; fontWeight: string; lineHeight: string };
  };
}

export interface ThemeLayout {
  pageMaxWidth: number;
  contentPadding: number;
  sidebarWidth: number;
  borderRadius: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  spacing: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export interface ThemeComponents {
  buttons: {
    borderRadius: string;
    defaultVariant: 'filled' | 'outline' | 'light' | 'subtle';
  };
  inputs: {
    borderRadius: string;
    variant: 'default' | 'filled' | 'unstyled';
  };
  cards: {
    borderRadius: string;
    shadow: string;
    withBorder: boolean;
  };
}

export interface EditorTheme {
  colors: ThemeColors;
  typography: ThemeTypography;
  layout: ThemeLayout;
  components: ThemeComponents;
}

// ─── Navigation ─────────────────────────────────────────────────────

export interface NavMenuLink {
  icon: string;
  label: string;
  href: string;
}

export interface NavMenuGroup {
  title?: string;
  links: NavMenuLink[];
}

export interface NavigationConfig {
  menus: NavMenuGroup[];
  logo: {
    type: 'default' | 'custom';
    url?: string;
    size?: number;
  };
}

// ─── Full Configuration ─────────────────────────────────────────────

export interface EditorConfiguration {
  version: 1;
  pages: EditorPage[];
  navigation: NavigationConfig;
  theme: EditorTheme;
  meta: {
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
  };
}

// ─── UI State Types ─────────────────────────────────────────────────

export type DevicePreview = 'desktop' | 'tablet' | 'mobile';
export type LeftPanelTab = 'pages' | 'layers' | 'components';
export type RightPanelTab = 'theme' | 'properties' | 'chat';
