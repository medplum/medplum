// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Button, Group, ScrollArea, TextInput } from '@mantine/core';
import type { MedplumClient, ProfileResource } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  Attachment,
  AuditEvent,
  Bundle,
  Communication,
  DiagnosticReport,
  Media,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconCloudUpload, IconMessage } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AttachmentButton } from '../AttachmentButton/AttachmentButton';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import { DiagnosticReportDisplay } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { Form } from '../Form/Form';
import { Panel } from '../Panel/Panel';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceDiffTable } from '../ResourceDiffTable/ResourceDiffTable';
import { ResourceTable } from '../ResourceTable/ResourceTable';
import type { TimelineItemProps } from '../Timeline/Timeline';
import { Timeline, TimelineItem, TimelineItemSkeleton } from '../Timeline/Timeline';
import { sortByDateAndPriority } from '../utils/date';
import classes from './ResourceTimeline.module.css';

export interface ResourceTimelineMenuItemContext {
  readonly primaryResource: Resource;
  readonly currentResource: Resource;
  readonly reloadTimeline: () => void;
}

export interface ResourceTimelineProps<T extends Resource> {
  readonly value: T | Reference<T>;
  readonly loadTimelineResources: (
    medplum: MedplumClient,
    resourceType: ResourceType,
    id: string
  ) => Promise<PromiseSettledResult<Bundle>[]>;
  readonly createCommunication?: (resource: T, sender: ProfileResource, text: string) => Communication;
  readonly createMedia?: (resource: T, operator: ProfileResource, attachment: Attachment) => Media;
  readonly getMenu?: (context: ResourceTimelineMenuItemContext) => ReactNode;
}

export function ResourceTimeline<T extends Resource>(props: ResourceTimelineProps<T>): JSX.Element {
  const medplum = useMedplum();
  const sender = medplum.getProfile() as ProfileResource;
  const inputRef = useRef<HTMLInputElement>(null);
  const resource = useResource(props.value);
  const [history, setHistory] = useState<Bundle>();
  const [items, setItems] = useState<Resource[]>([]);
  const [countToShow, setCountToShow] = useState(10);
  const [loading, setLoading] = useState(true);
  const loadTimelineResources = props.loadTimelineResources;

  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  });

  const sortAndSetItems = useCallback(
    (newItems: Resource[]): void => {
      sortByDateAndPriority(newItems, resource);
      newItems.reverse();
      setItems(newItems);
    },
    [resource]
  );

  const handleBatchResponse = useCallback(
    (batchResponse: PromiseSettledResult<Bundle>[]): void => {
      const newItems: Resource[] = [];

      for (const settledResult of batchResponse) {
        if (settledResult.status !== 'fulfilled') {
          continue;
        }

        const bundle = settledResult.value;
        if (bundle.type === 'history') {
          setHistory(bundle);
        }

        if (bundle.entry) {
          for (const entry of bundle.entry) {
            newItems.push(entry.resource as Resource);
          }
        }
      }

      sortAndSetItems(newItems);
      setLoading(false);
    },
    [sortAndSetItems]
  );

  const addResource = useCallback(
    (resource: Resource): void => sortAndSetItems([...itemsRef.current, resource]),
    [sortAndSetItems]
  );

  const loadTimeline = useCallback(() => {
    let resourceType: ResourceType;
    let id: string;
    if ('resourceType' in props.value) {
      resourceType = props.value.resourceType;
      id = props.value.id as string;
    } else {
      [resourceType, id] = props.value.reference?.split('/') as [ResourceType, string];
    }
    loadTimelineResources(medplum, resourceType, id)
      .then(handleBatchResponse)
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [medplum, props.value, loadTimelineResources, handleBatchResponse]);

  useEffect(() => loadTimeline(), [loadTimeline]);

  function createComment(contentString: string): void {
    if (!resource || !props.createCommunication) {
      return;
    }
    medplum
      .createResource(props.createCommunication(resource, sender, contentString))
      .then((result) => addResource(result))
      .catch(console.error);
  }

  function createMedia(attachment: Attachment): void {
    if (!resource || !props.createMedia) {
      return;
    }
    medplum
      .createResource(props.createMedia(resource, sender, attachment))
      .then((result) => addResource(result))
      .catch(console.error);
  }

  if (!resource) {
    return (
      <Timeline>
        <TimelineSkeletonItems />
      </Timeline>
    );
  }

  const itemsToShow = items.filter((item) => item).slice(0, countToShow);

  return (
    <Timeline>
      {props.createCommunication && (
        <Panel>
          <Form
            testid="timeline-form"
            onSubmit={(formData: Record<string, string>) => {
              createComment(formData.text);

              const input = inputRef.current;
              if (input) {
                input.value = '';
                input.focus();
              }
            }}
          >
            <Group gap="xs" wrap="nowrap" style={{ width: '100%' }}>
              <ResourceAvatar value={sender} />
              <TextInput
                name="text"
                ref={inputRef}
                placeholder="Add comment"
                style={{ width: '100%', maxWidth: 300 }}
              />
              <ActionIcon type="submit" radius="xl" color="blue" variant="filled">
                <IconMessage size={16} />
              </ActionIcon>
              <AttachmentButton securityContext={createReference(resource)} onUpload={createMedia}>
                {(props) => (
                  <ActionIcon {...props} radius="xl" color="blue" variant="filled">
                    <IconCloudUpload size={16} />
                  </ActionIcon>
                )}
              </AttachmentButton>
            </Group>
          </Form>
        </Panel>
      )}
      {loading && items.length === 0 && <TimelineSkeletonItems />}
      {itemsToShow.map((item) => {
        const key = `${item.resourceType}/${item.id}/${item.meta?.versionId}`;
        const menu = props.getMenu
          ? props.getMenu({
              primaryResource: resource,
              currentResource: item,
              reloadTimeline: loadTimeline,
            })
          : undefined;
        if (item.resourceType === resource.resourceType && item.id === resource.id) {
          return <HistoryTimelineItem key={key} history={history as Bundle} resource={item} popupMenuItems={menu} />;
        }
        switch (item.resourceType) {
          case 'AuditEvent':
            return <AuditEventTimelineItem key={key} resource={item} popupMenuItems={menu} />;
          case 'Communication':
            return <CommunicationTimelineItem key={key} resource={item} popupMenuItems={menu} />;
          case 'DiagnosticReport':
            return <DiagnosticReportTimelineItem key={key} resource={item} popupMenuItems={menu} />;
          case 'Media':
            return <MediaTimelineItem key={key} resource={item} popupMenuItems={menu} />;
          default:
            return (
              <TimelineItem key={key} resource={item} padding={true}>
                <ResourceTable value={item} ignoreMissingValues={true} />
              </TimelineItem>
            );
        }
      })}
      {countToShow < items.length && (
        <Group justify="center" pb="lg">
          <Button onClick={() => setCountToShow(countToShow + 10)}>Show More</Button>
        </Group>
      )}
    </Timeline>
  );
}

