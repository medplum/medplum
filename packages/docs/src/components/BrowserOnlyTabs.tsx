import BrowserOnly from '@docusaurus/BrowserOnly';
import Tabs, { Props } from '@theme/Tabs';
import { JSX } from 'react';

export default function BrowserOnlyTabs(props: Props): JSX.Element {
  return <BrowserOnly>{() => <Tabs {...props} />}</BrowserOnly>;
}
