import {
  IconBook2,
  IconCalendarEvent,
  IconClipboardCheck,
  IconMail,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEditorStore } from '../../store/editorStore';
import classes from './LeftPanel.module.css';

const PAGE_ICONS: Record<string, JSX.Element> = {
  IconUsers: <IconUsers size={16} />,
  IconUser: <IconUser size={16} />,
  IconCalendarEvent: <IconCalendarEvent size={16} />,
  IconMail: <IconMail size={16} />,
  IconClipboardCheck: <IconClipboardCheck size={16} />,
  IconBook2: <IconBook2 size={16} />,
};

export function PageTree(): JSX.Element {
  const config = useEditorStore((s) => s.config);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);

  if (!config) {
    return <div style={{ padding: 16, color: '#868e96' }}>No configuration loaded</div>;
  }

  return (
    <div>
      <div className={classes.sectionHeader}>Pages</div>
      {config.pages.map((page) => (
        <div
          key={page.id}
          className={classes.pageItem}
          data-active={page.id === currentPageId || undefined}
          onClick={() => setCurrentPage(page.id)}
        >
          {PAGE_ICONS[page.icon ?? ''] ?? <IconUsers size={16} />}
          <span>{page.name}</span>
        </div>
      ))}
    </div>
  );
}
