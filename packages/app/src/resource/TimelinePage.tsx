import { Menu } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Communication, Resource, ResourceType } from '@medplum/fhirtypes';
import {
  DefaultResourceTimeline,
  EncounterTimeline,
  PatientTimeline,
  ResourceTimelineMenuItemContext,
  ServiceRequestTimeline,
  useMedplum,
  useMedplumNavigate,
} from '@medplum/react';
import {
  IconBrain,
  IconEdit,
  IconListDetails,
  IconPin,
  IconPinnedOff,
  IconTextRecognition,
  IconTrash,
} from '@tabler/icons-react';
import { ReactNode } from 'react';
import { useParams } from 'react-router-dom';

export function TimelinePage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const reference = { reference: resourceType + '/' + id };

  function setPriority(
    communication: Communication,
    priority: 'routine' | 'urgent' | 'asap' | 'stat'
  ): Promise<Communication> {
    return medplum.updateResource({ ...communication, priority });
  }

  function onPin(communication: Communication, reloadTimeline: () => void): void {
    setPriority(communication, 'stat').then(reloadTimeline).catch(console.error);
  }

  function onUnpin(communication: Communication, reloadTimeline: () => void): void {
    setPriority(communication, 'routine').then(reloadTimeline).catch(console.error);
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

  function onAwsTextract(resource: Resource, reloadTimeline: () => void): void {
    medplum
      .post(medplum.fhirUrl(resource.resourceType, resource.id as string, '$aws-textract'), {})
      .then(reloadTimeline)
      .catch(console.error);
  }

  function onAwsComprehend(resource: Resource, reloadTimeline: () => void): void {
    medplum
      .post(medplum.fhirUrl(resource.resourceType, resource.id as string, '$aws-comprehend'), {})
      .then(reloadTimeline)
      .catch(console.error);
  }

  function getMenu(context: ResourceTimelineMenuItemContext): ReactNode {
    const { primaryResource, currentResource, reloadTimeline } = context;

    const isHistoryResource =
      currentResource.resourceType === primaryResource.resourceType && currentResource.id === primaryResource.id;

    const canPin = currentResource.resourceType === 'Communication' && currentResource.priority !== 'stat';
    const canUnpin = currentResource.resourceType === 'Communication' && currentResource.priority === 'stat';

    const showVersionDetails = isHistoryResource;
    const showDetails = !isHistoryResource;

    const canEdit = !isHistoryResource;
    const canDelete = !isHistoryResource;

    const showAwsAi = currentResource.resourceType === 'DocumentReference' || currentResource.resourceType === 'Media';

    return (
      <Menu.Dropdown>
        <Menu.Label>Resource</Menu.Label>
        {canPin && (
          <Menu.Item
            leftSection={<IconPin size={14} />}
            onClick={() => onPin(currentResource, reloadTimeline)}
            aria-label={`Pin ${getReferenceString(currentResource)}`}
          >
            Pin
          </Menu.Item>
        )}
        {canUnpin && (
          <Menu.Item
            leftSection={<IconPinnedOff size={14} />}
            onClick={() => onUnpin(currentResource, reloadTimeline)}
            aria-label={`Unpin ${getReferenceString(currentResource)}`}
          >
            Unpin
          </Menu.Item>
        )}
        {showDetails && (
          <Menu.Item
            leftSection={<IconListDetails size={14} />}
            onClick={() => onDetails(currentResource)}
            aria-label={`Details ${getReferenceString(currentResource)}`}
          >
            Details
          </Menu.Item>
        )}
        {showVersionDetails && (
          <Menu.Item
            leftSection={<IconListDetails size={14} />}
            onClick={() => onVersionDetails(currentResource)}
            aria-label={`Details ${getReferenceString(currentResource)}`}
          >
            Details
          </Menu.Item>
        )}
        {canEdit && (
          <Menu.Item
            leftSection={<IconEdit size={14} />}
            onClick={() => onEdit(currentResource)}
            aria-label={`Edit ${getReferenceString(currentResource)}`}
          >
            Edit
          </Menu.Item>
        )}
        {showAwsAi && (
          <>
            <Menu.Divider />
            <Menu.Label>AI</Menu.Label>
            <Menu.Item
              leftSection={<IconTextRecognition size={14} />}
              onClick={() => onAwsTextract(currentResource, reloadTimeline)}
              aria-label={`AWS Textract ${getReferenceString(currentResource)}`}
            >
              AWS Textract
            </Menu.Item>
            <Menu.Item
              leftSection={<IconBrain size={14} />}
              onClick={() => onAwsComprehend(currentResource, reloadTimeline)}
              aria-label={`AWS Comprehend ${getReferenceString(currentResource)}`}
            >
              AWS Comprehend
            </Menu.Item>
          </>
        )}
        {canDelete && (
          <>
            <Menu.Divider />
            <Menu.Label>Danger zone</Menu.Label>
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => onDelete(currentResource)}
              aria-label={`Delete ${getReferenceString(currentResource)}`}
            >
              Delete
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    );
  }

  switch (resourceType) {
    case 'Encounter':
      return <EncounterTimeline encounter={reference} getMenu={getMenu} />;
    case 'Patient':
      return <PatientTimeline patient={reference} getMenu={getMenu} />;
    case 'ServiceRequest':
      return <ServiceRequestTimeline serviceRequest={reference} getMenu={getMenu} />;
    default:
      return <DefaultResourceTimeline resource={reference} getMenu={getMenu} />;
  }
}
