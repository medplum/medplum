// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useState } from 'react';
import type { JSX } from 'react';
import { Tabs, Code, ScrollArea, Box } from '@mantine/core';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import * as Recharts from 'recharts';
import * as Mantine from '@mantine/core';

interface ComponentPreviewProps {
  code: string;
}

const scope = {
  ...Recharts,
  ...Mantine,
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

export function ComponentPreview({ code }: ComponentPreviewProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<string | null>('preview');

  const transformedCode = transformCode(code);

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="preview">Preview</Tabs.Tab>
        <Tabs.Tab value="code">Code</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="preview" pt="md">
        <LiveProvider code={transformedCode} scope={scope} noInline>
          <Box p="md">
            <LiveError />
            <LivePreview />
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
    </Tabs>
  );
}
