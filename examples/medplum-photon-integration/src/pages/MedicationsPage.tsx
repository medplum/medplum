import { getReferenceString } from '@medplum/core';
import { Document, SearchControl, useMedplumNavigate } from '@medplum/react';

export function MedicationsPage(): JSX.Element {
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <SearchControl
        search={{ resourceType: 'MedicationKnowledge', fields: ['ingredient', 'code'] }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
    </Document>
  );
}
