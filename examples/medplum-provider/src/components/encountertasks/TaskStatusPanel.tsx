import { Button, Flex, Grid, Group, Menu, Modal, Stack, Text } from '@mantine/core';
import { getQuestionnaireAnswers } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import { IconCaretDownFilled } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import classes from './TaskStatusPanel.module.css';

interface TaskStatusPanelProps {
  task: Task;
  onActionButtonClicked: () => void;
  onAddNote: (note: string) => void;
  onChangeStatus: (status: Task[`status`]) => void;
}

export const TaskStatusPanel = ({
  task,
  onActionButtonClicked,
  onAddNote,
  onChangeStatus,
}: TaskStatusPanelProps): JSX.Element => {
  const navigate = useNavigate();
  const isTaskReadyOrRequested = task.status === 'ready' || task.status === 'requested';
  const [submenuOpened, setSubmenuOpened] = useState(false);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);

  function getButtonText(): string {
    if (isTaskReadyOrRequested) {
      return 'Complete Task';
    }

    return 'Edit Task';
  }

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const answer = getQuestionnaireAnswers(formData)['new-comment'].valueString;
    if (answer) {
      onAddNote(answer);
    }
    setIsAddNoteOpen(false);
  };

  return (
    <>
      <Grid h={80} p="md" align="center">
        <Flex justify="flex-end" align="center" gap={8} w="100%">
          <Stack gap={4} align="flex-end">
            <Group gap="xs">
              <Text>Current status:</Text>
              <Text fw="bold">{task.status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())}</Text>
            </Group>

            <Menu>
              <div style={{ display: 'inline-block' }}>
                <Button
                  onClick={onActionButtonClicked}
                  variant={isTaskReadyOrRequested ? 'filled' : 'outline'}
                  rightSection={
                    <Menu.Target>
                      <div className={classes.menu} onClick={(e) => e.stopPropagation()}>
                        <IconCaretDownFilled size={14} />
                      </div>
                    </Menu.Target>
                  }
                >
                  {getButtonText()}
                </Button>
              </div>

              <Menu.Dropdown>
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setSubmenuOpened(true)}
                  onMouseLeave={() => setSubmenuOpened(false)}
                >
                  <Menu.Item rightSection="›">Change status</Menu.Item>
                  {submenuOpened && (
                    <div className={classes.submenu}>
                      <Menu.Item onClick={() => onChangeStatus('ready')}>Ready</Menu.Item>
                      <Menu.Item onClick={() => onChangeStatus('in-progress')}>In progress</Menu.Item>
                      <Menu.Item onClick={() => onChangeStatus('on-hold')}>On hold</Menu.Item>
                      <Menu.Item onClick={() => onChangeStatus('completed')}>Completed</Menu.Item>
                      <Menu.Item onClick={() => onChangeStatus('cancelled')}>Cancelled</Menu.Item>
                    </div>
                  )}
                </div>

                <Menu.Item onClick={() => navigate(`Task/${task.id}`)?.catch(console.error)}>
                  Edit task details
                </Menu.Item>
                <Menu.Item onClick={() => setIsAddNoteOpen(true)}>Add note</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Stack>
        </Flex>
      </Grid>
      <Modal opened={isAddNoteOpen} onClose={() => setIsAddNoteOpen(false)}>
        <QuestionnaireForm questionnaire={commentQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </>
  );
};

const commentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'add-comment',
  title: 'Add a comment',
  item: [
    {
      linkId: 'new-comment',
      text: 'Add a comment',
      type: 'string',
    },
  ],
};
