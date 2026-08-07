// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Text } from '@mantine/core';
import type { JSX } from 'react';
import { Modal } from '../Modal/Modal';

interface SearchExportDialogProps {
  readonly visible: boolean;
  readonly exportCsv?: () => void;
  readonly exportTransactionBundle?: () => void;
  readonly onCancel: () => void;
}

export function SearchExportDialog(props: SearchExportDialogProps): JSX.Element | null {
  // Left undefined when neither format is offered, so the modal renders no footer and no
  // footer border rather than an empty bordered strip.
  const actions =
    props.exportCsv || props.exportTransactionBundle ? (
      <>
        {props.exportCsv && <ExportButton text="CSV" exportLogic={props.exportCsv} onCancel={props.onCancel} />}
        {props.exportTransactionBundle && (
          <ExportButton
            text="Transaction Bundle"
            exportLogic={props.exportTransactionBundle}
            onCancel={props.onCancel}
          />
        )}
      </>
    ) : undefined;

  return (
    <Modal title="Export" opened={props.visible} onClose={props.onCancel} actions={actions}>
      <Text>Limited to 1000 records</Text>
    </Modal>
  );
}

interface ExportButtonProps {
  readonly text: string;
  readonly exportLogic: () => void;
  readonly onCancel: () => void;
}

export function ExportButton(props: ExportButtonProps): JSX.Element {
  return (
    <Button
      onClick={() => {
        props.exportLogic();
        props.onCancel();
      }}
    >
      {`Export as ${props.text}`}
    </Button>
  );
}