function TimelineSkeletonItems(): JSX.Element {
  return (
    <>
      <TimelineItemSkeleton lines={3} />
      <TimelineItemSkeleton lines={6} />
      <TimelineItemSkeleton lines={4} />
    </>
  );
}

interface HistoryTimelineItemProps extends TimelineItemProps {
  readonly history: Bundle;
}

function HistoryTimelineItem(props: HistoryTimelineItemProps): JSX.Element {
  const { history, resource, ...rest } = props;
  const previous = getPrevious(history, resource);
  if (previous) {
    return (
      <TimelineItem resource={resource} padding={true} {...rest}>
        <ResourceDiffTable original={previous} revised={props.resource} />
      </TimelineItem>
    );
  } else {
    return (
      <TimelineItem resource={resource} padding={true} {...rest}>
        <h3>Created</h3>
        <ResourceTable value={resource} ignoreMissingValues forceUseInput />
      </TimelineItem>
    );
  }
}

function getPrevious(history: Bundle, version: Resource): Resource | undefined {
  const entries = history.entry ?? [];
  const index = entries.findIndex((entry) => entry.resource?.meta?.versionId === version.meta?.versionId);
  if (index >= entries.length - 1) {
    return undefined;
  }
  return entries[index + 1].resource;
}

function CommunicationTimelineItem(props: TimelineItemProps<Communication>): JSX.Element {
  const routine = !props.resource.priority || props.resource.priority === 'routine';
  const className = routine ? undefined : classes.pinnedComment;
  return (
    <TimelineItem
      resource={props.resource}
      profile={props.resource.sender}
      dateTime={props.resource.sent}
      padding={true}
      className={className}
      popupMenuItems={props.popupMenuItems}
    >
      <p>{props.resource.payload?.[0]?.contentString}</p>
    </TimelineItem>
  );
}

function MediaTimelineItem(props: TimelineItemProps<Media>): JSX.Element {
  const contentType = props.resource.content?.contentType;
  const padding =
    contentType &&
    !contentType.startsWith('image/') &&
    !contentType.startsWith('video/') &&
    contentType !== 'application/pdf';
  return (
    <TimelineItem resource={props.resource} padding={!!padding} popupMenuItems={props.popupMenuItems}>
      <AttachmentDisplay value={props.resource.content} />
    </TimelineItem>
  );
}

function AuditEventTimelineItem(props: TimelineItemProps<AuditEvent>): JSX.Element {
  return (
    <TimelineItem resource={props.resource} padding={true} popupMenuItems={props.popupMenuItems}>
      <ScrollArea>
        <pre>{props.resource.outcomeDesc}</pre>
      </ScrollArea>
    </TimelineItem>
  );
}

function DiagnosticReportTimelineItem(props: TimelineItemProps<DiagnosticReport>): JSX.Element {
  return (
    <TimelineItem resource={props.resource} padding={true} popupMenuItems={props.popupMenuItems}>
      <DiagnosticReportDisplay value={props.resource} />
    </TimelineItem>
  );
}
