import React, { Suspense } from 'react';

const AceEditor = React.lazy(async () => {
  await import('ace-builds/src-noconflict/ace');
  await import('ace-builds/src-noconflict/mode-javascript');
  await import('ace-builds/src-noconflict/theme-github');

  // react-ace should be imported last
  // react-ace tries to load brace if ace is not already imported,
  // so ace-builds needs to be imported before react-ace
  // See: https://github.com/securingsincity/react-ace/issues/725
  return import('react-ace');
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
        setOptions={{
          highlightActiveLine: false,
          showPrintMargin: false,
          useWorker: false,
        }}
        style={{ border: '1px solid #ccc' }}
        defaultValue={props.defaultValue}
        onChange={props.onChange}
        editorProps={{}}
      />
    </Suspense>
  );
}
