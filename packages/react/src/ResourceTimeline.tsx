import { getReferenceString, ProfileResource } from '@medplum/core';
import {
  Attachment,
  AuditEvent,
  Bundle,
  BundleEntry,
  Communication,
  DiagnosticReport,
  Media,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AttachmentDisplay } from './AttachmentDisplay';
import { Button } from './Button';
import { DiagnosticReportDisplay } from './DiagnosticReportDisplay';
import { Form } from './Form';
import { Input } from './Input';
import { Loading } from './Loading';
import { useMedplum } from './MedplumProvider';
import { MenuItem } from './MenuItem';
import { ResourceDiffTable } from './ResourceDiffTable';
import { ResourceTable } from './ResourceTable';
import { Scrollable } from './Scrollable';
import { Timeline, TimelineItem } from './Timeline';
import { UploadButton } from './UploadButton';
import { useResource } from './useResource';
import { sortByDateAndPriority } from './utils/date';
import './ResourceTimeline.css';

export interface ResourceTimelineProps<T extends Resource> {
  value: T | Reference<T>;
  buildSearchRequests: (resource: T) => Bundle;
  createCommunication?: (resource: T, sender: ProfileResource, text: string) => Communication;
  createMedia?: (resource: T, operator: ProfileResource, attachment: Attachment) => Media;
}

