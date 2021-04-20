import { Meta, Story } from '@storybook/react';
import React from 'react';
import { Page, PageProps } from '../Page';
import * as HeaderStories from './Header.stories';

export default {
  title: 'MedPlum/Page',
  component: Page,
} as Meta;

const Template: Story<PageProps> = (args) => <Page {...args} />;

export const LoggedIn = Template.bind({});
LoggedIn.args = {
  ...HeaderStories.LoggedIn.args,
};

export const LoggedOut = Template.bind({});
LoggedOut.args = {
  ...HeaderStories.LoggedOut.args,
};
