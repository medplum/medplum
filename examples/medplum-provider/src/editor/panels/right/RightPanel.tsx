import { Tabs } from '@mantine/core';
import { IconBrush, IconMessageChatbot, IconSettings } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { RightPanelTab } from '../../types';
import { ChatPanel } from './ChatPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { ThemeSettingsPanel } from './ThemeSettingsPanel';
import classes from './RightPanel.module.css';

export function RightPanel(): JSX.Element {
  const tab = useEditorStore((s) => s.rightPanelTab);
  const setTab = useEditorStore((s) => s.setRightPanelTab);

  return (
    <div className={classes.panel}>
      <div className={classes.header}>
        <Tabs
          value={tab}
          onChange={(val) => setTab(val as RightPanelTab)}
          variant="unstyled"
          classNames={{ list: 'pill-tabs' }}
        >
          <Tabs.List>
            <Tabs.Tab value="theme" leftSection={<IconBrush size={14} />}>
              Theme
            </Tabs.Tab>
            <Tabs.Tab value="properties" leftSection={<IconSettings size={14} />}>
              Properties
            </Tabs.Tab>
            <Tabs.Tab value="chat" leftSection={<IconMessageChatbot size={14} />}>
              Chat
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </div>
      <div className={classes.body}>
        {tab === 'theme' && <ThemeSettingsPanel />}
        {tab === 'properties' && <PropertiesPanel />}
        {tab === 'chat' && <ChatPanel />}
      </div>
    </div>
  );
}
