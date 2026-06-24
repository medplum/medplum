import BrowserOnly from '@docusaurus/BrowserOnly';
import type { Props } from '@theme/Tabs';
import Tabs from '@theme/Tabs';
import type { JSX } from 'react';

export default function BrowserOnlyTabs(props: Props): JSX.Element {
  return <BrowserOnly>{() => <Tabs {...props} />}</BrowserOnly>;
}
