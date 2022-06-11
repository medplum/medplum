import { ObservationDefinition } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, useMedplum } from '@medplum/react';
import React from 'react';

export function PanelsPage(): JSX.Element {
  const medplum = useMedplum();
  const panels = medplum.searchResources('ActivityDefinition', '_count=100').read();
  const assays = medplum.searchResources('ObservationDefinition', '_count=100').read();

  return (
    <table className="medplum-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Assay</th>
          {panels.map((panel) => (
            <th>{panel.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {assays.map((assay: ObservationDefinition) => (
          <tr key={assay.id}>
            <td>
              <CodeableConceptDisplay value={assay.category?.[0]} />
            </td>
            <td>
              <CodeableConceptDisplay value={assay.code} />
            </td>
            {panels.map((panel) => (
              <td>
                {panel.observationResultRequirement?.find((r) => r.reference?.includes(assay.id as string)) ? '✅' : ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
