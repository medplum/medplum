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
        // defaultValue={
        //   newProcedure.status
        //     ? {
        //         coding: [
        //           {
        //             code: newProcedure.status,
        //             system: 'http://hl7.org/fhir/event-status',
        //             display: newProcedure.status,
        //           },
        //         ],
        //       }
        //     : {
        //         coding: [
        //           {
        //             code: 'preparation',
        //             system: 'http://hl7.org/fhir/event-status',
        //             display: 'Preparation',
        //           },
        //         ],
        //       }
        // }
        // onChange={(value: CodeableConcept | undefined) => {
        //   if (value) {
        //     setNewProcedure({ ...newProcedure, status: value.coding?.[0]?.code as Procedure['status'] });
        //   }
        // }}
      />

      <CodeableConceptInput
        name="code"
        label="Procedure Code"
        binding="http://hl7.org/fhir/ValueSet/procedure-code"
        path="Procedure.code"
        valuePath="code"
        // defaultValue={newProcedure.code}
        // onChange={(value: CodeableConcept | undefined) => {
        //   setNewProcedure({ ...newProcedure, code: value });
        // }}
      />

      <ResourceInput
        name="performer"
        label="Performer"
        resourceType="Practitioner"
        // defaultValue={newProcedure.performer?.[0]?.actor}
        // onChange={(value) => {
        //   if (value) {
        //     setNewProcedure({ 
        //       ...newProcedure, 
        //       performer: [{ actor: value as Reference<Practitioner> }] 
        //     });
        //   } else {
        //     setNewProcedure({ ...newProcedure, performer: undefined });
        //   }
        // }}
      />

      <TextInput
        label="Notes"
        placeholder="Additional notes about the procedure"
        // onChange={(event) => {
        //   const notes = event.currentTarget.value;
        //   setNewProcedure({ 
        //     ...newProcedure, 
        //     note: notes ? [{ text: notes }] : undefined 
        //   });
        // }}
      />

      <Group justify="flex-end" mt="md">
        <Button variant="outline" >
          Cancel
        </Button>
        <Button 
          // onClick={handleCreateProcedure} 
          // loading={loading}
          // disabled={!newProcedure.code || !newProcedure.subject}
        >
          Create Procedure
        </Button>
      </Group>
    </Stack>
  );
} 