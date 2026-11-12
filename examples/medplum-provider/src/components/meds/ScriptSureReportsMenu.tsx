// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Loader, Menu, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { ScriptSureReportWidget } from '@medplum/scriptsure-react';
import { useScriptSureWidgetUrl } from '@medplum/scriptsure-react';
import { IconReportAnalytics } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { SCRIPTSURE_REPORT_WIDGETS } from '../../scriptsure/reportWidgets';
import { useScriptSurePractice } from '../../scriptsure/ScriptSurePractice';
import { showErrorNotification } from '../../utils/notifications';
import { PrescriptionIFrameModal } from './PrescriptionIFrameModal';

/** DAW recommends 1000+ px for the reporting widgets; their tables wrap poorly when narrower. */
const REPORT_MODAL_SIZE = '90%';

/**
 * Header action that opens the current user's ScriptSure Audit Log (required for EPCS)
 * or Reports widget in a modal. Each open mints a fresh session URL.
 *
 * @returns The reports menu and its widget modal.
 */
export function ScriptSureReportsMenu(): JSX.Element {
  const { getWidgetUrl } = useScriptSureWidgetUrl();
  const { selectedOrganization } = useScriptSurePractice();
  const [menuOpened, { open: openMenu, close: closeMenu }] = useDisclosure(false);
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [widgetLabel, setWidgetLabel] = useState('');
  const [url, setUrl] = useState<string | undefined>();

  const openWidget = async (widget: ScriptSureReportWidget, label: string): Promise<void> => {
    setLoading(true);
    try {
      setUrl(await getWidgetUrl(widget, selectedOrganization));
      setWidgetLabel(label);
      openModal();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Menu shadow="md" position="bottom-end" radius="md" opened={menuOpened} onOpen={openMenu} onClose={closeMenu}>
        <Menu.Target>
          <Tooltip label="ScriptSure reports" position="bottom" openDelay={500} disabled={menuOpened}>
            <ActionIcon
              variant="transparent"
              size={32}
              radius="xl"
              aria-label="ScriptSure reports"
              className="outline-icon-button"
              data-opened={menuOpened || undefined}
              disabled={loading}
            >
              {loading ? <Loader size={14} /> : <IconReportAnalytics size={16} />}
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>ScriptSure</Menu.Label>
          {SCRIPTSURE_REPORT_WIDGETS.map(({ widget, label }) => (
            <Menu.Item key={widget} onClick={() => openWidget(widget, label).catch(showErrorNotification)}>
              {label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>

      <PrescriptionIFrameModal
        opened={modalOpened}
        onClose={closeModal}
        launchUrl={url}
        title={`ScriptSure ${widgetLabel.toLowerCase()}`}
        size={REPORT_MODAL_SIZE}
      />
    </>
  );
}
