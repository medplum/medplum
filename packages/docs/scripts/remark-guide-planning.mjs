// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Add the shared planning control after each guide's introduction, without
// changing the Markdown used to generate its Word and PDF downloads.
export default function remarkGuidePlanning() {
  return (tree, file) => {
    const source = file.path.replaceAll('\\', '/');
    if (!/\/docs\/decision-guides\/(?!index\.mdx?$)[^/]+\.mdx?$/.test(source)) {
      return;
    }

    // Guides separate their introduction from the questions with a divider.
    // If a future guide omits it, insert before its first section instead.
    const index = tree.children.findIndex(
      (node) => node.type === 'thematicBreak' || (node.type === 'heading' && node.depth === 2)
    );
    tree.children.splice(index < 0 ? tree.children.length : index, 0, {
      type: 'mdxJsxFlowElement',
      name: 'GuidePlanning',
      attributes: [],
      children: [],
    });
  };
}
