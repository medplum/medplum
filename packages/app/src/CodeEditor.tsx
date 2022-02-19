import React, { Suspense } from 'react';

const AceEditor = React.lazy(async () => {
  const ace = await import('react-ace');
  await import('ace-builds/src-noconflict/ace');
  await import('ace-builds/src-noconflict/mode-javascript');
  await import('ace-builds/src-noconflict/theme-github');
  return ace;
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
