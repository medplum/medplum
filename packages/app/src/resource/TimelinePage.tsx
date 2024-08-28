import { Menu } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
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
  IconEdit,
  IconListDetails,
  IconPin,
  IconPinnedOff,
  IconRepeat,
  IconTextRecognition,
  IconTrash,
} from '@tabler/icons-react';
import { ReactNode, useState } from 'react';
import { useParams } from 'react-router-dom';
import { isAwsTextractEnabled } from '../config';
import { ResendSubscriptionsModal } from './ResendSubscriptionsModal';

export function TimelinePage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const reference = { reference: resourceType + '/' + id };
  const [resendSubscriptionsResource, setResendSubscriptionsResource] = useState<Resource | undefined>();
  const resendSubscriptiosnDisclosure = useDisclosure(false);

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

  function onResend(timelineItem: Resource): void {
    setResendSubscriptionsResource(timelineItem);
    resendSubscriptiosnDisclosure[1].open();
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

    const isProjectAdmin = medplum.getProjectMembership()?.admin;
    const canResend = isProjectAdmin;

    const showAwsAi =
      isAwsTextractEnabled() &&
      (currentResource.resourceType === 'DocumentReference' || currentResource.resourceType === 'Media');

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
        {isProjectAdmin && (
          <>
            <Menu.Divider />
            <Menu.Label>Admin</Menu.Label>
            {canResend && (
              <Menu.Item
                leftSection={<IconRepeat size={14} />}
                onClick={() => onResend(currentResource)}
                aria-label={`Resend Subscriptions ${getReferenceString(currentResource)}`}
              >
                Resend Subscriptions
              </Menu.Item>
            )}
          </>
        )}
        {showAwsAi && (
          <>
            <Menu.Divider />
            <Menu.Label>AWS AI</Menu.Label>
            <Menu.Item
              leftSection={<IconTextRecognition size={14} />}
              onClick={() => onAwsTextract(currentResource, reloadTimeline)}
              aria-label={`AWS Textract ${getReferenceString(currentResource)}`}
            >
              AWS Textract
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

  return (
    <>
      {resourceType === 'Encounter' && <EncounterTimeline encounter={reference} getMenu={getMenu} />}
      {resourceType === 'Patient' && <PatientTimeline patient={reference} getMenu={getMenu} />}
      {resourceType === 'ServiceRequest' && <ServiceRequestTimeline serviceRequest={reference} getMenu={getMenu} />}
      {resourceType !== 'Encounter' && resourceType !== 'Patient' && resourceType !== 'ServiceRequest' && (
        <DefaultResourceTimeline resource={reference} getMenu={getMenu} />
      )}
      <ResendSubscriptionsModal
        key={`resend-subscriptions-${resendSubscriptionsResource?.id}`}
        resource={resendSubscriptionsResource}
        opened={resendSubscriptiosnDisclosure[0]}
        onClose={resendSubscriptiosnDisclosure[1].close}
      />
    </>
  );
}
