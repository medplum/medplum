import { Box, Card, Flex, Stack, Text, TextInput } from '@mantine/core';
import { ChargeItem } from '@medplum/fhirtypes';
import ChargeItemPanel from './ChargeItemPanel';
import { calculateTotalPrice } from '../../utils/chargeitems';
import { JSX, useCallback, useEffect, useState } from 'react';

interface ChargeItemListProps {
  chargeItems: ChargeItem[];
  updateChargeItems: (chargeItems: ChargeItem[]) => void;
}

export const ChargeItemList = (props: ChargeItemListProps): JSX.Element => {
  const { chargeItems, updateChargeItems } = props;
  const [chargeItemsState, setChargeItemsState] = useState<ChargeItem[]>(chargeItems);

  useEffect(() => {
    setChargeItemsState(chargeItems);
  }, [chargeItems]);

  const updateChargeItemList = useCallback(
    async (updatedChargeItem: ChargeItem): Promise<void> => {
      const updatedChargeItems = chargeItemsState.map((item) =>
        item.id === updatedChargeItem.id ? updatedChargeItem : item
      );
      updateChargeItems(updatedChargeItems);
    },
    [chargeItemsState, updateChargeItems]
  );

  const deleteChargeItem = useCallback(
    async (chargeItem: ChargeItem): Promise<void> => {
      const updatedChargeItems = chargeItemsState.filter((item) => item.id !== chargeItem.id);
      updateChargeItems(updatedChargeItems);
    },
    [chargeItemsState, updateChargeItems]
  );

  return (
    <Stack gap={0}>
      <Text fw={600} size="lg" mb="md">
        Charge Items
      </Text>
      {chargeItems.length > 0 ? (
        <Stack gap="md">
          {chargeItems.map((chargeItem: ChargeItem) => (
            <ChargeItemPanel
              key={chargeItem.id}
              chargeItem={chargeItem}
              onChange={updateChargeItemList}
              onDelete={deleteChargeItem}
            />
          ))}

          <Card withBorder shadow="sm">
            <Flex justify="space-between" align="center">
              <Text size="lg" fw={500}>
                Total Calculated Price to Bill
              </Text>
              <Box>
                <TextInput w={300} value={`$${calculateTotalPrice(chargeItems)}`} readOnly />
              </Box>
            </Flex>
          </Card>
        </Stack>
      ) : (
        <Card withBorder shadow="sm">
          <Text c="dimmed">No charge items available</Text>
        </Card>
      )}
    </Stack>
  );
};
