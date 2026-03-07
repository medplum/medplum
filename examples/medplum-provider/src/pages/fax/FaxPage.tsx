// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { FaxBoard } from '../../components/fax/FaxBoard';
import type { FaxTab } from '../../components/fax/FaxListItem';
import classes from './FaxPage.module.css';

const VALID_TABS: FaxTab[] = ['inbox', 'archived', 'sent'];

export function FaxPage(): JSX.Element {
  const { faxId } = useParams();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as FaxTab | null;
  const activeTab: FaxTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'inbox';

  return (
    <div className={classes.container}>
      <FaxBoard selectedFaxId={faxId} activeTab={activeTab} />
    </div>
  );
}
