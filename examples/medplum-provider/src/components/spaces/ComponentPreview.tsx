// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import * as Mantine from '@mantine/core';
import { Alert, Box, Code, ScrollArea, Stack, Tabs } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { Component, useState } from 'react';
import { LiveError, LivePreview, LiveProvider } from 'react-live';
import * as Recharts from 'recharts';
import { ResourceBox } from './ResourceBox';

interface ErrorBoundaryState {
  hasError: boolean;
}

class ComponentErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <Alert color="red">Component failed to render</Alert>;
    }
    return this.props.children;
  }
}

interface ComponentPreviewProps {
  code: string;
  resources?: string[];
  onResourceClick?: (ref: string) => void;
}

/**
 * Everything generated code may reference. Recharts and Mantine both export `Text` and `Tooltip`.
 * Mantine wins for `Text`, since prose is far more common than SVG text. Recharts wins for
 * `Tooltip`: a chart tooltip is what generated code means by it, and Mantine's throws when it
 * has no child element. Mantine's version stays reachable as `MantineTooltip`.
 */
const scope = {
  ...Recharts,
  ...Mantine,
  Tooltip: Recharts.Tooltip,
  ChartTooltip: Recharts.Tooltip,
  MantineTooltip: Mantine.Tooltip,
};

/**
 * Finds the component to render: the default export when it is named, otherwise the last
 * top-level PascalCase `function`/`const` declaration so helpers declared before the
 * component are skipped.
 * @param code - The generated source, before imports and exports are stripped.
 * @returns The component name, or undefined when none can be identified.
 */
function findComponentName(code: string): string | undefined {
  const defaultExport = code.match(/^export\s+default\s+(?:function\s+)?([A-Za-z_$][\w$]*)\b/m);
  if (defaultExport && defaultExport[1] !== 'function') {
    return defaultExport[1];
  }
  const declarations = [...code.matchAll(/^(?:export\s+)?(?:function|const)\s+([A-Z][\w$]*)\b/gm)];
  return declarations.at(-1)?.[1];
}

function transformCode(code: string): string {
  const componentName = findComponentName(code);

  // Imports may span multiple lines
  let transformed = code
    .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^import\s+['"][^'"]+['"];?[ \t]*$/gm, '');

  // Remove export statements but keep the component definition
  transformed = transformed.replace(/^export\s+default\s+/gm, '');
  transformed = transformed.replace(/^export\s+/gm, '');

  // Add render call at the end if we found a component
  if (componentName) {
    transformed = `${transformed.trim()}\nrender(<${componentName} />)`;
  }

  return transformed;
}

export function ComponentPreview({ code, resources, onResourceClick }: ComponentPreviewProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<string | null>('preview');

  const transformedCode = transformCode(code);

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="preview">Preview</Tabs.Tab>
        <Tabs.Tab value="code">Code</Tabs.Tab>
        {resources && resources.length > 0 && <Tabs.Tab value="resources">Resources</Tabs.Tab>}
      </Tabs.List>

      <Tabs.Panel value="preview" pt="md">
        <LiveProvider code={transformedCode} scope={scope} noInline>
          <Box p="md">
            <LiveError />
            {/* Keyed on the code so a failure in one component does not stick to the next */}
            <ComponentErrorBoundary key={code}>
              <LivePreview />
            </ComponentErrorBoundary>
          </Box>
        </LiveProvider>
      </Tabs.Panel>

      <Tabs.Panel value="code" pt="md">
        <ScrollArea>
          <Code block style={{ whiteSpace: 'pre-wrap' }}>
            {code}
          </Code>
        </ScrollArea>
      </Tabs.Panel>

      {resources && resources.length > 0 && (
        <Tabs.Panel value="resources" pt="md">
          <Stack gap="xs">
            {resources.map((ref) => (
              <ResourceBox key={ref} resourceReference={ref} onClick={onResourceClick ?? (() => undefined)} />
            ))}
          </Stack>
        </Tabs.Panel>
      )}
    </Tabs>
  );
}
