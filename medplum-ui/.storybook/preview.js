// import
import { MedPlumClient } from 'medplum';
import '../src/CssBaseline.css';
import '../src/DefaultTheme.css';

export const parameters = {
  actions: { argTypesRegex: "^on[A-Z].*" },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
}

window.medplum = new MedPlumClient({
  baseUrl: 'http://localhost:5000/',
  clientId: 'f051b8ed-105d-4e81-8ddc-c5c2af12f9d3'
});
