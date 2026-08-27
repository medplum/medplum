import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import '@medplum/react/styles.css';
import type { Decorator } from '@storybook/react';
import { DARK_MODE_EVENT_NAME } from '@vueless/storybook-dark-mode';
import { useEffect } from 'react';
import { BrowserRouter } from 'react-router';
import { useFakeTimers } from 'sinon';
import { addons } from 'storybook/preview-api';
import { withSchedulingHeader } from '../src/decorators';
import { themePresetMap, themePresets } from './themes';

export const parameters = {
  layout: 'fullscreen',
  actions: { argTypesRegex: '^on[A-Z].*' },
  viewMode: 'docs',
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
  docs: {
    codePanel: true,
  },
};

export const globalTypes = {
  theme: {
    name: 'Theme',
    description: 'Mantine theme preset',
    defaultValue: 'medplumDefault',
    toolbar: {
      icon: 'paintbrush',
      items: themePresets.map((preset) => ({ value: preset.id, title: preset.name })),
      dynamicTitle: true,
    },
  },
};

// wrap initialization of MockClient and initial page navigation
// so that resources created in MockFetchClient#initMockRepo have
// consistent timestamps between storybook runs
const clock = useFakeTimers({
  now: new Date(2020, 4, 4, 12, 5),
  toFake: ['Date'],
});
const medplum = new MockClient();
medplum.get('/').then(() => {
  clock.restore();
});

function ColorSchemeWrapper({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useMantineColorScheme();
  useEffect(() => {
    const channel = addons.getChannel();
    channel.on(DARK_MODE_EVENT_NAME, (darkMode: boolean) => {
      setColorScheme(darkMode ? 'dark' : 'light');
    });
  }, []);
  return <>{children}</>;
}

export const decorators: Decorator[] = [
  withSchedulingHeader,
  (Story, ctx) => (
    <BrowserRouter>
      <MedplumProvider
        medplum={ctx.parameters.skipDefaultSeeding ? new MockClient({ seedDefaultData: false }) : medplum}
      >
        <Story />
      </MedplumProvider>
    </BrowserRouter>
  ),
  (Story) => (
    <ColorSchemeWrapper>
      <Story />
    </ColorSchemeWrapper>
  ),
  (Story, context: { globals: { theme?: string } }) => {
    const selectedTheme = themePresetMap[context.globals.theme ?? 'medplumDefault'] ?? themePresetMap.medplumDefault;
    return (
      <MantineProvider theme={selectedTheme}>
        <Notifications />
        <Story />
      </MantineProvider>
    );
  },
];
