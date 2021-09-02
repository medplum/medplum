import { Attachment, Bundle, BundleEntry, Communication, Media, ProfileResource, Reference, Resource, SearchRequest, stringify } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';
import { Button } from './Button';
import { Form } from './Form';
import { Loading } from './Loading';
import { useMedplum } from './MedplumProvider';
import { ResourceDiff } from './ResourceDiff';
import './ResourceTimeline.css';
import { TextField } from './TextField';
import { Timeline, TimelineItem } from './Timeline';
import { UploadButton } from './UploadButton';
import { useResource } from './useResource';
import { sortBundleByDate, sortByDate } from './utils/format';

export interface ResourceTimelineProps {
  value: Resource | Reference;
  buildSearchRequests: (resource: Resource) => SearchRequest[];
  createCommunication?: (resource: Resource, sender: ProfileResource, text: string) => Communication;
  createMedia?: (resource: Resource, operator: ProfileResource, attachment: Attachment) => Media;
}

export const ResourceTimeline = (props: ResourceTimelineProps) => {
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
  function loadItems(): void {
    if (!resource) {
      setItems([]);
      return;
    }

    medplum.readHistory(resource.resourceType, resource.id as string).then(bundle => {
      sortBundleByDate(bundle); // Sort oldest to newest
      setHistory(bundle);
      addBundle(bundle);
    });

    props.buildSearchRequests(resource).forEach(searchRequest => {
      medplum.search(searchRequest).then(addBundle);
    });
  }

  /**
   * Adds a bundle of resources to the timeline.
   * @param bundle Bundle of new resources for the timeline.
   */
  function addBundle(bundle: Bundle): void {
    if (bundle.entry) {
      addResources(bundle.entry?.map(entry => entry.resource as Resource));
    }
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
    medplum.create(props.createCommunication(resource, sender, contentString))
      .then(result => {
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
    medplum.create(props.createMedia(resource, sender, attachment))
      .then(result => {
        addResources([result]);
      });
  }

  useEffect(() => {
    loadItems();
  }, [resource]);

  if (!resource || !history) {
    return <Loading />;
  }

  return (
    <Timeline>
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
            }}>
            <TextField id="text" testid="timeline-input" value="" inputRef={inputRef} />
            <Button type="submit">Comment</Button>
            <UploadButton onUpload={createMedia} />
          </Form>
        </div>
      </article>
      {items.map(item => {
        if (item.resourceType === resource.resourceType && item.id === resource.id) {
          return <HistoryTimelineItem key={item.meta?.versionId} history={history} version={item} />
        }
        switch (item.resourceType) {
          case 'Communication':
            return <CommunicationTimelineItem key={item.id} communication={item} />;
          case 'Media':
            return <MediaTimelineItem key={item.id} media={item} />;
        }
      })}
    </Timeline>
  );
};

interface HistoryTimelineItemProps {
  history: Bundle;
  version: Resource;
}

function HistoryTimelineItem(props: HistoryTimelineItemProps) {
  const previous = getPrevious(props.history, props.version);
  if (previous) {
    return (
      <TimelineItem resource={props.version} padding={true}>
        <ResourceDiff original={previous} revised={props.version} />
      </TimelineItem>
    );
  } else {
    return (
      <TimelineItem resource={props.version} padding={true}>
        <pre>{stringify(props.version, true)}</pre>
      </TimelineItem>
    );
  }
}

function getPrevious(history: Bundle, version: Resource): Resource | undefined {
  const entries = history.entry as BundleEntry[];
  const index = entries.findIndex(entry => entry.resource?.meta?.versionId === version.meta?.versionId);
  if (index === 0) {
    return undefined;
  }
  return entries[index - 1].resource;
}

interface CommunicationTimelineItemProps {
  communication: Communication;
}

function CommunicationTimelineItem(props: CommunicationTimelineItemProps) {
  return (
    <TimelineItem resource={props.communication} padding={true}>
      <p>{props.communication.payload?.[0]?.contentString}</p>
    </TimelineItem>
  );
}

interface MediaTimelineItemProps {
  media: Media;
}

function MediaTimelineItem(props: MediaTimelineItemProps) {
  return (
    <TimelineItem resource={props.media}>
      <AttachmentDisplay value={props.media.content} />
    </TimelineItem>
  );
}
