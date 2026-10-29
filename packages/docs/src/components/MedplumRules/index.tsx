// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import rules from '!!raw-loader!@site/static/ai/medplum-rules.md';
import CodeBlock from '@theme/CodeBlock';
import { type ReactNode } from 'react';

export default function MedplumRules(): ReactNode {
  return (
    <CodeBlock language="markdown" title="medplum-rules.md">
      {rules}
    </CodeBlock>
  );
}
