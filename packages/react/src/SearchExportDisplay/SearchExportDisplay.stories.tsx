import { Meta } from '@storybook/react';
import React from 'react';
import { SearchExportDisplay } from './SearchExportDisplay';

export default {
  title: 'Mepdlum/SearchExportDisplay',
  component: SearchExportDisplay,
} as Meta;

export const Basic = (): JSX.Element => {
  return (
    <SearchExportDisplay
      visible={true}
      onCancel={() => console.log('onCancel')}
      exportCSV={() => console.log('export')}
    />
  );
};
