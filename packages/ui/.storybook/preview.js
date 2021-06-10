import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '../src/MedplumProvider';
import '../src/CssBaseline.css';
import '../src/DefaultTheme.css';

export const parameters = {
  layout: 'fullscreen',
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
}

const mockRouter = {
  push: (path, state) => {
    alert('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

const medplum = new MedplumClient({
  baseUrl: process.env.MEDPLUM_BASE_URL,
  clientId: process.env.MEDPLUM_CLIENT_ID,
});

export const decorators = [
  (Story) => (
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <Story />
    </MedplumProvider>
  ),
];