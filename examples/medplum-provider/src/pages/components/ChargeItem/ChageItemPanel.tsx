import { TextInput, NumberInput, Text, Stack, ActionIcon, Card, Flex, Grid } from '@mantine/core';
import { IconDotsVertical, IconChevronDown } from '@tabler/icons-react';
import { ChargeItem } from '@medplum/fhirtypes';

interface ChargeItemPanelProps {
  chargeItem: ChargeItem;
}

export default function ChageItemPanel(props: ChargeItemPanelProps): JSX.Element {
  const { chargeItem } = props;

  return (
    <Card withBorder shadow="sm" p={0}>
      <Stack gap="xs" p="md">
        <Flex justify="flex-end" align="center" mb="md">
          <ActionIcon variant="subtle">
            <IconDotsVertical size={18} />
          </ActionIcon>
        </Flex>

        <Stack gap="md">
          <Grid columns={12}>
            <Grid.Col span={10}>
              <Text size="sm" fw={500} mb={8}>
                Procedure, Service, or Other CPT Code
              </Text>
              {chargeItem?.code?.coding?.map((coding) => {
                if (coding.system === 'http://www.ama-assn.org/go/cpt') {
                  return (
                    <TextInput
                      key={coding.code}
                      defaultValue={`${coding.code}: ${coding.display}`}
                      readOnly
                    />
                  );
                }
                return null;
              })}
            </Grid.Col>
            <Grid.Col span={2}>
              <Text size="sm" fw={500} mb={8}>
                Quantity
              </Text>
              <NumberInput
                defaultValue={1}
                min={1}
                max={99}
                step={1}
                rightSection={<IconChevronDown size={14} />}
                rightSectionProps={{ style: { pointerEvents: 'none' } }}
              />
            </Grid.Col>
          </Grid>

        </Stack>
      </Stack>
    </Card>
  );
}
