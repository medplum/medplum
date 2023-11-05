import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react-hooks';
import Home from './Home';

const medplum = new MedplumClient({
  // Enter your Medplum connection details here
  // See MedplumClient docs for more details
  // baseUrl: 'http://localhost:8103/',
  // clientId: 'MY_CLIENT_ID',
  // projectId: 'MY_PROJECT_ID',
});

export default function App(): JSX.Element {
  return (
    <MedplumProvider medplum={medplum}>
      <Home />
    </MedplumProvider>
  );
}
