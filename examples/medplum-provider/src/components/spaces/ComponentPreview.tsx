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

function transformCode(code: string): string {
  // Remove import statements
  let transformed = code.replace(/^import\s+.*?;?\s*$/gm, '');

  // Remove export statements but keep the component definition
  transformed = transformed.replace(/^export\s+default\s+/gm, '');
  transformed = transformed.replace(/^export\s+/gm, '');

  // Find the component name (assumes format like "function ComponentName" or "const ComponentName")
  const funcMatch = transformed.match(/function\s+(\w+)/);
  const constMatch = transformed.match(/const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=]*)\s*=>/);

  let componentName = '';
  if (funcMatch) {
    componentName = funcMatch[1];
  } else if (constMatch) {
    componentName = constMatch[1];
  }

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
            <ComponentErrorBoundary>
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
