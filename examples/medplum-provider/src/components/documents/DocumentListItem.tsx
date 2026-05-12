import { Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate } from '@medplum/core';
import type { Communication, DocumentReference } from '@medplum/fhirtypes';
import { MedplumLink } from '@medplum/react';
import cx from 'clsx';
import type { JSX } from 'react';
import classes from './DocumentListItem.module.css';

export type PatientDocument = {
  id: string;
  resourceType: 'DocumentReference' | 'Communication';
  resource: DocumentReference | Communication;
  name: string;
  date: string | undefined;
  tag: string;
  tagColor: string;
};

export function toPatientDocument(resource: DocumentReference | Communication): PatientDocument {
  if (resource.resourceType === 'DocumentReference') {
    return docRefToPatientDoc(resource);
  }
  return commToPatientDoc(resource);
}

function docRefToPatientDoc(doc: DocumentReference): PatientDocument {
  const tag = getDocRefTag(doc);
  return {
    id: doc.id!,
    resourceType: 'DocumentReference',
    resource: doc,
    name: doc.description || doc.content?.[0]?.attachment?.title || 'Untitled Document',
    date: doc.date || doc.meta?.lastUpdated,
    tag: tag.label,
    tagColor: tag.color,
  };
}

function commToPatientDoc(comm: Communication): PatientDocument {
  const attachment = comm.payload?.find((p) => p.contentAttachment)?.contentAttachment;
  const originatingFaxNumber = comm.extension?.find(
    (ext) => ext.url === 'https://efax.com/originating-fax-number'
  )?.valueString;

  const name = attachment?.title || (originatingFaxNumber ? `Fax from ${originatingFaxNumber}` : 'Received Fax');

  return {
    id: comm.id!,
    resourceType: 'Communication',
    resource: comm,
    name,
    date: comm.sent || comm.meta?.lastUpdated,
    tag: 'Fax',
    tagColor: 'violet',
  };
}

function getDocRefTag(doc: DocumentReference): { label: string; color: string } {
  const typeDisplay = doc.type?.coding?.[0]?.display || doc.type?.text;
  const categoryDisplay = doc.category?.[0]?.coding?.[0]?.display || doc.category?.[0]?.text;

  if (typeDisplay) {
    if (typeDisplay.toLowerCase().includes('lab')) {
      return { label: 'Lab', color: 'cyan' };
    }
    if (typeDisplay.toLowerCase().includes('insurance')) {
      return { label: 'Insurance', color: 'orange' };
    }
    if (typeDisplay.toLowerCase().includes('prior auth')) {
      return { label: 'Prior Auth', color: 'yellow' };
    }
    if (typeDisplay.toLowerCase().includes('addendum')) {
      return { label: 'Addendum', color: 'teal' };
    }
    return { label: typeDisplay, color: 'gray' };
  }

  if (categoryDisplay) {
    return { label: categoryDisplay, color: 'gray' };
  }

  return { label: 'Document', color: 'blue' };
}

interface DocumentListItemProps {
  item: PatientDocument;
  selectedItem: PatientDocument | undefined;
  getItemUri: (item: PatientDocument) => string;
}

export function DocumentListItem({ item, selectedItem, getItemUri }: DocumentListItemProps): JSX.Element {
  const isSelected = selectedItem?.id === item.id;

  return (
    <MedplumLink to={getItemUri(item)} underline="never" display="block" className={classes.row}>
      <Group
        align="center"
        wrap="nowrap"
        className={cx(classes.contentContainer, {
          [classes.selected]: isSelected,
        })}
      >
        <Stack gap={0} flex={1}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Text fw={700} className={classes.title} flex={1}>
              {item.name}
            </Text>
            <Badge size="sm" color={item.tagColor} variant="light">
              {item.tag}
            </Badge>
          </Group>
          {item.date && (
            <Text size="sm" c="dimmed">
              {formatDate(item.date)}
            </Text>
          )}
        </Stack>
      </Group>
    </MedplumLink>
  );
}
