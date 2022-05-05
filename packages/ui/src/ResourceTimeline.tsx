import { ProfileResource } from '@medplum/core';
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
import React, { useEffect, useRef, useState } from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';
import { Button } from './Button';
import { DiagnosticReportDisplay } from './DiagnosticReportDisplay';
import { Form } from './Form';
import { Input } from './Input';
import { Loading } from './Loading';
import { useMedplum } from './MedplumProvider';
import { ResourceDiffTable } from './ResourceDiffTable';
import { ResourceTable } from './ResourceTable';
import './ResourceTimeline.css';
import { Scrollable } from './Scrollable';
import { Timeline, TimelineItem } from './Timeline';
import { UploadButton } from './UploadButton';
import { useResource } from './useResource';
import { sortByDate } from './utils/date';

export interface ResourceTimelineProps<T extends Resource> {
  value: T | Reference<T>;
  buildSearchRequests: (resource: T) => Bundle;
  createCommunication?: (resource: T, sender: ProfileResource, text: string) => Communication;
  createMedia?: (resource: T, operator: ProfileResource, attachment: Attachment) => Media;
}

export function ResourceTimeline<T extends Resource>(props: ResourceTimelineProps<T>): JSX.Element {
  const medplum = useMedplum();
  const sender = medplum.getProfile() as ProfileResource;
  const inputRef = useRef<HTMLInputElement>(null);
  const resource = useResource(props.value);
  const [history, setHistory] = useState<Bundle>();
  const [items, setItems] = useState<Resource[]>([]);

  const itemsRef = useRef<Resource[]>(items);
  itemsRef.current = items;

  /**
   * Loads existing timeline resources.
   */
  useEffect(() => {
    if (!resource) {
      setItems([]);
      setHistory({} as Bundle);
      return;
    }

    const batchRequest = props.buildSearchRequests(resource);
    medplum.post('fhir/R4', batchRequest).then(handleBatchResponse);
  }, [medplum, props, resource]);

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

      sortByDate(newItems);
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
    sortByDate(newItems);
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
    medplum.createResource(props.createCommunication(resource, sender, contentString)).then((result) => {
      addResources([result]);
    });
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
    medplum.createResource(props.createMedia(resource, sender, attachment)).then((result) => {
      addResources([result]);
    });
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
          return <HistoryTimelineItem key={item.meta?.versionId} history={history} version={item} />;
        }
        const key = `${item.resourceType}/${item.id}`;
        switch (item.resourceType) {
          case 'AuditEvent':
            return <AuditEventTimelineItem key={key} auditEvent={item} />;
          case 'Communication':
            return <CommunicationTimelineItem key={key} communication={item} />;
          case 'DiagnosticReport':
            return <DiagnosticReportTimelineItem key={key} diagnosticReport={item} />;
          case 'Media':
            return <MediaTimelineItem key={key} media={item} />;
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

interface HistoryTimelineItemProps {
  history: Bundle;
  version: Resource;
}

function HistoryTimelineItem(props: HistoryTimelineItemProps): JSX.Element {
  const previous = getPrevious(props.history, props.version);
  if (previous) {
    return (
      <TimelineItem resource={props.version} padding={true}>
        <ResourceDiffTable original={previous} revised={props.version} />
      </TimelineItem>
    );
  } else {
    return (
      <TimelineItem resource={props.version} padding={true}>
        <h3>Created</h3>
        <ResourceTable value={props.version} ignoreMissingValues={true} />
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

interface CommunicationTimelineItemProps {
  communication: Communication;
}

function CommunicationTimelineItem(props: CommunicationTimelineItemProps): JSX.Element {
  return (
    <TimelineItem resource={props.communication} padding={true}>
      <p>{props.communication.payload?.[0]?.contentString}</p>
    </TimelineItem>
  );
}

interface MediaTimelineItemProps {
  media: Media;
}

function MediaTimelineItem(props: MediaTimelineItemProps): JSX.Element {
  const contentType = props.media.content?.contentType;
  const padding =
    contentType &&
    !contentType.startsWith('image/') &&
    !contentType.startsWith('video/') &&
    contentType !== 'application/pdf';
  return (
    <TimelineItem resource={props.media} padding={!!padding}>
      <AttachmentDisplay value={props.media.content} />
    </TimelineItem>
  );
}

interface AuditEventTimelineItemProps {
  auditEvent: AuditEvent;
}

function AuditEventTimelineItem(props: AuditEventTimelineItemProps): JSX.Element {
  return (
    <TimelineItem resource={props.auditEvent} padding={true}>
      <Scrollable>
        <pre>{props.auditEvent.outcomeDesc}</pre>
      </Scrollable>
    </TimelineItem>
  );
}

interface DiagnosticReportTimelineItemProps {
  diagnosticReport: DiagnosticReport;
}

function DiagnosticReportTimelineItem(props: DiagnosticReportTimelineItemProps): JSX.Element {
  return (
    <TimelineItem resource={props.diagnosticReport} padding={true}>
      <DiagnosticReportDisplay value={props.diagnosticReport} />
    </TimelineItem>
  );
}
