import { Button, Modal } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { DateTimeInput } from '@medplum/react';

interface AddDueDateModalProps {
  task: Task;
  onAddDate: (date: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function AddDueDateModal(props: AddDueDateModalProps): JSX.Element {
  // const [date, setDate] = useState<Date>();

  return (
    <Modal opened={props.isOpen} onClose={props.onClose}>
      <DateTimeInput onChange={(e) => console.log(typeof e)} />
      <Button type="submit">Submit</Button>
    </Modal>
  );
}
