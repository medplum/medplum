import { JSX } from "react";
import { CodeableConceptInput, ResourceInput } from "@medplum/react";
import { Button, Group, Stack, TextInput } from "@mantine/core";
import { ServiceRequest } from "@medplum/fhirtypes";

interface ProcedureModalProps {
  serviceRequest: ServiceRequest;
}

export default function ProcedureModal(props: ProcedureModalProps): JSX.Element {
  const { serviceRequest } = props;

  return (
    <Stack>
      <CodeableConceptInput
        name="status"
        label="Status"
        binding="http://hl7.org/fhir/ValueSet/event-status"
        path="Procedure.status"
        valuePath="status"
      />

      <CodeableConceptInput
        name="code"
        label="Procedure Code"
        binding="http://hl7.org/fhir/ValueSet/procedure-code"
        path="Procedure.code"
        valuePath="code"
      />

      <ResourceInput
        name="performer"
        label="Performer"
        resourceType="Practitioner"
      />

      <TextInput
        label="Notes"
        placeholder="Additional notes about the procedure"
      />

      <Group justify="flex-end" mt="md">
        <Button variant="outline" >
          Cancel
        </Button>
        <Button 
        >
          Create Procedure
        </Button>
      </Group>
    </Stack>
  );
} 