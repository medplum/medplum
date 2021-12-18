import { AccessPolicy, ElementDefinition, OperationOutcome, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { Button, Document, Form, FormSection, Loading, ReferenceInput, ResourceBadge, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const accessPolicyProperty: ElementDefinition = {
  min: 0,
  max: '1',
  type: [
    {
      code: 'Reference',
      targetProfile: ['https://medplum.com/fhir/StructureDefinition/AccessPolicy'],
    },
  ],
};

export function EditMembershipPage() {
  const { projectId, membershipId } = useParams();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [result, setResult] = useState<ProjectMembership>();
  const [error, setError] = useState();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    medplum
      .get(`admin/projects/${projectId}/members/${membershipId}`)
      .then((response) => {
        setResult(response);
        setLoading(false);
      })
      .catch((reason) => setError(reason));
  }, [projectId, membershipId]);

  if (error) {
    return (
      <Document>
        <pre data-testid="error">{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  if (loading || !result) {
    return <Loading />;
  }

  return (
    <Document width={600}>
      <h1>Edit membership</h1>
      <h3>
        <ResourceBadge value={result.profile} />
      </h3>
      <Form
        onSubmit={(formData: Record<string, string>) => {
          const accessPolicy = formData.accessPolicy
            ? (JSON.parse(formData.accessPolicy) as Reference<AccessPolicy>)
            : undefined;
          const admin = formData.admin === 'true';
          const updated = {
            ...result,
            accessPolicy,
            admin,
          };

          medplum
            .post(`admin/projects/${projectId}/members/${membershipId}`, updated)
            .then(() => setSuccess(true))
            .catch((err) => {
              if (err.outcome) {
                setOutcome(err.outcome);
              }
            });
        }}
      >
        {!success && (
          <>
            <FormSection title="Access Policy">
              <ReferenceInput name="accessPolicy" property={accessPolicyProperty} defaultValue={result.accessPolicy} />
            </FormSection>
            <FormSection title="Admin">
              <input type="checkbox" name="admin" defaultChecked={!!result.admin} value="true" />
            </FormSection>
            <div className="medplum-signin-buttons">
              <div></div>
              <div>
                <Button type="submit" testid="submit">
                  Edit
                </Button>
              </div>
            </div>
            <hr />
            <div style={{ textAlign: 'right' }}>
              <Button type="button" testid="remove-user" danger={true}>
                Remove user
              </Button>
            </div>
          </>
        )}
        {success && (
          <div data-testid="success">
            <p>User updated</p>
            <pre>{JSON.stringify(outcome, undefined, 2)}</pre>
            <p>
              Click <a href={'/admin/project'}>here</a> to return to the project admin page
            </p>
          </div>
        )}
      </Form>
    </Document>
  );
}
