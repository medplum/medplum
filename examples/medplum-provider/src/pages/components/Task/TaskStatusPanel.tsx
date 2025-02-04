import { Stack, Text, Button, Menu, useMantineTheme, Grid, Flex, Modal } from '@mantine/core';
import { Questionnaire, QuestionnaireResponse, Task } from '@medplum/fhirtypes';
import { useNavigate } from 'react-router-dom';
import { IconCaretDownFilled } from '@tabler/icons-react';
import classes from './TaskStatusPanel.module.css';
import cx from 'clsx';
import { useState } from 'react';
import { QuestionnaireForm } from '@medplum/react';
import { getQuestionnaireAnswers } from '@medplum/core';

interface TaskStatusPanelProps {
  task: Task;
  isQuestionnaire?: boolean;
  onSubmit: () => void;
  onAddNote: (note: string) => void;
  onChangeStatus: (status: Task[`status`]) => void;
}

export const TaskStatusPanel = ({ task, isQuestionnaire, onSubmit, onAddNote, onChangeStatus }: TaskStatusPanelProps): JSX.Element => {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const isTaskReadyOrRequested = task.status === 'ready' || task.status === 'requested';
  const [submenuOpened, setSubmenuOpened] = useState(false);
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);

  function getButtonText(): string {
    if (isQuestionnaire) {
      return 'Save Responses';
    }

    if (isTaskReadyOrRequested) {
      return 'Complete Task';
    }

    return 'Edit Task';
  }

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse): void => {
    const answer = getQuestionnaireAnswers(formData)['new-comment'].valueString;
    if (answer) {
      onAddNote(answer)
    }
    setIsAddNoteOpen(false)
  };

  return (
    <>
    <Grid
      h={70}
      className={cx(classes.panel, {
        [classes.completed]: task.status === 'completed',
        [classes.ready]: isTaskReadyOrRequested,
      })}
      p="md"
      align="center"
    >
      <Grid.Col span={6}>
        <Stack gap={0}>
          <Text c="black">Current status</Text>
          <Text fw="bold">{task.status}</Text>
        </Stack>
      </Grid.Col>

      <Grid.Col span={6}>
        <Flex justify="flex-end" align="center" gap={8} w="100%">
          <Button variant="transparent" color={theme.colors.blue[6]} onClick={() => navigate(`Task/${task.id}`)}>
            Task details
          </Button>

          <Menu>
            <div style={{ display: 'inline-block' }}>
              <Button
                onClick={onSubmit}
                variant={isQuestionnaire || isTaskReadyOrRequested ? 'filled' : 'outline'}
                rightSection={
                  <Menu.Target>
                    <div className={classes.caret} onClick={(e) => e.stopPropagation()}>
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
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '100%',
                      background: theme.white,
                      border: `1px solid ${theme.colors.gray[3]}`,
                      boxShadow: theme.shadows.md,
                      zIndex: 1000,
                      minWidth: 150,
                    }}
                  >
                    <Menu.Item onClick={() => onChangeStatus('ready')}>Ready</Menu.Item>
                    <Menu.Item onClick={() => onChangeStatus('in-progress')}>In progress</Menu.Item>
                    <Menu.Item onClick={() => onChangeStatus('on-hold')}>On hold</Menu.Item>
                    <Menu.Item onClick={() => onChangeStatus('completed')}>Completed</Menu.Item>
                    <Menu.Item onClick={() => onChangeStatus('cancelled')}>Cancelled</Menu.Item>
                  </div>
                )}
              </div>

              <Menu.Item onClick={() => navigate(`Task/${task.id}`)}>Edit task details</Menu.Item>
              <Menu.Item onClick={() => setIsAddNoteOpen(true)}>Add note</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>
      </Grid.Col>
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
