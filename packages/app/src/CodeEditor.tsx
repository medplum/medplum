import React, { Suspense } from 'react';

const AceEditor = React.lazy(async () => {
  const result = await import('react-ace');
  await import('ace-builds/webpack-resolver');
  return result;
});

export interface CodeEditorProps {
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AceEditor
        mode="javascript"
        name="code"
        width="100%"
        height="400px"
        showPrintMargin={false}
        highlightActiveLine={false}
        style={{ border: '1px solid #ccc' }}
        defaultValue={props.defaultValue}
        onChange={props.onChange}
      />
    </Suspense>
  );
}
