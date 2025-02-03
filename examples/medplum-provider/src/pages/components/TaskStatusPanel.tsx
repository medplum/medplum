import { Group, Stack, Text, Button, Menu, useMantineTheme } from '@mantine/core';
import { Task } from '@medplum/fhirtypes';
import { useNavigate } from 'react-router-dom';
import { IconCaretDownFilled } from '@tabler/icons-react';

interface TaskStatusPanelProps {
  task: Task;
  isQuestionnaire?: boolean;
  onSubmit?: () => void;
}

export const TaskStatusPanel = ({ task, isQuestionnaire, onSubmit }: TaskStatusPanelProps): JSX.Element => {
  const theme = useMantineTheme();
  const navigate = useNavigate();

  return (
    <Group
      justify="space-between"
      align="center"
      style={{
        height: 70,
        backgroundColor: task.status === 'completed' ? theme.colors.green[0] : theme.colors.gray[1],
      }}
      p="md"
    >
      <Stack gap={0}>
        <Text color="black">Current status</Text>
        <Text fw="bold" color="black">
          {task.status}
        </Text>
      </Stack>

      <Group gap={8}>
        <Button variant="transparent" color={theme.colors.blue[6]} onClick={() => navigate(`Task/${task.id}`)}>
          Task details
        </Button>
        <Menu>
          <div style={{ display: 'inline-block' }}>
            <Button
              onClick={onSubmit}
              variant={isQuestionnaire ? 'filled' : 'outline'}
              rightSection={
                <Menu.Target>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: '8px',
                      margin: '-8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <IconCaretDownFilled size={14} />
                  </div>
                </Menu.Target>
              }
            >
              {isQuestionnaire ? 'Save Changes' : 'Edit Task'}
            </Button>
          </div>

          <Menu.Dropdown>
            <Menu.Item>Edit</Menu.Item>
            <Menu.Item>Delete</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
};
