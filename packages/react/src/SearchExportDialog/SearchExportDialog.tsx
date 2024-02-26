import { Box, Button, Modal, Text } from '@mantine/core';

interface SearchExportDialogProps {
  readonly visible: boolean;
  readonly exportCsv?: () => void;
  readonly exportTransactionBundle?: () => void;
  readonly onCancel: () => void;
}

export function SearchExportDialog(props: SearchExportDialogProps): JSX.Element | null {
  return (
    <Modal title="Export" closeButtonProps={{ 'aria-label': 'Close' }} opened={props.visible} onClose={props.onCancel}>
      <Box display="flex" style={{ justifyContent: 'space-between' }}>
        {props.exportCsv && <ExportButton text="CSV" exportLogic={props.exportCsv} onCancel={props.onCancel} />}
        {props.exportTransactionBundle && (
          <ExportButton
            text="Transaction Bundle"
            exportLogic={props.exportTransactionBundle}
            onCancel={props.onCancel}
          />
        )}
      </Box>
      <Text style={{ marginTop: '10px', marginLeft: '2px' }}>Limited to 1000 records</Text>
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
