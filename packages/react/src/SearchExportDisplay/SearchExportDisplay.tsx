import { Box, Button, Modal } from '@mantine/core';
import React from 'react';

interface SearchExportDisplayProps {
  visible: boolean;
  exportCSV?: () => void;
  exportFHIRBundle?: () => void;
  onCancel: () => void;
}

export function SearchExportDisplay(props: SearchExportDisplayProps): JSX.Element | null {
  return (
    <Modal title="Export" closeButtonProps={{ 'aria-label': 'Close' }} opened={props.visible} onClose={props.onCancel}>
      <Box display="flex" sx={{ justifyContent: 'space-between' }}>
        {props.exportCSV && <ExportButton text="CSV" exportLogic={props.exportCSV} onCancel={props.onCancel} />}
        {props.exportFHIRBundle && (
          <ExportButton text="FHIR Bundle" exportLogic={props.exportFHIRBundle} onCancel={props.onCancel} />
        )}
      </Box>
    </Modal>
  );
}

interface ExportButtonProps {
  text: string;
  exportLogic: () => void;
  onCancel: () => void;
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
