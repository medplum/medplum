import CodeBlock, { Props } from '@theme/CodeBlock';
import * as React from 'react';

interface MedplumCodeBlockProps extends Props {
  selectLines?: number[][];
}

export default function MedplumCodeBlock({
  children,
  selectLines: lines,
  ...props
}: MedplumCodeBlockProps): JSX.Element {
  let code = children as string;
  if (lines) {
    const codeLines = code.split('\n');
    const filteredLines = lines.flatMap((range) =>
      range.length === 1 ? codeLines[range[0] - 1] : codeLines.slice(range[0] - 1, range[1])
    );
    code = filteredLines.join('\n');
  }
  return <CodeBlock {...props}>{code}</CodeBlock>;
}
