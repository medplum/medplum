import { createTheme } from '@mantine/core';
import type { EditorTheme } from '../types';

/**
 * Generate a Mantine-compatible color tuple (10 shades) from a single hex color.
 * This creates a simple lightness ramp.
 */
function generateColorScale(hex: string): [string, string, string, string, string, string, string, string, string, string] {
  // Parse hex to RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  function lighten(factor: number): string {
    const lr = Math.round(r + (255 - r) * factor);
    const lg = Math.round(g + (255 - g) * factor);
    const lb = Math.round(b + (255 - b) * factor);
    return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
  }

  function darken(factor: number): string {
    const dr = Math.round(r * (1 - factor));
    const dg = Math.round(g * (1 - factor));
    const db = Math.round(b * (1 - factor));
    return `#${dr.toString(16).padStart(2, '0')}${dg.toString(16).padStart(2, '0')}${db.toString(16).padStart(2, '0')}`;
  }

  return [
    lighten(0.9),  // 0 - lightest
    lighten(0.75),
    lighten(0.6),
    lighten(0.45),
    lighten(0.3),
    lighten(0.15),
    hex,           // 6 - base
    darken(0.15),
    darken(0.3),
    darken(0.45),  // 9 - darkest
  ];
}

/**
 * Converts an EditorTheme into a Mantine createTheme() configuration object.
 */
export function editorThemeToMantine(editorTheme: EditorTheme): ReturnType<typeof createTheme> {
  return createTheme({
    primaryColor: 'brand',
    colors: {
      brand: generateColorScale(editorTheme.colors.primary),
    },
    fontFamily: editorTheme.typography.fontFamily,
    headings: {
      fontFamily: editorTheme.typography.headingFontFamily ?? editorTheme.typography.fontFamily,
      sizes: {
        h1: {
          fontSize: editorTheme.typography.headingSizes.h1.fontSize,
          fontWeight: editorTheme.typography.headingSizes.h1.fontWeight,
          lineHeight: editorTheme.typography.headingSizes.h1.lineHeight,
        },
        h2: {
          fontSize: editorTheme.typography.headingSizes.h2.fontSize,
          fontWeight: editorTheme.typography.headingSizes.h2.fontWeight,
          lineHeight: editorTheme.typography.headingSizes.h2.lineHeight,
        },
        h3: {
          fontSize: editorTheme.typography.headingSizes.h3.fontSize,
          fontWeight: editorTheme.typography.headingSizes.h3.fontWeight,
          lineHeight: editorTheme.typography.headingSizes.h3.lineHeight,
        },
      },
    },
    fontSizes: editorTheme.typography.fontSizes,
    radius: {
      xs: '2px',
      sm: '4px',
      md: '8px',
      lg: '12px',
      xl: '16px',
    },
    components: {
      Button: {
        defaultProps: {
          variant: editorTheme.components.buttons.defaultVariant,
          radius: editorTheme.components.buttons.borderRadius,
        },
      },
      TextInput: {
        defaultProps: {
          variant: editorTheme.components.inputs.variant,
          radius: editorTheme.components.inputs.borderRadius,
        },
      },
      Paper: {
        defaultProps: {
          radius: editorTheme.components.cards.borderRadius,
          shadow: editorTheme.components.cards.shadow,
          withBorder: editorTheme.components.cards.withBorder,
        },
      },
    },
  });
}
