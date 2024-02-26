import { Table } from '@mantine/core';
import { ObservationDefinition } from '@medplum/fhirtypes';
import { CodeableConceptDisplay, Loading, useSearchResources } from '@medplum/react';

export function PanelsPage(): JSX.Element {
  const [panels] = useSearchResources('ActivityDefinition', '_count=100');
  const [assays] = useSearchResources('ObservationDefinition', '_count=100');

  if (!panels || !assays) {
    return <Loading />;
  }

  return (
    <Table withTableBorder withRowBorders withColumnBorders>
      <thead>
        <tr>
          <th>Category</th>
          <th>Assay</th>
          {panels.map((panel) => (
            <th key={panel.id}>{panel.name}</th>
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
              <td key={panel.id}>
                {panel.observationResultRequirement?.find((r) => r.reference?.includes(assay.id as string)) ? '✅' : ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
