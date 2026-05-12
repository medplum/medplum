import { Tabs } from '@mantine/core';
import { IconBoxModel2, IconComponents, IconSitemap } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { LeftPanelTab } from '../../types';
import { ComponentLibrary } from './ComponentLibrary';
import { LayersPanel } from './LayersPanel';
import { PageTree } from './PageTree';
import classes from './LeftPanel.module.css';

export function LeftPanel(): JSX.Element {
  const tab = useEditorStore((s) => s.leftPanelTab);
  const setTab = useEditorStore((s) => s.setLeftPanelTab);

  return (
    <div className={classes.panel}>
      <div className={classes.header}>
        <Tabs
          value={tab}
          onChange={(val) => setTab(val as LeftPanelTab)}
          variant="unstyled"
          classNames={{ list: 'pill-tabs' }}
        >
          <Tabs.List>
            <Tabs.Tab value="pages" leftSection={<IconSitemap size={14} />}>
              Pages
            </Tabs.Tab>
            <Tabs.Tab value="layers" leftSection={<IconBoxModel2 size={14} />}>
              Layers
            </Tabs.Tab>
            <Tabs.Tab value="components" leftSection={<IconComponents size={14} />}>
              Add
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </div>
      <div className={classes.body}>
        {tab === 'pages' && <PageTree />}
        {tab === 'layers' && <LayersPanel />}
        {tab === 'components' && <ComponentLibrary />}
      </div>
    </div>
  );
}
