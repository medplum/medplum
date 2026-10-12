// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { FhirPathTableField } from '@medplum/react';
import { MemoizedFhirPathTable } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useAppNavigate } from './useAppNavigate';

export function SmartSearchPage(): JSX.Element | null {
  const navigate = useAppNavigate();
  const location = useLocation();
  const [resourceType, setResourceType] = useState<string>();
  const [query, setQuery] = useState<string>();
  const [fields, setFields] = useState<FhirPathTableField[]>();

  useEffect(() => {
    const queryParams = Object.fromEntries(new URLSearchParams(location.search).entries());
    setResourceType(queryParams.resourceType);
    setQuery(queryParams.query);
    setFields(JSON.parse(queryParams.fields));
  }, [location]);

  if (!resourceType || !query || !fields) {
    return null;
  }

  return (
    <MemoizedFhirPathTable
      resourceType={resourceType}
      checkboxesEnabled={true}
      query={query}
      fields={fields}
      onClick={(e) => navigate(`/${resourceType}/${e.resource.id}`)}
      onAuxClick={(e) => window.open(`/${resourceType}/${e.resource.id}`, '_blank')}
      onBulk={(ids: string[]) => {
        navigate(`/bulk/${resourceType}?ids=${ids.join(',')}`);
      }}
    />
  );
}