export function ResourceTimeline<T extends Resource>(props: ResourceTimelineProps<T>): JSX.Element {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const sender = medplum.getProfile() as ProfileResource;
  const inputRef = useRef<HTMLInputElement>(null);
  const resource = useResource(props.value);
  const [history, setHistory] = useState<Bundle>();
  const [items, setItems] = useState<Resource[]>([]);
  const buildSearchRequests = props.buildSearchRequests;

  const itemsRef = useRef<Resource[]>(items);
  itemsRef.current = items;

  const loadTimeline = useCallback(() => {
    if (!resource) {
      setItems([]);
      setHistory({} as Bundle);
      return;
    }
    medplum.executeBatch(buildSearchRequests(resource)).then(handleBatchResponse).catch(console.log);
  }, [medplum, resource, buildSearchRequests]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  /**
   * Handles a batch request response.
   * @param batchResponse The batch response.
   */
  function handleBatchResponse(batchResponse: Bundle): void {
    const newItems = [];

    if (batchResponse.entry) {
      for (const batchEntry of batchResponse.entry) {
        const bundle = batchEntry.resource as Bundle;
        if (!bundle) {
          // User may not have access to all resource types
          continue;
        }

        if (bundle.type === 'history') {
          setHistory(bundle);
        }

        if (bundle.entry) {
          for (const entry of bundle.entry) {
            newItems.push(entry.resource as Resource);
          }
        }
      }

      sortByDateAndPriority(newItems);
      newItems.reverse();
    }

    setItems(newItems);
  }

  /**
   * Adds an array of resources to the timeline.
   * @param resources Array of resources.
   */
  function addResources(resources: Resource[]): void {
    const newItems = [...itemsRef.current, ...resources];
    sortByDateAndPriority(newItems);
    newItems.reverse();
    setItems(newItems);
  }

  /**
   * Adds a Communication resource to the timeline.
   * @param contentString The comment content.
   */
  function createComment(contentString: string): void {
    if (!resource || !props.createCommunication) {
      // Encounter not loaded yet
      return;
    }
    medplum
      .createResource(props.createCommunication(resource, sender, contentString))
      .then((result) => {
        addResources([result]);
      })
      .catch(console.log);
  }

  /**
   * Adds a Media resource to the timeline.
   * @param attachment The media attachment.
   */
  function createMedia(attachment: Attachment): void {
    if (!resource || !props.createMedia) {
      // Encounter not loaded yet
      return;
    }
    medplum
      .createResource(props.createMedia(resource, sender, attachment))
      .then((result) => {
        addResources([result]);
      })
      .catch(console.log);
  }

  function setPriority(communication: Communication, priority: string): Promise<Communication> {
    return medplum.updateResource({ ...communication, priority });
  }

  function onPin(communication: Communication): void {
    setPriority(communication, 'stat').then(loadTimeline).catch(console.log);
  }

  function onUnpin(communication: Communication): void {
    setPriority(communication, 'routine').then(loadTimeline).catch(console.log);
  }

  function onDetails(timelineItem: Resource): void {
    navigate(`/${timelineItem.resourceType}/${timelineItem.id}`);
  }

  function onEdit(timelineItem: Resource): void {
    navigate(`/${timelineItem.resourceType}/${timelineItem.id}/edit`);
  }

  function onDelete(timelineItem: Resource): void {
    navigate(`/${timelineItem.resourceType}/${timelineItem.id}/delete`);
  }

  function onVersionDetails(version: Resource): void {
    navigate(`/${version.resourceType}/${version.id}/_history/${version.meta?.versionId}`);
  }

  if (!resource || !history) {
    return <Loading />;
  }

  return (
    <Timeline>
      {props.createCommunication && (
        <article className="medplum-timeline-item">
          <div className="medplum-timeline-item-header">
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
              <Input name="text" testid="timeline-input" inputRef={inputRef} />
              <Button type="submit">Comment</Button>
              <UploadButton onUpload={createMedia} />
            </Form>
          </div>
        </article>
      )}
      {items.map((item) => {
        if (item.resourceType === resource.resourceType && item.id === resource.id) {
          return (
            <HistoryTimelineItem
              key={item.meta?.versionId}
              history={history}
              resource={item}
              onDetails={onVersionDetails}
            />
          );
        }
        const key = `${item.resourceType}/${item.id}`;
        switch (item.resourceType) {
          case 'AuditEvent':
            return <AuditEventTimelineItem key={key} resource={item} onDetails={onDetails} />;
          case 'Communication':
            return (
              <CommunicationTimelineItem
                key={key}
                resource={item}
                onPin={item.priority !== 'stat' ? onPin : undefined}
                onUnpin={item.priority === 'stat' ? onUnpin : undefined}
                onDetails={onDetails}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          case 'DiagnosticReport':
            return (
              <DiagnosticReportTimelineItem
                key={key}
                resource={item}
                onDetails={onDetails}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            );
          case 'Media':
            return (
              <MediaTimelineItem key={key} resource={item} onDetails={onDetails} onEdit={onEdit} onDelete={onDelete} />
            );
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

interface BaseTimelineItemProps<T extends Resource> {
  resource: T;
  onPin?: (resource: T) => void;
  onUnpin?: (resource: T) => void;
  onDetails?: (resource: T) => void;
  onEdit?: (resource: T) => void;
  onDelete?: (resource: T) => void;
}

function TimelineItemPopupMenu<T extends Resource>(props: BaseTimelineItemProps<T>): JSX.Element {
  return (
    <>
      {props.onPin && (
        <MenuItem
          onClick={() => (props.onPin as (resource: T) => void)(props.resource)}
          label={`Pin ${getReferenceString(props.resource)}`}
        >
          Pin
        </MenuItem>
      )}
      {props.onUnpin && (
        <MenuItem
          onClick={() => (props.onUnpin as (resource: T) => void)(props.resource)}
          label={`Unpin ${getReferenceString(props.resource)}`}
        >
          Unpin
        </MenuItem>
      )}
      {props.onDetails && (
        <MenuItem
          onClick={() => (props.onDetails as (resource: T) => void)(props.resource)}
          label={`Details ${getReferenceString(props.resource)}`}
        >
          Details
        </MenuItem>
      )}
      {props.onEdit && (
        <MenuItem
          onClick={() => (props.onEdit as (resource: T) => void)(props.resource)}
          label={`Edit ${getReferenceString(props.resource)}`}
        >
          Edit
        </MenuItem>
      )}
      {props.onDelete && (
        <MenuItem
          onClick={() => (props.onDelete as (resource: T) => void)(props.resource)}
          label={`Delete ${getReferenceString(props.resource)}`}
        >
          Delete
        </MenuItem>
      )}
    </>
  );
}

interface HistoryTimelineItemProps extends BaseTimelineItemProps<Resource> {
  history: Bundle;
}

function HistoryTimelineItem(props: HistoryTimelineItemProps): JSX.Element {
  const previous = getPrevious(props.history, props.resource);
  if (previous) {
    return (
      <TimelineItem resource={props.resource} padding={true} popupMenuItems={<TimelineItemPopupMenu {...props} />}>
        <ResourceDiffTable original={previous} revised={props.resource} />
      </TimelineItem>
    );
  } else {
    return (
      <TimelineItem resource={props.resource} padding={true} popupMenuItems={<TimelineItemPopupMenu {...props} />}>
        <h3>Created</h3>
        <ResourceTable value={props.resource} ignoreMissingValues={true} />
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

function CommunicationTimelineItem(props: BaseTimelineItemProps<Communication>): JSX.Element {
  const routine = !props.resource.priority || props.resource.priority === 'routine';
  const className = routine ? 'medplum-timeline-item' : 'medplum-timeline-item medplum-timeline-item-pinned';
  return (
    <TimelineItem
      resource={props.resource}
      profile={props.resource.sender}
      padding={true}
      className={className}
      popupMenuItems={<TimelineItemPopupMenu {...props} />}
    >
      <p>{props.resource.payload?.[0]?.contentString}</p>
    </TimelineItem>
  );
}

function MediaTimelineItem(props: BaseTimelineItemProps<Media>): JSX.Element {
  const contentType = props.resource.content?.contentType;
  const padding =
    contentType &&
    !contentType.startsWith('image/') &&
    !contentType.startsWith('video/') &&
    contentType !== 'application/pdf';
  return (
    <TimelineItem resource={props.resource} padding={!!padding} popupMenuItems={<TimelineItemPopupMenu {...props} />}>
      <AttachmentDisplay value={props.resource.content} />
    </TimelineItem>
  );
}

function AuditEventTimelineItem(props: BaseTimelineItemProps<AuditEvent>): JSX.Element {
  return (
    <TimelineItem resource={props.resource} padding={true} popupMenuItems={<TimelineItemPopupMenu {...props} />}>
      <Scrollable>
        <pre>{props.resource.outcomeDesc}</pre>
      </Scrollable>
    </TimelineItem>
  );
}

function DiagnosticReportTimelineItem(props: BaseTimelineItemProps<DiagnosticReport>): JSX.Element {
  return (
    <TimelineItem resource={props.resource} padding={true} popupMenuItems={<TimelineItemPopupMenu {...props} />}>
      <DiagnosticReportDisplay value={props.resource} />
    </TimelineItem>
  );
}
