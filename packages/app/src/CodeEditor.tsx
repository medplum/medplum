import React, { forwardRef, useRef } from 'react';
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  useSandpack,
  SandpackPreviewRef,
  SandpackFiles,
  SandpackFile,
} from '@codesandbox/sandpack-react';

import { useEffect, useImperativeHandle } from 'react';

import '@codesandbox/sandpack-react/dist/index.css';
import { useMedplum } from '@medplum/ui';

const BOT_CODE_PATH = '/handler.ts';
const AUTH_TOKEN_FILE = '/authToken.json';

const DEFAULT_CODE: SandpackFiles = {
  '/App.tsx': `

  import {handler} from './${BOT_CODE_PATH}';
  import input from './input';
  import {useEffect, useState, useRef} from 'react';
  import {MedplumClient} from '@medplum/core';
  import authToken from './${AUTH_TOKEN_FILE}';

  export default function App(): JSX.Element {
    [result, setResult] = useState();
    const medplum = useRef(new MedplumClient({
      baseUrl: authToken.baseUrl
    }));

    useEffect(() => {
      if(!medplum.current){
        return;
      }
      const {project, profile, accessToken, refreshToken} = medplum.current;
      medplum.current.setAccessToken(accessToken);
      console.log(medplum.current.getActiveLogin())
    }, [medplum])

    useEffect(()=> {
      const event = {
        input: input
      };
      handler(medplum.current, event)
        .then(setResult)
        .catch((error) => {
          setResult("");
          throw error;
        })
    }, []);
    return (<pre>{JSON.stringify(result, null, 2)}</pre>)
  }`,

  '/input.ts': {
    code: `\
const input =  {

};
export default input;`,
    active: false,
  },
};

DEFAULT_CODE[BOT_CODE_PATH] = {
  code: `\
export async function handler(medplum, event) {

}`,
  active: true,
};

DEFAULT_CODE[AUTH_TOKEN_FILE] = {
  code: `{}`,
};

export interface CodeEditorProps {
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export interface CodeEditorRef {
  /**
   * Execute the current code in the editor
   */
  execute: () => void;
}

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>((props, ref) => {
  const previewRef = useRef<SandpackPreviewRef>(null);
  const medplum = useMedplum();

  // Pass the login details to the Sandpack Environment
  useEffect(() => {
    const clientState = {
      baseUrl: medplum.baseUrl(),
      ...medplum.getActiveLogin(),
    };
    (DEFAULT_CODE[AUTH_TOKEN_FILE] as SandpackFile).code = JSON.stringify(clientState);
  }, []);

  // Expose an execute() method to the container component to manually trigger
  // code execution
  useImperativeHandle(ref, () => ({
    execute() {
      const client = previewRef.current?.getClient();
      if (!client) {
        return;
      }
      // Enable code execution, re-run compilation, and then immediately
      // disable execution
      try {
        client.updateOptions({ ...client.options, skipEval: false });
        client.updatePreview();
      } finally {
        client.updateOptions({ ...client.options, skipEval: true });
      }
    },
  }));

  return (
    <>
      {/* Sandpack provider is missing "children" in it's props. Suppress errors for now
        @ts-ignore */}
      <SandpackProvider
        template="react-ts"
        autorun={true}
        skipEval={true}
        // bundlerURL={'http://localhost:3000/'}
        customSetup={{
          files: DEFAULT_CODE,
          dependencies: {
            '@medplum/core': '0.9.3',
          },
        }}
      >
        <SandpackLayout>
          <WrappedSandpackEditor {...props} />
          <SandpackPreview ref={previewRef} showOpenInCodeSandbox={false} />
        </SandpackLayout>
      </SandpackProvider>
    </>
  );
});

// Thin wrapper around SandpackCodeEditor that listens for changes to main
// handler function code
function WrappedSandpackEditor(props: CodeEditorProps): JSX.Element {
  const { sandpack } = useSandpack();

  // If there was an already saved value, update the Bot's code file
  useEffect(() => {
    props.defaultValue && sandpack.updateFile(BOT_CODE_PATH, props.defaultValue);
  }, []);

  // Fire the change listener whenever the Bot's code changes
  useEffect(() => {
    props.onChange?.(sandpack.files[BOT_CODE_PATH].code);
  }, [sandpack.files[BOT_CODE_PATH]?.code]);

  return <SandpackCodeEditor showLineNumbers={true} showRunButton={false} />;
}
