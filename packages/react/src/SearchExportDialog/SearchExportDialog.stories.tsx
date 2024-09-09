import { Meta } from '@storybook/react';
import { SearchExportDialog } from './SearchExportDialog';

export default {
  title: 'Medplum/SearchExportDialog',
  component: SearchExportDialog,
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <SearchExportDialog
      visible={true}
      onCancel={() => console.log('onCancel')}
      exportCsv={() => console.log('export')}
    />
  );
};
