import React, { Suspense } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  Sandpack,
  useSandpack,
} from '@codesandbox/sandpack-react';

import { useEffect } from 'react';

import '@codesandbox/sandpack-react/dist/index.css';

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

const files = {
  '/App.tsx': `
  import {handler} from './handler';
  import input from './input';
  import {useEffect, useState} from 'react';
  export default function App(): JSX.Element {
    [result, setResult] = useState();

    useEffect(()=> {
      const event = {
        input: input
      };
      handler(event).then(setResult)
    }, []);
    return (<pre>{JSON.stringify(result, null, 2)}</pre>)
  }`,

  '/handler.ts': {
    code: `\
export async function handler(event) {
  return event.input;
}`,
    active: true,
  },

  '/input.ts': {
    code: `\
const input =  {

};
export default input;`,
    active: true,
  },
};

export function CodeEditor(props: CodeEditorProps): JSX.Element {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      {/* Sandpack provider is missing "children" in it's props. Suppress errors for now
        @ts-ignore */}
      <SandpackProvider
        template="react-ts"
        customSetup={{
          files: files,
        }}
      >
        <SandpackLayout>
          <WrappedSandpackEditor
            onChange={(code) => {
              console.log('My Code!', code);
              props.onChange && props.onChange(code);
            }}
            defaultValue={props.defaultValue}
          />
          <SandpackPreview showOpenInCodeSandbox={false} />
        </SandpackLayout>
      </SandpackProvider>
    </Suspense>
  );
}

function WrappedSandpackEditor(props: CodeEditorProps): JSX.Element {
  const { sandpack } = useSandpack();

  useEffect(() => {
    console.log('Getting Default Value\n', props.defaultValue);
    props.defaultValue && sandpack.updateFile('/handler.ts', props.defaultValue);
  }, []);

  useEffect(() => {
    props.onChange && props.onChange(sandpack.files['/handler.ts'].code);
  }, [sandpack.files['/handler.ts'].code]);

  return <SandpackCodeEditor showLineNumbers={true} />;
}
