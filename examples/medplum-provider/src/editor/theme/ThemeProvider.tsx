import { MantineProvider } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import type { EditorTheme } from '../types';
import { editorThemeToMantine } from './themeAdapter';

interface EditorThemeProviderProps {
  readonly theme: EditorTheme;
  readonly children: ReactNode;
}

/**
 * Wraps children with a MantineProvider that applies the editor theme.
 * Used around the canvas preview so theme changes are reflected in real-time.
 */
export function EditorThemeProvider({ theme, children }: EditorThemeProviderProps): JSX.Element {
  const mantineTheme = useMemo(() => editorThemeToMantine(theme), [theme]);

  return (
    <MantineProvider theme={mantineTheme} forceColorScheme="light">
      {children}
    </MantineProvider>
  );
}
