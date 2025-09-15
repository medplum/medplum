import pg from "pg";
import { globalLogger } from './logger';

const queryPostgres = async (
  client: pg.Client,
  query: string,
  values: (string | number)[]
): Promise<pg.QueryResult> => {
    return client.query(query, values);
};

export const seed_d2e = async (): Promise<void> => {
  const FHIR_CLIENT_ID = process.env.FHIR__CLIENT_ID;
  const FHIR_CLIENT_SECRET = process.env.FHIR__CLIENT_SECRET;
  const fhirCustomSchema = process.env.FHIR_CUSTOM_SCHEMA;

  // Sanitize schema name to prevent SQL injection
  if(fhirCustomSchema === undefined) {
    throw new Error("No custom schema defined");
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fhirCustomSchema)) {
    throw new Error("Invalid schema name");
  }

  if (!FHIR_CLIENT_ID || !FHIR_CLIENT_SECRET) {
    throw new Error("No client credentials are set for Fhir");
  }

  const client = new pg.Client({
    user: process.env.PG_SUPER_USER,
    password: process.env.PG_SUPER_PASSWORD,
    host: process.env.PG__HOST,
    port: parseInt(process.env.PG__PORT ?? '', 10),
    database: process.env.PG__DB_NAME,
  });

  await client.connect();

  const project_history_versionid = '2c8b0331-863a-432e-a5d1-ef0619acc3d2';

  const project_history_result = await queryPostgres(
    client,
    `SELECT "versionId" FROM ${fhirCustomSchema}."Project_History" WHERE "versionId" = $1`,
    [project_history_versionid]
  );
  if ((project_history_result.rowCount ?? 0) > 0) {
    globalLogger.info("D2e custom seed already complete");
    await client.end();
    return;
  } else {
    globalLogger.info("FHIR server seeding is not complete. Proceed with seeding");
  }
  globalLogger.info("Retrieving existing Super Admin project and Practitioner ids");

  const projectIdResult = await queryPostgres(
    client,
    `SELECT "projectId", "content" FROM ${fhirCustomSchema}."Project" WHERE name = 'Super Admin'`,
    []
  );

  const projectId: string = projectIdResult.rows[0].projectId;
  const projectContent: string = projectIdResult.rows[0].content;

  const practitionerResult = await queryPostgres(
    client,
    `SELECT id FROM ${fhirCustomSchema}."Practitioner" WHERE "projectId" = $1`,
    [projectId]
  );

  const practitioner: string = practitionerResult.rows[0].id;

  globalLogger.info("Seeding tables");

 const jsonParsedProjectContent = JSON.parse(projectContent);

  await queryPostgres(
    client,
    `INSERT INTO ${fhirCustomSchema}."Project_History" ("versionId", id, "content", "lastUpdated")
    values($1, $2, $3, $4) ON CONFLICT("versionId")
    DO NOTHING;`,
    [project_history_versionid, projectId, jsonParsedProjectContent, "2024-06-13 14:40:48.738 +0800"]
  );

  await queryPostgres(
    client,
    `UPDATE ${fhirCustomSchema}."Project" SET "content" = $1 WHERE name = 'Super Admin'`,
    [jsonParsedProjectContent]
  );

  const ClientApplicationContent = `{"meta":{"project":"${projectId}","versionId":"7ef81144-11f4-40ef-a017-da8885a0d36e","lastUpdated":"2024-06-13T06:40:48.738Z","author":{"reference":"Practitioner/${practitioner}","display":"Medplum Admin"},"compartment":[{"reference":"Project/${projectId}"}]},"resourceType":"ClientApplication","name":"d2eClient","secret":"${FHIR_CLIENT_SECRET}","description":"d2eClient","id":"${FHIR_CLIENT_ID}"}`;
  const ProjectMembershipContent = `{"meta":{"project":"${projectId}","versionId":"6e4864a8-b1df-417c-8aa9-35a4cb660e07","lastUpdated":"2024-06-13T06:40:48.762Z","author":{"reference":"system"},"compartment":[{"reference":"Project/${projectId}"}]},"resourceType":"ProjectMembership","project":{"reference":"Project/${projectId}"},"user":{"reference":"ClientApplication/${FHIR_CLIENT_ID}","display":"d2eClient"},"profile":{"reference":"ClientApplication/${FHIR_CLIENT_ID}","display":"d2eClient"},"id":"c5e1a35d-c979-428f-81db-9e3502c3ffa3"}`;

  await queryPostgres(
    client,
    `INSERT INTO ${fhirCustomSchema}."ClientApplication" (id, content, "lastUpdated", compartments, name, "projectId") \
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT(id) \
    DO NOTHING;`,
    [
      `${FHIR_CLIENT_ID}`,
      ClientApplicationContent,
      "2024-06-13 14:40:48.738 +0800",
      `{${projectId}}`,
      "d2eClient",
      projectId,
    ]
  );

  globalLogger.info("Seeding Client Application table complete");

  await queryPostgres(
    client,
    `INSERT INTO ${fhirCustomSchema}."ClientApplication_History" ("versionId", id, content, "lastUpdated") \
    VALUES ($1, $2, $3, $4) ON CONFLICT("versionId") \
    DO NOTHING;`,
    [
      "7ef81144-11f4-40ef-a017-da8885a0d36e",
      `${FHIR_CLIENT_ID}`,
      ClientApplicationContent,
      "2024-06-13 14:40:48.738 +0800",
    ]
  );

  globalLogger.info("Seeding Client Application History table complete");

  await queryPostgres(
    client,
    `INSERT INTO ${fhirCustomSchema}."ProjectMembership" (id, content, "lastUpdated", compartments, project, "user", profile, "profileType", "projectId") \
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT(id) \
    DO NOTHING;
    `,
    [
      "c5e1a35d-c979-428f-81db-9e3502c3ffa3",
      ProjectMembershipContent,
      "2024-06-13 14:40:48.762 +0800",
      `{${projectId}}`,
      `Project/${projectId}`,
      `ClientApplication/${FHIR_CLIENT_ID}`,
      `ClientApplication/${FHIR_CLIENT_ID}`,
      "ClientApplication",
      projectId,
    ]
  );

  globalLogger.info("Seeding Project Membership table complete");

  await queryPostgres(
    client,
    `INSERT INTO ${fhirCustomSchema}."ProjectMembership_History" ("versionId", id, content,"lastUpdated") \ 
    VALUES ($1, $2, $3, $4) ON CONFLICT("versionId") \
    DO NOTHING;`,
    [
      "6e4864a8-b1df-417c-8aa9-35a4cb660e06",
      "c5e1a35d-c979-428f-81db-9e3502c3ffa3",
      ProjectMembershipContent,
      "2024-06-13 14:40:48.762 +0800",
    ]
  );

  globalLogger.info("Seeding Project Membership History table complete");

  await client.end();
};