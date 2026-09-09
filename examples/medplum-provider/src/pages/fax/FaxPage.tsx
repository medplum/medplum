// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { FaxBoard } from '../../components/fax/FaxBoard';
import type { FaxTab } from '../../components/fax/FaxListItem';
import { useNewInUrl } from '../../hooks/useNewInUrl';
import classes from './FaxPage.module.css';

const FAX_QUERY_BASE = '_count=20&_sort=-_lastUpdated';
const INBOX_URI = `/Fax/Communication?${FAX_QUERY_BASE}&category=inbound`;
const SENT_URI = `/Fax/Communication?${FAX_QUERY_BASE}&category=outbound`;

function getFaxBasePath(faxId: string | undefined): string {
  return faxId ? `/Fax/Communication/${faxId}` : '/Fax/Communication';
}

export function FaxPage(): JSX.Element {
  const { faxId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const category = searchParams.get('category');
  const offset = searchParams.get('_offset');
  const activeTab: FaxTab = category === 'outbound' ? 'sent' : 'inbox';
  const query = `${FAX_QUERY_BASE}&category=${category ?? 'inbound'}${offset ? `&_offset=${offset}` : ''}`;

  const {
    isNew: isNewFax,
    openNew: onSendFaxOpen,
    closeNew: onSendFaxClose,
  } = useNewInUrl(getFaxBasePath(faxId), `?${query}`);

  // Preserve the /new suffix so auto-selecting a fax keeps the send fax modal open.
  const getFaxUri = (fax: Communication): string => {
    return `${getFaxBasePath(fax.id)}${isNewFax ? '/new' : ''}?${query}`;
  };

  const onNew = (fax: Communication): void => {
    navigate(`${getFaxBasePath(fax.id)}?${query}`)?.catch(console.error);
  };

  // Pagination: write the new offset to the URL, keeping the selected fax open
  const onChange = (search: SearchRequest): void => {
    const newOffset = search.offset ?? 0;
    const next = `${FAX_QUERY_BASE}&category=${category ?? 'inbound'}${newOffset > 0 ? `&_offset=${newOffset}` : ''}`;
    const basePath = faxId ? `/Fax/Communication/${faxId}` : '/Fax/Communication';
    navigate(`${basePath}?${next}`)?.catch(console.error);
  };

  return (
    <div className={classes.container}>
      <FaxBoard
        faxId={faxId}
        activeTab={activeTab}
        inboxUri={INBOX_URI}
        sentUri={SENT_URI}
        query={query}
        getFaxUri={getFaxUri}
        onNew={onNew}
        onChange={onChange}
        sendFaxOpened={isNewFax}
        onSendFaxOpen={onSendFaxOpen}
        onSendFaxClose={onSendFaxClose}
      />
    </div>
  );
}
