import { Attachment, Bundle, Communication, createReference, Encounter, getReferenceString, Media, Operator, Reference, Resource } from '@medplum/core';
import React, { useEffect, useRef, useState } from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';
import { Button } from './Button';
import { parseForm } from './FormUtils';
import { Loading } from './Loading';
import { useMedplum } from './MedplumProvider';
import { TextField } from './TextField';
import { Timeline, TimelineItem } from './Timeline';
import { UploadButton } from './UploadButton';
import { sortByDate } from './utils/format';

export interface EncounterTimelineProps {
  resource?: Encounter;
  reference?: Reference;
}

export const EncounterTimeline = (props: EncounterTimelineProps) => {
  const medplum = useMedplum();
  const sender = medplum.getProfile();
  const senderRef = sender ? createReference(sender) : undefined;
  const inputRef = useRef<HTMLInputElement>(null);
  const [resource, setResource] = useState<Encounter | undefined>(props.resource);
  const [items, setItems] = useState<Resource[]>([]);

  const itemsRef = useRef<Resource[]>(items);
  itemsRef.current = items;

  /**
   * Loads existing timeline resources for the encounter.
   * @param resource The encounter resource.
   */
  function loadItems(resource: Encounter | undefined): void {
    if (!resource) {
      setItems([]);
      return;
    }

    // Load comments
    medplum.search({
      resourceType: 'Communication',
      filters: [{
        code: 'encounter',
        operator: Operator.EQUALS,
        value: getReferenceString(resource)
      }],
      count: 100
    }).then(addBundle);

    // Load media
    medplum.search({
      resourceType: 'Media',
      filters: [{
        code: 'encounter',
        operator: Operator.EQUALS,
        value: getReferenceString(resource)
      }],
      count: 100
    }).then(addBundle);
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
    if (!resource) {
      // Encounter not loaded yet
      return;
    }
    medplum.create({
      resourceType: 'Communication',
      encounter: createReference(resource),
      subject: {
        reference: 'Patient/017acf55-bcc1-8a9c-6084-17af24c5a389'
      },
      sender: senderRef,
      payload: [{ contentString }]
    }).then(result => {
      addResources([result]);
    });
  }

  /**
   * Adds a Media resource to the timeline.
   * @param attachment The media attachment.
   */
  function createMedia(attachment: Attachment): void {
    if (!resource) {
      // Encounter not loaded yet
      return;
    }
    medplum.create({
      resourceType: 'Media',
      encounter: createReference(resource),
      subject: {
        reference: 'Patient/017acf55-bcc1-8a9c-6084-17af24c5a389'
      },
      operator: senderRef,
      content: attachment
    }).then(result => {
      addResources([result]);
    });
  }

  useEffect(() => {
    if (props.reference) {
      setResource(undefined);
      setItems([]);
      medplum.readReference(props.reference).then(resource => setResource(resource as Encounter));
    }
  }, [props.reference]);

  useEffect(() => {
    loadItems(resource);
  }, [resource]);

  if (!resource) {
    return <Loading />;
  }

  return (
    <Timeline>
      <article className="medplum-timeline-item">
        <div className="medplum-timeline-item-header">
          <form
            data-testid="timeline-form"
            onSubmit={(e: React.SyntheticEvent) => {
              e.preventDefault();

              const formData = parseForm(e.target as HTMLFormElement);
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
          </form>
        </div>
      </article>
      {items.map(item => {
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

interface CommunicationTimelineItemProps {
  communication: Communication;
}

function CommunicationTimelineItem(props: CommunicationTimelineItemProps) {
  return (
    <TimelineItem resource={props.communication}>
      <div style={{ padding: '2px 16px' }}>
        <p>{props.communication.payload?.[0]?.contentString}</p>
      </div>
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
