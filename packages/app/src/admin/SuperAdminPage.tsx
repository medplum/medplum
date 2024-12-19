import { Button, Divider, Modal, NativeSelect, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { MedplumClient, MedplumRequestOptions, forbidden, normalizeErrorString } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import {
  DateTimeInput,
  Document,
  Form,
  FormSection,
  OperationOutcomeAlert,
  convertLocalToIso,
  useMedplum,
} from '@medplum/react';
import { IconCheck, IconX } from '@tabler/icons-react';
import { ReactNode, useState } from 'react';

export function SuperAdminPage(): JSX.Element {
  const medplum = useMedplum();
  const [opened, { open, close }] = useDisclosure(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState<ReactNode | undefined>();

  if (!medplum.isLoading() && !medplum.isSuperAdmin()) {
    return <OperationOutcomeAlert outcome={forbidden} />;
  }

  function rebuildStructureDefinitions(): void {
    startAsyncJob(medplum, 'Rebuilding Structure Definitions', 'admin/super/structuredefinitions');
  }

  function rebuildSearchParameters(): void {
    startAsyncJob(medplum, 'Rebuilding Search Parameters', 'admin/super/searchparameters');
  }

  function rebuildValueSets(): void {
    startAsyncJob(medplum, 'Rebuilding Value Sets', 'admin/super/valuesets');
  }

  function reindexResourceType(formData: Record<string, string>): void {
    startAsyncJob(medplum, 'Reindexing Resources', 'admin/super/reindex', { body: formData, cancellable: true });
  }

  function removeBotIdJobsFromQueue(formData: Record<string, string>): void {
    medplum
      .post('admin/super/removebotidjobsfromqueue', formData)
      .then(() => notifications.show({ color: 'green', message: 'Done' }))
      .catch((err) => notifications.show({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function purgeResources(formData: Record<string, string>): void {
    medplum
      .post('admin/super/purge', { ...formData, before: convertLocalToIso(formData.before) })
      .then(() => notifications.show({ color: 'green', message: 'Done' }))
      .catch((err) => notifications.show({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function forceSetPassword(formData: Record<string, string>): void {
    medplum
      .post('admin/super/setpassword', formData)
      .then(() => notifications.show({ color: 'green', message: 'Done' }))
      .catch((err) => notifications.show({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  function getDatabaseStats(formData: Record<string, string>): void {
    medplum
      .post(
        'fhir/R4/$db-stats',
        formData.tableNames
          ? {
              resourceType: 'Parameters',
              parameter: [{ name: 'tableNames', valueString: formData.tableNames }],
            }
          : undefined
      )
      .then((params: Parameters) => {
        setModalTitle('Database Stats');
        setModalContent(<pre>{params.parameter?.find((p) => p.name === 'tableString')?.valueString}</pre>);
        open();
      })
      .catch((err) => notifications.show({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Document width={600}>
      <Title order={1}>Super Admin</Title>
      <Divider my="lg" />
      <Title order={2}>Structure Definitions</Title>
      <p>
        StructureDefinition resources contain the metadata about resource types. They are provided with the FHIR
        specification. Medplum also includes some custom StructureDefinition resources for internal data types. Press
        this button to update the database StructureDefinitions from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildStructureDefinitions}>Rebuild StructureDefinitions</Button>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Search Parameters</Title>
      <p>
        SearchParameter resources contain the metadata about filters and sorting. They are provided with the FHIR
        specification. Medplum also includes some custom SearchParameter resources for internal data types. Press this
        button to update the database SearchParameters from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildSearchParameters}>Rebuild SearchParameters</Button>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Value Sets</Title>
      <p>
        ValueSet resources enum values for a wide variety of use cases. Press this button to update the database
        ValueSets from the FHIR specification.
      </p>
      <Form>
        <Button onClick={rebuildValueSets}>Rebuild ValueSets</Button>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Reindex Resources</Title>
      <p>
        When Medplum changes how resources are indexed, the system may require a reindex for old resources to be indexed
        properly.
      </p>
      <Form onSubmit={reindexResourceType}>
        <Stack>
          <FormSection title="Resource Type" htmlFor="resourceType">
            <TextInput id="resourceType" name="resourceType" placeholder="Reindex Resource Type" />
          </FormSection>
          <FormSection title="Search Filter" htmlFor="filter">
            <TextInput id="filter" name="filter" placeholder="e.g. name=Sam&birthdate=lt2000-01-01" />
          </FormSection>
          <Button type="submit">Reindex</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Purge Resources</Title>
      <p>As system generated resources accumulate, the system may require a purge to remove old resources.</p>
      <Form onSubmit={purgeResources}>
        <Stack>
          <FormSection title="Purge Resource Type" htmlFor="purgeResourceType">
            <NativeSelect id="purgeResourceType" name="resourceType" data={['', 'AuditEvent', 'Login']} />
          </FormSection>
          <FormSection title="Purge Before" htmlFor="before">
            <DateTimeInput name="before" placeholder="Before Date" />
          </FormSection>
          <Button type="submit">Purge</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Remove Bot ID Jobs from Queue</Title>
      <p>Remove all queued jobs for a Bot ID</p>
      <Form onSubmit={removeBotIdJobsFromQueue}>
        <Stack>
          <FormSection title="Bot ID">
            <TextInput name="botId" placeholder="Bot Id" />
          </FormSection>
          <Button type="submit">Remove Jobs by Bot ID</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Force Set Password</Title>
      <p>
        Note that this applies to all projects for the user. Therefore, this should only be used in extreme
        circumstances. Always prefer to use the "Forgot Password" flow first.
      </p>
      <Form onSubmit={forceSetPassword}>
        <Stack>
          <TextInput name="email" label="Email" required />
          <PasswordInput name="password" label="Password" required />
          <TextInput name="projectId" label="Project ID" />
          <Button type="submit">Force Set Password</Button>
        </Stack>
      </Form>
      <Divider my="lg" />
      <Title order={2}>Database Stats</Title>
      <p>Query current table statistics from the database.</p>
      <Form onSubmit={getDatabaseStats}>
        <Stack>
          <FormSection title="Table Names (comma-delimited)" htmlFor="tableNames">
            <TextInput id="tableNames" name="tableNames" placeholder="Observation,Observation_History" />
          </FormSection>
          <Button type="submit">Get Database Stats</Button>
        </Stack>
      </Form>
      <Modal opened={opened} onClose={close} title={modalTitle} centered>
        {modalContent}
      </Modal>
    </Document>
  );
}

type AsyncJobOptions = {
  body?: Record<string, string>;
  cancellable?: boolean;
};

function startAsyncJob(medplum: MedplumClient, title: string, url: string, asyncJobOptions?: AsyncJobOptions): void {
  const controller = new AbortController();
  notifications.show({
    id: url,
    loading: true,
    title,
    message: 'Running...',
    autoClose: false,
    ...(asyncJobOptions?.cancellable
      ? { withCloseButton: true, onClose: () => controller.abort() }
      : { withCloseButton: false }),
  });

  const options: MedplumRequestOptions = {
    method: 'POST',
    pollStatusOnAccepted: true,
    ...(asyncJobOptions?.cancellable ? { asyncReqCancelSignal: controller.signal } : undefined),
  };

  if (asyncJobOptions?.body) {
    options.body = JSON.stringify(asyncJobOptions.body);
  }

  medplum
    .startAsyncRequest<AsyncJob>(url, options)
    .then((job) => {
      switch (job.status) {
        case 'completed':
          notifications.update({
            id: url,
            color: 'green',
            title,
            message: 'Done',
            icon: <IconCheck size="1rem" />,
            loading: false,
            autoClose: false,
            withCloseButton: true,
          });
          break;
        case 'cancelled': {
          const cancelledNotif = {
            id: url,
            color: 'red',
            title,
            message: 'Job cancelled',
            icon: <IconX size="1rem" />,
            loading: false,
            autoClose: false,
            withCloseButton: true,
          };
          // If the signal has been aborted, it means we made the change via our X button
          // That removes the notification so we have to show it again
          if (controller.signal.aborted) {
            notifications.show(cancelledNotif);
          } else {
            // Since the signal isn't aborted, the job was cancelled from elsewhere. We can just update the notification
            notifications.update(cancelledNotif);
          }
          break;
        }
        case 'error':
          notifications.update({
            id: url,
            color: 'red',
            title,
            message: 'Error while processing job',
            icon: <IconX size="1rem" />,
            loading: false,
            autoClose: false,
            withCloseButton: true,
          });
          break;
        default:
          throw new Error('Invalid status for finalized job');
      }
    })
    .catch((err) => {
      notifications.update({
        id: url,
        color: 'red',
        title,
        message: normalizeErrorString(err),
        icon: <IconX size="1rem" />,
        loading: false,
        autoClose: false,
        withCloseButton: true,
      });
    });
}
