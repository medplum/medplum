import { Button, Group, Menu, SegmentedControl, Tooltip } from '@mantine/core';
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconEye,
  IconPencil,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import type { DevicePreview } from '../types';
import { useEditorStore } from '../store/editorStore';
import classes from './EditorToolbar.module.css';

export function EditorToolbar(): JSX.Element {
  const navigate = useNavigate();
  const config = useEditorStore((s) => s.config);
  const currentPageId = useEditorStore((s) => s.currentPageId);
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage);
  const previewDevice = useEditorStore((s) => s.previewDevice);
  const setPreviewDevice = useEditorStore((s) => s.setPreviewDevice);
  const interactMode = useEditorStore((s) => s.interactMode);
  const setInteractMode = useEditorStore((s) => s.setInteractMode);
  const isDirty = useEditorStore((s) => s.isDirty);

  const currentPage = config?.pages.find((p) => p.id === currentPageId);

  return (
    <div className={classes.toolbar}>
      {/* Left: Back + Page Selector */}
      <div className={classes.left}>
        <Tooltip label="Back to app" withArrow>
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            onClick={() => navigate('/')}
            leftSection={<IconArrowLeft size={16} />}
            styles={{ root: { color: '#c1c2c5' } }}
          >
            Exit
          </Button>
        </Tooltip>

        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              rightSection={<IconChevronDown size={14} />}
              styles={{ root: { color: 'white' } }}
            >
              {currentPage?.name ?? 'Select page'}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {config?.pages.map((page) => (
              <Menu.Item
                key={page.id}
                onClick={() => setCurrentPage(page.id)}
                rightSection={page.id === currentPageId ? <IconCheck size={14} /> : undefined}
              >
                {page.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>

      {/* Center: Device Preview + Edit/Preview mode */}
      <div className={classes.center}>
        <Group gap={4}>
          <DeviceButton
            device="desktop"
            active={previewDevice}
            icon={<IconDeviceDesktop size={18} />}
            label="Desktop"
            onClick={setPreviewDevice}
          />
          <DeviceButton
            device="tablet"
            active={previewDevice}
            icon={<IconDeviceTablet size={18} />}
            label="Tablet"
            onClick={setPreviewDevice}
          />
          <DeviceButton
            device="mobile"
            active={previewDevice}
            icon={<IconDeviceMobile size={18} />}
            label="Mobile"
            onClick={setPreviewDevice}
          />
        </Group>

        <SegmentedControl
          size="xs"
          value={interactMode ? 'preview' : 'edit'}
          onChange={(val) => setInteractMode(val === 'preview')}
          data={[
            {
              value: 'edit',
              label: (
                <Group gap={4}>
                  <IconPencil size={14} />
                  <span>Edit</span>
                </Group>
              ),
            },
            {
              value: 'preview',
              label: (
                <Group gap={4}>
                  <IconEye size={14} />
                  <span>Preview</span>
                </Group>
              ),
            },
          ]}
          styles={{
            root: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' },
            label: { color: '#c1c2c5', fontSize: 12, padding: '2px 8px' },
            indicator: { background: 'rgba(255,255,255,0.15)' },
          }}
        />
      </div>

      {/* Right: Publish */}
      <div className={classes.right}>
        <Button size="compact-sm" color={isDirty ? 'green' : 'gray'} variant={isDirty ? 'filled' : 'light'}>
          Publish
        </Button>
      </div>
    </div>
  );
}

interface DeviceButtonProps {
  device: DevicePreview;
  active: DevicePreview;
  icon: JSX.Element;
  label: string;
  onClick: (device: DevicePreview) => void;
}

function DeviceButton({ device, active, icon, label, onClick }: DeviceButtonProps): JSX.Element {
  return (
    <Tooltip label={label} withArrow>
      <button
        className={classes.deviceButton}
        data-active={device === active || undefined}
        onClick={() => onClick(device)}
      >
        {icon}
      </button>
    </Tooltip>
  );
}
