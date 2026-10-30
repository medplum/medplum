// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from '@docusaurus/Link';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import CodeBlock from '@theme/CodeBlock';
import Details from '@theme/Details';
import { type ReactNode } from 'react';
import styles from './styles.module.css';

export default function GuidePlanning(): ReactNode {
  const { title, source, permalink } = useDoc().metadata;
  const sourcePath = `medplum-link/packages/docs/${source.replace(/^@site\//, '')}`;
  const guideUrl = new URL(permalink, 'https://www.medplum.com').href;
  const prompt = `Help me plan this part of my Medplum application using this guide:
${title}
${guideUrl}
Local source, if cloned: ${sourcePath}

Follow medplum-link/packages/docs/static/ai/planning.md
(or https://www.medplum.com/ai/planning.md), including its Medplum rules.
Ask before creating or changing my app's project instruction files.

Read my existing requirements and decisions, then ask me about consequential
missing requirements; do not invent answers. Save and summarize the decisions
in my app's repo before implementation.`;

  return (
    <Details summary={<summary>Plan with this guide</summary>}>
      <p>
        Copy this prompt into your AI agent. It will use this guide and your existing project context, ask about missing
        requirements, and save decisions for later development. See{' '}
        <Link to="/docs/building-with-ai-coding-assistants">setup and examples</Link>.
      </p>
      <CodeBlock language="text" className={styles.prompt}>
        {prompt}
      </CodeBlock>
    </Details>
  );
}
