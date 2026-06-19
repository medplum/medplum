// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import type { Communication } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { FaxBoard } from '../../components/fax/FaxBoard';
import type { FaxTab } from '../../components/fax/FaxListItem';
import classes from './FaxPage.module.css';

const FAX_QUERY_BASE = '_count=20&_sort=-_lastUpdated';
const INBOX_URI = `/Fax/Communication?${FAX_QUERY_BASE}&category=inbound`;
const SENT_URI = `/Fax/Communication?${FAX_QUERY_BASE}&category=outbound`;

export function FaxPage(): JSX.Element {
  const { faxId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const category = searchParams.get('category');
  const offset = searchParams.get('_offset');
  const activeTab: FaxTab = category === 'outbound' ? 'sent' : 'inbox';
  const query = `${FAX_QUERY_BASE}&category=${category ?? 'inbound'}${offset ? `&_offset=${offset}` : ''}`;

  const getFaxUri = (fax: Communication): string => {
    const base = fax.id ? `/Fax/Communication/${fax.id}` : '/Fax/Communication';
    return `${base}?${query}`;
  };

  const onNew = (fax: Communication): void => {
    navigate(getFaxUri(fax))?.catch(console.error);
  };

  // Pagination: write the new offset to the URL (drops the selected fax so the new
  // page auto-selects its first item via the board's onSelectFirst).
  const onChange = (search: SearchRequest): void => {
    const newOffset = search.offset ?? 0;
    const next = `${FAX_QUERY_BASE}&category=${category ?? 'inbound'}${newOffset > 0 ? `&_offset=${newOffset}` : ''}`;
    navigate(`/Fax/Communication?${next}`)?.catch(console.error);
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
      />
    </div>
  );
}
