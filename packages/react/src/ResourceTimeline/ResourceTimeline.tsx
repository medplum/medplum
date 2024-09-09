import { ActionIcon, Center, Group, Loader, ScrollArea, TextInput } from '@mantine/core';
import { showNotification, updateNotification } from '@mantine/notifications';
import { MedplumClient, ProfileResource, createReference, normalizeErrorString } from '@medplum/core';
import {
  Attachment,
  AuditEvent,
  Bundle,
  BundleEntry,
  Communication,
  DiagnosticReport,
  Media,
  OperationOutcome,
  Reference,
  Resource,
  ResourceType,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { IconCheck, IconCloudUpload, IconFileAlert, IconMessage } from '@tabler/icons-react';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { AttachmentButton } from '../AttachmentButton/AttachmentButton';
import { AttachmentDisplay } from '../AttachmentDisplay/AttachmentDisplay';
import { DiagnosticReportDisplay } from '../DiagnosticReportDisplay/DiagnosticReportDisplay';
import { Form } from '../Form/Form';
import { Panel } from '../Panel/Panel';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';
import { ResourceDiffTable } from '../ResourceDiffTable/ResourceDiffTable';
import { ResourceTable } from '../ResourceTable/ResourceTable';
import { Timeline, TimelineItem, TimelineItemProps } from '../Timeline/Timeline';
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
  const loadTimelineResources = props.loadTimelineResources;

  const itemsRef = useRef<Resource[]>(items);
  itemsRef.current = items;

  /**
   * Sorts and sets the items.
   *
   * Sorting is primarily a function of meta.lastUpdated, but there are special cases.
   * When displaying connected resources, for example a Communication in the context of an Encounter,
   * the Communication.sent time is used rather than Communication.meta.lastUpdated.
   *
   * Other examples of special cases:
   * - DiagnosticReport.issued
   * - Media.issued
   * - Observation.issued
   * - DocumentReference.date
   *
   * See "sortByDateAndPriority()" for more details.
   */
  const sortAndSetItems = useCallback(
    (newItems: Resource[]): void => {
      sortByDateAndPriority(newItems, resource);
      newItems.reverse();
      setItems(newItems);
    },
    [resource]
  );

  /**
   * Handles a batch request response.
   * @param batchResponse - The batch response.
   */
  const handleBatchResponse = useCallback(
    (batchResponse: PromiseSettledResult<Bundle>[]): void => {
      const newItems = [];

      for (const settledResult of batchResponse) {
        if (settledResult.status !== 'fulfilled') {
          // User may not have access to all resource types
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
    },
    [sortAndSetItems]
  );

  /**
   * Adds an array of resources to the timeline.
   * @param resource - Resource to add.
   */
  const addResource = useCallback(
    (resource: Resource): void => sortAndSetItems([...itemsRef.current, resource]),
    [sortAndSetItems]
  );

  /**
   * Loads the timeline.
   */
  const loadTimeline = useCallback(() => {
    let resourceType: ResourceType;
    let id: string;
    if ('resourceType' in props.value) {
      resourceType = props.value.resourceType;
      id = props.value.id as string;
    } else {
      [resourceType, id] = props.value.reference?.split('/') as [ResourceType, string];
    }
    loadTimelineResources(medplum, resourceType, id).then(handleBatchResponse).catch(console.error);
  }, [medplum, props.value, loadTimelineResources, handleBatchResponse]);

  useEffect(() => loadTimeline(), [loadTimeline]);

  /**
   * Adds a Communication resource to the timeline.
   * @param contentString - The comment content.
   */
  function createComment(contentString: string): void {
    if (!resource || !props.createCommunication) {
      // Encounter not loaded yet
      return;
    }
    medplum
      .createResource(props.createCommunication(resource, sender, contentString))
      .then((result) => addResource(result))
      .catch(console.error);
  }

  /**
   * Adds a Media resource to the timeline.
   * @param attachment - The media attachment.
   */
  function createMedia(attachment: Attachment): void {
    if (!resource || !props.createMedia) {
      // Encounter not loaded yet
      return;
    }
    medplum
      .createResource(props.createMedia(resource, sender, attachment))
      .then((result) => addResource(result))
      .then(() =>
        updateNotification({
          id: 'upload-notification',
          color: 'teal',
          title: 'Upload complete',
          message: '',
          icon: <IconCheck size={16} />,
          autoClose: 2000,
        })
      )
      .catch((reason) =>
        updateNotification({
          id: 'upload-notification',
          color: 'red',
          title: 'Upload error',
          message: normalizeErrorString(reason),
          icon: <IconFileAlert size={16} />,
          autoClose: 2000,
        })
      );
  }

  function onUploadStart(): void {
    showNotification({
      id: 'upload-notification',
      loading: true,
      title: 'Initializing upload...',
      message: 'Please wait...',
      autoClose: false,
      withCloseButton: false,
    });
  }

  function onUploadProgress(e: ProgressEvent): void {
    updateNotification({
      id: 'upload-notification',
      loading: true,
      title: 'Uploading...',
      message: getProgressMessage(e),
      autoClose: false,
      withCloseButton: false,
    });
  }

  function onUploadError(outcome: OperationOutcome): void {
    updateNotification({
      id: 'upload-notification',
      color: 'red',
      title: 'Upload error',
      message: normalizeErrorString(outcome),
      icon: <IconFileAlert size={16} />,
      autoClose: 2000,
    });
  }

  if (!resource) {
    return (
      <Center style={{ width: '100%', height: '100%' }}>
        <Loader />
      </Center>
    );
  }

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
              <AttachmentButton
                securityContext={createReference(resource)}
                onUpload={createMedia}
                onUploadStart={onUploadStart}
                onUploadProgress={onUploadProgress}
                onUploadError={onUploadError}
              >
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
      {items.map((item) => {
        if (!item) {
          // TODO: Handle null history items for deleted versions.
          return null;
        }
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
    </Timeline>
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
  const entries = history.entry as BundleEntry[];
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

function getProgressMessage(e: ProgressEvent): string {
  if (e.lengthComputable) {
    const percent = (100 * e.loaded) / e.total;
    return `Uploaded: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)} ${percent.toFixed(2)}%`;
  }
  return `Uploaded: ${formatFileSize(e.loaded)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0.00 B';
  }
  const e = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, e)).toFixed(2) + ' ' + ' KMGTP'.charAt(e) + 'B';
}
