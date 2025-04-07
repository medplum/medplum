import { Tabs, Paper } from '@mantine/core';
import { PatientPageTabs } from './PatientPage.utils';

interface PatientTabsNavigationProps {
  currentTab: string;
  onTabChange: (value: string | null) => void;
}

export function PatientTabsNavigation({ currentTab, onTabChange }: PatientTabsNavigationProps): JSX.Element {
  return (
    <Paper style={{ width: '100%' }}>
      <Tabs value={currentTab.toLowerCase()} onChange={onTabChange}>
        <Tabs.List
          style={{
            display: 'flex',
            width: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
            flexWrap: 'nowrap',
          }}
        >
          {PatientPageTabs.map((t) => (
            <Tabs.Tab key={t.id} value={t.id}>
              {t.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
    </Paper>
  );
}
