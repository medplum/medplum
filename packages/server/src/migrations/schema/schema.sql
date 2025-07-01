/*
 * This is a generated file
 * Do not edit manually.
 */

\set ON_ERROR_STOP true
\set QUIET on

DROP DATABASE IF EXISTS medplum;
CREATE DATABASE medplum;

\c medplum

DO $$
BEGIN
  IF current_database() NOT IN ('medplum') THEN
    RAISE EXCEPTION 'Connected to wrong database: %', current_database();
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION token_array_to_text(text[])
    RETURNS text LANGUAGE sql IMMUTABLE
    AS $function$SELECT e'\x03'||array_to_string($1, e'\x03')||e'\x03'$function$;

CREATE TABLE  "Account" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT,
  "owner" TEXT,
  "patient" TEXT[],
  "period" TIMESTAMPTZ,
  "status" TEXT,
  "subject" TEXT[],
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__ownerIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Account_lastUpdated_idx" ON "Account" ("lastUpdated");
CREATE INDEX "Account_projectId_lastUpdated_idx" ON "Account" ("projectId", "lastUpdated");
CREATE INDEX "Account_projectId_idx" ON "Account" ("projectId");
CREATE INDEX "Account__source_idx" ON "Account" ("_source");
CREATE INDEX "Account__profile_idx" ON "Account" USING gin ("_profile");
CREATE INDEX "Account___version_idx" ON "Account" ("__version");
CREATE INDEX "Account_compartments_idx" ON "Account" USING gin ("compartments");
CREATE INDEX "Account___sharedTokens_idx" ON "Account" USING gin ("__sharedTokens");
CREATE INDEX "Account___sharedTokensTextTrgm_idx" ON "Account" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Account____tag_idx" ON "Account" USING gin ("___tag");
CREATE INDEX "Account____tagTextTrgm_idx" ON "Account" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Account___idnt_idx" ON "Account" USING gin ("__identifier");
CREATE INDEX "Account___idntTextTrgm_idx" ON "Account" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Account_name_idx" ON "Account" ("name");
CREATE INDEX "Account_owner_idx" ON "Account" ("owner");
CREATE INDEX "Account_patient_idx" ON "Account" USING gin ("patient");
CREATE INDEX "Account_period_idx" ON "Account" ("period");
CREATE INDEX "Account_status_idx" ON "Account" ("status");
CREATE INDEX "Account_subject_idx" ON "Account" USING gin ("subject");
CREATE INDEX "Account___type_idx" ON "Account" USING gin ("__type");
CREATE INDEX "Account___typeTextTrgm_idx" ON "Account" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "Account_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Account_History_id_idx" ON "Account_History" ("id");
CREATE INDEX "Account_History_lastUpdated_idx" ON "Account_History" ("lastUpdated");

CREATE TABLE  "Account_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Account_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Account_Refs_targetId_code_idx" ON "Account_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ActivityDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "ActivityDefinition_lastUpdated_idx" ON "ActivityDefinition" ("lastUpdated");
CREATE INDEX "ActivityDefinition_projectId_lastUpdated_idx" ON "ActivityDefinition" ("projectId", "lastUpdated");
CREATE INDEX "ActivityDefinition_projectId_idx" ON "ActivityDefinition" ("projectId");
CREATE INDEX "ActivityDefinition__source_idx" ON "ActivityDefinition" ("_source");
CREATE INDEX "ActivityDefinition__profile_idx" ON "ActivityDefinition" USING gin ("_profile");
CREATE INDEX "ActivityDefinition___version_idx" ON "ActivityDefinition" ("__version");
CREATE INDEX "ActivityDefinition_compartments_idx" ON "ActivityDefinition" USING gin ("compartments");
CREATE INDEX "ActivityDefinition___sharedTokens_idx" ON "ActivityDefinition" USING gin ("__sharedTokens");
CREATE INDEX "ActivityDefinition___sharedTokensTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition____tag_idx" ON "ActivityDefinition" USING gin ("___tag");
CREATE INDEX "ActivityDefinition____tagTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition_composedOf_idx" ON "ActivityDefinition" USING gin ("composedOf");
CREATE INDEX "ActivityDefinition___context_idx" ON "ActivityDefinition" USING gin ("__context");
CREATE INDEX "ActivityDefinition___contextTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition_contextQuantity_idx" ON "ActivityDefinition" USING gin ("contextQuantity");
CREATE INDEX "ActivityDefinition___contextType_idx" ON "ActivityDefinition" USING gin ("__contextType");
CREATE INDEX "ActivityDefinition___contextTypeTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition_date_idx" ON "ActivityDefinition" ("date");
CREATE INDEX "ActivityDefinition_projectId_date_idx" ON "ActivityDefinition" ("projectId", "date");
CREATE INDEX "ActivityDefinition_dependsOn_idx" ON "ActivityDefinition" USING gin ("dependsOn");
CREATE INDEX "ActivityDefinition_derivedFrom_idx" ON "ActivityDefinition" USING gin ("derivedFrom");
CREATE INDEX "ActivityDefinition_description_idx" ON "ActivityDefinition" ("description");
CREATE INDEX "ActivityDefinition_effective_idx" ON "ActivityDefinition" ("effective");
CREATE INDEX "ActivityDefinition___idnt_idx" ON "ActivityDefinition" USING gin ("__identifier");
CREATE INDEX "ActivityDefinition___idntTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition___jurisdiction_idx" ON "ActivityDefinition" USING gin ("__jurisdiction");
CREATE INDEX "ActivityDefinition___jurisdictionTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition_name_idx" ON "ActivityDefinition" ("name");
CREATE INDEX "ActivityDefinition_predecessor_idx" ON "ActivityDefinition" USING gin ("predecessor");
CREATE INDEX "ActivityDefinition_publisher_idx" ON "ActivityDefinition" ("publisher");
CREATE INDEX "ActivityDefinition_status_idx" ON "ActivityDefinition" ("status");
CREATE INDEX "ActivityDefinition_successor_idx" ON "ActivityDefinition" USING gin ("successor");
CREATE INDEX "ActivityDefinition_title_idx" ON "ActivityDefinition" ("title");
CREATE INDEX "ActivityDefinition___topic_idx" ON "ActivityDefinition" USING gin ("__topic");
CREATE INDEX "ActivityDefinition___topicTextTrgm_idx" ON "ActivityDefinition" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "ActivityDefinition_url_idx" ON "ActivityDefinition" ("url");
CREATE INDEX "ActivityDefinition_version_idx" ON "ActivityDefinition" ("version");

CREATE TABLE  "ActivityDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ActivityDefinition_History_id_idx" ON "ActivityDefinition_History" ("id");
CREATE INDEX "ActivityDefinition_History_lastUpdated_idx" ON "ActivityDefinition_History" ("lastUpdated");

CREATE TABLE  "ActivityDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ActivityDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ActivityDefinition_Refs_targetId_code_idx" ON "ActivityDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "AdverseEvent" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "actuality" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "date" TIMESTAMPTZ,
  "__event" UUID[],
  "__eventText" TEXT[],
  "__eventSort" TEXT,
  "location" TEXT,
  "recorder" TEXT,
  "resultingcondition" TEXT[],
  "__seriousness" UUID[],
  "__seriousnessText" TEXT[],
  "__seriousnessSort" TEXT,
  "__severity" UUID[],
  "__severityText" TEXT[],
  "__severitySort" TEXT,
  "study" TEXT[],
  "subject" TEXT,
  "substance" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__recorderIdentifierSort" TEXT,
  "__resultingconditionIdentifierSort" TEXT,
  "__studyIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT,
  "__substanceIdentifierSort" TEXT
);
CREATE INDEX "AdverseEvent_lastUpdated_idx" ON "AdverseEvent" ("lastUpdated");
CREATE INDEX "AdverseEvent_projectId_lastUpdated_idx" ON "AdverseEvent" ("projectId", "lastUpdated");
CREATE INDEX "AdverseEvent_projectId_idx" ON "AdverseEvent" ("projectId");
CREATE INDEX "AdverseEvent__source_idx" ON "AdverseEvent" ("_source");
CREATE INDEX "AdverseEvent__profile_idx" ON "AdverseEvent" USING gin ("_profile");
CREATE INDEX "AdverseEvent___version_idx" ON "AdverseEvent" ("__version");
CREATE INDEX "AdverseEvent_compartments_idx" ON "AdverseEvent" USING gin ("compartments");
CREATE INDEX "AdverseEvent___sharedTokens_idx" ON "AdverseEvent" USING gin ("__sharedTokens");
CREATE INDEX "AdverseEvent___sharedTokensTextTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "AdverseEvent____tag_idx" ON "AdverseEvent" USING gin ("___tag");
CREATE INDEX "AdverseEvent____tagTextTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "AdverseEvent_actuality_idx" ON "AdverseEvent" ("actuality");
CREATE INDEX "AdverseEvent___category_idx" ON "AdverseEvent" USING gin ("__category");
CREATE INDEX "AdverseEvent___categoryTextTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "AdverseEvent_date_idx" ON "AdverseEvent" ("date");
CREATE INDEX "AdverseEvent_projectId_date_idx" ON "AdverseEvent" ("projectId", "date");
CREATE INDEX "AdverseEvent___event_idx" ON "AdverseEvent" USING gin ("__event");
CREATE INDEX "AdverseEvent___eventTextTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("__eventText") gin_trgm_ops);
CREATE INDEX "AdverseEvent_location_idx" ON "AdverseEvent" ("location");
CREATE INDEX "AdverseEvent_recorder_idx" ON "AdverseEvent" ("recorder");
CREATE INDEX "AdverseEvent_resultingcondition_idx" ON "AdverseEvent" USING gin ("resultingcondition");
CREATE INDEX "AdverseEvent___seriousness_idx" ON "AdverseEvent" USING gin ("__seriousness");
CREATE INDEX "AdverseEvent___seriousnessTextTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("__seriousnessText") gin_trgm_ops);
CREATE INDEX "AdverseEvent___severity_idx" ON "AdverseEvent" USING gin ("__severity");
CREATE INDEX "AdverseEvent___severityTextTrgm_idx" ON "AdverseEvent" USING gin (token_array_to_text("__severityText") gin_trgm_ops);
CREATE INDEX "AdverseEvent_study_idx" ON "AdverseEvent" USING gin ("study");
CREATE INDEX "AdverseEvent_subject_idx" ON "AdverseEvent" ("subject");
CREATE INDEX "AdverseEvent_substance_idx" ON "AdverseEvent" USING gin ("substance");

CREATE TABLE  "AdverseEvent_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AdverseEvent_History_id_idx" ON "AdverseEvent_History" ("id");
CREATE INDEX "AdverseEvent_History_lastUpdated_idx" ON "AdverseEvent_History" ("lastUpdated");

CREATE TABLE  "AdverseEvent_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "AdverseEvent_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "AdverseEvent_Refs_targetId_code_idx" ON "AdverseEvent_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "AllergyIntolerance" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "asserter" TEXT,
  "category" TEXT[],
  "__clinicalStatus" UUID[],
  "__clinicalStatusText" TEXT[],
  "__clinicalStatusSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "criticality" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "lastDate" TIMESTAMPTZ,
  "__manifestation" UUID[],
  "__manifestationText" TEXT[],
  "__manifestationSort" TEXT,
  "onset" TIMESTAMPTZ[],
  "patient" TEXT,
  "recorder" TEXT,
  "__route" UUID[],
  "__routeText" TEXT[],
  "__routeSort" TEXT,
  "severity" TEXT[],
  "type" TEXT,
  "__verificationStatus" UUID[],
  "__verificationStatusText" TEXT[],
  "__verificationStatusSort" TEXT,
  "encounter" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__asserterIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__recorderIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT
);
CREATE INDEX "AllergyIntolerance_lastUpdated_idx" ON "AllergyIntolerance" ("lastUpdated");
CREATE INDEX "AllergyIntolerance_projectId_lastUpdated_idx" ON "AllergyIntolerance" ("projectId", "lastUpdated");
CREATE INDEX "AllergyIntolerance_projectId_idx" ON "AllergyIntolerance" ("projectId");
CREATE INDEX "AllergyIntolerance__source_idx" ON "AllergyIntolerance" ("_source");
CREATE INDEX "AllergyIntolerance__profile_idx" ON "AllergyIntolerance" USING gin ("_profile");
CREATE INDEX "AllergyIntolerance___version_idx" ON "AllergyIntolerance" ("__version");
CREATE INDEX "AllergyIntolerance_compartments_idx" ON "AllergyIntolerance" USING gin ("compartments");
CREATE INDEX "AllergyIntolerance___sharedTokens_idx" ON "AllergyIntolerance" USING gin ("__sharedTokens");
CREATE INDEX "AllergyIntolerance___sharedTokensTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance____tag_idx" ON "AllergyIntolerance" USING gin ("___tag");
CREATE INDEX "AllergyIntolerance____tagTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance_asserter_idx" ON "AllergyIntolerance" ("asserter");
CREATE INDEX "AllergyIntolerance_category_idx" ON "AllergyIntolerance" USING gin ("category");
CREATE INDEX "AllergyIntolerance___clinicalStatus_idx" ON "AllergyIntolerance" USING gin ("__clinicalStatus");
CREATE INDEX "AllergyIntolerance___clinicalStatusTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__clinicalStatusText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance___code_idx" ON "AllergyIntolerance" USING gin ("__code");
CREATE INDEX "AllergyIntolerance___codeTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance_criticality_idx" ON "AllergyIntolerance" ("criticality");
CREATE INDEX "AllergyIntolerance_date_idx" ON "AllergyIntolerance" ("date");
CREATE INDEX "AllergyIntolerance_projectId_date_idx" ON "AllergyIntolerance" ("projectId", "date");
CREATE INDEX "AllergyIntolerance___idnt_idx" ON "AllergyIntolerance" USING gin ("__identifier");
CREATE INDEX "AllergyIntolerance___idntTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance_lastDate_idx" ON "AllergyIntolerance" ("lastDate");
CREATE INDEX "AllergyIntolerance___manifestation_idx" ON "AllergyIntolerance" USING gin ("__manifestation");
CREATE INDEX "AllergyIntolerance___manifestationTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__manifestationText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance_onset_idx" ON "AllergyIntolerance" USING gin ("onset");
CREATE INDEX "AllergyIntolerance_patient_idx" ON "AllergyIntolerance" ("patient");
CREATE INDEX "AllergyIntolerance_recorder_idx" ON "AllergyIntolerance" ("recorder");
CREATE INDEX "AllergyIntolerance___route_idx" ON "AllergyIntolerance" USING gin ("__route");
CREATE INDEX "AllergyIntolerance___routeTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__routeText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance_severity_idx" ON "AllergyIntolerance" USING gin ("severity");
CREATE INDEX "AllergyIntolerance_type_idx" ON "AllergyIntolerance" ("type");
CREATE INDEX "AllergyIntolerance___verificationStatus_idx" ON "AllergyIntolerance" USING gin ("__verificationStatus");
CREATE INDEX "AllergyIntolerance___verificationStatusTextTrgm_idx" ON "AllergyIntolerance" USING gin (token_array_to_text("__verificationStatusText") gin_trgm_ops);
CREATE INDEX "AllergyIntolerance_encounter_idx" ON "AllergyIntolerance" ("encounter");

CREATE TABLE  "AllergyIntolerance_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AllergyIntolerance_History_id_idx" ON "AllergyIntolerance_History" ("id");
CREATE INDEX "AllergyIntolerance_History_lastUpdated_idx" ON "AllergyIntolerance_History" ("lastUpdated");

CREATE TABLE  "AllergyIntolerance_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "AllergyIntolerance_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "AllergyIntolerance_Refs_targetId_code_idx" ON "AllergyIntolerance_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Appointment" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "actor" TEXT[],
  "__appointmentType" UUID[],
  "__appointmentTypeText" TEXT[],
  "__appointmentTypeSort" TEXT,
  "basedOn" TEXT[],
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "location" TEXT[],
  "partStatus" TEXT[],
  "patient" TEXT[],
  "practitioner" TEXT[],
  "__reasonCodeSort" TEXT,
  "reasonReference" TEXT[],
  "__serviceCategory" UUID[],
  "__serviceCategoryText" TEXT[],
  "__serviceCategorySort" TEXT,
  "__serviceType" UUID[],
  "__serviceTypeText" TEXT[],
  "__serviceTypeSort" TEXT,
  "slot" TEXT[],
  "__specialty" UUID[],
  "__specialtyText" TEXT[],
  "__specialtySort" TEXT,
  "status" TEXT,
  "supportingInfo" TEXT[],
  "end" TIMESTAMPTZ,
  "___compartmentIdentifierSort" TEXT,
  "__actorIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__practitionerIdentifierSort" TEXT,
  "__reasonReferenceIdentifierSort" TEXT,
  "__slotIdentifierSort" TEXT,
  "__supportingInfoIdentifierSort" TEXT
);
CREATE INDEX "Appointment_lastUpdated_idx" ON "Appointment" ("lastUpdated");
CREATE INDEX "Appointment_projectId_lastUpdated_idx" ON "Appointment" ("projectId", "lastUpdated");
CREATE INDEX "Appointment_projectId_idx" ON "Appointment" ("projectId");
CREATE INDEX "Appointment__source_idx" ON "Appointment" ("_source");
CREATE INDEX "Appointment__profile_idx" ON "Appointment" USING gin ("_profile");
CREATE INDEX "Appointment___version_idx" ON "Appointment" ("__version");
CREATE INDEX "Appointment_compartments_idx" ON "Appointment" USING gin ("compartments");
CREATE INDEX "Appointment___sharedTokens_idx" ON "Appointment" USING gin ("__sharedTokens");
CREATE INDEX "Appointment___sharedTokensTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Appointment____tag_idx" ON "Appointment" USING gin ("___tag");
CREATE INDEX "Appointment____tagTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Appointment_actor_idx" ON "Appointment" USING gin ("actor");
CREATE INDEX "Appointment___appointmentType_idx" ON "Appointment" USING gin ("__appointmentType");
CREATE INDEX "Appointment___appointmentTypeTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("__appointmentTypeText") gin_trgm_ops);
CREATE INDEX "Appointment_basedOn_idx" ON "Appointment" USING gin ("basedOn");
CREATE INDEX "Appointment_date_idx" ON "Appointment" ("date");
CREATE INDEX "Appointment_projectId_date_idx" ON "Appointment" ("projectId", "date");
CREATE INDEX "Appointment___idnt_idx" ON "Appointment" USING gin ("__identifier");
CREATE INDEX "Appointment___idntTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Appointment_location_idx" ON "Appointment" USING gin ("location");
CREATE INDEX "Appointment_partStatus_idx" ON "Appointment" USING gin ("partStatus");
CREATE INDEX "Appointment_patient_idx" ON "Appointment" USING gin ("patient");
CREATE INDEX "Appointment_practitioner_idx" ON "Appointment" USING gin ("practitioner");
CREATE INDEX "Appointment_reasonReference_idx" ON "Appointment" USING gin ("reasonReference");
CREATE INDEX "Appointment___serviceCategory_idx" ON "Appointment" USING gin ("__serviceCategory");
CREATE INDEX "Appointment___serviceCategoryTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("__serviceCategoryText") gin_trgm_ops);
CREATE INDEX "Appointment___serviceType_idx" ON "Appointment" USING gin ("__serviceType");
CREATE INDEX "Appointment___serviceTypeTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("__serviceTypeText") gin_trgm_ops);
CREATE INDEX "Appointment_slot_idx" ON "Appointment" USING gin ("slot");
CREATE INDEX "Appointment___specialty_idx" ON "Appointment" USING gin ("__specialty");
CREATE INDEX "Appointment___specialtyTextTrgm_idx" ON "Appointment" USING gin (token_array_to_text("__specialtyText") gin_trgm_ops);
CREATE INDEX "Appointment_status_idx" ON "Appointment" ("status");
CREATE INDEX "Appointment_supportingInfo_idx" ON "Appointment" USING gin ("supportingInfo");
CREATE INDEX "Appointment_end_idx" ON "Appointment" ("end");

CREATE TABLE  "Appointment_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Appointment_History_id_idx" ON "Appointment_History" ("id");
CREATE INDEX "Appointment_History_lastUpdated_idx" ON "Appointment_History" ("lastUpdated");

CREATE TABLE  "Appointment_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Appointment_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Appointment_Refs_targetId_code_idx" ON "Appointment_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "AppointmentResponse" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "actor" TEXT,
  "appointment" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "location" TEXT,
  "partStatus" TEXT,
  "patient" TEXT,
  "practitioner" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__actorIdentifierSort" TEXT,
  "__appointmentIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__practitionerIdentifierSort" TEXT
);
CREATE INDEX "AppointmentResponse_lastUpdated_idx" ON "AppointmentResponse" ("lastUpdated");
CREATE INDEX "AppointmentResponse_projectId_lastUpdated_idx" ON "AppointmentResponse" ("projectId", "lastUpdated");
CREATE INDEX "AppointmentResponse_projectId_idx" ON "AppointmentResponse" ("projectId");
CREATE INDEX "AppointmentResponse__source_idx" ON "AppointmentResponse" ("_source");
CREATE INDEX "AppointmentResponse__profile_idx" ON "AppointmentResponse" USING gin ("_profile");
CREATE INDEX "AppointmentResponse___version_idx" ON "AppointmentResponse" ("__version");
CREATE INDEX "AppointmentResponse_compartments_idx" ON "AppointmentResponse" USING gin ("compartments");
CREATE INDEX "AppointmentResponse___sharedTokens_idx" ON "AppointmentResponse" USING gin ("__sharedTokens");
CREATE INDEX "AppointmentResponse___sharedTokensTextTrgm_idx" ON "AppointmentResponse" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "AppointmentResponse____tag_idx" ON "AppointmentResponse" USING gin ("___tag");
CREATE INDEX "AppointmentResponse____tagTextTrgm_idx" ON "AppointmentResponse" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "AppointmentResponse_actor_idx" ON "AppointmentResponse" ("actor");
CREATE INDEX "AppointmentResponse_appointment_idx" ON "AppointmentResponse" ("appointment");
CREATE INDEX "AppointmentResponse___idnt_idx" ON "AppointmentResponse" USING gin ("__identifier");
CREATE INDEX "AppointmentResponse___idntTextTrgm_idx" ON "AppointmentResponse" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "AppointmentResponse_location_idx" ON "AppointmentResponse" ("location");
CREATE INDEX "AppointmentResponse_partStatus_idx" ON "AppointmentResponse" ("partStatus");
CREATE INDEX "AppointmentResponse_patient_idx" ON "AppointmentResponse" ("patient");
CREATE INDEX "AppointmentResponse_practitioner_idx" ON "AppointmentResponse" ("practitioner");

CREATE TABLE  "AppointmentResponse_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AppointmentResponse_History_id_idx" ON "AppointmentResponse_History" ("id");
CREATE INDEX "AppointmentResponse_History_lastUpdated_idx" ON "AppointmentResponse_History" ("lastUpdated");

CREATE TABLE  "AppointmentResponse_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "AppointmentResponse_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "AppointmentResponse_Refs_targetId_code_idx" ON "AppointmentResponse_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "AuditEvent" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tagSort" TEXT,
  "action" TEXT,
  "address" TEXT[],
  "agent" TEXT[],
  "agentName" TEXT[],
  "__agentRoleSort" TEXT,
  "altid" TEXT[],
  "date" TIMESTAMPTZ,
  "entity" TEXT[],
  "entityName" TEXT[],
  "__entityRole" UUID[],
  "__entityRoleText" TEXT[],
  "__entityRoleSort" TEXT,
  "__entityTypeSort" TEXT,
  "outcome" TEXT,
  "patient" TEXT[],
  "policy" TEXT[],
  "site" TEXT,
  "source" TEXT,
  "__subtypeSort" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__agentIdentifierSort" TEXT,
  "__entityIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT
);
CREATE INDEX "AuditEvent_lastUpdated_idx" ON "AuditEvent" ("lastUpdated");
CREATE INDEX "AuditEvent_projectId_lastUpdated_idx" ON "AuditEvent" ("projectId", "lastUpdated");
CREATE INDEX "AuditEvent_projectId_idx" ON "AuditEvent" ("projectId");
CREATE INDEX "AuditEvent__source_idx" ON "AuditEvent" ("_source");
CREATE INDEX "AuditEvent__profile_idx" ON "AuditEvent" USING gin ("_profile");
CREATE INDEX "AuditEvent___version_idx" ON "AuditEvent" ("__version");
CREATE INDEX "AuditEvent_compartments_idx" ON "AuditEvent" USING gin ("compartments");
CREATE INDEX "AuditEvent___sharedTokens_idx" ON "AuditEvent" USING gin ("__sharedTokens");
CREATE INDEX "AuditEvent___sharedTokensTextTrgm_idx" ON "AuditEvent" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent" ("action");
CREATE INDEX "AuditEvent_address_idx" ON "AuditEvent" USING gin ("address");
CREATE INDEX "AuditEvent_agent_idx" ON "AuditEvent" USING gin ("agent");
CREATE INDEX "AuditEvent_agentName_idx" ON "AuditEvent" USING gin ("agentName");
CREATE INDEX "AuditEvent_altid_idx" ON "AuditEvent" USING gin ("altid");
CREATE INDEX "AuditEvent_date_idx" ON "AuditEvent" ("date");
CREATE INDEX "AuditEvent_projectId_date_idx" ON "AuditEvent" ("projectId", "date");
CREATE INDEX "AuditEvent_entity_idx" ON "AuditEvent" USING gin ("entity");
CREATE INDEX "AuditEvent_entityName_idx" ON "AuditEvent" USING gin ("entityName");
CREATE INDEX "AuditEvent___entityRole_idx" ON "AuditEvent" USING gin ("__entityRole");
CREATE INDEX "AuditEvent___entityRoleTextTrgm_idx" ON "AuditEvent" USING gin (token_array_to_text("__entityRoleText") gin_trgm_ops);
CREATE INDEX "AuditEvent_outcome_idx" ON "AuditEvent" ("outcome");
CREATE INDEX "AuditEvent_patient_idx" ON "AuditEvent" USING gin ("patient");
CREATE INDEX "AuditEvent_policy_idx" ON "AuditEvent" USING gin ("policy");
CREATE INDEX "AuditEvent_site_idx" ON "AuditEvent" ("site");
CREATE INDEX "AuditEvent_source_idx" ON "AuditEvent" ("source");
CREATE INDEX "AuditEvent___type_idx" ON "AuditEvent" USING gin ("__type");
CREATE INDEX "AuditEvent___typeTextTrgm_idx" ON "AuditEvent" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "AuditEvent_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AuditEvent_History_id_idx" ON "AuditEvent_History" ("id");
CREATE INDEX "AuditEvent_History_lastUpdated_idx" ON "AuditEvent_History" ("lastUpdated");

CREATE TABLE  "AuditEvent_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "AuditEvent_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "AuditEvent_Refs_targetId_code_idx" ON "AuditEvent_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Basic" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "author" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "created" DATE,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Basic_lastUpdated_idx" ON "Basic" ("lastUpdated");
CREATE INDEX "Basic_projectId_lastUpdated_idx" ON "Basic" ("projectId", "lastUpdated");
CREATE INDEX "Basic_projectId_idx" ON "Basic" ("projectId");
CREATE INDEX "Basic__source_idx" ON "Basic" ("_source");
CREATE INDEX "Basic__profile_idx" ON "Basic" USING gin ("_profile");
CREATE INDEX "Basic___version_idx" ON "Basic" ("__version");
CREATE INDEX "Basic_compartments_idx" ON "Basic" USING gin ("compartments");
CREATE INDEX "Basic___sharedTokens_idx" ON "Basic" USING gin ("__sharedTokens");
CREATE INDEX "Basic___sharedTokensTextTrgm_idx" ON "Basic" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Basic____tag_idx" ON "Basic" USING gin ("___tag");
CREATE INDEX "Basic____tagTextTrgm_idx" ON "Basic" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Basic_author_idx" ON "Basic" ("author");
CREATE INDEX "Basic___code_idx" ON "Basic" USING gin ("__code");
CREATE INDEX "Basic___codeTextTrgm_idx" ON "Basic" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Basic_created_idx" ON "Basic" ("created");
CREATE INDEX "Basic___idnt_idx" ON "Basic" USING gin ("__identifier");
CREATE INDEX "Basic___idntTextTrgm_idx" ON "Basic" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Basic_patient_idx" ON "Basic" ("patient");
CREATE INDEX "Basic_subject_idx" ON "Basic" ("subject");

CREATE TABLE  "Basic_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Basic_History_id_idx" ON "Basic_History" ("id");
CREATE INDEX "Basic_History_lastUpdated_idx" ON "Basic_History" ("lastUpdated");

CREATE TABLE  "Basic_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Basic_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Basic_Refs_targetId_code_idx" ON "Basic_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Binary" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[]
);
CREATE INDEX "Binary_lastUpdated_idx" ON "Binary" ("lastUpdated");
CREATE INDEX "Binary_projectId_lastUpdated_idx" ON "Binary" ("projectId", "lastUpdated");
CREATE INDEX "Binary_projectId_idx" ON "Binary" ("projectId");
CREATE INDEX "Binary__source_idx" ON "Binary" ("_source");
CREATE INDEX "Binary__profile_idx" ON "Binary" USING gin ("_profile");
CREATE INDEX "Binary___version_idx" ON "Binary" ("__version");

CREATE TABLE  "Binary_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Binary_History_id_idx" ON "Binary_History" ("id");
CREATE INDEX "Binary_History_lastUpdated_idx" ON "Binary_History" ("lastUpdated");

CREATE TABLE  "Binary_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Binary_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Binary_Refs_targetId_code_idx" ON "Binary_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "BiologicallyDerivedProduct" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "BiologicallyDerivedProduct_lastUpdated_idx" ON "BiologicallyDerivedProduct" ("lastUpdated");
CREATE INDEX "BiologicallyDerivedProduct_projectId_lastUpdated_idx" ON "BiologicallyDerivedProduct" ("projectId", "lastUpdated");
CREATE INDEX "BiologicallyDerivedProduct_projectId_idx" ON "BiologicallyDerivedProduct" ("projectId");
CREATE INDEX "BiologicallyDerivedProduct__source_idx" ON "BiologicallyDerivedProduct" ("_source");
CREATE INDEX "BiologicallyDerivedProduct__profile_idx" ON "BiologicallyDerivedProduct" USING gin ("_profile");
CREATE INDEX "BiologicallyDerivedProduct___version_idx" ON "BiologicallyDerivedProduct" ("__version");
CREATE INDEX "BiologicallyDerivedProduct_compartments_idx" ON "BiologicallyDerivedProduct" USING gin ("compartments");
CREATE INDEX "BiologicallyDerivedProduct___sharedTokens_idx" ON "BiologicallyDerivedProduct" USING gin ("__sharedTokens");
CREATE INDEX "BiologicallyDerivedProduct___sharedTokensTextTrgm_idx" ON "BiologicallyDerivedProduct" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "BiologicallyDerivedProduct____tag_idx" ON "BiologicallyDerivedProduct" USING gin ("___tag");
CREATE INDEX "BiologicallyDerivedProduct____tagTextTrgm_idx" ON "BiologicallyDerivedProduct" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "BiologicallyDerivedProduct_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "BiologicallyDerivedProduct_History_id_idx" ON "BiologicallyDerivedProduct_History" ("id");
CREATE INDEX "BiologicallyDerivedProduct_History_lastUpdated_idx" ON "BiologicallyDerivedProduct_History" ("lastUpdated");

CREATE TABLE  "BiologicallyDerivedProduct_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "BiologicallyDerivedProduct_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "BiologicallyDerivedProduct_Refs_targetId_code_idx" ON "BiologicallyDerivedProduct_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "BodyStructure" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__location" UUID[],
  "__locationText" TEXT[],
  "__locationSort" TEXT,
  "__morphology" UUID[],
  "__morphologyText" TEXT[],
  "__morphologySort" TEXT,
  "patient" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT
);
CREATE INDEX "BodyStructure_lastUpdated_idx" ON "BodyStructure" ("lastUpdated");
CREATE INDEX "BodyStructure_projectId_lastUpdated_idx" ON "BodyStructure" ("projectId", "lastUpdated");
CREATE INDEX "BodyStructure_projectId_idx" ON "BodyStructure" ("projectId");
CREATE INDEX "BodyStructure__source_idx" ON "BodyStructure" ("_source");
CREATE INDEX "BodyStructure__profile_idx" ON "BodyStructure" USING gin ("_profile");
CREATE INDEX "BodyStructure___version_idx" ON "BodyStructure" ("__version");
CREATE INDEX "BodyStructure_compartments_idx" ON "BodyStructure" USING gin ("compartments");
CREATE INDEX "BodyStructure___sharedTokens_idx" ON "BodyStructure" USING gin ("__sharedTokens");
CREATE INDEX "BodyStructure___sharedTokensTextTrgm_idx" ON "BodyStructure" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "BodyStructure____tag_idx" ON "BodyStructure" USING gin ("___tag");
CREATE INDEX "BodyStructure____tagTextTrgm_idx" ON "BodyStructure" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "BodyStructure___idnt_idx" ON "BodyStructure" USING gin ("__identifier");
CREATE INDEX "BodyStructure___idntTextTrgm_idx" ON "BodyStructure" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "BodyStructure___location_idx" ON "BodyStructure" USING gin ("__location");
CREATE INDEX "BodyStructure___locationTextTrgm_idx" ON "BodyStructure" USING gin (token_array_to_text("__locationText") gin_trgm_ops);
CREATE INDEX "BodyStructure___morphology_idx" ON "BodyStructure" USING gin ("__morphology");
CREATE INDEX "BodyStructure___morphologyTextTrgm_idx" ON "BodyStructure" USING gin (token_array_to_text("__morphologyText") gin_trgm_ops);
CREATE INDEX "BodyStructure_patient_idx" ON "BodyStructure" ("patient");

CREATE TABLE  "BodyStructure_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "BodyStructure_History_id_idx" ON "BodyStructure_History" ("id");
CREATE INDEX "BodyStructure_History_lastUpdated_idx" ON "BodyStructure_History" ("lastUpdated");

CREATE TABLE  "BodyStructure_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "BodyStructure_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "BodyStructure_Refs_targetId_code_idx" ON "BodyStructure_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Bundle" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composition" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "message" TEXT,
  "timestamp" TIMESTAMPTZ,
  "type" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__compositionIdentifierSort" TEXT,
  "__messageIdentifierSort" TEXT
);
CREATE INDEX "Bundle_lastUpdated_idx" ON "Bundle" ("lastUpdated");
CREATE INDEX "Bundle_projectId_lastUpdated_idx" ON "Bundle" ("projectId", "lastUpdated");
CREATE INDEX "Bundle_projectId_idx" ON "Bundle" ("projectId");
CREATE INDEX "Bundle__source_idx" ON "Bundle" ("_source");
CREATE INDEX "Bundle__profile_idx" ON "Bundle" USING gin ("_profile");
CREATE INDEX "Bundle___version_idx" ON "Bundle" ("__version");
CREATE INDEX "Bundle_compartments_idx" ON "Bundle" USING gin ("compartments");
CREATE INDEX "Bundle___sharedTokens_idx" ON "Bundle" USING gin ("__sharedTokens");
CREATE INDEX "Bundle___sharedTokensTextTrgm_idx" ON "Bundle" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Bundle____tag_idx" ON "Bundle" USING gin ("___tag");
CREATE INDEX "Bundle____tagTextTrgm_idx" ON "Bundle" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Bundle_composition_idx" ON "Bundle" ("composition");
CREATE INDEX "Bundle___idnt_idx" ON "Bundle" USING gin ("__identifier");
CREATE INDEX "Bundle___idntTextTrgm_idx" ON "Bundle" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Bundle_message_idx" ON "Bundle" ("message");
CREATE INDEX "Bundle_timestamp_idx" ON "Bundle" ("timestamp");
CREATE INDEX "Bundle_type_idx" ON "Bundle" ("type");

CREATE TABLE  "Bundle_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Bundle_History_id_idx" ON "Bundle_History" ("id");
CREATE INDEX "Bundle_History_lastUpdated_idx" ON "Bundle_History" ("lastUpdated");

CREATE TABLE  "Bundle_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Bundle_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Bundle_Refs_targetId_code_idx" ON "Bundle_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CapabilityStatement" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "fhirversion" TEXT,
  "format" TEXT[],
  "guide" TEXT[],
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "mode" TEXT[],
  "name" TEXT,
  "publisher" TEXT,
  "resource" TEXT[],
  "resourceProfile" TEXT[],
  "__securityService" UUID[],
  "__securityServiceText" TEXT[],
  "__securityServiceSort" TEXT,
  "software" TEXT,
  "status" TEXT,
  "supportedProfile" TEXT[],
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__guideIdentifierSort" TEXT,
  "__resourceProfileIdentifierSort" TEXT,
  "__supportedProfileIdentifierSort" TEXT
);
CREATE INDEX "CapabilityStatement_lastUpdated_idx" ON "CapabilityStatement" ("lastUpdated");
CREATE INDEX "CapabilityStatement_projectId_lastUpdated_idx" ON "CapabilityStatement" ("projectId", "lastUpdated");
CREATE INDEX "CapabilityStatement_projectId_idx" ON "CapabilityStatement" ("projectId");
CREATE INDEX "CapabilityStatement__source_idx" ON "CapabilityStatement" ("_source");
CREATE INDEX "CapabilityStatement__profile_idx" ON "CapabilityStatement" USING gin ("_profile");
CREATE INDEX "CapabilityStatement___version_idx" ON "CapabilityStatement" ("__version");
CREATE INDEX "CapabilityStatement_compartments_idx" ON "CapabilityStatement" USING gin ("compartments");
CREATE INDEX "CapabilityStatement___sharedTokens_idx" ON "CapabilityStatement" USING gin ("__sharedTokens");
CREATE INDEX "CapabilityStatement___sharedTokensTextTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CapabilityStatement____tag_idx" ON "CapabilityStatement" USING gin ("___tag");
CREATE INDEX "CapabilityStatement____tagTextTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CapabilityStatement___context_idx" ON "CapabilityStatement" USING gin ("__context");
CREATE INDEX "CapabilityStatement___contextTextTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "CapabilityStatement_contextQuantity_idx" ON "CapabilityStatement" USING gin ("contextQuantity");
CREATE INDEX "CapabilityStatement___contextType_idx" ON "CapabilityStatement" USING gin ("__contextType");
CREATE INDEX "CapabilityStatement___contextTypeTextTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "CapabilityStatement_date_idx" ON "CapabilityStatement" ("date");
CREATE INDEX "CapabilityStatement_projectId_date_idx" ON "CapabilityStatement" ("projectId", "date");
CREATE INDEX "CapabilityStatement_description_idx" ON "CapabilityStatement" ("description");
CREATE INDEX "CapabilityStatement_fhirversion_idx" ON "CapabilityStatement" ("fhirversion");
CREATE INDEX "CapabilityStatement_format_idx" ON "CapabilityStatement" USING gin ("format");
CREATE INDEX "CapabilityStatement_guide_idx" ON "CapabilityStatement" USING gin ("guide");
CREATE INDEX "CapabilityStatement___jurisdiction_idx" ON "CapabilityStatement" USING gin ("__jurisdiction");
CREATE INDEX "CapabilityStatement___jurisdictionTextTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "CapabilityStatement_mode_idx" ON "CapabilityStatement" USING gin ("mode");
CREATE INDEX "CapabilityStatement_name_idx" ON "CapabilityStatement" ("name");
CREATE INDEX "CapabilityStatement_publisher_idx" ON "CapabilityStatement" ("publisher");
CREATE INDEX "CapabilityStatement_resource_idx" ON "CapabilityStatement" USING gin ("resource");
CREATE INDEX "CapabilityStatement_resourceProfile_idx" ON "CapabilityStatement" USING gin ("resourceProfile");
CREATE INDEX "CapabilityStatement___securityService_idx" ON "CapabilityStatement" USING gin ("__securityService");
CREATE INDEX "CapabilityStatement___securityServiceTextTrgm_idx" ON "CapabilityStatement" USING gin (token_array_to_text("__securityServiceText") gin_trgm_ops);
CREATE INDEX "CapabilityStatement_software_idx" ON "CapabilityStatement" ("software");
CREATE INDEX "CapabilityStatement_status_idx" ON "CapabilityStatement" ("status");
CREATE INDEX "CapabilityStatement_supportedProfile_idx" ON "CapabilityStatement" USING gin ("supportedProfile");
CREATE INDEX "CapabilityStatement_title_idx" ON "CapabilityStatement" ("title");
CREATE INDEX "CapabilityStatement_url_idx" ON "CapabilityStatement" ("url");
CREATE INDEX "CapabilityStatement_version_idx" ON "CapabilityStatement" ("version");

CREATE TABLE  "CapabilityStatement_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CapabilityStatement_History_id_idx" ON "CapabilityStatement_History" ("id");
CREATE INDEX "CapabilityStatement_History_lastUpdated_idx" ON "CapabilityStatement_History" ("lastUpdated");

CREATE TABLE  "CapabilityStatement_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CapabilityStatement_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CapabilityStatement_Refs_targetId_code_idx" ON "CapabilityStatement_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CarePlan" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__activityCode" UUID[],
  "__activityCodeText" TEXT[],
  "__activityCodeSort" TEXT,
  "activityDate" TIMESTAMPTZ[],
  "activityReference" TEXT[],
  "basedOn" TEXT[],
  "careTeam" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "condition" TEXT[],
  "encounter" TEXT,
  "goal" TEXT[],
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "intent" TEXT,
  "partOf" TEXT[],
  "performer" TEXT[],
  "replaces" TEXT[],
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__activityReferenceIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__careTeamIdentifierSort" TEXT,
  "__conditionIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__goalIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__replacesIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "CarePlan_lastUpdated_idx" ON "CarePlan" ("lastUpdated");
CREATE INDEX "CarePlan_projectId_lastUpdated_idx" ON "CarePlan" ("projectId", "lastUpdated");
CREATE INDEX "CarePlan_projectId_idx" ON "CarePlan" ("projectId");
CREATE INDEX "CarePlan__source_idx" ON "CarePlan" ("_source");
CREATE INDEX "CarePlan__profile_idx" ON "CarePlan" USING gin ("_profile");
CREATE INDEX "CarePlan___version_idx" ON "CarePlan" ("__version");
CREATE INDEX "CarePlan_compartments_idx" ON "CarePlan" USING gin ("compartments");
CREATE INDEX "CarePlan___sharedTokens_idx" ON "CarePlan" USING gin ("__sharedTokens");
CREATE INDEX "CarePlan___sharedTokensTextTrgm_idx" ON "CarePlan" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CarePlan____tag_idx" ON "CarePlan" USING gin ("___tag");
CREATE INDEX "CarePlan____tagTextTrgm_idx" ON "CarePlan" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CarePlan_date_idx" ON "CarePlan" ("date");
CREATE INDEX "CarePlan_projectId_date_idx" ON "CarePlan" ("projectId", "date");
CREATE INDEX "CarePlan___idnt_idx" ON "CarePlan" USING gin ("__identifier");
CREATE INDEX "CarePlan___idntTextTrgm_idx" ON "CarePlan" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "CarePlan_patient_idx" ON "CarePlan" ("patient");
CREATE INDEX "CarePlan___activityCode_idx" ON "CarePlan" USING gin ("__activityCode");
CREATE INDEX "CarePlan___activityCodeTextTrgm_idx" ON "CarePlan" USING gin (token_array_to_text("__activityCodeText") gin_trgm_ops);
CREATE INDEX "CarePlan_activityDate_idx" ON "CarePlan" USING gin ("activityDate");
CREATE INDEX "CarePlan_activityReference_idx" ON "CarePlan" USING gin ("activityReference");
CREATE INDEX "CarePlan_basedOn_idx" ON "CarePlan" USING gin ("basedOn");
CREATE INDEX "CarePlan_careTeam_idx" ON "CarePlan" USING gin ("careTeam");
CREATE INDEX "CarePlan___category_idx" ON "CarePlan" USING gin ("__category");
CREATE INDEX "CarePlan___categoryTextTrgm_idx" ON "CarePlan" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "CarePlan_condition_idx" ON "CarePlan" USING gin ("condition");
CREATE INDEX "CarePlan_encounter_idx" ON "CarePlan" ("encounter");
CREATE INDEX "CarePlan_goal_idx" ON "CarePlan" USING gin ("goal");
CREATE INDEX "CarePlan_instantiatesCanonical_idx" ON "CarePlan" USING gin ("instantiatesCanonical");
CREATE INDEX "CarePlan_instantiatesUri_idx" ON "CarePlan" USING gin ("instantiatesUri");
CREATE INDEX "CarePlan_intent_idx" ON "CarePlan" ("intent");
CREATE INDEX "CarePlan_partOf_idx" ON "CarePlan" USING gin ("partOf");
CREATE INDEX "CarePlan_performer_idx" ON "CarePlan" USING gin ("performer");
CREATE INDEX "CarePlan_replaces_idx" ON "CarePlan" USING gin ("replaces");
CREATE INDEX "CarePlan_status_idx" ON "CarePlan" ("status");
CREATE INDEX "CarePlan_subject_idx" ON "CarePlan" ("subject");

CREATE TABLE  "CarePlan_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CarePlan_History_id_idx" ON "CarePlan_History" ("id");
CREATE INDEX "CarePlan_History_lastUpdated_idx" ON "CarePlan_History" ("lastUpdated");

CREATE TABLE  "CarePlan_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CarePlan_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CarePlan_Refs_targetId_code_idx" ON "CarePlan_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CareTeam" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "encounter" TEXT,
  "participant" TEXT[],
  "status" TEXT,
  "subject" TEXT,
  "name" TEXT,
  "__role" UUID[],
  "__roleText" TEXT[],
  "__roleSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__participantIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "CareTeam_lastUpdated_idx" ON "CareTeam" ("lastUpdated");
CREATE INDEX "CareTeam_projectId_lastUpdated_idx" ON "CareTeam" ("projectId", "lastUpdated");
CREATE INDEX "CareTeam_projectId_idx" ON "CareTeam" ("projectId");
CREATE INDEX "CareTeam__source_idx" ON "CareTeam" ("_source");
CREATE INDEX "CareTeam__profile_idx" ON "CareTeam" USING gin ("_profile");
CREATE INDEX "CareTeam___version_idx" ON "CareTeam" ("__version");
CREATE INDEX "CareTeam_compartments_idx" ON "CareTeam" USING gin ("compartments");
CREATE INDEX "CareTeam___sharedTokens_idx" ON "CareTeam" USING gin ("__sharedTokens");
CREATE INDEX "CareTeam___sharedTokensTextTrgm_idx" ON "CareTeam" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CareTeam____tag_idx" ON "CareTeam" USING gin ("___tag");
CREATE INDEX "CareTeam____tagTextTrgm_idx" ON "CareTeam" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CareTeam_date_idx" ON "CareTeam" ("date");
CREATE INDEX "CareTeam_projectId_date_idx" ON "CareTeam" ("projectId", "date");
CREATE INDEX "CareTeam___idnt_idx" ON "CareTeam" USING gin ("__identifier");
CREATE INDEX "CareTeam___idntTextTrgm_idx" ON "CareTeam" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "CareTeam_patient_idx" ON "CareTeam" ("patient");
CREATE INDEX "CareTeam___category_idx" ON "CareTeam" USING gin ("__category");
CREATE INDEX "CareTeam___categoryTextTrgm_idx" ON "CareTeam" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "CareTeam_encounter_idx" ON "CareTeam" ("encounter");
CREATE INDEX "CareTeam_participant_idx" ON "CareTeam" USING gin ("participant");
CREATE INDEX "CareTeam_status_idx" ON "CareTeam" ("status");
CREATE INDEX "CareTeam_subject_idx" ON "CareTeam" ("subject");
CREATE INDEX "CareTeam_name_idx" ON "CareTeam" ("name");
CREATE INDEX "CareTeam___role_idx" ON "CareTeam" USING gin ("__role");
CREATE INDEX "CareTeam___roleTextTrgm_idx" ON "CareTeam" USING gin (token_array_to_text("__roleText") gin_trgm_ops);

CREATE TABLE  "CareTeam_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CareTeam_History_id_idx" ON "CareTeam_History" ("id");
CREATE INDEX "CareTeam_History_lastUpdated_idx" ON "CareTeam_History" ("lastUpdated");

CREATE TABLE  "CareTeam_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CareTeam_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CareTeam_Refs_targetId_code_idx" ON "CareTeam_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CatalogEntry" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "CatalogEntry_lastUpdated_idx" ON "CatalogEntry" ("lastUpdated");
CREATE INDEX "CatalogEntry_projectId_lastUpdated_idx" ON "CatalogEntry" ("projectId", "lastUpdated");
CREATE INDEX "CatalogEntry_projectId_idx" ON "CatalogEntry" ("projectId");
CREATE INDEX "CatalogEntry__source_idx" ON "CatalogEntry" ("_source");
CREATE INDEX "CatalogEntry__profile_idx" ON "CatalogEntry" USING gin ("_profile");
CREATE INDEX "CatalogEntry___version_idx" ON "CatalogEntry" ("__version");
CREATE INDEX "CatalogEntry_compartments_idx" ON "CatalogEntry" USING gin ("compartments");
CREATE INDEX "CatalogEntry___sharedTokens_idx" ON "CatalogEntry" USING gin ("__sharedTokens");
CREATE INDEX "CatalogEntry___sharedTokensTextTrgm_idx" ON "CatalogEntry" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CatalogEntry____tag_idx" ON "CatalogEntry" USING gin ("___tag");
CREATE INDEX "CatalogEntry____tagTextTrgm_idx" ON "CatalogEntry" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "CatalogEntry_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CatalogEntry_History_id_idx" ON "CatalogEntry_History" ("id");
CREATE INDEX "CatalogEntry_History_lastUpdated_idx" ON "CatalogEntry_History" ("lastUpdated");

CREATE TABLE  "CatalogEntry_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CatalogEntry_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CatalogEntry_Refs_targetId_code_idx" ON "CatalogEntry_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ChargeItem" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "account" TEXT[],
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "context" TEXT,
  "enteredDate" TIMESTAMPTZ,
  "enterer" TEXT,
  "factorOverride" DOUBLE PRECISION,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "occurrence" TIMESTAMPTZ,
  "patient" TEXT,
  "performerActor" TEXT[],
  "__performerFunction" UUID[],
  "__performerFunctionText" TEXT[],
  "__performerFunctionSort" TEXT,
  "performingOrganization" TEXT,
  "priceOverride" DOUBLE PRECISION,
  "quantity" DOUBLE PRECISION,
  "requestingOrganization" TEXT,
  "service" TEXT[],
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__accountIdentifierSort" TEXT,
  "__contextIdentifierSort" TEXT,
  "__entererIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__performerActorIdentifierSort" TEXT,
  "__performingOrganizationIdentifierSort" TEXT,
  "__requestingOrganizationIdentifierSort" TEXT,
  "__serviceIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "ChargeItem_lastUpdated_idx" ON "ChargeItem" ("lastUpdated");
CREATE INDEX "ChargeItem_projectId_lastUpdated_idx" ON "ChargeItem" ("projectId", "lastUpdated");
CREATE INDEX "ChargeItem_projectId_idx" ON "ChargeItem" ("projectId");
CREATE INDEX "ChargeItem__source_idx" ON "ChargeItem" ("_source");
CREATE INDEX "ChargeItem__profile_idx" ON "ChargeItem" USING gin ("_profile");
CREATE INDEX "ChargeItem___version_idx" ON "ChargeItem" ("__version");
CREATE INDEX "ChargeItem_compartments_idx" ON "ChargeItem" USING gin ("compartments");
CREATE INDEX "ChargeItem___sharedTokens_idx" ON "ChargeItem" USING gin ("__sharedTokens");
CREATE INDEX "ChargeItem___sharedTokensTextTrgm_idx" ON "ChargeItem" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ChargeItem____tag_idx" ON "ChargeItem" USING gin ("___tag");
CREATE INDEX "ChargeItem____tagTextTrgm_idx" ON "ChargeItem" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ChargeItem_account_idx" ON "ChargeItem" USING gin ("account");
CREATE INDEX "ChargeItem___code_idx" ON "ChargeItem" USING gin ("__code");
CREATE INDEX "ChargeItem___codeTextTrgm_idx" ON "ChargeItem" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "ChargeItem_context_idx" ON "ChargeItem" ("context");
CREATE INDEX "ChargeItem_enteredDate_idx" ON "ChargeItem" ("enteredDate");
CREATE INDEX "ChargeItem_enterer_idx" ON "ChargeItem" ("enterer");
CREATE INDEX "ChargeItem_factorOverride_idx" ON "ChargeItem" ("factorOverride");
CREATE INDEX "ChargeItem___idnt_idx" ON "ChargeItem" USING gin ("__identifier");
CREATE INDEX "ChargeItem___idntTextTrgm_idx" ON "ChargeItem" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ChargeItem_occurrence_idx" ON "ChargeItem" ("occurrence");
CREATE INDEX "ChargeItem_patient_idx" ON "ChargeItem" ("patient");
CREATE INDEX "ChargeItem_performerActor_idx" ON "ChargeItem" USING gin ("performerActor");
CREATE INDEX "ChargeItem___performerFunction_idx" ON "ChargeItem" USING gin ("__performerFunction");
CREATE INDEX "ChargeItem___performerFunctionTextTrgm_idx" ON "ChargeItem" USING gin (token_array_to_text("__performerFunctionText") gin_trgm_ops);
CREATE INDEX "ChargeItem_performingOrganization_idx" ON "ChargeItem" ("performingOrganization");
CREATE INDEX "ChargeItem_priceOverride_idx" ON "ChargeItem" ("priceOverride");
CREATE INDEX "ChargeItem_quantity_idx" ON "ChargeItem" ("quantity");
CREATE INDEX "ChargeItem_requestingOrganization_idx" ON "ChargeItem" ("requestingOrganization");
CREATE INDEX "ChargeItem_service_idx" ON "ChargeItem" USING gin ("service");
CREATE INDEX "ChargeItem_subject_idx" ON "ChargeItem" ("subject");

CREATE TABLE  "ChargeItem_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ChargeItem_History_id_idx" ON "ChargeItem_History" ("id");
CREATE INDEX "ChargeItem_History_lastUpdated_idx" ON "ChargeItem_History" ("lastUpdated");

CREATE TABLE  "ChargeItem_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ChargeItem_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ChargeItem_Refs_targetId_code_idx" ON "ChargeItem_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ChargeItemDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "ChargeItemDefinition_lastUpdated_idx" ON "ChargeItemDefinition" ("lastUpdated");
CREATE INDEX "ChargeItemDefinition_projectId_lastUpdated_idx" ON "ChargeItemDefinition" ("projectId", "lastUpdated");
CREATE INDEX "ChargeItemDefinition_projectId_idx" ON "ChargeItemDefinition" ("projectId");
CREATE INDEX "ChargeItemDefinition__source_idx" ON "ChargeItemDefinition" ("_source");
CREATE INDEX "ChargeItemDefinition__profile_idx" ON "ChargeItemDefinition" USING gin ("_profile");
CREATE INDEX "ChargeItemDefinition___version_idx" ON "ChargeItemDefinition" ("__version");
CREATE INDEX "ChargeItemDefinition_compartments_idx" ON "ChargeItemDefinition" USING gin ("compartments");
CREATE INDEX "ChargeItemDefinition___sharedTokens_idx" ON "ChargeItemDefinition" USING gin ("__sharedTokens");
CREATE INDEX "ChargeItemDefinition___sharedTokensTextTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ChargeItemDefinition____tag_idx" ON "ChargeItemDefinition" USING gin ("___tag");
CREATE INDEX "ChargeItemDefinition____tagTextTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ChargeItemDefinition___context_idx" ON "ChargeItemDefinition" USING gin ("__context");
CREATE INDEX "ChargeItemDefinition___contextTextTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ChargeItemDefinition_contextQuantity_idx" ON "ChargeItemDefinition" USING gin ("contextQuantity");
CREATE INDEX "ChargeItemDefinition___contextType_idx" ON "ChargeItemDefinition" USING gin ("__contextType");
CREATE INDEX "ChargeItemDefinition___contextTypeTextTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ChargeItemDefinition_date_idx" ON "ChargeItemDefinition" ("date");
CREATE INDEX "ChargeItemDefinition_projectId_date_idx" ON "ChargeItemDefinition" ("projectId", "date");
CREATE INDEX "ChargeItemDefinition_description_idx" ON "ChargeItemDefinition" ("description");
CREATE INDEX "ChargeItemDefinition_effective_idx" ON "ChargeItemDefinition" ("effective");
CREATE INDEX "ChargeItemDefinition___idnt_idx" ON "ChargeItemDefinition" USING gin ("__identifier");
CREATE INDEX "ChargeItemDefinition___idntTextTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ChargeItemDefinition___jurisdiction_idx" ON "ChargeItemDefinition" USING gin ("__jurisdiction");
CREATE INDEX "ChargeItemDefinition___jurisdictionTextTrgm_idx" ON "ChargeItemDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ChargeItemDefinition_publisher_idx" ON "ChargeItemDefinition" ("publisher");
CREATE INDEX "ChargeItemDefinition_status_idx" ON "ChargeItemDefinition" ("status");
CREATE INDEX "ChargeItemDefinition_title_idx" ON "ChargeItemDefinition" ("title");
CREATE INDEX "ChargeItemDefinition_url_idx" ON "ChargeItemDefinition" ("url");
CREATE INDEX "ChargeItemDefinition_version_idx" ON "ChargeItemDefinition" ("version");

CREATE TABLE  "ChargeItemDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ChargeItemDefinition_History_id_idx" ON "ChargeItemDefinition_History" ("id");
CREATE INDEX "ChargeItemDefinition_History_lastUpdated_idx" ON "ChargeItemDefinition_History" ("lastUpdated");

CREATE TABLE  "ChargeItemDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ChargeItemDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ChargeItemDefinition_Refs_targetId_code_idx" ON "ChargeItemDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Claim" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "careTeam" TEXT[],
  "created" TIMESTAMPTZ,
  "detailUdi" TEXT[],
  "encounter" TEXT[],
  "enterer" TEXT,
  "facility" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "insurer" TEXT,
  "itemUdi" TEXT[],
  "patient" TEXT,
  "payee" TEXT,
  "__priority" UUID[],
  "__priorityText" TEXT[],
  "__prioritySort" TEXT,
  "procedureUdi" TEXT[],
  "provider" TEXT,
  "status" TEXT,
  "subdetailUdi" TEXT[],
  "use" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__careTeamIdentifierSort" TEXT,
  "__detailUdiIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__entererIdentifierSort" TEXT,
  "__facilityIdentifierSort" TEXT,
  "__insurerIdentifierSort" TEXT,
  "__itemUdiIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__payeeIdentifierSort" TEXT,
  "__procedureUdiIdentifierSort" TEXT,
  "__providerIdentifierSort" TEXT,
  "__subdetailUdiIdentifierSort" TEXT
);
CREATE INDEX "Claim_lastUpdated_idx" ON "Claim" ("lastUpdated");
CREATE INDEX "Claim_projectId_lastUpdated_idx" ON "Claim" ("projectId", "lastUpdated");
CREATE INDEX "Claim_projectId_idx" ON "Claim" ("projectId");
CREATE INDEX "Claim__source_idx" ON "Claim" ("_source");
CREATE INDEX "Claim__profile_idx" ON "Claim" USING gin ("_profile");
CREATE INDEX "Claim___version_idx" ON "Claim" ("__version");
CREATE INDEX "Claim_compartments_idx" ON "Claim" USING gin ("compartments");
CREATE INDEX "Claim___sharedTokens_idx" ON "Claim" USING gin ("__sharedTokens");
CREATE INDEX "Claim___sharedTokensTextTrgm_idx" ON "Claim" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Claim____tag_idx" ON "Claim" USING gin ("___tag");
CREATE INDEX "Claim____tagTextTrgm_idx" ON "Claim" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Claim_careTeam_idx" ON "Claim" USING gin ("careTeam");
CREATE INDEX "Claim_created_idx" ON "Claim" ("created");
CREATE INDEX "Claim_detailUdi_idx" ON "Claim" USING gin ("detailUdi");
CREATE INDEX "Claim_encounter_idx" ON "Claim" USING gin ("encounter");
CREATE INDEX "Claim_enterer_idx" ON "Claim" ("enterer");
CREATE INDEX "Claim_facility_idx" ON "Claim" ("facility");
CREATE INDEX "Claim___idnt_idx" ON "Claim" USING gin ("__identifier");
CREATE INDEX "Claim___idntTextTrgm_idx" ON "Claim" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Claim_insurer_idx" ON "Claim" ("insurer");
CREATE INDEX "Claim_itemUdi_idx" ON "Claim" USING gin ("itemUdi");
CREATE INDEX "Claim_patient_idx" ON "Claim" ("patient");
CREATE INDEX "Claim_payee_idx" ON "Claim" ("payee");
CREATE INDEX "Claim___priority_idx" ON "Claim" USING gin ("__priority");
CREATE INDEX "Claim___priorityTextTrgm_idx" ON "Claim" USING gin (token_array_to_text("__priorityText") gin_trgm_ops);
CREATE INDEX "Claim_procedureUdi_idx" ON "Claim" USING gin ("procedureUdi");
CREATE INDEX "Claim_provider_idx" ON "Claim" ("provider");
CREATE INDEX "Claim_status_idx" ON "Claim" ("status");
CREATE INDEX "Claim_subdetailUdi_idx" ON "Claim" USING gin ("subdetailUdi");
CREATE INDEX "Claim_use_idx" ON "Claim" ("use");

CREATE TABLE  "Claim_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Claim_History_id_idx" ON "Claim_History" ("id");
CREATE INDEX "Claim_History_lastUpdated_idx" ON "Claim_History" ("lastUpdated");

CREATE TABLE  "Claim_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Claim_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Claim_Refs_targetId_code_idx" ON "Claim_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ClaimResponse" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "created" TIMESTAMPTZ,
  "disposition" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "insurer" TEXT,
  "outcome" TEXT,
  "patient" TEXT,
  "paymentDate" DATE,
  "request" TEXT,
  "requestor" TEXT,
  "status" TEXT,
  "use" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__insurerIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__requestIdentifierSort" TEXT,
  "__requestorIdentifierSort" TEXT
);
CREATE INDEX "ClaimResponse_lastUpdated_idx" ON "ClaimResponse" ("lastUpdated");
CREATE INDEX "ClaimResponse_projectId_lastUpdated_idx" ON "ClaimResponse" ("projectId", "lastUpdated");
CREATE INDEX "ClaimResponse_projectId_idx" ON "ClaimResponse" ("projectId");
CREATE INDEX "ClaimResponse__source_idx" ON "ClaimResponse" ("_source");
CREATE INDEX "ClaimResponse__profile_idx" ON "ClaimResponse" USING gin ("_profile");
CREATE INDEX "ClaimResponse___version_idx" ON "ClaimResponse" ("__version");
CREATE INDEX "ClaimResponse_compartments_idx" ON "ClaimResponse" USING gin ("compartments");
CREATE INDEX "ClaimResponse___sharedTokens_idx" ON "ClaimResponse" USING gin ("__sharedTokens");
CREATE INDEX "ClaimResponse___sharedTokensTextTrgm_idx" ON "ClaimResponse" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ClaimResponse____tag_idx" ON "ClaimResponse" USING gin ("___tag");
CREATE INDEX "ClaimResponse____tagTextTrgm_idx" ON "ClaimResponse" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ClaimResponse_created_idx" ON "ClaimResponse" ("created");
CREATE INDEX "ClaimResponse_disposition_idx" ON "ClaimResponse" ("disposition");
CREATE INDEX "ClaimResponse___idnt_idx" ON "ClaimResponse" USING gin ("__identifier");
CREATE INDEX "ClaimResponse___idntTextTrgm_idx" ON "ClaimResponse" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ClaimResponse_insurer_idx" ON "ClaimResponse" ("insurer");
CREATE INDEX "ClaimResponse_outcome_idx" ON "ClaimResponse" ("outcome");
CREATE INDEX "ClaimResponse_patient_idx" ON "ClaimResponse" ("patient");
CREATE INDEX "ClaimResponse_paymentDate_idx" ON "ClaimResponse" ("paymentDate");
CREATE INDEX "ClaimResponse_request_idx" ON "ClaimResponse" ("request");
CREATE INDEX "ClaimResponse_requestor_idx" ON "ClaimResponse" ("requestor");
CREATE INDEX "ClaimResponse_status_idx" ON "ClaimResponse" ("status");
CREATE INDEX "ClaimResponse_use_idx" ON "ClaimResponse" ("use");

CREATE TABLE  "ClaimResponse_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ClaimResponse_History_id_idx" ON "ClaimResponse_History" ("id");
CREATE INDEX "ClaimResponse_History_lastUpdated_idx" ON "ClaimResponse_History" ("lastUpdated");

CREATE TABLE  "ClaimResponse_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ClaimResponse_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ClaimResponse_Refs_targetId_code_idx" ON "ClaimResponse_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ClinicalImpression" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "patient" TEXT,
  "assessor" TEXT,
  "encounter" TEXT,
  "__findingCode" UUID[],
  "__findingCodeText" TEXT[],
  "__findingCodeSort" TEXT,
  "findingRef" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "investigation" TEXT[],
  "previous" TEXT,
  "problem" TEXT[],
  "status" TEXT,
  "subject" TEXT,
  "supportingInfo" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__assessorIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__findingRefIdentifierSort" TEXT,
  "__investigationIdentifierSort" TEXT,
  "__previousIdentifierSort" TEXT,
  "__problemIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT,
  "__supportingInfoIdentifierSort" TEXT
);
CREATE INDEX "ClinicalImpression_lastUpdated_idx" ON "ClinicalImpression" ("lastUpdated");
CREATE INDEX "ClinicalImpression_projectId_lastUpdated_idx" ON "ClinicalImpression" ("projectId", "lastUpdated");
CREATE INDEX "ClinicalImpression_projectId_idx" ON "ClinicalImpression" ("projectId");
CREATE INDEX "ClinicalImpression__source_idx" ON "ClinicalImpression" ("_source");
CREATE INDEX "ClinicalImpression__profile_idx" ON "ClinicalImpression" USING gin ("_profile");
CREATE INDEX "ClinicalImpression___version_idx" ON "ClinicalImpression" ("__version");
CREATE INDEX "ClinicalImpression_compartments_idx" ON "ClinicalImpression" USING gin ("compartments");
CREATE INDEX "ClinicalImpression___sharedTokens_idx" ON "ClinicalImpression" USING gin ("__sharedTokens");
CREATE INDEX "ClinicalImpression___sharedTokensTextTrgm_idx" ON "ClinicalImpression" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ClinicalImpression____tag_idx" ON "ClinicalImpression" USING gin ("___tag");
CREATE INDEX "ClinicalImpression____tagTextTrgm_idx" ON "ClinicalImpression" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ClinicalImpression_date_idx" ON "ClinicalImpression" ("date");
CREATE INDEX "ClinicalImpression_projectId_date_idx" ON "ClinicalImpression" ("projectId", "date");
CREATE INDEX "ClinicalImpression_patient_idx" ON "ClinicalImpression" ("patient");
CREATE INDEX "ClinicalImpression_assessor_idx" ON "ClinicalImpression" ("assessor");
CREATE INDEX "ClinicalImpression_encounter_idx" ON "ClinicalImpression" ("encounter");
CREATE INDEX "ClinicalImpression___findingCode_idx" ON "ClinicalImpression" USING gin ("__findingCode");
CREATE INDEX "ClinicalImpression___findingCodeTextTrgm_idx" ON "ClinicalImpression" USING gin (token_array_to_text("__findingCodeText") gin_trgm_ops);
CREATE INDEX "ClinicalImpression_findingRef_idx" ON "ClinicalImpression" USING gin ("findingRef");
CREATE INDEX "ClinicalImpression___idnt_idx" ON "ClinicalImpression" USING gin ("__identifier");
CREATE INDEX "ClinicalImpression___idntTextTrgm_idx" ON "ClinicalImpression" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ClinicalImpression_investigation_idx" ON "ClinicalImpression" USING gin ("investigation");
CREATE INDEX "ClinicalImpression_previous_idx" ON "ClinicalImpression" ("previous");
CREATE INDEX "ClinicalImpression_problem_idx" ON "ClinicalImpression" USING gin ("problem");
CREATE INDEX "ClinicalImpression_status_idx" ON "ClinicalImpression" ("status");
CREATE INDEX "ClinicalImpression_subject_idx" ON "ClinicalImpression" ("subject");
CREATE INDEX "ClinicalImpression_supportingInfo_idx" ON "ClinicalImpression" USING gin ("supportingInfo");

CREATE TABLE  "ClinicalImpression_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ClinicalImpression_History_id_idx" ON "ClinicalImpression_History" ("id");
CREATE INDEX "ClinicalImpression_History_lastUpdated_idx" ON "ClinicalImpression_History" ("lastUpdated");

CREATE TABLE  "ClinicalImpression_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ClinicalImpression_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ClinicalImpression_Refs_targetId_code_idx" ON "ClinicalImpression_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CodeSystem" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "code" TEXT[],
  "contentMode" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "language" TEXT[],
  "supplements" TEXT,
  "system" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__supplementsIdentifierSort" TEXT
);
CREATE INDEX "CodeSystem_lastUpdated_idx" ON "CodeSystem" ("lastUpdated");
CREATE INDEX "CodeSystem_projectId_lastUpdated_idx" ON "CodeSystem" ("projectId", "lastUpdated");
CREATE INDEX "CodeSystem_projectId_idx" ON "CodeSystem" ("projectId");
CREATE INDEX "CodeSystem__source_idx" ON "CodeSystem" ("_source");
CREATE INDEX "CodeSystem__profile_idx" ON "CodeSystem" USING gin ("_profile");
CREATE INDEX "CodeSystem___version_idx" ON "CodeSystem" ("__version");
CREATE INDEX "CodeSystem_compartments_idx" ON "CodeSystem" USING gin ("compartments");
CREATE INDEX "CodeSystem___sharedTokens_idx" ON "CodeSystem" USING gin ("__sharedTokens");
CREATE INDEX "CodeSystem___sharedTokensTextTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CodeSystem____tag_idx" ON "CodeSystem" USING gin ("___tag");
CREATE INDEX "CodeSystem____tagTextTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CodeSystem___context_idx" ON "CodeSystem" USING gin ("__context");
CREATE INDEX "CodeSystem___contextTextTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "CodeSystem_contextQuantity_idx" ON "CodeSystem" USING gin ("contextQuantity");
CREATE INDEX "CodeSystem___contextType_idx" ON "CodeSystem" USING gin ("__contextType");
CREATE INDEX "CodeSystem___contextTypeTextTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "CodeSystem_date_idx" ON "CodeSystem" ("date");
CREATE INDEX "CodeSystem_projectId_date_idx" ON "CodeSystem" ("projectId", "date");
CREATE INDEX "CodeSystem_description_idx" ON "CodeSystem" ("description");
CREATE INDEX "CodeSystem___jurisdiction_idx" ON "CodeSystem" USING gin ("__jurisdiction");
CREATE INDEX "CodeSystem___jurisdictionTextTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "CodeSystem_name_idx" ON "CodeSystem" ("name");
CREATE INDEX "CodeSystem_publisher_idx" ON "CodeSystem" ("publisher");
CREATE INDEX "CodeSystem_status_idx" ON "CodeSystem" ("status");
CREATE INDEX "CodeSystem_title_idx" ON "CodeSystem" ("title");
CREATE INDEX "CodeSystem_url_idx" ON "CodeSystem" ("url");
CREATE INDEX "CodeSystem_version_idx" ON "CodeSystem" ("version");
CREATE INDEX "CodeSystem_code_idx" ON "CodeSystem" USING gin ("code");
CREATE INDEX "CodeSystem_contentMode_idx" ON "CodeSystem" ("contentMode");
CREATE INDEX "CodeSystem___idnt_idx" ON "CodeSystem" USING gin ("__identifier");
CREATE INDEX "CodeSystem___idntTextTrgm_idx" ON "CodeSystem" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "CodeSystem_language_idx" ON "CodeSystem" USING gin ("language");
CREATE INDEX "CodeSystem_supplements_idx" ON "CodeSystem" ("supplements");
CREATE INDEX "CodeSystem_system_idx" ON "CodeSystem" ("system");

CREATE TABLE  "CodeSystem_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CodeSystem_History_id_idx" ON "CodeSystem_History" ("id");
CREATE INDEX "CodeSystem_History_lastUpdated_idx" ON "CodeSystem_History" ("lastUpdated");

CREATE TABLE  "CodeSystem_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CodeSystem_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CodeSystem_Refs_targetId_code_idx" ON "CodeSystem_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Communication" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "basedOn" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "encounter" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "__medium" UUID[],
  "__mediumText" TEXT[],
  "__mediumSort" TEXT,
  "partOf" TEXT[],
  "patient" TEXT,
  "received" TIMESTAMPTZ,
  "recipient" TEXT[],
  "sender" TEXT,
  "sent" TIMESTAMPTZ,
  "status" TEXT,
  "subject" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__recipientIdentifierSort" TEXT,
  "__senderIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Communication_lastUpdated_idx" ON "Communication" ("lastUpdated");
CREATE INDEX "Communication_projectId_lastUpdated_idx" ON "Communication" ("projectId", "lastUpdated");
CREATE INDEX "Communication_projectId_idx" ON "Communication" ("projectId");
CREATE INDEX "Communication__source_idx" ON "Communication" ("_source");
CREATE INDEX "Communication__profile_idx" ON "Communication" USING gin ("_profile");
CREATE INDEX "Communication___version_idx" ON "Communication" ("__version");
CREATE INDEX "Communication_compartments_idx" ON "Communication" USING gin ("compartments");
CREATE INDEX "Communication___sharedTokens_idx" ON "Communication" USING gin ("__sharedTokens");
CREATE INDEX "Communication___sharedTokensTextTrgm_idx" ON "Communication" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Communication____tag_idx" ON "Communication" USING gin ("___tag");
CREATE INDEX "Communication____tagTextTrgm_idx" ON "Communication" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Communication_basedOn_idx" ON "Communication" USING gin ("basedOn");
CREATE INDEX "Communication___category_idx" ON "Communication" USING gin ("__category");
CREATE INDEX "Communication___categoryTextTrgm_idx" ON "Communication" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Communication_encounter_idx" ON "Communication" ("encounter");
CREATE INDEX "Communication___idnt_idx" ON "Communication" USING gin ("__identifier");
CREATE INDEX "Communication___idntTextTrgm_idx" ON "Communication" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Communication_instantiatesCanonical_idx" ON "Communication" USING gin ("instantiatesCanonical");
CREATE INDEX "Communication_instantiatesUri_idx" ON "Communication" USING gin ("instantiatesUri");
CREATE INDEX "Communication___medium_idx" ON "Communication" USING gin ("__medium");
CREATE INDEX "Communication___mediumTextTrgm_idx" ON "Communication" USING gin (token_array_to_text("__mediumText") gin_trgm_ops);
CREATE INDEX "Communication_partOf_idx" ON "Communication" USING gin ("partOf");
CREATE INDEX "Communication_patient_idx" ON "Communication" ("patient");
CREATE INDEX "Communication_received_idx" ON "Communication" ("received");
CREATE INDEX "Communication_recipient_idx" ON "Communication" USING gin ("recipient");
CREATE INDEX "Communication_sender_idx" ON "Communication" ("sender");
CREATE INDEX "Communication_sent_idx" ON "Communication" ("sent");
CREATE INDEX "Communication_projectId_sent_idx" ON "Communication" ("projectId", "sent");
CREATE INDEX "Communication_status_idx" ON "Communication" ("status");
CREATE INDEX "Communication_subject_idx" ON "Communication" ("subject");
CREATE INDEX "Communication___topic_idx" ON "Communication" USING gin ("__topic");
CREATE INDEX "Communication___topicTextTrgm_idx" ON "Communication" USING gin (token_array_to_text("__topicText") gin_trgm_ops);

CREATE TABLE  "Communication_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Communication_History_id_idx" ON "Communication_History" ("id");
CREATE INDEX "Communication_History_lastUpdated_idx" ON "Communication_History" ("lastUpdated");

CREATE TABLE  "Communication_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Communication_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Communication_Refs_targetId_code_idx" ON "Communication_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CommunicationRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "authored" TIMESTAMPTZ,
  "basedOn" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "encounter" TEXT,
  "__groupIdentifier" UUID[],
  "__groupIdentifierText" TEXT[],
  "__groupIdentifierSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__medium" UUID[],
  "__mediumText" TEXT[],
  "__mediumSort" TEXT,
  "occurrence" TIMESTAMPTZ,
  "patient" TEXT,
  "priority" TEXT,
  "recipient" TEXT[],
  "replaces" TEXT[],
  "requester" TEXT,
  "sender" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "priorityOrder" INTEGER,
  "___compartmentIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__recipientIdentifierSort" TEXT,
  "__replacesIdentifierSort" TEXT,
  "__requesterIdentifierSort" TEXT,
  "__senderIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "CommunicationRequest_lastUpdated_idx" ON "CommunicationRequest" ("lastUpdated");
CREATE INDEX "CommunicationRequest_projectId_lastUpdated_idx" ON "CommunicationRequest" ("projectId", "lastUpdated");
CREATE INDEX "CommunicationRequest_projectId_idx" ON "CommunicationRequest" ("projectId");
CREATE INDEX "CommunicationRequest__source_idx" ON "CommunicationRequest" ("_source");
CREATE INDEX "CommunicationRequest__profile_idx" ON "CommunicationRequest" USING gin ("_profile");
CREATE INDEX "CommunicationRequest___version_idx" ON "CommunicationRequest" ("__version");
CREATE INDEX "CommunicationRequest_compartments_idx" ON "CommunicationRequest" USING gin ("compartments");
CREATE INDEX "CommunicationRequest___sharedTokens_idx" ON "CommunicationRequest" USING gin ("__sharedTokens");
CREATE INDEX "CommunicationRequest___sharedTokensTextTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CommunicationRequest____tag_idx" ON "CommunicationRequest" USING gin ("___tag");
CREATE INDEX "CommunicationRequest____tagTextTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CommunicationRequest_authored_idx" ON "CommunicationRequest" ("authored");
CREATE INDEX "CommunicationRequest_basedOn_idx" ON "CommunicationRequest" USING gin ("basedOn");
CREATE INDEX "CommunicationRequest___category_idx" ON "CommunicationRequest" USING gin ("__category");
CREATE INDEX "CommunicationRequest___categoryTextTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "CommunicationRequest_encounter_idx" ON "CommunicationRequest" ("encounter");
CREATE INDEX "CommunicationRequest___groupIdnt_idx" ON "CommunicationRequest" USING gin ("__groupIdentifier");
CREATE INDEX "CommunicationRequest___groupIdntTextTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("__groupIdentifierText") gin_trgm_ops);
CREATE INDEX "CommunicationRequest___idnt_idx" ON "CommunicationRequest" USING gin ("__identifier");
CREATE INDEX "CommunicationRequest___idntTextTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "CommunicationRequest___medium_idx" ON "CommunicationRequest" USING gin ("__medium");
CREATE INDEX "CommunicationRequest___mediumTextTrgm_idx" ON "CommunicationRequest" USING gin (token_array_to_text("__mediumText") gin_trgm_ops);
CREATE INDEX "CommunicationRequest_occurrence_idx" ON "CommunicationRequest" ("occurrence");
CREATE INDEX "CommunicationRequest_patient_idx" ON "CommunicationRequest" ("patient");
CREATE INDEX "CommunicationRequest_priority_idx" ON "CommunicationRequest" ("priority");
CREATE INDEX "CommunicationRequest_recipient_idx" ON "CommunicationRequest" USING gin ("recipient");
CREATE INDEX "CommunicationRequest_replaces_idx" ON "CommunicationRequest" USING gin ("replaces");
CREATE INDEX "CommunicationRequest_requester_idx" ON "CommunicationRequest" ("requester");
CREATE INDEX "CommunicationRequest_sender_idx" ON "CommunicationRequest" ("sender");
CREATE INDEX "CommunicationRequest_status_idx" ON "CommunicationRequest" ("status");
CREATE INDEX "CommunicationRequest_subject_idx" ON "CommunicationRequest" ("subject");
CREATE INDEX "CommunicationRequest_priorityOrder_idx" ON "CommunicationRequest" ("priorityOrder");

CREATE TABLE  "CommunicationRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CommunicationRequest_History_id_idx" ON "CommunicationRequest_History" ("id");
CREATE INDEX "CommunicationRequest_History_lastUpdated_idx" ON "CommunicationRequest_History" ("lastUpdated");

CREATE TABLE  "CommunicationRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CommunicationRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CommunicationRequest_Refs_targetId_code_idx" ON "CommunicationRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CompartmentDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "url" TEXT,
  "version" TEXT,
  "code" TEXT,
  "resource" TEXT[],
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "CompartmentDefinition_lastUpdated_idx" ON "CompartmentDefinition" ("lastUpdated");
CREATE INDEX "CompartmentDefinition_projectId_lastUpdated_idx" ON "CompartmentDefinition" ("projectId", "lastUpdated");
CREATE INDEX "CompartmentDefinition_projectId_idx" ON "CompartmentDefinition" ("projectId");
CREATE INDEX "CompartmentDefinition__source_idx" ON "CompartmentDefinition" ("_source");
CREATE INDEX "CompartmentDefinition__profile_idx" ON "CompartmentDefinition" USING gin ("_profile");
CREATE INDEX "CompartmentDefinition___version_idx" ON "CompartmentDefinition" ("__version");
CREATE INDEX "CompartmentDefinition_compartments_idx" ON "CompartmentDefinition" USING gin ("compartments");
CREATE INDEX "CompartmentDefinition___sharedTokens_idx" ON "CompartmentDefinition" USING gin ("__sharedTokens");
CREATE INDEX "CompartmentDefinition___sharedTokensTextTrgm_idx" ON "CompartmentDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CompartmentDefinition____tag_idx" ON "CompartmentDefinition" USING gin ("___tag");
CREATE INDEX "CompartmentDefinition____tagTextTrgm_idx" ON "CompartmentDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CompartmentDefinition___context_idx" ON "CompartmentDefinition" USING gin ("__context");
CREATE INDEX "CompartmentDefinition___contextTextTrgm_idx" ON "CompartmentDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "CompartmentDefinition_contextQuantity_idx" ON "CompartmentDefinition" USING gin ("contextQuantity");
CREATE INDEX "CompartmentDefinition___contextType_idx" ON "CompartmentDefinition" USING gin ("__contextType");
CREATE INDEX "CompartmentDefinition___contextTypeTextTrgm_idx" ON "CompartmentDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "CompartmentDefinition_date_idx" ON "CompartmentDefinition" ("date");
CREATE INDEX "CompartmentDefinition_projectId_date_idx" ON "CompartmentDefinition" ("projectId", "date");
CREATE INDEX "CompartmentDefinition_description_idx" ON "CompartmentDefinition" ("description");
CREATE INDEX "CompartmentDefinition_name_idx" ON "CompartmentDefinition" ("name");
CREATE INDEX "CompartmentDefinition_publisher_idx" ON "CompartmentDefinition" ("publisher");
CREATE INDEX "CompartmentDefinition_status_idx" ON "CompartmentDefinition" ("status");
CREATE INDEX "CompartmentDefinition_url_idx" ON "CompartmentDefinition" ("url");
CREATE INDEX "CompartmentDefinition_version_idx" ON "CompartmentDefinition" ("version");
CREATE INDEX "CompartmentDefinition_code_idx" ON "CompartmentDefinition" ("code");
CREATE INDEX "CompartmentDefinition_resource_idx" ON "CompartmentDefinition" USING gin ("resource");

CREATE TABLE  "CompartmentDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CompartmentDefinition_History_id_idx" ON "CompartmentDefinition_History" ("id");
CREATE INDEX "CompartmentDefinition_History_lastUpdated_idx" ON "CompartmentDefinition_History" ("lastUpdated");

CREATE TABLE  "CompartmentDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CompartmentDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CompartmentDefinition_Refs_targetId_code_idx" ON "CompartmentDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Composition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "attester" TEXT[],
  "author" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "confidentiality" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "encounter" TEXT,
  "entry" TEXT[],
  "period" TIMESTAMPTZ[],
  "__relatedId" UUID[],
  "__relatedIdText" TEXT[],
  "__relatedIdSort" TEXT,
  "relatedRef" TEXT[],
  "__section" UUID[],
  "__sectionText" TEXT[],
  "__sectionSort" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "title" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__attesterIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__entryIdentifierSort" TEXT,
  "__relatedRefIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Composition_lastUpdated_idx" ON "Composition" ("lastUpdated");
CREATE INDEX "Composition_projectId_lastUpdated_idx" ON "Composition" ("projectId", "lastUpdated");
CREATE INDEX "Composition_projectId_idx" ON "Composition" ("projectId");
CREATE INDEX "Composition__source_idx" ON "Composition" ("_source");
CREATE INDEX "Composition__profile_idx" ON "Composition" USING gin ("_profile");
CREATE INDEX "Composition___version_idx" ON "Composition" ("__version");
CREATE INDEX "Composition_compartments_idx" ON "Composition" USING gin ("compartments");
CREATE INDEX "Composition___sharedTokens_idx" ON "Composition" USING gin ("__sharedTokens");
CREATE INDEX "Composition___sharedTokensTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Composition____tag_idx" ON "Composition" USING gin ("___tag");
CREATE INDEX "Composition____tagTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Composition_date_idx" ON "Composition" ("date");
CREATE INDEX "Composition_projectId_date_idx" ON "Composition" ("projectId", "date");
CREATE INDEX "Composition___idnt_idx" ON "Composition" USING gin ("__identifier");
CREATE INDEX "Composition___idntTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Composition_patient_idx" ON "Composition" ("patient");
CREATE INDEX "Composition___type_idx" ON "Composition" USING gin ("__type");
CREATE INDEX "Composition___typeTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "Composition_attester_idx" ON "Composition" USING gin ("attester");
CREATE INDEX "Composition_author_idx" ON "Composition" USING gin ("author");
CREATE INDEX "Composition___category_idx" ON "Composition" USING gin ("__category");
CREATE INDEX "Composition___categoryTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Composition_confidentiality_idx" ON "Composition" ("confidentiality");
CREATE INDEX "Composition___context_idx" ON "Composition" USING gin ("__context");
CREATE INDEX "Composition___contextTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "Composition_encounter_idx" ON "Composition" ("encounter");
CREATE INDEX "Composition_entry_idx" ON "Composition" USING gin ("entry");
CREATE INDEX "Composition_period_idx" ON "Composition" USING gin ("period");
CREATE INDEX "Composition___relatedId_idx" ON "Composition" USING gin ("__relatedId");
CREATE INDEX "Composition___relatedIdTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__relatedIdText") gin_trgm_ops);
CREATE INDEX "Composition_relatedRef_idx" ON "Composition" USING gin ("relatedRef");
CREATE INDEX "Composition___section_idx" ON "Composition" USING gin ("__section");
CREATE INDEX "Composition___sectionTextTrgm_idx" ON "Composition" USING gin (token_array_to_text("__sectionText") gin_trgm_ops);
CREATE INDEX "Composition_status_idx" ON "Composition" ("status");
CREATE INDEX "Composition_subject_idx" ON "Composition" ("subject");
CREATE INDEX "Composition_title_idx" ON "Composition" ("title");

CREATE TABLE  "Composition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Composition_History_id_idx" ON "Composition_History" ("id");
CREATE INDEX "Composition_History_lastUpdated_idx" ON "Composition_History" ("lastUpdated");

CREATE TABLE  "Composition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Composition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Composition_Refs_targetId_code_idx" ON "Composition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ConceptMap" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "dependson" TEXT[],
  "other" TEXT[],
  "product" TEXT[],
  "source" TEXT,
  "sourceCode" TEXT[],
  "sourceSystem" TEXT[],
  "sourceUri" TEXT,
  "target" TEXT,
  "targetCode" TEXT[],
  "targetSystem" TEXT[],
  "targetUri" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__otherIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT,
  "__sourceUriIdentifierSort" TEXT,
  "__targetIdentifierSort" TEXT,
  "__targetUriIdentifierSort" TEXT
);
CREATE INDEX "ConceptMap_lastUpdated_idx" ON "ConceptMap" ("lastUpdated");
CREATE INDEX "ConceptMap_projectId_lastUpdated_idx" ON "ConceptMap" ("projectId", "lastUpdated");
CREATE INDEX "ConceptMap_projectId_idx" ON "ConceptMap" ("projectId");
CREATE INDEX "ConceptMap__source_idx" ON "ConceptMap" ("_source");
CREATE INDEX "ConceptMap__profile_idx" ON "ConceptMap" USING gin ("_profile");
CREATE INDEX "ConceptMap___version_idx" ON "ConceptMap" ("__version");
CREATE INDEX "ConceptMap_compartments_idx" ON "ConceptMap" USING gin ("compartments");
CREATE INDEX "ConceptMap___sharedTokens_idx" ON "ConceptMap" USING gin ("__sharedTokens");
CREATE INDEX "ConceptMap___sharedTokensTextTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ConceptMap____tag_idx" ON "ConceptMap" USING gin ("___tag");
CREATE INDEX "ConceptMap____tagTextTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ConceptMap___context_idx" ON "ConceptMap" USING gin ("__context");
CREATE INDEX "ConceptMap___contextTextTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ConceptMap_contextQuantity_idx" ON "ConceptMap" USING gin ("contextQuantity");
CREATE INDEX "ConceptMap___contextType_idx" ON "ConceptMap" USING gin ("__contextType");
CREATE INDEX "ConceptMap___contextTypeTextTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ConceptMap_date_idx" ON "ConceptMap" ("date");
CREATE INDEX "ConceptMap_projectId_date_idx" ON "ConceptMap" ("projectId", "date");
CREATE INDEX "ConceptMap_description_idx" ON "ConceptMap" ("description");
CREATE INDEX "ConceptMap___jurisdiction_idx" ON "ConceptMap" USING gin ("__jurisdiction");
CREATE INDEX "ConceptMap___jurisdictionTextTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ConceptMap_name_idx" ON "ConceptMap" ("name");
CREATE INDEX "ConceptMap_publisher_idx" ON "ConceptMap" ("publisher");
CREATE INDEX "ConceptMap_status_idx" ON "ConceptMap" ("status");
CREATE INDEX "ConceptMap_title_idx" ON "ConceptMap" ("title");
CREATE INDEX "ConceptMap_url_idx" ON "ConceptMap" ("url");
CREATE INDEX "ConceptMap_version_idx" ON "ConceptMap" ("version");
CREATE INDEX "ConceptMap___idnt_idx" ON "ConceptMap" USING gin ("__identifier");
CREATE INDEX "ConceptMap___idntTextTrgm_idx" ON "ConceptMap" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ConceptMap_dependson_idx" ON "ConceptMap" USING gin ("dependson");
CREATE INDEX "ConceptMap_other_idx" ON "ConceptMap" USING gin ("other");
CREATE INDEX "ConceptMap_product_idx" ON "ConceptMap" USING gin ("product");
CREATE INDEX "ConceptMap_source_idx" ON "ConceptMap" ("source");
CREATE INDEX "ConceptMap_sourceCode_idx" ON "ConceptMap" USING gin ("sourceCode");
CREATE INDEX "ConceptMap_sourceSystem_idx" ON "ConceptMap" USING gin ("sourceSystem");
CREATE INDEX "ConceptMap_sourceUri_idx" ON "ConceptMap" ("sourceUri");
CREATE INDEX "ConceptMap_target_idx" ON "ConceptMap" ("target");
CREATE INDEX "ConceptMap_targetCode_idx" ON "ConceptMap" USING gin ("targetCode");
CREATE INDEX "ConceptMap_targetSystem_idx" ON "ConceptMap" USING gin ("targetSystem");
CREATE INDEX "ConceptMap_targetUri_idx" ON "ConceptMap" ("targetUri");

CREATE TABLE  "ConceptMap_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ConceptMap_History_id_idx" ON "ConceptMap_History" ("id");
CREATE INDEX "ConceptMap_History_lastUpdated_idx" ON "ConceptMap_History" ("lastUpdated");

CREATE TABLE  "ConceptMap_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ConceptMap_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ConceptMap_Refs_targetId_code_idx" ON "ConceptMap_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Condition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "abatementAge" DOUBLE PRECISION,
  "abatementDate" TIMESTAMPTZ,
  "abatementString" TEXT,
  "asserter" TEXT,
  "__bodySiteSort" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "__clinicalStatus" UUID[],
  "__clinicalStatusText" TEXT[],
  "__clinicalStatusSort" TEXT,
  "encounter" TEXT,
  "__evidenceSort" TEXT,
  "evidenceDetail" TEXT[],
  "onsetAge" DOUBLE PRECISION,
  "onsetDate" TIMESTAMPTZ,
  "onsetInfo" TEXT,
  "recordedDate" TIMESTAMPTZ,
  "__severity" UUID[],
  "__severityText" TEXT[],
  "__severitySort" TEXT,
  "__stage" UUID[],
  "__stageText" TEXT[],
  "__stageSort" TEXT,
  "subject" TEXT,
  "__verificationStatus" UUID[],
  "__verificationStatusText" TEXT[],
  "__verificationStatusSort" TEXT,
  "assertedDate" TIMESTAMPTZ,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__asserterIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__evidenceDetailIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Condition_lastUpdated_idx" ON "Condition" ("lastUpdated");
CREATE INDEX "Condition_projectId_lastUpdated_idx" ON "Condition" ("projectId", "lastUpdated");
CREATE INDEX "Condition_projectId_idx" ON "Condition" ("projectId");
CREATE INDEX "Condition__source_idx" ON "Condition" ("_source");
CREATE INDEX "Condition__profile_idx" ON "Condition" USING gin ("_profile");
CREATE INDEX "Condition___version_idx" ON "Condition" ("__version");
CREATE INDEX "Condition_compartments_idx" ON "Condition" USING gin ("compartments");
CREATE INDEX "Condition___sharedTokens_idx" ON "Condition" USING gin ("__sharedTokens");
CREATE INDEX "Condition___sharedTokensTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Condition____tag_idx" ON "Condition" USING gin ("___tag");
CREATE INDEX "Condition____tagTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Condition___code_idx" ON "Condition" USING gin ("__code");
CREATE INDEX "Condition___codeTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Condition___idnt_idx" ON "Condition" USING gin ("__identifier");
CREATE INDEX "Condition___idntTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Condition_patient_idx" ON "Condition" ("patient");
CREATE INDEX "Condition_abatementAge_idx" ON "Condition" ("abatementAge");
CREATE INDEX "Condition_abatementDate_idx" ON "Condition" ("abatementDate");
CREATE INDEX "Condition_abatementString_idx" ON "Condition" ("abatementString");
CREATE INDEX "Condition_asserter_idx" ON "Condition" ("asserter");
CREATE INDEX "Condition___category_idx" ON "Condition" USING gin ("__category");
CREATE INDEX "Condition___categoryTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Condition___clinicalStatus_idx" ON "Condition" USING gin ("__clinicalStatus");
CREATE INDEX "Condition___clinicalStatusTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__clinicalStatusText") gin_trgm_ops);
CREATE INDEX "Condition_encounter_idx" ON "Condition" ("encounter");
CREATE INDEX "Condition_evidenceDetail_idx" ON "Condition" USING gin ("evidenceDetail");
CREATE INDEX "Condition_onsetAge_idx" ON "Condition" ("onsetAge");
CREATE INDEX "Condition_onsetDate_idx" ON "Condition" ("onsetDate");
CREATE INDEX "Condition_onsetInfo_idx" ON "Condition" ("onsetInfo");
CREATE INDEX "Condition_recordedDate_idx" ON "Condition" ("recordedDate");
CREATE INDEX "Condition___severity_idx" ON "Condition" USING gin ("__severity");
CREATE INDEX "Condition___severityTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__severityText") gin_trgm_ops);
CREATE INDEX "Condition___stage_idx" ON "Condition" USING gin ("__stage");
CREATE INDEX "Condition___stageTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__stageText") gin_trgm_ops);
CREATE INDEX "Condition_subject_idx" ON "Condition" ("subject");
CREATE INDEX "Condition___verificationStatus_idx" ON "Condition" USING gin ("__verificationStatus");
CREATE INDEX "Condition___verificationStatusTextTrgm_idx" ON "Condition" USING gin (token_array_to_text("__verificationStatusText") gin_trgm_ops);
CREATE INDEX "Condition_assertedDate_idx" ON "Condition" ("assertedDate");

CREATE TABLE  "Condition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Condition_History_id_idx" ON "Condition_History" ("id");
CREATE INDEX "Condition_History_lastUpdated_idx" ON "Condition_History" ("lastUpdated");

CREATE TABLE  "Condition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Condition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Condition_Refs_targetId_code_idx" ON "Condition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Consent" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__action" UUID[],
  "__actionText" TEXT[],
  "__actionSort" TEXT,
  "actor" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "consentor" TEXT[],
  "data" TEXT[],
  "organization" TEXT[],
  "period" TIMESTAMPTZ,
  "__purpose" UUID[],
  "__purposeText" TEXT[],
  "__purposeSort" TEXT,
  "__scope" UUID[],
  "__scopeText" TEXT[],
  "__scopeSort" TEXT,
  "__securityLabel" UUID[],
  "__securityLabelText" TEXT[],
  "__securityLabelSort" TEXT,
  "sourceReference" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__actorIdentifierSort" TEXT,
  "__consentorIdentifierSort" TEXT,
  "__dataIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT,
  "__sourceReferenceIdentifierSort" TEXT
);
CREATE INDEX "Consent_lastUpdated_idx" ON "Consent" ("lastUpdated");
CREATE INDEX "Consent_projectId_lastUpdated_idx" ON "Consent" ("projectId", "lastUpdated");
CREATE INDEX "Consent_projectId_idx" ON "Consent" ("projectId");
CREATE INDEX "Consent__source_idx" ON "Consent" ("_source");
CREATE INDEX "Consent__profile_idx" ON "Consent" USING gin ("_profile");
CREATE INDEX "Consent___version_idx" ON "Consent" ("__version");
CREATE INDEX "Consent_compartments_idx" ON "Consent" USING gin ("compartments");
CREATE INDEX "Consent___sharedTokens_idx" ON "Consent" USING gin ("__sharedTokens");
CREATE INDEX "Consent___sharedTokensTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Consent____tag_idx" ON "Consent" USING gin ("___tag");
CREATE INDEX "Consent____tagTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Consent_date_idx" ON "Consent" ("date");
CREATE INDEX "Consent_projectId_date_idx" ON "Consent" ("projectId", "date");
CREATE INDEX "Consent___idnt_idx" ON "Consent" USING gin ("__identifier");
CREATE INDEX "Consent___idntTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Consent_patient_idx" ON "Consent" ("patient");
CREATE INDEX "Consent___action_idx" ON "Consent" USING gin ("__action");
CREATE INDEX "Consent___actionTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__actionText") gin_trgm_ops);
CREATE INDEX "Consent_actor_idx" ON "Consent" USING gin ("actor");
CREATE INDEX "Consent___category_idx" ON "Consent" USING gin ("__category");
CREATE INDEX "Consent___categoryTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Consent_consentor_idx" ON "Consent" USING gin ("consentor");
CREATE INDEX "Consent_data_idx" ON "Consent" USING gin ("data");
CREATE INDEX "Consent_organization_idx" ON "Consent" USING gin ("organization");
CREATE INDEX "Consent_period_idx" ON "Consent" ("period");
CREATE INDEX "Consent___purpose_idx" ON "Consent" USING gin ("__purpose");
CREATE INDEX "Consent___purposeTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__purposeText") gin_trgm_ops);
CREATE INDEX "Consent___scope_idx" ON "Consent" USING gin ("__scope");
CREATE INDEX "Consent___scopeTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__scopeText") gin_trgm_ops);
CREATE INDEX "Consent___securityLabel_idx" ON "Consent" USING gin ("__securityLabel");
CREATE INDEX "Consent___securityLabelTextTrgm_idx" ON "Consent" USING gin (token_array_to_text("__securityLabelText") gin_trgm_ops);
CREATE INDEX "Consent_sourceReference_idx" ON "Consent" ("sourceReference");
CREATE INDEX "Consent_status_idx" ON "Consent" ("status");

CREATE TABLE  "Consent_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Consent_History_id_idx" ON "Consent_History" ("id");
CREATE INDEX "Consent_History_lastUpdated_idx" ON "Consent_History" ("lastUpdated");

CREATE TABLE  "Consent_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Consent_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Consent_Refs_targetId_code_idx" ON "Consent_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Contract" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "authority" TEXT[],
  "domain" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "instantiates" TEXT,
  "issued" TIMESTAMPTZ,
  "patient" TEXT[],
  "signer" TEXT[],
  "status" TEXT,
  "subject" TEXT[],
  "url" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__authorityIdentifierSort" TEXT,
  "__domainIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__signerIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Contract_lastUpdated_idx" ON "Contract" ("lastUpdated");
CREATE INDEX "Contract_projectId_lastUpdated_idx" ON "Contract" ("projectId", "lastUpdated");
CREATE INDEX "Contract_projectId_idx" ON "Contract" ("projectId");
CREATE INDEX "Contract__source_idx" ON "Contract" ("_source");
CREATE INDEX "Contract__profile_idx" ON "Contract" USING gin ("_profile");
CREATE INDEX "Contract___version_idx" ON "Contract" ("__version");
CREATE INDEX "Contract_compartments_idx" ON "Contract" USING gin ("compartments");
CREATE INDEX "Contract___sharedTokens_idx" ON "Contract" USING gin ("__sharedTokens");
CREATE INDEX "Contract___sharedTokensTextTrgm_idx" ON "Contract" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Contract____tag_idx" ON "Contract" USING gin ("___tag");
CREATE INDEX "Contract____tagTextTrgm_idx" ON "Contract" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Contract_authority_idx" ON "Contract" USING gin ("authority");
CREATE INDEX "Contract_domain_idx" ON "Contract" USING gin ("domain");
CREATE INDEX "Contract___idnt_idx" ON "Contract" USING gin ("__identifier");
CREATE INDEX "Contract___idntTextTrgm_idx" ON "Contract" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Contract_instantiates_idx" ON "Contract" ("instantiates");
CREATE INDEX "Contract_issued_idx" ON "Contract" ("issued");
CREATE INDEX "Contract_patient_idx" ON "Contract" USING gin ("patient");
CREATE INDEX "Contract_signer_idx" ON "Contract" USING gin ("signer");
CREATE INDEX "Contract_status_idx" ON "Contract" ("status");
CREATE INDEX "Contract_subject_idx" ON "Contract" USING gin ("subject");
CREATE INDEX "Contract_url_idx" ON "Contract" ("url");

CREATE TABLE  "Contract_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Contract_History_id_idx" ON "Contract_History" ("id");
CREATE INDEX "Contract_History_lastUpdated_idx" ON "Contract_History" ("lastUpdated");

CREATE TABLE  "Contract_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Contract_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Contract_Refs_targetId_code_idx" ON "Contract_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Coverage" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "beneficiary" TEXT,
  "__classType" UUID[],
  "__classTypeText" TEXT[],
  "__classTypeSort" TEXT,
  "classValue" TEXT[],
  "dependent" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "payor" TEXT[],
  "policyHolder" TEXT,
  "status" TEXT,
  "subscriber" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__beneficiaryIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__payorIdentifierSort" TEXT,
  "__policyHolderIdentifierSort" TEXT,
  "__subscriberIdentifierSort" TEXT
);
CREATE INDEX "Coverage_lastUpdated_idx" ON "Coverage" ("lastUpdated");
CREATE INDEX "Coverage_projectId_lastUpdated_idx" ON "Coverage" ("projectId", "lastUpdated");
CREATE INDEX "Coverage_projectId_idx" ON "Coverage" ("projectId");
CREATE INDEX "Coverage__source_idx" ON "Coverage" ("_source");
CREATE INDEX "Coverage__profile_idx" ON "Coverage" USING gin ("_profile");
CREATE INDEX "Coverage___version_idx" ON "Coverage" ("__version");
CREATE INDEX "Coverage_compartments_idx" ON "Coverage" USING gin ("compartments");
CREATE INDEX "Coverage___sharedTokens_idx" ON "Coverage" USING gin ("__sharedTokens");
CREATE INDEX "Coverage___sharedTokensTextTrgm_idx" ON "Coverage" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Coverage____tag_idx" ON "Coverage" USING gin ("___tag");
CREATE INDEX "Coverage____tagTextTrgm_idx" ON "Coverage" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Coverage_beneficiary_idx" ON "Coverage" ("beneficiary");
CREATE INDEX "Coverage___classType_idx" ON "Coverage" USING gin ("__classType");
CREATE INDEX "Coverage___classTypeTextTrgm_idx" ON "Coverage" USING gin (token_array_to_text("__classTypeText") gin_trgm_ops);
CREATE INDEX "Coverage_classValue_idx" ON "Coverage" USING gin ("classValue");
CREATE INDEX "Coverage_dependent_idx" ON "Coverage" ("dependent");
CREATE INDEX "Coverage___idnt_idx" ON "Coverage" USING gin ("__identifier");
CREATE INDEX "Coverage___idntTextTrgm_idx" ON "Coverage" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Coverage_patient_idx" ON "Coverage" ("patient");
CREATE INDEX "Coverage_payor_idx" ON "Coverage" USING gin ("payor");
CREATE INDEX "Coverage_policyHolder_idx" ON "Coverage" ("policyHolder");
CREATE INDEX "Coverage_status_idx" ON "Coverage" ("status");
CREATE INDEX "Coverage_subscriber_idx" ON "Coverage" ("subscriber");
CREATE INDEX "Coverage___type_idx" ON "Coverage" USING gin ("__type");
CREATE INDEX "Coverage___typeTextTrgm_idx" ON "Coverage" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "Coverage_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Coverage_History_id_idx" ON "Coverage_History" ("id");
CREATE INDEX "Coverage_History_lastUpdated_idx" ON "Coverage_History" ("lastUpdated");

CREATE TABLE  "Coverage_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Coverage_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Coverage_Refs_targetId_code_idx" ON "Coverage_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CoverageEligibilityRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "created" TIMESTAMPTZ,
  "enterer" TEXT,
  "facility" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "provider" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__entererIdentifierSort" TEXT,
  "__facilityIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__providerIdentifierSort" TEXT
);
CREATE INDEX "CoverageEligibilityRequest_lastUpdated_idx" ON "CoverageEligibilityRequest" ("lastUpdated");
CREATE INDEX "CoverageEligibilityRequest_projectId_lastUpdated_idx" ON "CoverageEligibilityRequest" ("projectId", "lastUpdated");
CREATE INDEX "CoverageEligibilityRequest_projectId_idx" ON "CoverageEligibilityRequest" ("projectId");
CREATE INDEX "CoverageEligibilityRequest__source_idx" ON "CoverageEligibilityRequest" ("_source");
CREATE INDEX "CoverageEligibilityRequest__profile_idx" ON "CoverageEligibilityRequest" USING gin ("_profile");
CREATE INDEX "CoverageEligibilityRequest___version_idx" ON "CoverageEligibilityRequest" ("__version");
CREATE INDEX "CoverageEligibilityRequest_compartments_idx" ON "CoverageEligibilityRequest" USING gin ("compartments");
CREATE INDEX "CoverageEligibilityRequest___sharedTokens_idx" ON "CoverageEligibilityRequest" USING gin ("__sharedTokens");
CREATE INDEX "CoverageEligibilityRequest___sharedTokensTextTrgm_idx" ON "CoverageEligibilityRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CoverageEligibilityRequest____tag_idx" ON "CoverageEligibilityRequest" USING gin ("___tag");
CREATE INDEX "CoverageEligibilityRequest____tagTextTrgm_idx" ON "CoverageEligibilityRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CoverageEligibilityRequest_created_idx" ON "CoverageEligibilityRequest" ("created");
CREATE INDEX "CoverageEligibilityRequest_enterer_idx" ON "CoverageEligibilityRequest" ("enterer");
CREATE INDEX "CoverageEligibilityRequest_facility_idx" ON "CoverageEligibilityRequest" ("facility");
CREATE INDEX "CoverageEligibilityRequest___idnt_idx" ON "CoverageEligibilityRequest" USING gin ("__identifier");
CREATE INDEX "CoverageEligibilityRequest___idntTextTrgm_idx" ON "CoverageEligibilityRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "CoverageEligibilityRequest_patient_idx" ON "CoverageEligibilityRequest" ("patient");
CREATE INDEX "CoverageEligibilityRequest_provider_idx" ON "CoverageEligibilityRequest" ("provider");
CREATE INDEX "CoverageEligibilityRequest_status_idx" ON "CoverageEligibilityRequest" ("status");

CREATE TABLE  "CoverageEligibilityRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CoverageEligibilityRequest_History_id_idx" ON "CoverageEligibilityRequest_History" ("id");
CREATE INDEX "CoverageEligibilityRequest_History_lastUpdated_idx" ON "CoverageEligibilityRequest_History" ("lastUpdated");

CREATE TABLE  "CoverageEligibilityRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CoverageEligibilityRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CoverageEligibilityRequest_Refs_targetId_code_idx" ON "CoverageEligibilityRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "CoverageEligibilityResponse" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "created" TIMESTAMPTZ,
  "disposition" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "insurer" TEXT,
  "outcome" TEXT,
  "patient" TEXT,
  "request" TEXT,
  "requestor" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__insurerIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__requestIdentifierSort" TEXT,
  "__requestorIdentifierSort" TEXT
);
CREATE INDEX "CoverageEligibilityResponse_lastUpdated_idx" ON "CoverageEligibilityResponse" ("lastUpdated");
CREATE INDEX "CoverageEligibilityResponse_projectId_lastUpdated_idx" ON "CoverageEligibilityResponse" ("projectId", "lastUpdated");
CREATE INDEX "CoverageEligibilityResponse_projectId_idx" ON "CoverageEligibilityResponse" ("projectId");
CREATE INDEX "CoverageEligibilityResponse__source_idx" ON "CoverageEligibilityResponse" ("_source");
CREATE INDEX "CoverageEligibilityResponse__profile_idx" ON "CoverageEligibilityResponse" USING gin ("_profile");
CREATE INDEX "CoverageEligibilityResponse___version_idx" ON "CoverageEligibilityResponse" ("__version");
CREATE INDEX "CoverageEligibilityResponse_compartments_idx" ON "CoverageEligibilityResponse" USING gin ("compartments");
CREATE INDEX "CoverageEligibilityResponse___sharedTokens_idx" ON "CoverageEligibilityResponse" USING gin ("__sharedTokens");
CREATE INDEX "CoverageEligibilityResponse___sharedTokensTextTrgm_idx" ON "CoverageEligibilityResponse" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "CoverageEligibilityResponse____tag_idx" ON "CoverageEligibilityResponse" USING gin ("___tag");
CREATE INDEX "CoverageEligibilityResponse____tagTextTrgm_idx" ON "CoverageEligibilityResponse" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "CoverageEligibilityResponse_created_idx" ON "CoverageEligibilityResponse" ("created");
CREATE INDEX "CoverageEligibilityResponse_disposition_idx" ON "CoverageEligibilityResponse" ("disposition");
CREATE INDEX "CoverageEligibilityResponse___idnt_idx" ON "CoverageEligibilityResponse" USING gin ("__identifier");
CREATE INDEX "CoverageEligibilityResponse___idntTextTrgm_idx" ON "CoverageEligibilityResponse" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "CoverageEligibilityResponse_insurer_idx" ON "CoverageEligibilityResponse" ("insurer");
CREATE INDEX "CoverageEligibilityResponse_outcome_idx" ON "CoverageEligibilityResponse" ("outcome");
CREATE INDEX "CoverageEligibilityResponse_patient_idx" ON "CoverageEligibilityResponse" ("patient");
CREATE INDEX "CoverageEligibilityResponse_request_idx" ON "CoverageEligibilityResponse" ("request");
CREATE INDEX "CoverageEligibilityResponse_requestor_idx" ON "CoverageEligibilityResponse" ("requestor");
CREATE INDEX "CoverageEligibilityResponse_status_idx" ON "CoverageEligibilityResponse" ("status");

CREATE TABLE  "CoverageEligibilityResponse_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "CoverageEligibilityResponse_History_id_idx" ON "CoverageEligibilityResponse_History" ("id");
CREATE INDEX "CoverageEligibilityResponse_History_lastUpdated_idx" ON "CoverageEligibilityResponse_History" ("lastUpdated");

CREATE TABLE  "CoverageEligibilityResponse_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "CoverageEligibilityResponse_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "CoverageEligibilityResponse_Refs_targetId_code_idx" ON "CoverageEligibilityResponse_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DetectedIssue" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "author" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "identified" TIMESTAMPTZ,
  "implicated" TEXT[],
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__implicatedIdentifierSort" TEXT
);
CREATE INDEX "DetectedIssue_lastUpdated_idx" ON "DetectedIssue" ("lastUpdated");
CREATE INDEX "DetectedIssue_projectId_lastUpdated_idx" ON "DetectedIssue" ("projectId", "lastUpdated");
CREATE INDEX "DetectedIssue_projectId_idx" ON "DetectedIssue" ("projectId");
CREATE INDEX "DetectedIssue__source_idx" ON "DetectedIssue" ("_source");
CREATE INDEX "DetectedIssue__profile_idx" ON "DetectedIssue" USING gin ("_profile");
CREATE INDEX "DetectedIssue___version_idx" ON "DetectedIssue" ("__version");
CREATE INDEX "DetectedIssue_compartments_idx" ON "DetectedIssue" USING gin ("compartments");
CREATE INDEX "DetectedIssue___sharedTokens_idx" ON "DetectedIssue" USING gin ("__sharedTokens");
CREATE INDEX "DetectedIssue___sharedTokensTextTrgm_idx" ON "DetectedIssue" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DetectedIssue____tag_idx" ON "DetectedIssue" USING gin ("___tag");
CREATE INDEX "DetectedIssue____tagTextTrgm_idx" ON "DetectedIssue" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DetectedIssue___idnt_idx" ON "DetectedIssue" USING gin ("__identifier");
CREATE INDEX "DetectedIssue___idntTextTrgm_idx" ON "DetectedIssue" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DetectedIssue_patient_idx" ON "DetectedIssue" ("patient");
CREATE INDEX "DetectedIssue_author_idx" ON "DetectedIssue" ("author");
CREATE INDEX "DetectedIssue___code_idx" ON "DetectedIssue" USING gin ("__code");
CREATE INDEX "DetectedIssue___codeTextTrgm_idx" ON "DetectedIssue" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "DetectedIssue_identified_idx" ON "DetectedIssue" ("identified");
CREATE INDEX "DetectedIssue_implicated_idx" ON "DetectedIssue" USING gin ("implicated");
CREATE INDEX "DetectedIssue_status_idx" ON "DetectedIssue" ("status");

CREATE TABLE  "DetectedIssue_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DetectedIssue_History_id_idx" ON "DetectedIssue_History" ("id");
CREATE INDEX "DetectedIssue_History_lastUpdated_idx" ON "DetectedIssue_History" ("lastUpdated");

CREATE TABLE  "DetectedIssue_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DetectedIssue_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DetectedIssue_Refs_targetId_code_idx" ON "DetectedIssue_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Device" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "deviceName" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "location" TEXT,
  "manufacturer" TEXT,
  "model" TEXT,
  "organization" TEXT,
  "patient" TEXT,
  "status" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "udiCarrier" TEXT[],
  "udiDi" TEXT[],
  "url" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT
);
CREATE INDEX "Device_lastUpdated_idx" ON "Device" ("lastUpdated");
CREATE INDEX "Device_projectId_lastUpdated_idx" ON "Device" ("projectId", "lastUpdated");
CREATE INDEX "Device_projectId_idx" ON "Device" ("projectId");
CREATE INDEX "Device__source_idx" ON "Device" ("_source");
CREATE INDEX "Device__profile_idx" ON "Device" USING gin ("_profile");
CREATE INDEX "Device___version_idx" ON "Device" ("__version");
CREATE INDEX "Device_compartments_idx" ON "Device" USING gin ("compartments");
CREATE INDEX "Device___sharedTokens_idx" ON "Device" USING gin ("__sharedTokens");
CREATE INDEX "Device___sharedTokensTextTrgm_idx" ON "Device" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Device____tag_idx" ON "Device" USING gin ("___tag");
CREATE INDEX "Device____tagTextTrgm_idx" ON "Device" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Device_deviceName_idx" ON "Device" USING gin ("deviceName");
CREATE INDEX "Device___idnt_idx" ON "Device" USING gin ("__identifier");
CREATE INDEX "Device___idntTextTrgm_idx" ON "Device" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Device_location_idx" ON "Device" ("location");
CREATE INDEX "Device_manufacturer_idx" ON "Device" ("manufacturer");
CREATE INDEX "Device_model_idx" ON "Device" ("model");
CREATE INDEX "Device_organization_idx" ON "Device" ("organization");
CREATE INDEX "Device_patient_idx" ON "Device" ("patient");
CREATE INDEX "Device_status_idx" ON "Device" ("status");
CREATE INDEX "Device___type_idx" ON "Device" USING gin ("__type");
CREATE INDEX "Device___typeTextTrgm_idx" ON "Device" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "Device_udiCarrier_idx" ON "Device" USING gin ("udiCarrier");
CREATE INDEX "Device_udiDi_idx" ON "Device" USING gin ("udiDi");
CREATE INDEX "Device_url_idx" ON "Device" ("url");

CREATE TABLE  "Device_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Device_History_id_idx" ON "Device_History" ("id");
CREATE INDEX "Device_History_lastUpdated_idx" ON "Device_History" ("lastUpdated");

CREATE TABLE  "Device_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Device_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Device_Refs_targetId_code_idx" ON "Device_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DeviceDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "parent" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "__classification" UUID[],
  "__classificationText" TEXT[],
  "__classificationSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__parentIdentifierSort" TEXT
);
CREATE INDEX "DeviceDefinition_lastUpdated_idx" ON "DeviceDefinition" ("lastUpdated");
CREATE INDEX "DeviceDefinition_projectId_lastUpdated_idx" ON "DeviceDefinition" ("projectId", "lastUpdated");
CREATE INDEX "DeviceDefinition_projectId_idx" ON "DeviceDefinition" ("projectId");
CREATE INDEX "DeviceDefinition__source_idx" ON "DeviceDefinition" ("_source");
CREATE INDEX "DeviceDefinition__profile_idx" ON "DeviceDefinition" USING gin ("_profile");
CREATE INDEX "DeviceDefinition___version_idx" ON "DeviceDefinition" ("__version");
CREATE INDEX "DeviceDefinition_compartments_idx" ON "DeviceDefinition" USING gin ("compartments");
CREATE INDEX "DeviceDefinition___sharedTokens_idx" ON "DeviceDefinition" USING gin ("__sharedTokens");
CREATE INDEX "DeviceDefinition___sharedTokensTextTrgm_idx" ON "DeviceDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DeviceDefinition____tag_idx" ON "DeviceDefinition" USING gin ("___tag");
CREATE INDEX "DeviceDefinition____tagTextTrgm_idx" ON "DeviceDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DeviceDefinition___idnt_idx" ON "DeviceDefinition" USING gin ("__identifier");
CREATE INDEX "DeviceDefinition___idntTextTrgm_idx" ON "DeviceDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DeviceDefinition_parent_idx" ON "DeviceDefinition" ("parent");
CREATE INDEX "DeviceDefinition___type_idx" ON "DeviceDefinition" USING gin ("__type");
CREATE INDEX "DeviceDefinition___typeTextTrgm_idx" ON "DeviceDefinition" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "DeviceDefinition___classification_idx" ON "DeviceDefinition" USING gin ("__classification");
CREATE INDEX "DeviceDefinition___classificationTextTrgm_idx" ON "DeviceDefinition" USING gin (token_array_to_text("__classificationText") gin_trgm_ops);

CREATE TABLE  "DeviceDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DeviceDefinition_History_id_idx" ON "DeviceDefinition_History" ("id");
CREATE INDEX "DeviceDefinition_History_lastUpdated_idx" ON "DeviceDefinition_History" ("lastUpdated");

CREATE TABLE  "DeviceDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DeviceDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DeviceDefinition_Refs_targetId_code_idx" ON "DeviceDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DeviceMetric" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "category" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "parent" TEXT,
  "source" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__parentIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT
);
CREATE INDEX "DeviceMetric_lastUpdated_idx" ON "DeviceMetric" ("lastUpdated");
CREATE INDEX "DeviceMetric_projectId_lastUpdated_idx" ON "DeviceMetric" ("projectId", "lastUpdated");
CREATE INDEX "DeviceMetric_projectId_idx" ON "DeviceMetric" ("projectId");
CREATE INDEX "DeviceMetric__source_idx" ON "DeviceMetric" ("_source");
CREATE INDEX "DeviceMetric__profile_idx" ON "DeviceMetric" USING gin ("_profile");
CREATE INDEX "DeviceMetric___version_idx" ON "DeviceMetric" ("__version");
CREATE INDEX "DeviceMetric_compartments_idx" ON "DeviceMetric" USING gin ("compartments");
CREATE INDEX "DeviceMetric___sharedTokens_idx" ON "DeviceMetric" USING gin ("__sharedTokens");
CREATE INDEX "DeviceMetric___sharedTokensTextTrgm_idx" ON "DeviceMetric" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DeviceMetric____tag_idx" ON "DeviceMetric" USING gin ("___tag");
CREATE INDEX "DeviceMetric____tagTextTrgm_idx" ON "DeviceMetric" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DeviceMetric_category_idx" ON "DeviceMetric" ("category");
CREATE INDEX "DeviceMetric___idnt_idx" ON "DeviceMetric" USING gin ("__identifier");
CREATE INDEX "DeviceMetric___idntTextTrgm_idx" ON "DeviceMetric" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DeviceMetric_parent_idx" ON "DeviceMetric" ("parent");
CREATE INDEX "DeviceMetric_source_idx" ON "DeviceMetric" ("source");
CREATE INDEX "DeviceMetric___type_idx" ON "DeviceMetric" USING gin ("__type");
CREATE INDEX "DeviceMetric___typeTextTrgm_idx" ON "DeviceMetric" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "DeviceMetric_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DeviceMetric_History_id_idx" ON "DeviceMetric_History" ("id");
CREATE INDEX "DeviceMetric_History_lastUpdated_idx" ON "DeviceMetric_History" ("lastUpdated");

CREATE TABLE  "DeviceMetric_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DeviceMetric_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DeviceMetric_Refs_targetId_code_idx" ON "DeviceMetric_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DeviceRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "authoredOn" TIMESTAMPTZ,
  "basedOn" TEXT[],
  "device" TEXT,
  "eventDate" TIMESTAMPTZ,
  "__groupIdentifier" UUID[],
  "__groupIdentifierText" TEXT[],
  "__groupIdentifierSort" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "insurance" TEXT[],
  "intent" TEXT,
  "performer" TEXT,
  "priorRequest" TEXT[],
  "requester" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__deviceIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__insuranceIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__priorRequestIdentifierSort" TEXT,
  "__requesterIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "DeviceRequest_lastUpdated_idx" ON "DeviceRequest" ("lastUpdated");
CREATE INDEX "DeviceRequest_projectId_lastUpdated_idx" ON "DeviceRequest" ("projectId", "lastUpdated");
CREATE INDEX "DeviceRequest_projectId_idx" ON "DeviceRequest" ("projectId");
CREATE INDEX "DeviceRequest__source_idx" ON "DeviceRequest" ("_source");
CREATE INDEX "DeviceRequest__profile_idx" ON "DeviceRequest" USING gin ("_profile");
CREATE INDEX "DeviceRequest___version_idx" ON "DeviceRequest" ("__version");
CREATE INDEX "DeviceRequest_compartments_idx" ON "DeviceRequest" USING gin ("compartments");
CREATE INDEX "DeviceRequest___sharedTokens_idx" ON "DeviceRequest" USING gin ("__sharedTokens");
CREATE INDEX "DeviceRequest___sharedTokensTextTrgm_idx" ON "DeviceRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DeviceRequest____tag_idx" ON "DeviceRequest" USING gin ("___tag");
CREATE INDEX "DeviceRequest____tagTextTrgm_idx" ON "DeviceRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DeviceRequest___code_idx" ON "DeviceRequest" USING gin ("__code");
CREATE INDEX "DeviceRequest___codeTextTrgm_idx" ON "DeviceRequest" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "DeviceRequest___idnt_idx" ON "DeviceRequest" USING gin ("__identifier");
CREATE INDEX "DeviceRequest___idntTextTrgm_idx" ON "DeviceRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DeviceRequest_patient_idx" ON "DeviceRequest" ("patient");
CREATE INDEX "DeviceRequest_encounter_idx" ON "DeviceRequest" ("encounter");
CREATE INDEX "DeviceRequest_authoredOn_idx" ON "DeviceRequest" ("authoredOn");
CREATE INDEX "DeviceRequest_basedOn_idx" ON "DeviceRequest" USING gin ("basedOn");
CREATE INDEX "DeviceRequest_device_idx" ON "DeviceRequest" ("device");
CREATE INDEX "DeviceRequest_eventDate_idx" ON "DeviceRequest" ("eventDate");
CREATE INDEX "DeviceRequest___groupIdnt_idx" ON "DeviceRequest" USING gin ("__groupIdentifier");
CREATE INDEX "DeviceRequest___groupIdntTextTrgm_idx" ON "DeviceRequest" USING gin (token_array_to_text("__groupIdentifierText") gin_trgm_ops);
CREATE INDEX "DeviceRequest_instantiatesCanonical_idx" ON "DeviceRequest" USING gin ("instantiatesCanonical");
CREATE INDEX "DeviceRequest_instantiatesUri_idx" ON "DeviceRequest" USING gin ("instantiatesUri");
CREATE INDEX "DeviceRequest_insurance_idx" ON "DeviceRequest" USING gin ("insurance");
CREATE INDEX "DeviceRequest_intent_idx" ON "DeviceRequest" ("intent");
CREATE INDEX "DeviceRequest_performer_idx" ON "DeviceRequest" ("performer");
CREATE INDEX "DeviceRequest_priorRequest_idx" ON "DeviceRequest" USING gin ("priorRequest");
CREATE INDEX "DeviceRequest_requester_idx" ON "DeviceRequest" ("requester");
CREATE INDEX "DeviceRequest_status_idx" ON "DeviceRequest" ("status");
CREATE INDEX "DeviceRequest_subject_idx" ON "DeviceRequest" ("subject");

CREATE TABLE  "DeviceRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DeviceRequest_History_id_idx" ON "DeviceRequest_History" ("id");
CREATE INDEX "DeviceRequest_History_lastUpdated_idx" ON "DeviceRequest_History" ("lastUpdated");

CREATE TABLE  "DeviceRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DeviceRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DeviceRequest_Refs_targetId_code_idx" ON "DeviceRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DeviceUseStatement" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "patient" TEXT,
  "device" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__deviceIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "DeviceUseStatement_lastUpdated_idx" ON "DeviceUseStatement" ("lastUpdated");
CREATE INDEX "DeviceUseStatement_projectId_lastUpdated_idx" ON "DeviceUseStatement" ("projectId", "lastUpdated");
CREATE INDEX "DeviceUseStatement_projectId_idx" ON "DeviceUseStatement" ("projectId");
CREATE INDEX "DeviceUseStatement__source_idx" ON "DeviceUseStatement" ("_source");
CREATE INDEX "DeviceUseStatement__profile_idx" ON "DeviceUseStatement" USING gin ("_profile");
CREATE INDEX "DeviceUseStatement___version_idx" ON "DeviceUseStatement" ("__version");
CREATE INDEX "DeviceUseStatement_compartments_idx" ON "DeviceUseStatement" USING gin ("compartments");
CREATE INDEX "DeviceUseStatement___sharedTokens_idx" ON "DeviceUseStatement" USING gin ("__sharedTokens");
CREATE INDEX "DeviceUseStatement___sharedTokensTextTrgm_idx" ON "DeviceUseStatement" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DeviceUseStatement____tag_idx" ON "DeviceUseStatement" USING gin ("___tag");
CREATE INDEX "DeviceUseStatement____tagTextTrgm_idx" ON "DeviceUseStatement" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DeviceUseStatement_patient_idx" ON "DeviceUseStatement" ("patient");
CREATE INDEX "DeviceUseStatement_device_idx" ON "DeviceUseStatement" ("device");
CREATE INDEX "DeviceUseStatement___idnt_idx" ON "DeviceUseStatement" USING gin ("__identifier");
CREATE INDEX "DeviceUseStatement___idntTextTrgm_idx" ON "DeviceUseStatement" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DeviceUseStatement_subject_idx" ON "DeviceUseStatement" ("subject");

CREATE TABLE  "DeviceUseStatement_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DeviceUseStatement_History_id_idx" ON "DeviceUseStatement_History" ("id");
CREATE INDEX "DeviceUseStatement_History_lastUpdated_idx" ON "DeviceUseStatement_History" ("lastUpdated");

CREATE TABLE  "DeviceUseStatement_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DeviceUseStatement_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DeviceUseStatement_Refs_targetId_code_idx" ON "DeviceUseStatement_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DiagnosticReport" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "basedOn" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "__conclusionSort" TEXT,
  "issued" TIMESTAMPTZ,
  "media" TEXT[],
  "performer" TEXT[],
  "result" TEXT[],
  "resultsInterpreter" TEXT[],
  "specimen" TEXT[],
  "status" TEXT,
  "subject" TEXT,
  "study" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__mediaIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__resultIdentifier" UUID[],
  "__resultIdentifierText" TEXT[],
  "__resultIdentifierSort" TEXT,
  "__resultsInterpreterIdentifierSort" TEXT,
  "__specimenIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT,
  "__studyIdentifierSort" TEXT
);
CREATE INDEX "DiagnosticReport_lastUpdated_idx" ON "DiagnosticReport" ("lastUpdated");
CREATE INDEX "DiagnosticReport_projectId_lastUpdated_idx" ON "DiagnosticReport" ("projectId", "lastUpdated");
CREATE INDEX "DiagnosticReport_projectId_idx" ON "DiagnosticReport" ("projectId");
CREATE INDEX "DiagnosticReport__source_idx" ON "DiagnosticReport" ("_source");
CREATE INDEX "DiagnosticReport__profile_idx" ON "DiagnosticReport" USING gin ("_profile");
CREATE INDEX "DiagnosticReport___version_idx" ON "DiagnosticReport" ("__version");
CREATE INDEX "DiagnosticReport_compartments_idx" ON "DiagnosticReport" USING gin ("compartments");
CREATE INDEX "DiagnosticReport___sharedTokens_idx" ON "DiagnosticReport" USING gin ("__sharedTokens");
CREATE INDEX "DiagnosticReport___sharedTokensTextTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DiagnosticReport____tag_idx" ON "DiagnosticReport" USING gin ("___tag");
CREATE INDEX "DiagnosticReport____tagTextTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DiagnosticReport___code_idx" ON "DiagnosticReport" USING gin ("__code");
CREATE INDEX "DiagnosticReport___codeTextTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "DiagnosticReport_date_idx" ON "DiagnosticReport" ("date");
CREATE INDEX "DiagnosticReport_projectId_date_idx" ON "DiagnosticReport" ("projectId", "date");
CREATE INDEX "DiagnosticReport___idnt_idx" ON "DiagnosticReport" USING gin ("__identifier");
CREATE INDEX "DiagnosticReport___idntTextTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DiagnosticReport_patient_idx" ON "DiagnosticReport" ("patient");
CREATE INDEX "DiagnosticReport_encounter_idx" ON "DiagnosticReport" ("encounter");
CREATE INDEX "DiagnosticReport_basedOn_idx" ON "DiagnosticReport" USING gin ("basedOn");
CREATE INDEX "DiagnosticReport___category_idx" ON "DiagnosticReport" USING gin ("__category");
CREATE INDEX "DiagnosticReport___categoryTextTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "DiagnosticReport_issued_idx" ON "DiagnosticReport" ("issued");
CREATE INDEX "DiagnosticReport_media_idx" ON "DiagnosticReport" USING gin ("media");
CREATE INDEX "DiagnosticReport_performer_idx" ON "DiagnosticReport" USING gin ("performer");
CREATE INDEX "DiagnosticReport_result_idx" ON "DiagnosticReport" USING gin ("result");
CREATE INDEX "DiagnosticReport_resultsInterpreter_idx" ON "DiagnosticReport" USING gin ("resultsInterpreter");
CREATE INDEX "DiagnosticReport_specimen_idx" ON "DiagnosticReport" USING gin ("specimen");
CREATE INDEX "DiagnosticReport_status_idx" ON "DiagnosticReport" ("status");
CREATE INDEX "DiagnosticReport_subject_idx" ON "DiagnosticReport" ("subject");
CREATE INDEX "DiagnosticReport_study_idx" ON "DiagnosticReport" USING gin ("study");
CREATE INDEX "DiagnosticReport___resultIdnt_idx" ON "DiagnosticReport" USING gin ("__resultIdentifier");
CREATE INDEX "DiagnosticReport___resultIdntTextTrgm_idx" ON "DiagnosticReport" USING gin (token_array_to_text("__resultIdentifierText") gin_trgm_ops);

CREATE TABLE  "DiagnosticReport_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DiagnosticReport_History_id_idx" ON "DiagnosticReport_History" ("id");
CREATE INDEX "DiagnosticReport_History_lastUpdated_idx" ON "DiagnosticReport_History" ("lastUpdated");

CREATE TABLE  "DiagnosticReport_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DiagnosticReport_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DiagnosticReport_Refs_targetId_code_idx" ON "DiagnosticReport_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DocumentManifest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "author" TEXT[],
  "created" TIMESTAMPTZ,
  "description" TEXT,
  "item" TEXT[],
  "recipient" TEXT[],
  "__relatedId" UUID[],
  "__relatedIdText" TEXT[],
  "__relatedIdSort" TEXT,
  "relatedRef" TEXT[],
  "source" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__itemIdentifierSort" TEXT,
  "__recipientIdentifierSort" TEXT,
  "__relatedRefIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "DocumentManifest_lastUpdated_idx" ON "DocumentManifest" ("lastUpdated");
CREATE INDEX "DocumentManifest_projectId_lastUpdated_idx" ON "DocumentManifest" ("projectId", "lastUpdated");
CREATE INDEX "DocumentManifest_projectId_idx" ON "DocumentManifest" ("projectId");
CREATE INDEX "DocumentManifest__source_idx" ON "DocumentManifest" ("_source");
CREATE INDEX "DocumentManifest__profile_idx" ON "DocumentManifest" USING gin ("_profile");
CREATE INDEX "DocumentManifest___version_idx" ON "DocumentManifest" ("__version");
CREATE INDEX "DocumentManifest_compartments_idx" ON "DocumentManifest" USING gin ("compartments");
CREATE INDEX "DocumentManifest___sharedTokens_idx" ON "DocumentManifest" USING gin ("__sharedTokens");
CREATE INDEX "DocumentManifest___sharedTokensTextTrgm_idx" ON "DocumentManifest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DocumentManifest____tag_idx" ON "DocumentManifest" USING gin ("___tag");
CREATE INDEX "DocumentManifest____tagTextTrgm_idx" ON "DocumentManifest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DocumentManifest___idnt_idx" ON "DocumentManifest" USING gin ("__identifier");
CREATE INDEX "DocumentManifest___idntTextTrgm_idx" ON "DocumentManifest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DocumentManifest_patient_idx" ON "DocumentManifest" ("patient");
CREATE INDEX "DocumentManifest___type_idx" ON "DocumentManifest" USING gin ("__type");
CREATE INDEX "DocumentManifest___typeTextTrgm_idx" ON "DocumentManifest" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "DocumentManifest_author_idx" ON "DocumentManifest" USING gin ("author");
CREATE INDEX "DocumentManifest_created_idx" ON "DocumentManifest" ("created");
CREATE INDEX "DocumentManifest_description_idx" ON "DocumentManifest" ("description");
CREATE INDEX "DocumentManifest_item_idx" ON "DocumentManifest" USING gin ("item");
CREATE INDEX "DocumentManifest_recipient_idx" ON "DocumentManifest" USING gin ("recipient");
CREATE INDEX "DocumentManifest___relatedId_idx" ON "DocumentManifest" USING gin ("__relatedId");
CREATE INDEX "DocumentManifest___relatedIdTextTrgm_idx" ON "DocumentManifest" USING gin (token_array_to_text("__relatedIdText") gin_trgm_ops);
CREATE INDEX "DocumentManifest_relatedRef_idx" ON "DocumentManifest" USING gin ("relatedRef");
CREATE INDEX "DocumentManifest_source_idx" ON "DocumentManifest" ("source");
CREATE INDEX "DocumentManifest_status_idx" ON "DocumentManifest" ("status");
CREATE INDEX "DocumentManifest_subject_idx" ON "DocumentManifest" ("subject");

CREATE TABLE  "DocumentManifest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DocumentManifest_History_id_idx" ON "DocumentManifest_History" ("id");
CREATE INDEX "DocumentManifest_History_lastUpdated_idx" ON "DocumentManifest_History" ("lastUpdated");

CREATE TABLE  "DocumentManifest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DocumentManifest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DocumentManifest_Refs_targetId_code_idx" ON "DocumentManifest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DocumentReference" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "encounter" TEXT[],
  "authenticator" TEXT,
  "author" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "contenttype" TEXT[],
  "custodian" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__eventSort" TEXT,
  "__facility" UUID[],
  "__facilityText" TEXT[],
  "__facilitySort" TEXT,
  "__format" UUID[],
  "__formatText" TEXT[],
  "__formatSort" TEXT,
  "language" TEXT[],
  "location" TEXT[],
  "period" TIMESTAMPTZ,
  "related" TEXT[],
  "relatesto" TEXT[],
  "relation" TEXT[],
  "__securityLabel" UUID[],
  "__securityLabelText" TEXT[],
  "__securityLabelSort" TEXT,
  "__settingSort" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__authenticatorIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__custodianIdentifierSort" TEXT,
  "__relatedIdentifierSort" TEXT,
  "__relatestoIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "DocumentReference_lastUpdated_idx" ON "DocumentReference" ("lastUpdated");
CREATE INDEX "DocumentReference_projectId_lastUpdated_idx" ON "DocumentReference" ("projectId", "lastUpdated");
CREATE INDEX "DocumentReference_projectId_idx" ON "DocumentReference" ("projectId");
CREATE INDEX "DocumentReference__source_idx" ON "DocumentReference" ("_source");
CREATE INDEX "DocumentReference__profile_idx" ON "DocumentReference" USING gin ("_profile");
CREATE INDEX "DocumentReference___version_idx" ON "DocumentReference" ("__version");
CREATE INDEX "DocumentReference_compartments_idx" ON "DocumentReference" USING gin ("compartments");
CREATE INDEX "DocumentReference___sharedTokens_idx" ON "DocumentReference" USING gin ("__sharedTokens");
CREATE INDEX "DocumentReference___sharedTokensTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DocumentReference____tag_idx" ON "DocumentReference" USING gin ("___tag");
CREATE INDEX "DocumentReference____tagTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "DocumentReference___idnt_idx" ON "DocumentReference" USING gin ("__identifier");
CREATE INDEX "DocumentReference___idntTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "DocumentReference_patient_idx" ON "DocumentReference" ("patient");
CREATE INDEX "DocumentReference___type_idx" ON "DocumentReference" USING gin ("__type");
CREATE INDEX "DocumentReference___typeTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "DocumentReference_encounter_idx" ON "DocumentReference" USING gin ("encounter");
CREATE INDEX "DocumentReference_authenticator_idx" ON "DocumentReference" ("authenticator");
CREATE INDEX "DocumentReference_author_idx" ON "DocumentReference" USING gin ("author");
CREATE INDEX "DocumentReference___category_idx" ON "DocumentReference" USING gin ("__category");
CREATE INDEX "DocumentReference___categoryTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "DocumentReference_contenttype_idx" ON "DocumentReference" USING gin ("contenttype");
CREATE INDEX "DocumentReference_custodian_idx" ON "DocumentReference" ("custodian");
CREATE INDEX "DocumentReference_date_idx" ON "DocumentReference" ("date");
CREATE INDEX "DocumentReference_projectId_date_idx" ON "DocumentReference" ("projectId", "date");
CREATE INDEX "DocumentReference_description_idx" ON "DocumentReference" ("description");
CREATE INDEX "DocumentReference___facility_idx" ON "DocumentReference" USING gin ("__facility");
CREATE INDEX "DocumentReference___facilityTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__facilityText") gin_trgm_ops);
CREATE INDEX "DocumentReference___format_idx" ON "DocumentReference" USING gin ("__format");
CREATE INDEX "DocumentReference___formatTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__formatText") gin_trgm_ops);
CREATE INDEX "DocumentReference_language_idx" ON "DocumentReference" USING gin ("language");
CREATE INDEX "DocumentReference_location_idx" ON "DocumentReference" USING gin ("location");
CREATE INDEX "DocumentReference_period_idx" ON "DocumentReference" ("period");
CREATE INDEX "DocumentReference_related_idx" ON "DocumentReference" USING gin ("related");
CREATE INDEX "DocumentReference_relatesto_idx" ON "DocumentReference" USING gin ("relatesto");
CREATE INDEX "DocumentReference_relation_idx" ON "DocumentReference" USING gin ("relation");
CREATE INDEX "DocumentReference___securityLabel_idx" ON "DocumentReference" USING gin ("__securityLabel");
CREATE INDEX "DocumentReference___securityLabelTextTrgm_idx" ON "DocumentReference" USING gin (token_array_to_text("__securityLabelText") gin_trgm_ops);
CREATE INDEX "DocumentReference_status_idx" ON "DocumentReference" ("status");
CREATE INDEX "DocumentReference_subject_idx" ON "DocumentReference" ("subject");

CREATE TABLE  "DocumentReference_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DocumentReference_History_id_idx" ON "DocumentReference_History" ("id");
CREATE INDEX "DocumentReference_History_lastUpdated_idx" ON "DocumentReference_History" ("lastUpdated");

CREATE TABLE  "DocumentReference_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DocumentReference_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DocumentReference_Refs_targetId_code_idx" ON "DocumentReference_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "EffectEvidenceSynthesis" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "EffectEvidenceSynthesis_lastUpdated_idx" ON "EffectEvidenceSynthesis" ("lastUpdated");
CREATE INDEX "EffectEvidenceSynthesis_projectId_lastUpdated_idx" ON "EffectEvidenceSynthesis" ("projectId", "lastUpdated");
CREATE INDEX "EffectEvidenceSynthesis_projectId_idx" ON "EffectEvidenceSynthesis" ("projectId");
CREATE INDEX "EffectEvidenceSynthesis__source_idx" ON "EffectEvidenceSynthesis" ("_source");
CREATE INDEX "EffectEvidenceSynthesis__profile_idx" ON "EffectEvidenceSynthesis" USING gin ("_profile");
CREATE INDEX "EffectEvidenceSynthesis___version_idx" ON "EffectEvidenceSynthesis" ("__version");
CREATE INDEX "EffectEvidenceSynthesis_compartments_idx" ON "EffectEvidenceSynthesis" USING gin ("compartments");
CREATE INDEX "EffectEvidenceSynthesis___sharedTokens_idx" ON "EffectEvidenceSynthesis" USING gin ("__sharedTokens");
CREATE INDEX "EffectEvidenceSynthesis___sharedTokensTextTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "EffectEvidenceSynthesis____tag_idx" ON "EffectEvidenceSynthesis" USING gin ("___tag");
CREATE INDEX "EffectEvidenceSynthesis____tagTextTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "EffectEvidenceSynthesis___context_idx" ON "EffectEvidenceSynthesis" USING gin ("__context");
CREATE INDEX "EffectEvidenceSynthesis___contextTextTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "EffectEvidenceSynthesis_contextQuantity_idx" ON "EffectEvidenceSynthesis" USING gin ("contextQuantity");
CREATE INDEX "EffectEvidenceSynthesis___contextType_idx" ON "EffectEvidenceSynthesis" USING gin ("__contextType");
CREATE INDEX "EffectEvidenceSynthesis___contextTypeTextTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "EffectEvidenceSynthesis_date_idx" ON "EffectEvidenceSynthesis" ("date");
CREATE INDEX "EffectEvidenceSynthesis_projectId_date_idx" ON "EffectEvidenceSynthesis" ("projectId", "date");
CREATE INDEX "EffectEvidenceSynthesis_description_idx" ON "EffectEvidenceSynthesis" ("description");
CREATE INDEX "EffectEvidenceSynthesis_effective_idx" ON "EffectEvidenceSynthesis" ("effective");
CREATE INDEX "EffectEvidenceSynthesis___idnt_idx" ON "EffectEvidenceSynthesis" USING gin ("__identifier");
CREATE INDEX "EffectEvidenceSynthesis___idntTextTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "EffectEvidenceSynthesis___jurisdiction_idx" ON "EffectEvidenceSynthesis" USING gin ("__jurisdiction");
CREATE INDEX "EffectEvidenceSynthesis___jurisdictionTextTrgm_idx" ON "EffectEvidenceSynthesis" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "EffectEvidenceSynthesis_name_idx" ON "EffectEvidenceSynthesis" ("name");
CREATE INDEX "EffectEvidenceSynthesis_publisher_idx" ON "EffectEvidenceSynthesis" ("publisher");
CREATE INDEX "EffectEvidenceSynthesis_status_idx" ON "EffectEvidenceSynthesis" ("status");
CREATE INDEX "EffectEvidenceSynthesis_title_idx" ON "EffectEvidenceSynthesis" ("title");
CREATE INDEX "EffectEvidenceSynthesis_url_idx" ON "EffectEvidenceSynthesis" ("url");
CREATE INDEX "EffectEvidenceSynthesis_version_idx" ON "EffectEvidenceSynthesis" ("version");

CREATE TABLE  "EffectEvidenceSynthesis_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "EffectEvidenceSynthesis_History_id_idx" ON "EffectEvidenceSynthesis_History" ("id");
CREATE INDEX "EffectEvidenceSynthesis_History_lastUpdated_idx" ON "EffectEvidenceSynthesis_History" ("lastUpdated");

CREATE TABLE  "EffectEvidenceSynthesis_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "EffectEvidenceSynthesis_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "EffectEvidenceSynthesis_Refs_targetId_code_idx" ON "EffectEvidenceSynthesis_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Encounter" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "account" TEXT[],
  "appointment" TEXT[],
  "basedOn" TEXT[],
  "__class" UUID[],
  "__classText" TEXT[],
  "__classSort" TEXT,
  "diagnosis" TEXT[],
  "episodeOfCare" TEXT[],
  "length" DOUBLE PRECISION,
  "location" TEXT[],
  "locationPeriod" TIMESTAMPTZ[],
  "partOf" TEXT,
  "participant" TEXT[],
  "__participantType" UUID[],
  "__participantTypeText" TEXT[],
  "__participantTypeSort" TEXT,
  "practitioner" TEXT[],
  "__reasonCode" UUID[],
  "__reasonCodeText" TEXT[],
  "__reasonCodeSort" TEXT,
  "reasonReference" TEXT[],
  "serviceProvider" TEXT,
  "__specialArrangementSort" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "__dischargeDisposition" UUID[],
  "__dischargeDispositionText" TEXT[],
  "__dischargeDispositionSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__accountIdentifierSort" TEXT,
  "__appointmentIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__diagnosisIdentifierSort" TEXT,
  "__episodeOfCareIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__participantIdentifierSort" TEXT,
  "__practitionerIdentifierSort" TEXT,
  "__reasonReferenceIdentifierSort" TEXT,
  "__serviceProviderIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Encounter_lastUpdated_idx" ON "Encounter" ("lastUpdated");
CREATE INDEX "Encounter_projectId_lastUpdated_idx" ON "Encounter" ("projectId", "lastUpdated");
CREATE INDEX "Encounter_projectId_idx" ON "Encounter" ("projectId");
CREATE INDEX "Encounter__source_idx" ON "Encounter" ("_source");
CREATE INDEX "Encounter__profile_idx" ON "Encounter" USING gin ("_profile");
CREATE INDEX "Encounter___version_idx" ON "Encounter" ("__version");
CREATE INDEX "Encounter_compartments_idx" ON "Encounter" USING gin ("compartments");
CREATE INDEX "Encounter___sharedTokens_idx" ON "Encounter" USING gin ("__sharedTokens");
CREATE INDEX "Encounter___sharedTokensTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Encounter____tag_idx" ON "Encounter" USING gin ("___tag");
CREATE INDEX "Encounter____tagTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Encounter_date_idx" ON "Encounter" ("date");
CREATE INDEX "Encounter_projectId_date_idx" ON "Encounter" ("projectId", "date");
CREATE INDEX "Encounter___idnt_idx" ON "Encounter" USING gin ("__identifier");
CREATE INDEX "Encounter___idntTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Encounter_patient_idx" ON "Encounter" ("patient");
CREATE INDEX "Encounter___type_idx" ON "Encounter" USING gin ("__type");
CREATE INDEX "Encounter___typeTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "Encounter_account_idx" ON "Encounter" USING gin ("account");
CREATE INDEX "Encounter_appointment_idx" ON "Encounter" USING gin ("appointment");
CREATE INDEX "Encounter_basedOn_idx" ON "Encounter" USING gin ("basedOn");
CREATE INDEX "Encounter___class_idx" ON "Encounter" USING gin ("__class");
CREATE INDEX "Encounter___classTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__classText") gin_trgm_ops);
CREATE INDEX "Encounter_diagnosis_idx" ON "Encounter" USING gin ("diagnosis");
CREATE INDEX "Encounter_episodeOfCare_idx" ON "Encounter" USING gin ("episodeOfCare");
CREATE INDEX "Encounter_length_idx" ON "Encounter" ("length");
CREATE INDEX "Encounter_location_idx" ON "Encounter" USING gin ("location");
CREATE INDEX "Encounter_locationPeriod_idx" ON "Encounter" USING gin ("locationPeriod");
CREATE INDEX "Encounter_partOf_idx" ON "Encounter" ("partOf");
CREATE INDEX "Encounter_participant_idx" ON "Encounter" USING gin ("participant");
CREATE INDEX "Encounter___participantType_idx" ON "Encounter" USING gin ("__participantType");
CREATE INDEX "Encounter___participantTypeTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__participantTypeText") gin_trgm_ops);
CREATE INDEX "Encounter_practitioner_idx" ON "Encounter" USING gin ("practitioner");
CREATE INDEX "Encounter___reasonCode_idx" ON "Encounter" USING gin ("__reasonCode");
CREATE INDEX "Encounter___reasonCodeTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__reasonCodeText") gin_trgm_ops);
CREATE INDEX "Encounter_reasonReference_idx" ON "Encounter" USING gin ("reasonReference");
CREATE INDEX "Encounter_serviceProvider_idx" ON "Encounter" ("serviceProvider");
CREATE INDEX "Encounter_status_idx" ON "Encounter" ("status");
CREATE INDEX "Encounter_subject_idx" ON "Encounter" ("subject");
CREATE INDEX "Encounter___dischargeDisposition_idx" ON "Encounter" USING gin ("__dischargeDisposition");
CREATE INDEX "Encounter___dischargeDispositionTextTrgm_idx" ON "Encounter" USING gin (token_array_to_text("__dischargeDispositionText") gin_trgm_ops);
CREATE INDEX "Encounter_compartments_deleted_appointment_idx" ON "Encounter" USING gin ("compartments", "deleted", "appointment");

CREATE TABLE  "Encounter_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Encounter_History_id_idx" ON "Encounter_History" ("id");
CREATE INDEX "Encounter_History_lastUpdated_idx" ON "Encounter_History" ("lastUpdated");

CREATE TABLE  "Encounter_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Encounter_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Encounter_Refs_targetId_code_idx" ON "Encounter_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Endpoint" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__connectionType" UUID[],
  "__connectionTypeText" TEXT[],
  "__connectionTypeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT,
  "organization" TEXT,
  "__payloadType" UUID[],
  "__payloadTypeText" TEXT[],
  "__payloadTypeSort" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT
);
CREATE INDEX "Endpoint_lastUpdated_idx" ON "Endpoint" ("lastUpdated");
CREATE INDEX "Endpoint_projectId_lastUpdated_idx" ON "Endpoint" ("projectId", "lastUpdated");
CREATE INDEX "Endpoint_projectId_idx" ON "Endpoint" ("projectId");
CREATE INDEX "Endpoint__source_idx" ON "Endpoint" ("_source");
CREATE INDEX "Endpoint__profile_idx" ON "Endpoint" USING gin ("_profile");
CREATE INDEX "Endpoint___version_idx" ON "Endpoint" ("__version");
CREATE INDEX "Endpoint_compartments_idx" ON "Endpoint" USING gin ("compartments");
CREATE INDEX "Endpoint___sharedTokens_idx" ON "Endpoint" USING gin ("__sharedTokens");
CREATE INDEX "Endpoint___sharedTokensTextTrgm_idx" ON "Endpoint" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Endpoint____tag_idx" ON "Endpoint" USING gin ("___tag");
CREATE INDEX "Endpoint____tagTextTrgm_idx" ON "Endpoint" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Endpoint___connectionType_idx" ON "Endpoint" USING gin ("__connectionType");
CREATE INDEX "Endpoint___connectionTypeTextTrgm_idx" ON "Endpoint" USING gin (token_array_to_text("__connectionTypeText") gin_trgm_ops);
CREATE INDEX "Endpoint___idnt_idx" ON "Endpoint" USING gin ("__identifier");
CREATE INDEX "Endpoint___idntTextTrgm_idx" ON "Endpoint" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Endpoint_name_idx" ON "Endpoint" ("name");
CREATE INDEX "Endpoint_organization_idx" ON "Endpoint" ("organization");
CREATE INDEX "Endpoint___payloadType_idx" ON "Endpoint" USING gin ("__payloadType");
CREATE INDEX "Endpoint___payloadTypeTextTrgm_idx" ON "Endpoint" USING gin (token_array_to_text("__payloadTypeText") gin_trgm_ops);
CREATE INDEX "Endpoint_status_idx" ON "Endpoint" ("status");

CREATE TABLE  "Endpoint_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Endpoint_History_id_idx" ON "Endpoint_History" ("id");
CREATE INDEX "Endpoint_History_lastUpdated_idx" ON "Endpoint_History" ("lastUpdated");

CREATE TABLE  "Endpoint_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Endpoint_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Endpoint_Refs_targetId_code_idx" ON "Endpoint_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "EnrollmentRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "EnrollmentRequest_lastUpdated_idx" ON "EnrollmentRequest" ("lastUpdated");
CREATE INDEX "EnrollmentRequest_projectId_lastUpdated_idx" ON "EnrollmentRequest" ("projectId", "lastUpdated");
CREATE INDEX "EnrollmentRequest_projectId_idx" ON "EnrollmentRequest" ("projectId");
CREATE INDEX "EnrollmentRequest__source_idx" ON "EnrollmentRequest" ("_source");
CREATE INDEX "EnrollmentRequest__profile_idx" ON "EnrollmentRequest" USING gin ("_profile");
CREATE INDEX "EnrollmentRequest___version_idx" ON "EnrollmentRequest" ("__version");
CREATE INDEX "EnrollmentRequest_compartments_idx" ON "EnrollmentRequest" USING gin ("compartments");
CREATE INDEX "EnrollmentRequest___sharedTokens_idx" ON "EnrollmentRequest" USING gin ("__sharedTokens");
CREATE INDEX "EnrollmentRequest___sharedTokensTextTrgm_idx" ON "EnrollmentRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "EnrollmentRequest____tag_idx" ON "EnrollmentRequest" USING gin ("___tag");
CREATE INDEX "EnrollmentRequest____tagTextTrgm_idx" ON "EnrollmentRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "EnrollmentRequest___idnt_idx" ON "EnrollmentRequest" USING gin ("__identifier");
CREATE INDEX "EnrollmentRequest___idntTextTrgm_idx" ON "EnrollmentRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "EnrollmentRequest_patient_idx" ON "EnrollmentRequest" ("patient");
CREATE INDEX "EnrollmentRequest_status_idx" ON "EnrollmentRequest" ("status");
CREATE INDEX "EnrollmentRequest_subject_idx" ON "EnrollmentRequest" ("subject");

CREATE TABLE  "EnrollmentRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "EnrollmentRequest_History_id_idx" ON "EnrollmentRequest_History" ("id");
CREATE INDEX "EnrollmentRequest_History_lastUpdated_idx" ON "EnrollmentRequest_History" ("lastUpdated");

CREATE TABLE  "EnrollmentRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "EnrollmentRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "EnrollmentRequest_Refs_targetId_code_idx" ON "EnrollmentRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "EnrollmentResponse" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "request" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__requestIdentifierSort" TEXT
);
CREATE INDEX "EnrollmentResponse_lastUpdated_idx" ON "EnrollmentResponse" ("lastUpdated");
CREATE INDEX "EnrollmentResponse_projectId_lastUpdated_idx" ON "EnrollmentResponse" ("projectId", "lastUpdated");
CREATE INDEX "EnrollmentResponse_projectId_idx" ON "EnrollmentResponse" ("projectId");
CREATE INDEX "EnrollmentResponse__source_idx" ON "EnrollmentResponse" ("_source");
CREATE INDEX "EnrollmentResponse__profile_idx" ON "EnrollmentResponse" USING gin ("_profile");
CREATE INDEX "EnrollmentResponse___version_idx" ON "EnrollmentResponse" ("__version");
CREATE INDEX "EnrollmentResponse_compartments_idx" ON "EnrollmentResponse" USING gin ("compartments");
CREATE INDEX "EnrollmentResponse___sharedTokens_idx" ON "EnrollmentResponse" USING gin ("__sharedTokens");
CREATE INDEX "EnrollmentResponse___sharedTokensTextTrgm_idx" ON "EnrollmentResponse" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "EnrollmentResponse____tag_idx" ON "EnrollmentResponse" USING gin ("___tag");
CREATE INDEX "EnrollmentResponse____tagTextTrgm_idx" ON "EnrollmentResponse" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "EnrollmentResponse___idnt_idx" ON "EnrollmentResponse" USING gin ("__identifier");
CREATE INDEX "EnrollmentResponse___idntTextTrgm_idx" ON "EnrollmentResponse" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "EnrollmentResponse_request_idx" ON "EnrollmentResponse" ("request");
CREATE INDEX "EnrollmentResponse_status_idx" ON "EnrollmentResponse" ("status");

CREATE TABLE  "EnrollmentResponse_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "EnrollmentResponse_History_id_idx" ON "EnrollmentResponse_History" ("id");
CREATE INDEX "EnrollmentResponse_History_lastUpdated_idx" ON "EnrollmentResponse_History" ("lastUpdated");

CREATE TABLE  "EnrollmentResponse_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "EnrollmentResponse_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "EnrollmentResponse_Refs_targetId_code_idx" ON "EnrollmentResponse_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "EpisodeOfCare" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "careManager" TEXT,
  "condition" TEXT[],
  "incomingReferral" TEXT[],
  "organization" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__careManagerIdentifierSort" TEXT,
  "__conditionIdentifierSort" TEXT,
  "__incomingReferralIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT
);
CREATE INDEX "EpisodeOfCare_lastUpdated_idx" ON "EpisodeOfCare" ("lastUpdated");
CREATE INDEX "EpisodeOfCare_projectId_lastUpdated_idx" ON "EpisodeOfCare" ("projectId", "lastUpdated");
CREATE INDEX "EpisodeOfCare_projectId_idx" ON "EpisodeOfCare" ("projectId");
CREATE INDEX "EpisodeOfCare__source_idx" ON "EpisodeOfCare" ("_source");
CREATE INDEX "EpisodeOfCare__profile_idx" ON "EpisodeOfCare" USING gin ("_profile");
CREATE INDEX "EpisodeOfCare___version_idx" ON "EpisodeOfCare" ("__version");
CREATE INDEX "EpisodeOfCare_compartments_idx" ON "EpisodeOfCare" USING gin ("compartments");
CREATE INDEX "EpisodeOfCare___sharedTokens_idx" ON "EpisodeOfCare" USING gin ("__sharedTokens");
CREATE INDEX "EpisodeOfCare___sharedTokensTextTrgm_idx" ON "EpisodeOfCare" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "EpisodeOfCare____tag_idx" ON "EpisodeOfCare" USING gin ("___tag");
CREATE INDEX "EpisodeOfCare____tagTextTrgm_idx" ON "EpisodeOfCare" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "EpisodeOfCare_date_idx" ON "EpisodeOfCare" ("date");
CREATE INDEX "EpisodeOfCare_projectId_date_idx" ON "EpisodeOfCare" ("projectId", "date");
CREATE INDEX "EpisodeOfCare___idnt_idx" ON "EpisodeOfCare" USING gin ("__identifier");
CREATE INDEX "EpisodeOfCare___idntTextTrgm_idx" ON "EpisodeOfCare" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "EpisodeOfCare_patient_idx" ON "EpisodeOfCare" ("patient");
CREATE INDEX "EpisodeOfCare___type_idx" ON "EpisodeOfCare" USING gin ("__type");
CREATE INDEX "EpisodeOfCare___typeTextTrgm_idx" ON "EpisodeOfCare" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "EpisodeOfCare_careManager_idx" ON "EpisodeOfCare" ("careManager");
CREATE INDEX "EpisodeOfCare_condition_idx" ON "EpisodeOfCare" USING gin ("condition");
CREATE INDEX "EpisodeOfCare_incomingReferral_idx" ON "EpisodeOfCare" USING gin ("incomingReferral");
CREATE INDEX "EpisodeOfCare_organization_idx" ON "EpisodeOfCare" ("organization");
CREATE INDEX "EpisodeOfCare_status_idx" ON "EpisodeOfCare" ("status");

CREATE TABLE  "EpisodeOfCare_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "EpisodeOfCare_History_id_idx" ON "EpisodeOfCare_History" ("id");
CREATE INDEX "EpisodeOfCare_History_lastUpdated_idx" ON "EpisodeOfCare_History" ("lastUpdated");

CREATE TABLE  "EpisodeOfCare_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "EpisodeOfCare_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "EpisodeOfCare_Refs_targetId_code_idx" ON "EpisodeOfCare_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "EventDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "EventDefinition_lastUpdated_idx" ON "EventDefinition" ("lastUpdated");
CREATE INDEX "EventDefinition_projectId_lastUpdated_idx" ON "EventDefinition" ("projectId", "lastUpdated");
CREATE INDEX "EventDefinition_projectId_idx" ON "EventDefinition" ("projectId");
CREATE INDEX "EventDefinition__source_idx" ON "EventDefinition" ("_source");
CREATE INDEX "EventDefinition__profile_idx" ON "EventDefinition" USING gin ("_profile");
CREATE INDEX "EventDefinition___version_idx" ON "EventDefinition" ("__version");
CREATE INDEX "EventDefinition_compartments_idx" ON "EventDefinition" USING gin ("compartments");
CREATE INDEX "EventDefinition___sharedTokens_idx" ON "EventDefinition" USING gin ("__sharedTokens");
CREATE INDEX "EventDefinition___sharedTokensTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "EventDefinition____tag_idx" ON "EventDefinition" USING gin ("___tag");
CREATE INDEX "EventDefinition____tagTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "EventDefinition_composedOf_idx" ON "EventDefinition" USING gin ("composedOf");
CREATE INDEX "EventDefinition___context_idx" ON "EventDefinition" USING gin ("__context");
CREATE INDEX "EventDefinition___contextTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "EventDefinition_contextQuantity_idx" ON "EventDefinition" USING gin ("contextQuantity");
CREATE INDEX "EventDefinition___contextType_idx" ON "EventDefinition" USING gin ("__contextType");
CREATE INDEX "EventDefinition___contextTypeTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "EventDefinition_date_idx" ON "EventDefinition" ("date");
CREATE INDEX "EventDefinition_projectId_date_idx" ON "EventDefinition" ("projectId", "date");
CREATE INDEX "EventDefinition_dependsOn_idx" ON "EventDefinition" USING gin ("dependsOn");
CREATE INDEX "EventDefinition_derivedFrom_idx" ON "EventDefinition" USING gin ("derivedFrom");
CREATE INDEX "EventDefinition_description_idx" ON "EventDefinition" ("description");
CREATE INDEX "EventDefinition_effective_idx" ON "EventDefinition" ("effective");
CREATE INDEX "EventDefinition___idnt_idx" ON "EventDefinition" USING gin ("__identifier");
CREATE INDEX "EventDefinition___idntTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "EventDefinition___jurisdiction_idx" ON "EventDefinition" USING gin ("__jurisdiction");
CREATE INDEX "EventDefinition___jurisdictionTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "EventDefinition_name_idx" ON "EventDefinition" ("name");
CREATE INDEX "EventDefinition_predecessor_idx" ON "EventDefinition" USING gin ("predecessor");
CREATE INDEX "EventDefinition_publisher_idx" ON "EventDefinition" ("publisher");
CREATE INDEX "EventDefinition_status_idx" ON "EventDefinition" ("status");
CREATE INDEX "EventDefinition_successor_idx" ON "EventDefinition" USING gin ("successor");
CREATE INDEX "EventDefinition_title_idx" ON "EventDefinition" ("title");
CREATE INDEX "EventDefinition___topic_idx" ON "EventDefinition" USING gin ("__topic");
CREATE INDEX "EventDefinition___topicTextTrgm_idx" ON "EventDefinition" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "EventDefinition_url_idx" ON "EventDefinition" ("url");
CREATE INDEX "EventDefinition_version_idx" ON "EventDefinition" ("version");

CREATE TABLE  "EventDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "EventDefinition_History_id_idx" ON "EventDefinition_History" ("id");
CREATE INDEX "EventDefinition_History_lastUpdated_idx" ON "EventDefinition_History" ("lastUpdated");

CREATE TABLE  "EventDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "EventDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "EventDefinition_Refs_targetId_code_idx" ON "EventDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Evidence" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "Evidence_lastUpdated_idx" ON "Evidence" ("lastUpdated");
CREATE INDEX "Evidence_projectId_lastUpdated_idx" ON "Evidence" ("projectId", "lastUpdated");
CREATE INDEX "Evidence_projectId_idx" ON "Evidence" ("projectId");
CREATE INDEX "Evidence__source_idx" ON "Evidence" ("_source");
CREATE INDEX "Evidence__profile_idx" ON "Evidence" USING gin ("_profile");
CREATE INDEX "Evidence___version_idx" ON "Evidence" ("__version");
CREATE INDEX "Evidence_compartments_idx" ON "Evidence" USING gin ("compartments");
CREATE INDEX "Evidence___sharedTokens_idx" ON "Evidence" USING gin ("__sharedTokens");
CREATE INDEX "Evidence___sharedTokensTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Evidence____tag_idx" ON "Evidence" USING gin ("___tag");
CREATE INDEX "Evidence____tagTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Evidence_composedOf_idx" ON "Evidence" USING gin ("composedOf");
CREATE INDEX "Evidence___context_idx" ON "Evidence" USING gin ("__context");
CREATE INDEX "Evidence___contextTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "Evidence_contextQuantity_idx" ON "Evidence" USING gin ("contextQuantity");
CREATE INDEX "Evidence___contextType_idx" ON "Evidence" USING gin ("__contextType");
CREATE INDEX "Evidence___contextTypeTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "Evidence_date_idx" ON "Evidence" ("date");
CREATE INDEX "Evidence_projectId_date_idx" ON "Evidence" ("projectId", "date");
CREATE INDEX "Evidence_dependsOn_idx" ON "Evidence" USING gin ("dependsOn");
CREATE INDEX "Evidence_derivedFrom_idx" ON "Evidence" USING gin ("derivedFrom");
CREATE INDEX "Evidence_description_idx" ON "Evidence" ("description");
CREATE INDEX "Evidence_effective_idx" ON "Evidence" ("effective");
CREATE INDEX "Evidence___idnt_idx" ON "Evidence" USING gin ("__identifier");
CREATE INDEX "Evidence___idntTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Evidence___jurisdiction_idx" ON "Evidence" USING gin ("__jurisdiction");
CREATE INDEX "Evidence___jurisdictionTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "Evidence_name_idx" ON "Evidence" ("name");
CREATE INDEX "Evidence_predecessor_idx" ON "Evidence" USING gin ("predecessor");
CREATE INDEX "Evidence_publisher_idx" ON "Evidence" ("publisher");
CREATE INDEX "Evidence_status_idx" ON "Evidence" ("status");
CREATE INDEX "Evidence_successor_idx" ON "Evidence" USING gin ("successor");
CREATE INDEX "Evidence_title_idx" ON "Evidence" ("title");
CREATE INDEX "Evidence___topic_idx" ON "Evidence" USING gin ("__topic");
CREATE INDEX "Evidence___topicTextTrgm_idx" ON "Evidence" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "Evidence_url_idx" ON "Evidence" ("url");
CREATE INDEX "Evidence_version_idx" ON "Evidence" ("version");

CREATE TABLE  "Evidence_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Evidence_History_id_idx" ON "Evidence_History" ("id");
CREATE INDEX "Evidence_History_lastUpdated_idx" ON "Evidence_History" ("lastUpdated");

CREATE TABLE  "Evidence_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Evidence_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Evidence_Refs_targetId_code_idx" ON "Evidence_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "EvidenceVariable" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "__characteristicType" UUID[],
  "__characteristicTypeText" TEXT[],
  "__characteristicTypeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "EvidenceVariable_lastUpdated_idx" ON "EvidenceVariable" ("lastUpdated");
CREATE INDEX "EvidenceVariable_projectId_lastUpdated_idx" ON "EvidenceVariable" ("projectId", "lastUpdated");
CREATE INDEX "EvidenceVariable_projectId_idx" ON "EvidenceVariable" ("projectId");
CREATE INDEX "EvidenceVariable__source_idx" ON "EvidenceVariable" ("_source");
CREATE INDEX "EvidenceVariable__profile_idx" ON "EvidenceVariable" USING gin ("_profile");
CREATE INDEX "EvidenceVariable___version_idx" ON "EvidenceVariable" ("__version");
CREATE INDEX "EvidenceVariable_compartments_idx" ON "EvidenceVariable" USING gin ("compartments");
CREATE INDEX "EvidenceVariable___sharedTokens_idx" ON "EvidenceVariable" USING gin ("__sharedTokens");
CREATE INDEX "EvidenceVariable___sharedTokensTextTrgm_idx" ON "EvidenceVariable" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "EvidenceVariable____tag_idx" ON "EvidenceVariable" USING gin ("___tag");
CREATE INDEX "EvidenceVariable____tagTextTrgm_idx" ON "EvidenceVariable" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "EvidenceVariable_composedOf_idx" ON "EvidenceVariable" USING gin ("composedOf");
CREATE INDEX "EvidenceVariable_contextQuantity_idx" ON "EvidenceVariable" USING gin ("contextQuantity");
CREATE INDEX "EvidenceVariable_date_idx" ON "EvidenceVariable" ("date");
CREATE INDEX "EvidenceVariable_projectId_date_idx" ON "EvidenceVariable" ("projectId", "date");
CREATE INDEX "EvidenceVariable_dependsOn_idx" ON "EvidenceVariable" USING gin ("dependsOn");
CREATE INDEX "EvidenceVariable_derivedFrom_idx" ON "EvidenceVariable" USING gin ("derivedFrom");
CREATE INDEX "EvidenceVariable_description_idx" ON "EvidenceVariable" ("description");
CREATE INDEX "EvidenceVariable_effective_idx" ON "EvidenceVariable" ("effective");
CREATE INDEX "EvidenceVariable___idnt_idx" ON "EvidenceVariable" USING gin ("__identifier");
CREATE INDEX "EvidenceVariable___idntTextTrgm_idx" ON "EvidenceVariable" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "EvidenceVariable_name_idx" ON "EvidenceVariable" ("name");
CREATE INDEX "EvidenceVariable_predecessor_idx" ON "EvidenceVariable" USING gin ("predecessor");
CREATE INDEX "EvidenceVariable_publisher_idx" ON "EvidenceVariable" ("publisher");
CREATE INDEX "EvidenceVariable_status_idx" ON "EvidenceVariable" ("status");
CREATE INDEX "EvidenceVariable_successor_idx" ON "EvidenceVariable" USING gin ("successor");
CREATE INDEX "EvidenceVariable_title_idx" ON "EvidenceVariable" ("title");
CREATE INDEX "EvidenceVariable_url_idx" ON "EvidenceVariable" ("url");
CREATE INDEX "EvidenceVariable_version_idx" ON "EvidenceVariable" ("version");
CREATE INDEX "EvidenceVariable___characteristicType_idx" ON "EvidenceVariable" USING gin ("__characteristicType");
CREATE INDEX "EvidenceVariable___characteristicTypeTextTrgm_idx" ON "EvidenceVariable" USING gin (token_array_to_text("__characteristicTypeText") gin_trgm_ops);

CREATE TABLE  "EvidenceVariable_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "EvidenceVariable_History_id_idx" ON "EvidenceVariable_History" ("id");
CREATE INDEX "EvidenceVariable_History_lastUpdated_idx" ON "EvidenceVariable_History" ("lastUpdated");

CREATE TABLE  "EvidenceVariable_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "EvidenceVariable_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "EvidenceVariable_Refs_targetId_code_idx" ON "EvidenceVariable_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ExampleScenario" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "ExampleScenario_lastUpdated_idx" ON "ExampleScenario" ("lastUpdated");
CREATE INDEX "ExampleScenario_projectId_lastUpdated_idx" ON "ExampleScenario" ("projectId", "lastUpdated");
CREATE INDEX "ExampleScenario_projectId_idx" ON "ExampleScenario" ("projectId");
CREATE INDEX "ExampleScenario__source_idx" ON "ExampleScenario" ("_source");
CREATE INDEX "ExampleScenario__profile_idx" ON "ExampleScenario" USING gin ("_profile");
CREATE INDEX "ExampleScenario___version_idx" ON "ExampleScenario" ("__version");
CREATE INDEX "ExampleScenario_compartments_idx" ON "ExampleScenario" USING gin ("compartments");
CREATE INDEX "ExampleScenario___sharedTokens_idx" ON "ExampleScenario" USING gin ("__sharedTokens");
CREATE INDEX "ExampleScenario___sharedTokensTextTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ExampleScenario____tag_idx" ON "ExampleScenario" USING gin ("___tag");
CREATE INDEX "ExampleScenario____tagTextTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ExampleScenario___context_idx" ON "ExampleScenario" USING gin ("__context");
CREATE INDEX "ExampleScenario___contextTextTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ExampleScenario_contextQuantity_idx" ON "ExampleScenario" USING gin ("contextQuantity");
CREATE INDEX "ExampleScenario___contextType_idx" ON "ExampleScenario" USING gin ("__contextType");
CREATE INDEX "ExampleScenario___contextTypeTextTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ExampleScenario_date_idx" ON "ExampleScenario" ("date");
CREATE INDEX "ExampleScenario_projectId_date_idx" ON "ExampleScenario" ("projectId", "date");
CREATE INDEX "ExampleScenario___idnt_idx" ON "ExampleScenario" USING gin ("__identifier");
CREATE INDEX "ExampleScenario___idntTextTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ExampleScenario___jurisdiction_idx" ON "ExampleScenario" USING gin ("__jurisdiction");
CREATE INDEX "ExampleScenario___jurisdictionTextTrgm_idx" ON "ExampleScenario" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ExampleScenario_name_idx" ON "ExampleScenario" ("name");
CREATE INDEX "ExampleScenario_publisher_idx" ON "ExampleScenario" ("publisher");
CREATE INDEX "ExampleScenario_status_idx" ON "ExampleScenario" ("status");
CREATE INDEX "ExampleScenario_url_idx" ON "ExampleScenario" ("url");
CREATE INDEX "ExampleScenario_version_idx" ON "ExampleScenario" ("version");

CREATE TABLE  "ExampleScenario_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ExampleScenario_History_id_idx" ON "ExampleScenario_History" ("id");
CREATE INDEX "ExampleScenario_History_lastUpdated_idx" ON "ExampleScenario_History" ("lastUpdated");

CREATE TABLE  "ExampleScenario_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ExampleScenario_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ExampleScenario_Refs_targetId_code_idx" ON "ExampleScenario_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ExplanationOfBenefit" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "careTeam" TEXT[],
  "claim" TEXT,
  "coverage" TEXT[],
  "created" TIMESTAMPTZ,
  "detailUdi" TEXT[],
  "disposition" TEXT,
  "encounter" TEXT[],
  "enterer" TEXT,
  "facility" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "itemUdi" TEXT[],
  "patient" TEXT,
  "payee" TEXT,
  "procedureUdi" TEXT[],
  "provider" TEXT,
  "status" TEXT,
  "subdetailUdi" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__careTeamIdentifierSort" TEXT,
  "__claimIdentifierSort" TEXT,
  "__coverageIdentifierSort" TEXT,
  "__detailUdiIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__entererIdentifierSort" TEXT,
  "__facilityIdentifierSort" TEXT,
  "__itemUdiIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__payeeIdentifierSort" TEXT,
  "__procedureUdiIdentifierSort" TEXT,
  "__providerIdentifierSort" TEXT,
  "__subdetailUdiIdentifierSort" TEXT
);
CREATE INDEX "ExplanationOfBenefit_lastUpdated_idx" ON "ExplanationOfBenefit" ("lastUpdated");
CREATE INDEX "ExplanationOfBenefit_projectId_lastUpdated_idx" ON "ExplanationOfBenefit" ("projectId", "lastUpdated");
CREATE INDEX "ExplanationOfBenefit_projectId_idx" ON "ExplanationOfBenefit" ("projectId");
CREATE INDEX "ExplanationOfBenefit__source_idx" ON "ExplanationOfBenefit" ("_source");
CREATE INDEX "ExplanationOfBenefit__profile_idx" ON "ExplanationOfBenefit" USING gin ("_profile");
CREATE INDEX "ExplanationOfBenefit___version_idx" ON "ExplanationOfBenefit" ("__version");
CREATE INDEX "ExplanationOfBenefit_compartments_idx" ON "ExplanationOfBenefit" USING gin ("compartments");
CREATE INDEX "ExplanationOfBenefit___sharedTokens_idx" ON "ExplanationOfBenefit" USING gin ("__sharedTokens");
CREATE INDEX "ExplanationOfBenefit___sharedTokensTextTrgm_idx" ON "ExplanationOfBenefit" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ExplanationOfBenefit____tag_idx" ON "ExplanationOfBenefit" USING gin ("___tag");
CREATE INDEX "ExplanationOfBenefit____tagTextTrgm_idx" ON "ExplanationOfBenefit" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ExplanationOfBenefit_careTeam_idx" ON "ExplanationOfBenefit" USING gin ("careTeam");
CREATE INDEX "ExplanationOfBenefit_claim_idx" ON "ExplanationOfBenefit" ("claim");
CREATE INDEX "ExplanationOfBenefit_coverage_idx" ON "ExplanationOfBenefit" USING gin ("coverage");
CREATE INDEX "ExplanationOfBenefit_created_idx" ON "ExplanationOfBenefit" ("created");
CREATE INDEX "ExplanationOfBenefit_detailUdi_idx" ON "ExplanationOfBenefit" USING gin ("detailUdi");
CREATE INDEX "ExplanationOfBenefit_disposition_idx" ON "ExplanationOfBenefit" ("disposition");
CREATE INDEX "ExplanationOfBenefit_encounter_idx" ON "ExplanationOfBenefit" USING gin ("encounter");
CREATE INDEX "ExplanationOfBenefit_enterer_idx" ON "ExplanationOfBenefit" ("enterer");
CREATE INDEX "ExplanationOfBenefit_facility_idx" ON "ExplanationOfBenefit" ("facility");
CREATE INDEX "ExplanationOfBenefit___idnt_idx" ON "ExplanationOfBenefit" USING gin ("__identifier");
CREATE INDEX "ExplanationOfBenefit___idntTextTrgm_idx" ON "ExplanationOfBenefit" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ExplanationOfBenefit_itemUdi_idx" ON "ExplanationOfBenefit" USING gin ("itemUdi");
CREATE INDEX "ExplanationOfBenefit_patient_idx" ON "ExplanationOfBenefit" ("patient");
CREATE INDEX "ExplanationOfBenefit_payee_idx" ON "ExplanationOfBenefit" ("payee");
CREATE INDEX "ExplanationOfBenefit_procedureUdi_idx" ON "ExplanationOfBenefit" USING gin ("procedureUdi");
CREATE INDEX "ExplanationOfBenefit_provider_idx" ON "ExplanationOfBenefit" ("provider");
CREATE INDEX "ExplanationOfBenefit_status_idx" ON "ExplanationOfBenefit" ("status");
CREATE INDEX "ExplanationOfBenefit_subdetailUdi_idx" ON "ExplanationOfBenefit" USING gin ("subdetailUdi");

CREATE TABLE  "ExplanationOfBenefit_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ExplanationOfBenefit_History_id_idx" ON "ExplanationOfBenefit_History" ("id");
CREATE INDEX "ExplanationOfBenefit_History_lastUpdated_idx" ON "ExplanationOfBenefit_History" ("lastUpdated");

CREATE TABLE  "ExplanationOfBenefit_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ExplanationOfBenefit_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ExplanationOfBenefit_Refs_targetId_code_idx" ON "ExplanationOfBenefit_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "FamilyMemberHistory" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "__relationship" UUID[],
  "__relationshipText" TEXT[],
  "__relationshipSort" TEXT,
  "__sex" UUID[],
  "__sexText" TEXT[],
  "__sexSort" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT
);
CREATE INDEX "FamilyMemberHistory_lastUpdated_idx" ON "FamilyMemberHistory" ("lastUpdated");
CREATE INDEX "FamilyMemberHistory_projectId_lastUpdated_idx" ON "FamilyMemberHistory" ("projectId", "lastUpdated");
CREATE INDEX "FamilyMemberHistory_projectId_idx" ON "FamilyMemberHistory" ("projectId");
CREATE INDEX "FamilyMemberHistory__source_idx" ON "FamilyMemberHistory" ("_source");
CREATE INDEX "FamilyMemberHistory__profile_idx" ON "FamilyMemberHistory" USING gin ("_profile");
CREATE INDEX "FamilyMemberHistory___version_idx" ON "FamilyMemberHistory" ("__version");
CREATE INDEX "FamilyMemberHistory_compartments_idx" ON "FamilyMemberHistory" USING gin ("compartments");
CREATE INDEX "FamilyMemberHistory___sharedTokens_idx" ON "FamilyMemberHistory" USING gin ("__sharedTokens");
CREATE INDEX "FamilyMemberHistory___sharedTokensTextTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "FamilyMemberHistory____tag_idx" ON "FamilyMemberHistory" USING gin ("___tag");
CREATE INDEX "FamilyMemberHistory____tagTextTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "FamilyMemberHistory___code_idx" ON "FamilyMemberHistory" USING gin ("__code");
CREATE INDEX "FamilyMemberHistory___codeTextTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "FamilyMemberHistory_date_idx" ON "FamilyMemberHistory" ("date");
CREATE INDEX "FamilyMemberHistory_projectId_date_idx" ON "FamilyMemberHistory" ("projectId", "date");
CREATE INDEX "FamilyMemberHistory___idnt_idx" ON "FamilyMemberHistory" USING gin ("__identifier");
CREATE INDEX "FamilyMemberHistory___idntTextTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "FamilyMemberHistory_patient_idx" ON "FamilyMemberHistory" ("patient");
CREATE INDEX "FamilyMemberHistory_instantiatesCanonical_idx" ON "FamilyMemberHistory" USING gin ("instantiatesCanonical");
CREATE INDEX "FamilyMemberHistory_instantiatesUri_idx" ON "FamilyMemberHistory" USING gin ("instantiatesUri");
CREATE INDEX "FamilyMemberHistory___relationship_idx" ON "FamilyMemberHistory" USING gin ("__relationship");
CREATE INDEX "FamilyMemberHistory___relationshipTextTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("__relationshipText") gin_trgm_ops);
CREATE INDEX "FamilyMemberHistory___sex_idx" ON "FamilyMemberHistory" USING gin ("__sex");
CREATE INDEX "FamilyMemberHistory___sexTextTrgm_idx" ON "FamilyMemberHistory" USING gin (token_array_to_text("__sexText") gin_trgm_ops);
CREATE INDEX "FamilyMemberHistory_status_idx" ON "FamilyMemberHistory" ("status");

CREATE TABLE  "FamilyMemberHistory_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "FamilyMemberHistory_History_id_idx" ON "FamilyMemberHistory_History" ("id");
CREATE INDEX "FamilyMemberHistory_History_lastUpdated_idx" ON "FamilyMemberHistory_History" ("lastUpdated");

CREATE TABLE  "FamilyMemberHistory_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "FamilyMemberHistory_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "FamilyMemberHistory_Refs_targetId_code_idx" ON "FamilyMemberHistory_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Flag" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "patient" TEXT,
  "encounter" TEXT,
  "author" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "subject" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Flag_lastUpdated_idx" ON "Flag" ("lastUpdated");
CREATE INDEX "Flag_projectId_lastUpdated_idx" ON "Flag" ("projectId", "lastUpdated");
CREATE INDEX "Flag_projectId_idx" ON "Flag" ("projectId");
CREATE INDEX "Flag__source_idx" ON "Flag" ("_source");
CREATE INDEX "Flag__profile_idx" ON "Flag" USING gin ("_profile");
CREATE INDEX "Flag___version_idx" ON "Flag" ("__version");
CREATE INDEX "Flag_compartments_idx" ON "Flag" USING gin ("compartments");
CREATE INDEX "Flag___sharedTokens_idx" ON "Flag" USING gin ("__sharedTokens");
CREATE INDEX "Flag___sharedTokensTextTrgm_idx" ON "Flag" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Flag____tag_idx" ON "Flag" USING gin ("___tag");
CREATE INDEX "Flag____tagTextTrgm_idx" ON "Flag" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Flag_date_idx" ON "Flag" ("date");
CREATE INDEX "Flag_projectId_date_idx" ON "Flag" ("projectId", "date");
CREATE INDEX "Flag_patient_idx" ON "Flag" ("patient");
CREATE INDEX "Flag_encounter_idx" ON "Flag" ("encounter");
CREATE INDEX "Flag_author_idx" ON "Flag" ("author");
CREATE INDEX "Flag___idnt_idx" ON "Flag" USING gin ("__identifier");
CREATE INDEX "Flag___idntTextTrgm_idx" ON "Flag" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Flag_subject_idx" ON "Flag" ("subject");
CREATE INDEX "Flag___category_idx" ON "Flag" USING gin ("__category");
CREATE INDEX "Flag___categoryTextTrgm_idx" ON "Flag" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Flag_status_idx" ON "Flag" ("status");

CREATE TABLE  "Flag_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Flag_History_id_idx" ON "Flag_History" ("id");
CREATE INDEX "Flag_History_lastUpdated_idx" ON "Flag_History" ("lastUpdated");

CREATE TABLE  "Flag_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Flag_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Flag_Refs_targetId_code_idx" ON "Flag_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Goal" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__achievementStatus" UUID[],
  "__achievementStatusText" TEXT[],
  "__achievementStatusSort" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "lifecycleStatus" TEXT,
  "startDate" DATE,
  "subject" TEXT,
  "targetDate" DATE[],
  "__description" UUID[],
  "__descriptionText" TEXT[],
  "__descriptionSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Goal_lastUpdated_idx" ON "Goal" ("lastUpdated");
CREATE INDEX "Goal_projectId_lastUpdated_idx" ON "Goal" ("projectId", "lastUpdated");
CREATE INDEX "Goal_projectId_idx" ON "Goal" ("projectId");
CREATE INDEX "Goal__source_idx" ON "Goal" ("_source");
CREATE INDEX "Goal__profile_idx" ON "Goal" USING gin ("_profile");
CREATE INDEX "Goal___version_idx" ON "Goal" ("__version");
CREATE INDEX "Goal_compartments_idx" ON "Goal" USING gin ("compartments");
CREATE INDEX "Goal___sharedTokens_idx" ON "Goal" USING gin ("__sharedTokens");
CREATE INDEX "Goal___sharedTokensTextTrgm_idx" ON "Goal" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Goal____tag_idx" ON "Goal" USING gin ("___tag");
CREATE INDEX "Goal____tagTextTrgm_idx" ON "Goal" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Goal___idnt_idx" ON "Goal" USING gin ("__identifier");
CREATE INDEX "Goal___idntTextTrgm_idx" ON "Goal" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Goal_patient_idx" ON "Goal" ("patient");
CREATE INDEX "Goal___achievementStatus_idx" ON "Goal" USING gin ("__achievementStatus");
CREATE INDEX "Goal___achievementStatusTextTrgm_idx" ON "Goal" USING gin (token_array_to_text("__achievementStatusText") gin_trgm_ops);
CREATE INDEX "Goal___category_idx" ON "Goal" USING gin ("__category");
CREATE INDEX "Goal___categoryTextTrgm_idx" ON "Goal" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Goal_lifecycleStatus_idx" ON "Goal" ("lifecycleStatus");
CREATE INDEX "Goal_startDate_idx" ON "Goal" ("startDate");
CREATE INDEX "Goal_subject_idx" ON "Goal" ("subject");
CREATE INDEX "Goal_targetDate_idx" ON "Goal" USING gin ("targetDate");
CREATE INDEX "Goal___description_idx" ON "Goal" USING gin ("__description");
CREATE INDEX "Goal___descriptionTextTrgm_idx" ON "Goal" USING gin (token_array_to_text("__descriptionText") gin_trgm_ops);

CREATE TABLE  "Goal_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Goal_History_id_idx" ON "Goal_History" ("id");
CREATE INDEX "Goal_History_lastUpdated_idx" ON "Goal_History" ("lastUpdated");

CREATE TABLE  "Goal_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Goal_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Goal_Refs_targetId_code_idx" ON "Goal_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "GraphDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "url" TEXT,
  "version" TEXT,
  "start" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "GraphDefinition_lastUpdated_idx" ON "GraphDefinition" ("lastUpdated");
CREATE INDEX "GraphDefinition_projectId_lastUpdated_idx" ON "GraphDefinition" ("projectId", "lastUpdated");
CREATE INDEX "GraphDefinition_projectId_idx" ON "GraphDefinition" ("projectId");
CREATE INDEX "GraphDefinition__source_idx" ON "GraphDefinition" ("_source");
CREATE INDEX "GraphDefinition__profile_idx" ON "GraphDefinition" USING gin ("_profile");
CREATE INDEX "GraphDefinition___version_idx" ON "GraphDefinition" ("__version");
CREATE INDEX "GraphDefinition_compartments_idx" ON "GraphDefinition" USING gin ("compartments");
CREATE INDEX "GraphDefinition___sharedTokens_idx" ON "GraphDefinition" USING gin ("__sharedTokens");
CREATE INDEX "GraphDefinition___sharedTokensTextTrgm_idx" ON "GraphDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "GraphDefinition____tag_idx" ON "GraphDefinition" USING gin ("___tag");
CREATE INDEX "GraphDefinition____tagTextTrgm_idx" ON "GraphDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "GraphDefinition___context_idx" ON "GraphDefinition" USING gin ("__context");
CREATE INDEX "GraphDefinition___contextTextTrgm_idx" ON "GraphDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "GraphDefinition_contextQuantity_idx" ON "GraphDefinition" USING gin ("contextQuantity");
CREATE INDEX "GraphDefinition___contextType_idx" ON "GraphDefinition" USING gin ("__contextType");
CREATE INDEX "GraphDefinition___contextTypeTextTrgm_idx" ON "GraphDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "GraphDefinition_date_idx" ON "GraphDefinition" ("date");
CREATE INDEX "GraphDefinition_projectId_date_idx" ON "GraphDefinition" ("projectId", "date");
CREATE INDEX "GraphDefinition_description_idx" ON "GraphDefinition" ("description");
CREATE INDEX "GraphDefinition___jurisdiction_idx" ON "GraphDefinition" USING gin ("__jurisdiction");
CREATE INDEX "GraphDefinition___jurisdictionTextTrgm_idx" ON "GraphDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "GraphDefinition_name_idx" ON "GraphDefinition" ("name");
CREATE INDEX "GraphDefinition_publisher_idx" ON "GraphDefinition" ("publisher");
CREATE INDEX "GraphDefinition_status_idx" ON "GraphDefinition" ("status");
CREATE INDEX "GraphDefinition_url_idx" ON "GraphDefinition" ("url");
CREATE INDEX "GraphDefinition_version_idx" ON "GraphDefinition" ("version");
CREATE INDEX "GraphDefinition_start_idx" ON "GraphDefinition" ("start");

CREATE TABLE  "GraphDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "GraphDefinition_History_id_idx" ON "GraphDefinition_History" ("id");
CREATE INDEX "GraphDefinition_History_lastUpdated_idx" ON "GraphDefinition_History" ("lastUpdated");

CREATE TABLE  "GraphDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "GraphDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "GraphDefinition_Refs_targetId_code_idx" ON "GraphDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Group" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "actual" BOOLEAN,
  "__characteristic" UUID[],
  "__characteristicText" TEXT[],
  "__characteristicSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "exclude" BOOLEAN[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "managingEntity" TEXT,
  "member" TEXT[],
  "type" TEXT,
  "__value" UUID[],
  "__valueText" TEXT[],
  "__valueSort" TEXT,
  "name" TEXT,
  "characteristicRange" DOUBLE PRECISION[],
  "characteristicReference" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__managingEntityIdentifierSort" TEXT,
  "__memberIdentifierSort" TEXT,
  "__characteristicReferenceIdentifierSort" TEXT
);
CREATE INDEX "Group_lastUpdated_idx" ON "Group" ("lastUpdated");
CREATE INDEX "Group_projectId_lastUpdated_idx" ON "Group" ("projectId", "lastUpdated");
CREATE INDEX "Group_projectId_idx" ON "Group" ("projectId");
CREATE INDEX "Group__source_idx" ON "Group" ("_source");
CREATE INDEX "Group__profile_idx" ON "Group" USING gin ("_profile");
CREATE INDEX "Group___version_idx" ON "Group" ("__version");
CREATE INDEX "Group_compartments_idx" ON "Group" USING gin ("compartments");
CREATE INDEX "Group___sharedTokens_idx" ON "Group" USING gin ("__sharedTokens");
CREATE INDEX "Group___sharedTokensTextTrgm_idx" ON "Group" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Group____tag_idx" ON "Group" USING gin ("___tag");
CREATE INDEX "Group____tagTextTrgm_idx" ON "Group" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Group_actual_idx" ON "Group" ("actual");
CREATE INDEX "Group___characteristic_idx" ON "Group" USING gin ("__characteristic");
CREATE INDEX "Group___characteristicTextTrgm_idx" ON "Group" USING gin (token_array_to_text("__characteristicText") gin_trgm_ops);
CREATE INDEX "Group___code_idx" ON "Group" USING gin ("__code");
CREATE INDEX "Group___codeTextTrgm_idx" ON "Group" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Group_exclude_idx" ON "Group" USING gin ("exclude");
CREATE INDEX "Group___idnt_idx" ON "Group" USING gin ("__identifier");
CREATE INDEX "Group___idntTextTrgm_idx" ON "Group" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Group_managingEntity_idx" ON "Group" ("managingEntity");
CREATE INDEX "Group_member_idx" ON "Group" USING gin ("member");
CREATE INDEX "Group_type_idx" ON "Group" ("type");
CREATE INDEX "Group___value_idx" ON "Group" USING gin ("__value");
CREATE INDEX "Group___valueTextTrgm_idx" ON "Group" USING gin (token_array_to_text("__valueText") gin_trgm_ops);
CREATE INDEX "Group_name_idx" ON "Group" ("name");
CREATE INDEX "Group_characteristicRange_idx" ON "Group" USING gin ("characteristicRange");
CREATE INDEX "Group_characteristicReference_idx" ON "Group" USING gin ("characteristicReference");

CREATE TABLE  "Group_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Group_History_id_idx" ON "Group_History" ("id");
CREATE INDEX "Group_History_lastUpdated_idx" ON "Group_History" ("lastUpdated");

CREATE TABLE  "Group_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Group_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Group_Refs_targetId_code_idx" ON "Group_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "GuidanceResponse" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__request" UUID[],
  "__requestText" TEXT[],
  "__requestSort" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "GuidanceResponse_lastUpdated_idx" ON "GuidanceResponse" ("lastUpdated");
CREATE INDEX "GuidanceResponse_projectId_lastUpdated_idx" ON "GuidanceResponse" ("projectId", "lastUpdated");
CREATE INDEX "GuidanceResponse_projectId_idx" ON "GuidanceResponse" ("projectId");
CREATE INDEX "GuidanceResponse__source_idx" ON "GuidanceResponse" ("_source");
CREATE INDEX "GuidanceResponse__profile_idx" ON "GuidanceResponse" USING gin ("_profile");
CREATE INDEX "GuidanceResponse___version_idx" ON "GuidanceResponse" ("__version");
CREATE INDEX "GuidanceResponse_compartments_idx" ON "GuidanceResponse" USING gin ("compartments");
CREATE INDEX "GuidanceResponse___sharedTokens_idx" ON "GuidanceResponse" USING gin ("__sharedTokens");
CREATE INDEX "GuidanceResponse___sharedTokensTextTrgm_idx" ON "GuidanceResponse" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "GuidanceResponse____tag_idx" ON "GuidanceResponse" USING gin ("___tag");
CREATE INDEX "GuidanceResponse____tagTextTrgm_idx" ON "GuidanceResponse" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "GuidanceResponse___idnt_idx" ON "GuidanceResponse" USING gin ("__identifier");
CREATE INDEX "GuidanceResponse___idntTextTrgm_idx" ON "GuidanceResponse" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "GuidanceResponse_patient_idx" ON "GuidanceResponse" ("patient");
CREATE INDEX "GuidanceResponse___request_idx" ON "GuidanceResponse" USING gin ("__request");
CREATE INDEX "GuidanceResponse___requestTextTrgm_idx" ON "GuidanceResponse" USING gin (token_array_to_text("__requestText") gin_trgm_ops);
CREATE INDEX "GuidanceResponse_subject_idx" ON "GuidanceResponse" ("subject");

CREATE TABLE  "GuidanceResponse_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "GuidanceResponse_History_id_idx" ON "GuidanceResponse_History" ("id");
CREATE INDEX "GuidanceResponse_History_lastUpdated_idx" ON "GuidanceResponse_History" ("lastUpdated");

CREATE TABLE  "GuidanceResponse_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "GuidanceResponse_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "GuidanceResponse_Refs_targetId_code_idx" ON "GuidanceResponse_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "HealthcareService" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "active" BOOLEAN,
  "__characteristic" UUID[],
  "__characteristicText" TEXT[],
  "__characteristicSort" TEXT,
  "coverageArea" TEXT[],
  "endpoint" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "location" TEXT[],
  "name" TEXT,
  "organization" TEXT,
  "__program" UUID[],
  "__programText" TEXT[],
  "__programSort" TEXT,
  "__serviceCategory" UUID[],
  "__serviceCategoryText" TEXT[],
  "__serviceCategorySort" TEXT,
  "__serviceType" UUID[],
  "__serviceTypeText" TEXT[],
  "__serviceTypeSort" TEXT,
  "__specialty" UUID[],
  "__specialtyText" TEXT[],
  "__specialtySort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__coverageAreaIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT
);
CREATE INDEX "HealthcareService_lastUpdated_idx" ON "HealthcareService" ("lastUpdated");
CREATE INDEX "HealthcareService_projectId_lastUpdated_idx" ON "HealthcareService" ("projectId", "lastUpdated");
CREATE INDEX "HealthcareService_projectId_idx" ON "HealthcareService" ("projectId");
CREATE INDEX "HealthcareService__source_idx" ON "HealthcareService" ("_source");
CREATE INDEX "HealthcareService__profile_idx" ON "HealthcareService" USING gin ("_profile");
CREATE INDEX "HealthcareService___version_idx" ON "HealthcareService" ("__version");
CREATE INDEX "HealthcareService_compartments_idx" ON "HealthcareService" USING gin ("compartments");
CREATE INDEX "HealthcareService___sharedTokens_idx" ON "HealthcareService" USING gin ("__sharedTokens");
CREATE INDEX "HealthcareService___sharedTokensTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "HealthcareService____tag_idx" ON "HealthcareService" USING gin ("___tag");
CREATE INDEX "HealthcareService____tagTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "HealthcareService_active_idx" ON "HealthcareService" ("active");
CREATE INDEX "HealthcareService___characteristic_idx" ON "HealthcareService" USING gin ("__characteristic");
CREATE INDEX "HealthcareService___characteristicTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__characteristicText") gin_trgm_ops);
CREATE INDEX "HealthcareService_coverageArea_idx" ON "HealthcareService" USING gin ("coverageArea");
CREATE INDEX "HealthcareService_endpoint_idx" ON "HealthcareService" USING gin ("endpoint");
CREATE INDEX "HealthcareService___idnt_idx" ON "HealthcareService" USING gin ("__identifier");
CREATE INDEX "HealthcareService___idntTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "HealthcareService_location_idx" ON "HealthcareService" USING gin ("location");
CREATE INDEX "HealthcareService_name_idx" ON "HealthcareService" ("name");
CREATE INDEX "HealthcareService_organization_idx" ON "HealthcareService" ("organization");
CREATE INDEX "HealthcareService___program_idx" ON "HealthcareService" USING gin ("__program");
CREATE INDEX "HealthcareService___programTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__programText") gin_trgm_ops);
CREATE INDEX "HealthcareService___serviceCategory_idx" ON "HealthcareService" USING gin ("__serviceCategory");
CREATE INDEX "HealthcareService___serviceCategoryTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__serviceCategoryText") gin_trgm_ops);
CREATE INDEX "HealthcareService___serviceType_idx" ON "HealthcareService" USING gin ("__serviceType");
CREATE INDEX "HealthcareService___serviceTypeTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__serviceTypeText") gin_trgm_ops);
CREATE INDEX "HealthcareService___specialty_idx" ON "HealthcareService" USING gin ("__specialty");
CREATE INDEX "HealthcareService___specialtyTextTrgm_idx" ON "HealthcareService" USING gin (token_array_to_text("__specialtyText") gin_trgm_ops);

CREATE TABLE  "HealthcareService_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "HealthcareService_History_id_idx" ON "HealthcareService_History" ("id");
CREATE INDEX "HealthcareService_History_lastUpdated_idx" ON "HealthcareService_History" ("lastUpdated");

CREATE TABLE  "HealthcareService_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "HealthcareService_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "HealthcareService_Refs_targetId_code_idx" ON "HealthcareService_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ImagingStudy" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "basedon" TEXT[],
  "__bodysite" UUID[],
  "__bodysiteText" TEXT[],
  "__bodysiteSort" TEXT,
  "__dicomClass" UUID[],
  "__dicomClassText" TEXT[],
  "__dicomClassSort" TEXT,
  "encounter" TEXT,
  "endpoint" TEXT[],
  "instance" TEXT[],
  "interpreter" TEXT[],
  "__modality" UUID[],
  "__modalityText" TEXT[],
  "__modalitySort" TEXT,
  "performer" TEXT[],
  "__reason" UUID[],
  "__reasonText" TEXT[],
  "__reasonSort" TEXT,
  "referrer" TEXT,
  "series" TEXT[],
  "started" TIMESTAMPTZ,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__basedonIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__interpreterIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__referrerIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "ImagingStudy_lastUpdated_idx" ON "ImagingStudy" ("lastUpdated");
CREATE INDEX "ImagingStudy_projectId_lastUpdated_idx" ON "ImagingStudy" ("projectId", "lastUpdated");
CREATE INDEX "ImagingStudy_projectId_idx" ON "ImagingStudy" ("projectId");
CREATE INDEX "ImagingStudy__source_idx" ON "ImagingStudy" ("_source");
CREATE INDEX "ImagingStudy__profile_idx" ON "ImagingStudy" USING gin ("_profile");
CREATE INDEX "ImagingStudy___version_idx" ON "ImagingStudy" ("__version");
CREATE INDEX "ImagingStudy_compartments_idx" ON "ImagingStudy" USING gin ("compartments");
CREATE INDEX "ImagingStudy___sharedTokens_idx" ON "ImagingStudy" USING gin ("__sharedTokens");
CREATE INDEX "ImagingStudy___sharedTokensTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ImagingStudy____tag_idx" ON "ImagingStudy" USING gin ("___tag");
CREATE INDEX "ImagingStudy____tagTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ImagingStudy___idnt_idx" ON "ImagingStudy" USING gin ("__identifier");
CREATE INDEX "ImagingStudy___idntTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ImagingStudy_patient_idx" ON "ImagingStudy" ("patient");
CREATE INDEX "ImagingStudy_basedon_idx" ON "ImagingStudy" USING gin ("basedon");
CREATE INDEX "ImagingStudy___bodysite_idx" ON "ImagingStudy" USING gin ("__bodysite");
CREATE INDEX "ImagingStudy___bodysiteTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("__bodysiteText") gin_trgm_ops);
CREATE INDEX "ImagingStudy___dicomClass_idx" ON "ImagingStudy" USING gin ("__dicomClass");
CREATE INDEX "ImagingStudy___dicomClassTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("__dicomClassText") gin_trgm_ops);
CREATE INDEX "ImagingStudy_encounter_idx" ON "ImagingStudy" ("encounter");
CREATE INDEX "ImagingStudy_endpoint_idx" ON "ImagingStudy" USING gin ("endpoint");
CREATE INDEX "ImagingStudy_instance_idx" ON "ImagingStudy" USING gin ("instance");
CREATE INDEX "ImagingStudy_interpreter_idx" ON "ImagingStudy" USING gin ("interpreter");
CREATE INDEX "ImagingStudy___modality_idx" ON "ImagingStudy" USING gin ("__modality");
CREATE INDEX "ImagingStudy___modalityTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("__modalityText") gin_trgm_ops);
CREATE INDEX "ImagingStudy_performer_idx" ON "ImagingStudy" USING gin ("performer");
CREATE INDEX "ImagingStudy___reason_idx" ON "ImagingStudy" USING gin ("__reason");
CREATE INDEX "ImagingStudy___reasonTextTrgm_idx" ON "ImagingStudy" USING gin (token_array_to_text("__reasonText") gin_trgm_ops);
CREATE INDEX "ImagingStudy_referrer_idx" ON "ImagingStudy" ("referrer");
CREATE INDEX "ImagingStudy_series_idx" ON "ImagingStudy" USING gin ("series");
CREATE INDEX "ImagingStudy_started_idx" ON "ImagingStudy" ("started");
CREATE INDEX "ImagingStudy_status_idx" ON "ImagingStudy" ("status");
CREATE INDEX "ImagingStudy_subject_idx" ON "ImagingStudy" ("subject");

CREATE TABLE  "ImagingStudy_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ImagingStudy_History_id_idx" ON "ImagingStudy_History" ("id");
CREATE INDEX "ImagingStudy_History_lastUpdated_idx" ON "ImagingStudy_History" ("lastUpdated");

CREATE TABLE  "ImagingStudy_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ImagingStudy_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ImagingStudy_Refs_targetId_code_idx" ON "ImagingStudy_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Immunization" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "location" TEXT,
  "lotNumber" TEXT,
  "manufacturer" TEXT,
  "performer" TEXT[],
  "reaction" TEXT[],
  "reactionDate" TIMESTAMPTZ[],
  "__reasonCode" UUID[],
  "__reasonCodeText" TEXT[],
  "__reasonCodeSort" TEXT,
  "reasonReference" TEXT[],
  "series" TEXT[],
  "status" TEXT,
  "__statusReason" UUID[],
  "__statusReasonText" TEXT[],
  "__statusReasonSort" TEXT,
  "__targetDisease" UUID[],
  "__targetDiseaseText" TEXT[],
  "__targetDiseaseSort" TEXT,
  "__vaccineCode" UUID[],
  "__vaccineCodeText" TEXT[],
  "__vaccineCodeSort" TEXT,
  "encounter" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__manufacturerIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__reactionIdentifierSort" TEXT,
  "__reasonReferenceIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT
);
CREATE INDEX "Immunization_lastUpdated_idx" ON "Immunization" ("lastUpdated");
CREATE INDEX "Immunization_projectId_lastUpdated_idx" ON "Immunization" ("projectId", "lastUpdated");
CREATE INDEX "Immunization_projectId_idx" ON "Immunization" ("projectId");
CREATE INDEX "Immunization__source_idx" ON "Immunization" ("_source");
CREATE INDEX "Immunization__profile_idx" ON "Immunization" USING gin ("_profile");
CREATE INDEX "Immunization___version_idx" ON "Immunization" ("__version");
CREATE INDEX "Immunization_compartments_idx" ON "Immunization" USING gin ("compartments");
CREATE INDEX "Immunization___sharedTokens_idx" ON "Immunization" USING gin ("__sharedTokens");
CREATE INDEX "Immunization___sharedTokensTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Immunization____tag_idx" ON "Immunization" USING gin ("___tag");
CREATE INDEX "Immunization____tagTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Immunization_date_idx" ON "Immunization" ("date");
CREATE INDEX "Immunization_projectId_date_idx" ON "Immunization" ("projectId", "date");
CREATE INDEX "Immunization___idnt_idx" ON "Immunization" USING gin ("__identifier");
CREATE INDEX "Immunization___idntTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Immunization_patient_idx" ON "Immunization" ("patient");
CREATE INDEX "Immunization_location_idx" ON "Immunization" ("location");
CREATE INDEX "Immunization_lotNumber_idx" ON "Immunization" ("lotNumber");
CREATE INDEX "Immunization_manufacturer_idx" ON "Immunization" ("manufacturer");
CREATE INDEX "Immunization_performer_idx" ON "Immunization" USING gin ("performer");
CREATE INDEX "Immunization_reaction_idx" ON "Immunization" USING gin ("reaction");
CREATE INDEX "Immunization_reactionDate_idx" ON "Immunization" USING gin ("reactionDate");
CREATE INDEX "Immunization___reasonCode_idx" ON "Immunization" USING gin ("__reasonCode");
CREATE INDEX "Immunization___reasonCodeTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("__reasonCodeText") gin_trgm_ops);
CREATE INDEX "Immunization_reasonReference_idx" ON "Immunization" USING gin ("reasonReference");
CREATE INDEX "Immunization_series_idx" ON "Immunization" USING gin ("series");
CREATE INDEX "Immunization_status_idx" ON "Immunization" ("status");
CREATE INDEX "Immunization___statusReason_idx" ON "Immunization" USING gin ("__statusReason");
CREATE INDEX "Immunization___statusReasonTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("__statusReasonText") gin_trgm_ops);
CREATE INDEX "Immunization___targetDisease_idx" ON "Immunization" USING gin ("__targetDisease");
CREATE INDEX "Immunization___targetDiseaseTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("__targetDiseaseText") gin_trgm_ops);
CREATE INDEX "Immunization___vaccineCode_idx" ON "Immunization" USING gin ("__vaccineCode");
CREATE INDEX "Immunization___vaccineCodeTextTrgm_idx" ON "Immunization" USING gin (token_array_to_text("__vaccineCodeText") gin_trgm_ops);
CREATE INDEX "Immunization_encounter_idx" ON "Immunization" ("encounter");

CREATE TABLE  "Immunization_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Immunization_History_id_idx" ON "Immunization_History" ("id");
CREATE INDEX "Immunization_History_lastUpdated_idx" ON "Immunization_History" ("lastUpdated");

CREATE TABLE  "Immunization_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Immunization_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Immunization_Refs_targetId_code_idx" ON "Immunization_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ImmunizationEvaluation" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__doseStatus" UUID[],
  "__doseStatusText" TEXT[],
  "__doseStatusSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "immunizationEvent" TEXT,
  "patient" TEXT,
  "status" TEXT,
  "__targetDisease" UUID[],
  "__targetDiseaseText" TEXT[],
  "__targetDiseaseSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__immunizationEventIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT
);
CREATE INDEX "ImmunizationEvaluation_lastUpdated_idx" ON "ImmunizationEvaluation" ("lastUpdated");
CREATE INDEX "ImmunizationEvaluation_projectId_lastUpdated_idx" ON "ImmunizationEvaluation" ("projectId", "lastUpdated");
CREATE INDEX "ImmunizationEvaluation_projectId_idx" ON "ImmunizationEvaluation" ("projectId");
CREATE INDEX "ImmunizationEvaluation__source_idx" ON "ImmunizationEvaluation" ("_source");
CREATE INDEX "ImmunizationEvaluation__profile_idx" ON "ImmunizationEvaluation" USING gin ("_profile");
CREATE INDEX "ImmunizationEvaluation___version_idx" ON "ImmunizationEvaluation" ("__version");
CREATE INDEX "ImmunizationEvaluation_compartments_idx" ON "ImmunizationEvaluation" USING gin ("compartments");
CREATE INDEX "ImmunizationEvaluation___sharedTokens_idx" ON "ImmunizationEvaluation" USING gin ("__sharedTokens");
CREATE INDEX "ImmunizationEvaluation___sharedTokensTextTrgm_idx" ON "ImmunizationEvaluation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ImmunizationEvaluation____tag_idx" ON "ImmunizationEvaluation" USING gin ("___tag");
CREATE INDEX "ImmunizationEvaluation____tagTextTrgm_idx" ON "ImmunizationEvaluation" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ImmunizationEvaluation_date_idx" ON "ImmunizationEvaluation" ("date");
CREATE INDEX "ImmunizationEvaluation_projectId_date_idx" ON "ImmunizationEvaluation" ("projectId", "date");
CREATE INDEX "ImmunizationEvaluation___doseStatus_idx" ON "ImmunizationEvaluation" USING gin ("__doseStatus");
CREATE INDEX "ImmunizationEvaluation___doseStatusTextTrgm_idx" ON "ImmunizationEvaluation" USING gin (token_array_to_text("__doseStatusText") gin_trgm_ops);
CREATE INDEX "ImmunizationEvaluation___idnt_idx" ON "ImmunizationEvaluation" USING gin ("__identifier");
CREATE INDEX "ImmunizationEvaluation___idntTextTrgm_idx" ON "ImmunizationEvaluation" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ImmunizationEvaluation_immEvent_idx" ON "ImmunizationEvaluation" ("immunizationEvent");
CREATE INDEX "ImmunizationEvaluation_patient_idx" ON "ImmunizationEvaluation" ("patient");
CREATE INDEX "ImmunizationEvaluation_status_idx" ON "ImmunizationEvaluation" ("status");
CREATE INDEX "ImmunizationEvaluation___targetDisease_idx" ON "ImmunizationEvaluation" USING gin ("__targetDisease");
CREATE INDEX "ImmunizationEvaluation___targetDiseaseTextTrgm_idx" ON "ImmunizationEvaluation" USING gin (token_array_to_text("__targetDiseaseText") gin_trgm_ops);

CREATE TABLE  "ImmunizationEvaluation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ImmunizationEvaluation_History_id_idx" ON "ImmunizationEvaluation_History" ("id");
CREATE INDEX "ImmunizationEvaluation_History_lastUpdated_idx" ON "ImmunizationEvaluation_History" ("lastUpdated");

CREATE TABLE  "ImmunizationEvaluation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ImmunizationEvaluation_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ImmunizationEvaluation_Refs_targetId_code_idx" ON "ImmunizationEvaluation_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ImmunizationRecommendation" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "information" TEXT[],
  "patient" TEXT,
  "__status" UUID[],
  "__statusText" TEXT[],
  "__statusSort" TEXT,
  "support" TEXT[],
  "__targetDisease" UUID[],
  "__targetDiseaseText" TEXT[],
  "__targetDiseaseSort" TEXT,
  "__vaccineType" UUID[],
  "__vaccineTypeText" TEXT[],
  "__vaccineTypeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__informationIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__supportIdentifierSort" TEXT
);
CREATE INDEX "ImmunizationRecommendation_lastUpdated_idx" ON "ImmunizationRecommendation" ("lastUpdated");
CREATE INDEX "ImmunizationRecommendation_projectId_lastUpdated_idx" ON "ImmunizationRecommendation" ("projectId", "lastUpdated");
CREATE INDEX "ImmunizationRecommendation_projectId_idx" ON "ImmunizationRecommendation" ("projectId");
CREATE INDEX "ImmunizationRecommendation__source_idx" ON "ImmunizationRecommendation" ("_source");
CREATE INDEX "ImmunizationRecommendation__profile_idx" ON "ImmunizationRecommendation" USING gin ("_profile");
CREATE INDEX "ImmunizationRecommendation___version_idx" ON "ImmunizationRecommendation" ("__version");
CREATE INDEX "ImmunizationRecommendation_compartments_idx" ON "ImmunizationRecommendation" USING gin ("compartments");
CREATE INDEX "ImmunizationRecommendation___sharedTokens_idx" ON "ImmunizationRecommendation" USING gin ("__sharedTokens");
CREATE INDEX "ImmunizationRecommendation___sharedTokensTextTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ImmunizationRecommendation____tag_idx" ON "ImmunizationRecommendation" USING gin ("___tag");
CREATE INDEX "ImmunizationRecommendation____tagTextTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ImmunizationRecommendation_date_idx" ON "ImmunizationRecommendation" ("date");
CREATE INDEX "ImmunizationRecommendation_projectId_date_idx" ON "ImmunizationRecommendation" ("projectId", "date");
CREATE INDEX "ImmunizationRecommendation___idnt_idx" ON "ImmunizationRecommendation" USING gin ("__identifier");
CREATE INDEX "ImmunizationRecommendation___idntTextTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ImmunizationRecommendation_information_idx" ON "ImmunizationRecommendation" USING gin ("information");
CREATE INDEX "ImmunizationRecommendation_patient_idx" ON "ImmunizationRecommendation" ("patient");
CREATE INDEX "ImmunizationRecommendation___status_idx" ON "ImmunizationRecommendation" USING gin ("__status");
CREATE INDEX "ImmunizationRecommendation___statusTextTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("__statusText") gin_trgm_ops);
CREATE INDEX "ImmunizationRecommendation_support_idx" ON "ImmunizationRecommendation" USING gin ("support");
CREATE INDEX "ImmunizationRecommendation___targetDisease_idx" ON "ImmunizationRecommendation" USING gin ("__targetDisease");
CREATE INDEX "ImmunizationRecommendation___targetDiseaseTextTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("__targetDiseaseText") gin_trgm_ops);
CREATE INDEX "ImmunizationRecommendation___vaccineType_idx" ON "ImmunizationRecommendation" USING gin ("__vaccineType");
CREATE INDEX "ImmunizationRecommendation___vaccineTypeTextTrgm_idx" ON "ImmunizationRecommendation" USING gin (token_array_to_text("__vaccineTypeText") gin_trgm_ops);

CREATE TABLE  "ImmunizationRecommendation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ImmunizationRecommendation_History_id_idx" ON "ImmunizationRecommendation_History" ("id");
CREATE INDEX "ImmunizationRecommendation_History_lastUpdated_idx" ON "ImmunizationRecommendation_History" ("lastUpdated");

CREATE TABLE  "ImmunizationRecommendation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ImmunizationRecommendation_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ImmunizationRecommendation_Refs_targetId_code_idx" ON "ImmunizationRecommendation_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ImplementationGuide" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "dependsOn" TEXT[],
  "experimental" BOOLEAN,
  "global" TEXT[],
  "resource" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__globalIdentifierSort" TEXT,
  "__resourceIdentifierSort" TEXT
);
CREATE INDEX "ImplementationGuide_lastUpdated_idx" ON "ImplementationGuide" ("lastUpdated");
CREATE INDEX "ImplementationGuide_projectId_lastUpdated_idx" ON "ImplementationGuide" ("projectId", "lastUpdated");
CREATE INDEX "ImplementationGuide_projectId_idx" ON "ImplementationGuide" ("projectId");
CREATE INDEX "ImplementationGuide__source_idx" ON "ImplementationGuide" ("_source");
CREATE INDEX "ImplementationGuide__profile_idx" ON "ImplementationGuide" USING gin ("_profile");
CREATE INDEX "ImplementationGuide___version_idx" ON "ImplementationGuide" ("__version");
CREATE INDEX "ImplementationGuide_compartments_idx" ON "ImplementationGuide" USING gin ("compartments");
CREATE INDEX "ImplementationGuide___sharedTokens_idx" ON "ImplementationGuide" USING gin ("__sharedTokens");
CREATE INDEX "ImplementationGuide___sharedTokensTextTrgm_idx" ON "ImplementationGuide" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ImplementationGuide____tag_idx" ON "ImplementationGuide" USING gin ("___tag");
CREATE INDEX "ImplementationGuide____tagTextTrgm_idx" ON "ImplementationGuide" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ImplementationGuide___context_idx" ON "ImplementationGuide" USING gin ("__context");
CREATE INDEX "ImplementationGuide___contextTextTrgm_idx" ON "ImplementationGuide" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ImplementationGuide_contextQuantity_idx" ON "ImplementationGuide" USING gin ("contextQuantity");
CREATE INDEX "ImplementationGuide___contextType_idx" ON "ImplementationGuide" USING gin ("__contextType");
CREATE INDEX "ImplementationGuide___contextTypeTextTrgm_idx" ON "ImplementationGuide" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ImplementationGuide_date_idx" ON "ImplementationGuide" ("date");
CREATE INDEX "ImplementationGuide_projectId_date_idx" ON "ImplementationGuide" ("projectId", "date");
CREATE INDEX "ImplementationGuide_description_idx" ON "ImplementationGuide" ("description");
CREATE INDEX "ImplementationGuide___jurisdiction_idx" ON "ImplementationGuide" USING gin ("__jurisdiction");
CREATE INDEX "ImplementationGuide___jurisdictionTextTrgm_idx" ON "ImplementationGuide" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ImplementationGuide_name_idx" ON "ImplementationGuide" ("name");
CREATE INDEX "ImplementationGuide_publisher_idx" ON "ImplementationGuide" ("publisher");
CREATE INDEX "ImplementationGuide_status_idx" ON "ImplementationGuide" ("status");
CREATE INDEX "ImplementationGuide_title_idx" ON "ImplementationGuide" ("title");
CREATE INDEX "ImplementationGuide_url_idx" ON "ImplementationGuide" ("url");
CREATE INDEX "ImplementationGuide_version_idx" ON "ImplementationGuide" ("version");
CREATE INDEX "ImplementationGuide_dependsOn_idx" ON "ImplementationGuide" USING gin ("dependsOn");
CREATE INDEX "ImplementationGuide_experimental_idx" ON "ImplementationGuide" ("experimental");
CREATE INDEX "ImplementationGuide_global_idx" ON "ImplementationGuide" USING gin ("global");
CREATE INDEX "ImplementationGuide_resource_idx" ON "ImplementationGuide" USING gin ("resource");

CREATE TABLE  "ImplementationGuide_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ImplementationGuide_History_id_idx" ON "ImplementationGuide_History" ("id");
CREATE INDEX "ImplementationGuide_History_lastUpdated_idx" ON "ImplementationGuide_History" ("lastUpdated");

CREATE TABLE  "ImplementationGuide_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ImplementationGuide_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ImplementationGuide_Refs_targetId_code_idx" ON "ImplementationGuide_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "InsurancePlan" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "administeredBy" TEXT,
  "endpoint" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT,
  "ownedBy" TEXT,
  "phonetic" TEXT,
  "status" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__administeredByIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__ownedByIdentifierSort" TEXT
);
CREATE INDEX "InsurancePlan_lastUpdated_idx" ON "InsurancePlan" ("lastUpdated");
CREATE INDEX "InsurancePlan_projectId_lastUpdated_idx" ON "InsurancePlan" ("projectId", "lastUpdated");
CREATE INDEX "InsurancePlan_projectId_idx" ON "InsurancePlan" ("projectId");
CREATE INDEX "InsurancePlan__source_idx" ON "InsurancePlan" ("_source");
CREATE INDEX "InsurancePlan__profile_idx" ON "InsurancePlan" USING gin ("_profile");
CREATE INDEX "InsurancePlan___version_idx" ON "InsurancePlan" ("__version");
CREATE INDEX "InsurancePlan_compartments_idx" ON "InsurancePlan" USING gin ("compartments");
CREATE INDEX "InsurancePlan___sharedTokens_idx" ON "InsurancePlan" USING gin ("__sharedTokens");
CREATE INDEX "InsurancePlan___sharedTokensTextTrgm_idx" ON "InsurancePlan" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "InsurancePlan____tag_idx" ON "InsurancePlan" USING gin ("___tag");
CREATE INDEX "InsurancePlan____tagTextTrgm_idx" ON "InsurancePlan" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "InsurancePlan_administeredBy_idx" ON "InsurancePlan" ("administeredBy");
CREATE INDEX "InsurancePlan_endpoint_idx" ON "InsurancePlan" USING gin ("endpoint");
CREATE INDEX "InsurancePlan___idnt_idx" ON "InsurancePlan" USING gin ("__identifier");
CREATE INDEX "InsurancePlan___idntTextTrgm_idx" ON "InsurancePlan" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "InsurancePlan_name_idx" ON "InsurancePlan" ("name");
CREATE INDEX "InsurancePlan_ownedBy_idx" ON "InsurancePlan" ("ownedBy");
CREATE INDEX "InsurancePlan_phonetic_idx" ON "InsurancePlan" ("phonetic");
CREATE INDEX "InsurancePlan_status_idx" ON "InsurancePlan" ("status");
CREATE INDEX "InsurancePlan___type_idx" ON "InsurancePlan" USING gin ("__type");
CREATE INDEX "InsurancePlan___typeTextTrgm_idx" ON "InsurancePlan" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "InsurancePlan_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "InsurancePlan_History_id_idx" ON "InsurancePlan_History" ("id");
CREATE INDEX "InsurancePlan_History_lastUpdated_idx" ON "InsurancePlan_History" ("lastUpdated");

CREATE TABLE  "InsurancePlan_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "InsurancePlan_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "InsurancePlan_Refs_targetId_code_idx" ON "InsurancePlan_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Invoice" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "account" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "issuer" TEXT,
  "participant" TEXT[],
  "__participantRole" UUID[],
  "__participantRoleText" TEXT[],
  "__participantRoleSort" TEXT,
  "patient" TEXT,
  "recipient" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "totalgross" DOUBLE PRECISION,
  "totalnet" DOUBLE PRECISION,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__accountIdentifierSort" TEXT,
  "__issuerIdentifierSort" TEXT,
  "__participantIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__recipientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Invoice_lastUpdated_idx" ON "Invoice" ("lastUpdated");
CREATE INDEX "Invoice_projectId_lastUpdated_idx" ON "Invoice" ("projectId", "lastUpdated");
CREATE INDEX "Invoice_projectId_idx" ON "Invoice" ("projectId");
CREATE INDEX "Invoice__source_idx" ON "Invoice" ("_source");
CREATE INDEX "Invoice__profile_idx" ON "Invoice" USING gin ("_profile");
CREATE INDEX "Invoice___version_idx" ON "Invoice" ("__version");
CREATE INDEX "Invoice_compartments_idx" ON "Invoice" USING gin ("compartments");
CREATE INDEX "Invoice___sharedTokens_idx" ON "Invoice" USING gin ("__sharedTokens");
CREATE INDEX "Invoice___sharedTokensTextTrgm_idx" ON "Invoice" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Invoice____tag_idx" ON "Invoice" USING gin ("___tag");
CREATE INDEX "Invoice____tagTextTrgm_idx" ON "Invoice" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Invoice_account_idx" ON "Invoice" ("account");
CREATE INDEX "Invoice_date_idx" ON "Invoice" ("date");
CREATE INDEX "Invoice_projectId_date_idx" ON "Invoice" ("projectId", "date");
CREATE INDEX "Invoice___idnt_idx" ON "Invoice" USING gin ("__identifier");
CREATE INDEX "Invoice___idntTextTrgm_idx" ON "Invoice" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Invoice_issuer_idx" ON "Invoice" ("issuer");
CREATE INDEX "Invoice_participant_idx" ON "Invoice" USING gin ("participant");
CREATE INDEX "Invoice___participantRole_idx" ON "Invoice" USING gin ("__participantRole");
CREATE INDEX "Invoice___participantRoleTextTrgm_idx" ON "Invoice" USING gin (token_array_to_text("__participantRoleText") gin_trgm_ops);
CREATE INDEX "Invoice_patient_idx" ON "Invoice" ("patient");
CREATE INDEX "Invoice_recipient_idx" ON "Invoice" ("recipient");
CREATE INDEX "Invoice_status_idx" ON "Invoice" ("status");
CREATE INDEX "Invoice_subject_idx" ON "Invoice" ("subject");
CREATE INDEX "Invoice_totalgross_idx" ON "Invoice" ("totalgross");
CREATE INDEX "Invoice_totalnet_idx" ON "Invoice" ("totalnet");
CREATE INDEX "Invoice___type_idx" ON "Invoice" USING gin ("__type");
CREATE INDEX "Invoice___typeTextTrgm_idx" ON "Invoice" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "Invoice_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Invoice_History_id_idx" ON "Invoice_History" ("id");
CREATE INDEX "Invoice_History_lastUpdated_idx" ON "Invoice_History" ("lastUpdated");

CREATE TABLE  "Invoice_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Invoice_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Invoice_Refs_targetId_code_idx" ON "Invoice_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Library" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "contentType" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "Library_lastUpdated_idx" ON "Library" ("lastUpdated");
CREATE INDEX "Library_projectId_lastUpdated_idx" ON "Library" ("projectId", "lastUpdated");
CREATE INDEX "Library_projectId_idx" ON "Library" ("projectId");
CREATE INDEX "Library__source_idx" ON "Library" ("_source");
CREATE INDEX "Library__profile_idx" ON "Library" USING gin ("_profile");
CREATE INDEX "Library___version_idx" ON "Library" ("__version");
CREATE INDEX "Library_compartments_idx" ON "Library" USING gin ("compartments");
CREATE INDEX "Library___sharedTokens_idx" ON "Library" USING gin ("__sharedTokens");
CREATE INDEX "Library___sharedTokensTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Library____tag_idx" ON "Library" USING gin ("___tag");
CREATE INDEX "Library____tagTextTrgm_idx" ON "Library" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Library_composedOf_idx" ON "Library" USING gin ("composedOf");
CREATE INDEX "Library_contentType_idx" ON "Library" USING gin ("contentType");
CREATE INDEX "Library___context_idx" ON "Library" USING gin ("__context");
CREATE INDEX "Library___contextTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "Library_contextQuantity_idx" ON "Library" USING gin ("contextQuantity");
CREATE INDEX "Library___contextType_idx" ON "Library" USING gin ("__contextType");
CREATE INDEX "Library___contextTypeTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "Library_date_idx" ON "Library" ("date");
CREATE INDEX "Library_projectId_date_idx" ON "Library" ("projectId", "date");
CREATE INDEX "Library_dependsOn_idx" ON "Library" USING gin ("dependsOn");
CREATE INDEX "Library_derivedFrom_idx" ON "Library" USING gin ("derivedFrom");
CREATE INDEX "Library_description_idx" ON "Library" ("description");
CREATE INDEX "Library_effective_idx" ON "Library" ("effective");
CREATE INDEX "Library___idnt_idx" ON "Library" USING gin ("__identifier");
CREATE INDEX "Library___idntTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Library___jurisdiction_idx" ON "Library" USING gin ("__jurisdiction");
CREATE INDEX "Library___jurisdictionTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "Library_name_idx" ON "Library" ("name");
CREATE INDEX "Library_predecessor_idx" ON "Library" USING gin ("predecessor");
CREATE INDEX "Library_publisher_idx" ON "Library" ("publisher");
CREATE INDEX "Library_status_idx" ON "Library" ("status");
CREATE INDEX "Library_successor_idx" ON "Library" USING gin ("successor");
CREATE INDEX "Library_title_idx" ON "Library" ("title");
CREATE INDEX "Library___topic_idx" ON "Library" USING gin ("__topic");
CREATE INDEX "Library___topicTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "Library___type_idx" ON "Library" USING gin ("__type");
CREATE INDEX "Library___typeTextTrgm_idx" ON "Library" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "Library_url_idx" ON "Library" ("url");
CREATE INDEX "Library_version_idx" ON "Library" ("version");

CREATE TABLE  "Library_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Library_History_id_idx" ON "Library_History" ("id");
CREATE INDEX "Library_History_lastUpdated_idx" ON "Library_History" ("lastUpdated");

CREATE TABLE  "Library_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Library_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Library_Refs_targetId_code_idx" ON "Library_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Linkage" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "author" TEXT,
  "item" TEXT[],
  "source" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__itemIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT
);
CREATE INDEX "Linkage_lastUpdated_idx" ON "Linkage" ("lastUpdated");
CREATE INDEX "Linkage_projectId_lastUpdated_idx" ON "Linkage" ("projectId", "lastUpdated");
CREATE INDEX "Linkage_projectId_idx" ON "Linkage" ("projectId");
CREATE INDEX "Linkage__source_idx" ON "Linkage" ("_source");
CREATE INDEX "Linkage__profile_idx" ON "Linkage" USING gin ("_profile");
CREATE INDEX "Linkage___version_idx" ON "Linkage" ("__version");
CREATE INDEX "Linkage_compartments_idx" ON "Linkage" USING gin ("compartments");
CREATE INDEX "Linkage___sharedTokens_idx" ON "Linkage" USING gin ("__sharedTokens");
CREATE INDEX "Linkage___sharedTokensTextTrgm_idx" ON "Linkage" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Linkage____tag_idx" ON "Linkage" USING gin ("___tag");
CREATE INDEX "Linkage____tagTextTrgm_idx" ON "Linkage" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Linkage_author_idx" ON "Linkage" ("author");
CREATE INDEX "Linkage_item_idx" ON "Linkage" USING gin ("item");
CREATE INDEX "Linkage_source_idx" ON "Linkage" USING gin ("source");

CREATE TABLE  "Linkage_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Linkage_History_id_idx" ON "Linkage_History" ("id");
CREATE INDEX "Linkage_History_lastUpdated_idx" ON "Linkage_History" ("lastUpdated");

CREATE TABLE  "Linkage_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Linkage_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Linkage_Refs_targetId_code_idx" ON "Linkage_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "List" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "__emptyReason" UUID[],
  "__emptyReasonText" TEXT[],
  "__emptyReasonSort" TEXT,
  "item" TEXT[],
  "notes" TEXT[],
  "source" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "title" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__itemIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "List_lastUpdated_idx" ON "List" ("lastUpdated");
CREATE INDEX "List_projectId_lastUpdated_idx" ON "List" ("projectId", "lastUpdated");
CREATE INDEX "List_projectId_idx" ON "List" ("projectId");
CREATE INDEX "List__source_idx" ON "List" ("_source");
CREATE INDEX "List__profile_idx" ON "List" USING gin ("_profile");
CREATE INDEX "List___version_idx" ON "List" ("__version");
CREATE INDEX "List_compartments_idx" ON "List" USING gin ("compartments");
CREATE INDEX "List___sharedTokens_idx" ON "List" USING gin ("__sharedTokens");
CREATE INDEX "List___sharedTokensTextTrgm_idx" ON "List" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "List____tag_idx" ON "List" USING gin ("___tag");
CREATE INDEX "List____tagTextTrgm_idx" ON "List" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "List___code_idx" ON "List" USING gin ("__code");
CREATE INDEX "List___codeTextTrgm_idx" ON "List" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "List_date_idx" ON "List" ("date");
CREATE INDEX "List_projectId_date_idx" ON "List" ("projectId", "date");
CREATE INDEX "List___idnt_idx" ON "List" USING gin ("__identifier");
CREATE INDEX "List___idntTextTrgm_idx" ON "List" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "List_patient_idx" ON "List" ("patient");
CREATE INDEX "List_encounter_idx" ON "List" ("encounter");
CREATE INDEX "List___emptyReason_idx" ON "List" USING gin ("__emptyReason");
CREATE INDEX "List___emptyReasonTextTrgm_idx" ON "List" USING gin (token_array_to_text("__emptyReasonText") gin_trgm_ops);
CREATE INDEX "List_item_idx" ON "List" USING gin ("item");
CREATE INDEX "List_notes_idx" ON "List" USING gin ("notes");
CREATE INDEX "List_source_idx" ON "List" ("source");
CREATE INDEX "List_status_idx" ON "List" ("status");
CREATE INDEX "List_subject_idx" ON "List" ("subject");
CREATE INDEX "List_title_idx" ON "List" ("title");

CREATE TABLE  "List_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "List_History_id_idx" ON "List_History" ("id");
CREATE INDEX "List_History_lastUpdated_idx" ON "List_History" ("lastUpdated");

CREATE TABLE  "List_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "List_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "List_Refs_targetId_code_idx" ON "List_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Location" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "endpoint" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT[],
  "near" TEXT,
  "__operationalStatus" UUID[],
  "__operationalStatusText" TEXT[],
  "__operationalStatusSort" TEXT,
  "organization" TEXT,
  "partof" TEXT,
  "status" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "__physicalType" UUID[],
  "__physicalTypeText" TEXT[],
  "__physicalTypeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT,
  "__partofIdentifierSort" TEXT
);
CREATE INDEX "Location_lastUpdated_idx" ON "Location" ("lastUpdated");
CREATE INDEX "Location_projectId_lastUpdated_idx" ON "Location" ("projectId", "lastUpdated");
CREATE INDEX "Location_projectId_idx" ON "Location" ("projectId");
CREATE INDEX "Location__source_idx" ON "Location" ("_source");
CREATE INDEX "Location__profile_idx" ON "Location" USING gin ("_profile");
CREATE INDEX "Location___version_idx" ON "Location" ("__version");
CREATE INDEX "Location_compartments_idx" ON "Location" USING gin ("compartments");
CREATE INDEX "Location___sharedTokens_idx" ON "Location" USING gin ("__sharedTokens");
CREATE INDEX "Location___sharedTokensTextTrgm_idx" ON "Location" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Location____tag_idx" ON "Location" USING gin ("___tag");
CREATE INDEX "Location____tagTextTrgm_idx" ON "Location" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Location_endpoint_idx" ON "Location" USING gin ("endpoint");
CREATE INDEX "Location___idnt_idx" ON "Location" USING gin ("__identifier");
CREATE INDEX "Location___idntTextTrgm_idx" ON "Location" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Location_name_idx" ON "Location" USING gin ("name");
CREATE INDEX "Location_near_idx" ON "Location" ("near");
CREATE INDEX "Location___operationalStatus_idx" ON "Location" USING gin ("__operationalStatus");
CREATE INDEX "Location___operationalStatusTextTrgm_idx" ON "Location" USING gin (token_array_to_text("__operationalStatusText") gin_trgm_ops);
CREATE INDEX "Location_organization_idx" ON "Location" ("organization");
CREATE INDEX "Location_partof_idx" ON "Location" ("partof");
CREATE INDEX "Location_status_idx" ON "Location" ("status");
CREATE INDEX "Location___type_idx" ON "Location" USING gin ("__type");
CREATE INDEX "Location___typeTextTrgm_idx" ON "Location" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "Location___physicalType_idx" ON "Location" USING gin ("__physicalType");
CREATE INDEX "Location___physicalTypeTextTrgm_idx" ON "Location" USING gin (token_array_to_text("__physicalTypeText") gin_trgm_ops);

CREATE TABLE  "Location_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Location_History_id_idx" ON "Location_History" ("id");
CREATE INDEX "Location_History_lastUpdated_idx" ON "Location_History" ("lastUpdated");

CREATE TABLE  "Location_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Location_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Location_Refs_targetId_code_idx" ON "Location_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Measure" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "Measure_lastUpdated_idx" ON "Measure" ("lastUpdated");
CREATE INDEX "Measure_projectId_lastUpdated_idx" ON "Measure" ("projectId", "lastUpdated");
CREATE INDEX "Measure_projectId_idx" ON "Measure" ("projectId");
CREATE INDEX "Measure__source_idx" ON "Measure" ("_source");
CREATE INDEX "Measure__profile_idx" ON "Measure" USING gin ("_profile");
CREATE INDEX "Measure___version_idx" ON "Measure" ("__version");
CREATE INDEX "Measure_compartments_idx" ON "Measure" USING gin ("compartments");
CREATE INDEX "Measure___sharedTokens_idx" ON "Measure" USING gin ("__sharedTokens");
CREATE INDEX "Measure___sharedTokensTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Measure____tag_idx" ON "Measure" USING gin ("___tag");
CREATE INDEX "Measure____tagTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Measure_composedOf_idx" ON "Measure" USING gin ("composedOf");
CREATE INDEX "Measure___context_idx" ON "Measure" USING gin ("__context");
CREATE INDEX "Measure___contextTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "Measure_contextQuantity_idx" ON "Measure" USING gin ("contextQuantity");
CREATE INDEX "Measure___contextType_idx" ON "Measure" USING gin ("__contextType");
CREATE INDEX "Measure___contextTypeTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "Measure_date_idx" ON "Measure" ("date");
CREATE INDEX "Measure_projectId_date_idx" ON "Measure" ("projectId", "date");
CREATE INDEX "Measure_dependsOn_idx" ON "Measure" USING gin ("dependsOn");
CREATE INDEX "Measure_derivedFrom_idx" ON "Measure" USING gin ("derivedFrom");
CREATE INDEX "Measure_description_idx" ON "Measure" ("description");
CREATE INDEX "Measure_effective_idx" ON "Measure" ("effective");
CREATE INDEX "Measure___idnt_idx" ON "Measure" USING gin ("__identifier");
CREATE INDEX "Measure___idntTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Measure___jurisdiction_idx" ON "Measure" USING gin ("__jurisdiction");
CREATE INDEX "Measure___jurisdictionTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "Measure_name_idx" ON "Measure" ("name");
CREATE INDEX "Measure_predecessor_idx" ON "Measure" USING gin ("predecessor");
CREATE INDEX "Measure_publisher_idx" ON "Measure" ("publisher");
CREATE INDEX "Measure_status_idx" ON "Measure" ("status");
CREATE INDEX "Measure_successor_idx" ON "Measure" USING gin ("successor");
CREATE INDEX "Measure_title_idx" ON "Measure" ("title");
CREATE INDEX "Measure___topic_idx" ON "Measure" USING gin ("__topic");
CREATE INDEX "Measure___topicTextTrgm_idx" ON "Measure" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "Measure_url_idx" ON "Measure" ("url");
CREATE INDEX "Measure_version_idx" ON "Measure" ("version");

CREATE TABLE  "Measure_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Measure_History_id_idx" ON "Measure_History" ("id");
CREATE INDEX "Measure_History_lastUpdated_idx" ON "Measure_History" ("lastUpdated");

CREATE TABLE  "Measure_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Measure_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Measure_Refs_targetId_code_idx" ON "Measure_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MeasureReport" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "evaluatedResource" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "measure" TEXT,
  "patient" TEXT,
  "period" TIMESTAMPTZ,
  "reporter" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__evaluatedResourceIdentifierSort" TEXT,
  "__measureIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__reporterIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT,
  "period_range" TSTZRANGE
);
CREATE INDEX "MeasureReport_lastUpdated_idx" ON "MeasureReport" ("lastUpdated");
CREATE INDEX "MeasureReport_projectId_lastUpdated_idx" ON "MeasureReport" ("projectId", "lastUpdated");
CREATE INDEX "MeasureReport_projectId_idx" ON "MeasureReport" ("projectId");
CREATE INDEX "MeasureReport__source_idx" ON "MeasureReport" ("_source");
CREATE INDEX "MeasureReport__profile_idx" ON "MeasureReport" USING gin ("_profile");
CREATE INDEX "MeasureReport___version_idx" ON "MeasureReport" ("__version");
CREATE INDEX "MeasureReport_compartments_idx" ON "MeasureReport" USING gin ("compartments");
CREATE INDEX "MeasureReport___sharedTokens_idx" ON "MeasureReport" USING gin ("__sharedTokens");
CREATE INDEX "MeasureReport___sharedTokensTextTrgm_idx" ON "MeasureReport" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MeasureReport____tag_idx" ON "MeasureReport" USING gin ("___tag");
CREATE INDEX "MeasureReport____tagTextTrgm_idx" ON "MeasureReport" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MeasureReport_date_idx" ON "MeasureReport" ("date");
CREATE INDEX "MeasureReport_projectId_date_idx" ON "MeasureReport" ("projectId", "date");
CREATE INDEX "MeasureReport_evaluatedResource_idx" ON "MeasureReport" USING gin ("evaluatedResource");
CREATE INDEX "MeasureReport___idnt_idx" ON "MeasureReport" USING gin ("__identifier");
CREATE INDEX "MeasureReport___idntTextTrgm_idx" ON "MeasureReport" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MeasureReport_measure_idx" ON "MeasureReport" ("measure");
CREATE INDEX "MeasureReport_patient_idx" ON "MeasureReport" ("patient");
CREATE INDEX "MeasureReport_period_idx" ON "MeasureReport" ("period");
CREATE INDEX "MeasureReport_reporter_idx" ON "MeasureReport" ("reporter");
CREATE INDEX "MeasureReport_status_idx" ON "MeasureReport" ("status");
CREATE INDEX "MeasureReport_subject_idx" ON "MeasureReport" ("subject");
CREATE INDEX "MeasureReport_period_range_idx" ON "MeasureReport" USING gist ("period_range");

CREATE TABLE  "MeasureReport_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MeasureReport_History_id_idx" ON "MeasureReport_History" ("id");
CREATE INDEX "MeasureReport_History_lastUpdated_idx" ON "MeasureReport_History" ("lastUpdated");

CREATE TABLE  "MeasureReport_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MeasureReport_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MeasureReport_Refs_targetId_code_idx" ON "MeasureReport_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Media" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "basedOn" TEXT[],
  "created" TIMESTAMPTZ,
  "device" TEXT,
  "encounter" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__modality" UUID[],
  "__modalityText" TEXT[],
  "__modalitySort" TEXT,
  "operator" TEXT,
  "patient" TEXT,
  "__site" UUID[],
  "__siteText" TEXT[],
  "__siteSort" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "__view" UUID[],
  "__viewText" TEXT[],
  "__viewSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__deviceIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__operatorIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Media_lastUpdated_idx" ON "Media" ("lastUpdated");
CREATE INDEX "Media_projectId_lastUpdated_idx" ON "Media" ("projectId", "lastUpdated");
CREATE INDEX "Media_projectId_idx" ON "Media" ("projectId");
CREATE INDEX "Media__source_idx" ON "Media" ("_source");
CREATE INDEX "Media__profile_idx" ON "Media" USING gin ("_profile");
CREATE INDEX "Media___version_idx" ON "Media" ("__version");
CREATE INDEX "Media_compartments_idx" ON "Media" USING gin ("compartments");
CREATE INDEX "Media___sharedTokens_idx" ON "Media" USING gin ("__sharedTokens");
CREATE INDEX "Media___sharedTokensTextTrgm_idx" ON "Media" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Media____tag_idx" ON "Media" USING gin ("___tag");
CREATE INDEX "Media____tagTextTrgm_idx" ON "Media" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Media_basedOn_idx" ON "Media" USING gin ("basedOn");
CREATE INDEX "Media_created_idx" ON "Media" ("created");
CREATE INDEX "Media_device_idx" ON "Media" ("device");
CREATE INDEX "Media_encounter_idx" ON "Media" ("encounter");
CREATE INDEX "Media___idnt_idx" ON "Media" USING gin ("__identifier");
CREATE INDEX "Media___idntTextTrgm_idx" ON "Media" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Media___modality_idx" ON "Media" USING gin ("__modality");
CREATE INDEX "Media___modalityTextTrgm_idx" ON "Media" USING gin (token_array_to_text("__modalityText") gin_trgm_ops);
CREATE INDEX "Media_operator_idx" ON "Media" ("operator");
CREATE INDEX "Media_patient_idx" ON "Media" ("patient");
CREATE INDEX "Media___site_idx" ON "Media" USING gin ("__site");
CREATE INDEX "Media___siteTextTrgm_idx" ON "Media" USING gin (token_array_to_text("__siteText") gin_trgm_ops);
CREATE INDEX "Media_status_idx" ON "Media" ("status");
CREATE INDEX "Media_subject_idx" ON "Media" ("subject");
CREATE INDEX "Media___type_idx" ON "Media" USING gin ("__type");
CREATE INDEX "Media___typeTextTrgm_idx" ON "Media" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "Media___view_idx" ON "Media" USING gin ("__view");
CREATE INDEX "Media___viewTextTrgm_idx" ON "Media" USING gin (token_array_to_text("__viewText") gin_trgm_ops);

CREATE TABLE  "Media_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Media_History_id_idx" ON "Media_History" ("id");
CREATE INDEX "Media_History_lastUpdated_idx" ON "Media_History" ("lastUpdated");

CREATE TABLE  "Media_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Media_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Media_Refs_targetId_code_idx" ON "Media_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Medication" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "expirationDate" TIMESTAMPTZ,
  "__form" UUID[],
  "__formText" TEXT[],
  "__formSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "ingredient" TEXT[],
  "__ingredientCode" UUID[],
  "__ingredientCodeText" TEXT[],
  "__ingredientCodeSort" TEXT,
  "lotNumber" TEXT,
  "manufacturer" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__ingredientIdentifierSort" TEXT,
  "__manufacturerIdentifierSort" TEXT
);
CREATE INDEX "Medication_lastUpdated_idx" ON "Medication" ("lastUpdated");
CREATE INDEX "Medication_projectId_lastUpdated_idx" ON "Medication" ("projectId", "lastUpdated");
CREATE INDEX "Medication_projectId_idx" ON "Medication" ("projectId");
CREATE INDEX "Medication__source_idx" ON "Medication" ("_source");
CREATE INDEX "Medication__profile_idx" ON "Medication" USING gin ("_profile");
CREATE INDEX "Medication___version_idx" ON "Medication" ("__version");
CREATE INDEX "Medication_compartments_idx" ON "Medication" USING gin ("compartments");
CREATE INDEX "Medication___sharedTokens_idx" ON "Medication" USING gin ("__sharedTokens");
CREATE INDEX "Medication___sharedTokensTextTrgm_idx" ON "Medication" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Medication____tag_idx" ON "Medication" USING gin ("___tag");
CREATE INDEX "Medication____tagTextTrgm_idx" ON "Medication" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Medication___code_idx" ON "Medication" USING gin ("__code");
CREATE INDEX "Medication___codeTextTrgm_idx" ON "Medication" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Medication_expirationDate_idx" ON "Medication" ("expirationDate");
CREATE INDEX "Medication___form_idx" ON "Medication" USING gin ("__form");
CREATE INDEX "Medication___formTextTrgm_idx" ON "Medication" USING gin (token_array_to_text("__formText") gin_trgm_ops);
CREATE INDEX "Medication___idnt_idx" ON "Medication" USING gin ("__identifier");
CREATE INDEX "Medication___idntTextTrgm_idx" ON "Medication" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Medication_ingredient_idx" ON "Medication" USING gin ("ingredient");
CREATE INDEX "Medication___ingredientCode_idx" ON "Medication" USING gin ("__ingredientCode");
CREATE INDEX "Medication___ingredientCodeTextTrgm_idx" ON "Medication" USING gin (token_array_to_text("__ingredientCodeText") gin_trgm_ops);
CREATE INDEX "Medication_lotNumber_idx" ON "Medication" ("lotNumber");
CREATE INDEX "Medication_manufacturer_idx" ON "Medication" ("manufacturer");
CREATE INDEX "Medication_status_idx" ON "Medication" ("status");

CREATE TABLE  "Medication_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Medication_History_id_idx" ON "Medication_History" ("id");
CREATE INDEX "Medication_History_lastUpdated_idx" ON "Medication_History" ("lastUpdated");

CREATE TABLE  "Medication_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Medication_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Medication_Refs_targetId_code_idx" ON "Medication_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicationAdministration" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "context" TEXT,
  "device" TEXT[],
  "effectiveTime" TIMESTAMPTZ,
  "medication" TEXT,
  "performer" TEXT[],
  "__reasonGiven" UUID[],
  "__reasonGivenText" TEXT[],
  "__reasonGivenSort" TEXT,
  "__reasonNotGiven" UUID[],
  "__reasonNotGivenText" TEXT[],
  "__reasonNotGivenSort" TEXT,
  "request" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__contextIdentifierSort" TEXT,
  "__deviceIdentifierSort" TEXT,
  "__medicationIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__requestIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicationAdministration_lastUpdated_idx" ON "MedicationAdministration" ("lastUpdated");
CREATE INDEX "MedicationAdministration_projectId_lastUpdated_idx" ON "MedicationAdministration" ("projectId", "lastUpdated");
CREATE INDEX "MedicationAdministration_projectId_idx" ON "MedicationAdministration" ("projectId");
CREATE INDEX "MedicationAdministration__source_idx" ON "MedicationAdministration" ("_source");
CREATE INDEX "MedicationAdministration__profile_idx" ON "MedicationAdministration" USING gin ("_profile");
CREATE INDEX "MedicationAdministration___version_idx" ON "MedicationAdministration" ("__version");
CREATE INDEX "MedicationAdministration_compartments_idx" ON "MedicationAdministration" USING gin ("compartments");
CREATE INDEX "MedicationAdministration___sharedTokens_idx" ON "MedicationAdministration" USING gin ("__sharedTokens");
CREATE INDEX "MedicationAdministration___sharedTokensTextTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicationAdministration____tag_idx" ON "MedicationAdministration" USING gin ("___tag");
CREATE INDEX "MedicationAdministration____tagTextTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicationAdministration___code_idx" ON "MedicationAdministration" USING gin ("__code");
CREATE INDEX "MedicationAdministration___codeTextTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "MedicationAdministration___idnt_idx" ON "MedicationAdministration" USING gin ("__identifier");
CREATE INDEX "MedicationAdministration___idntTextTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MedicationAdministration_patient_idx" ON "MedicationAdministration" ("patient");
CREATE INDEX "MedicationAdministration_context_idx" ON "MedicationAdministration" ("context");
CREATE INDEX "MedicationAdministration_device_idx" ON "MedicationAdministration" USING gin ("device");
CREATE INDEX "MedicationAdministration_effectiveTime_idx" ON "MedicationAdministration" ("effectiveTime");
CREATE INDEX "MedicationAdministration_medication_idx" ON "MedicationAdministration" ("medication");
CREATE INDEX "MedicationAdministration_performer_idx" ON "MedicationAdministration" USING gin ("performer");
CREATE INDEX "MedicationAdministration___reasonGiven_idx" ON "MedicationAdministration" USING gin ("__reasonGiven");
CREATE INDEX "MedicationAdministration___reasonGivenTextTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("__reasonGivenText") gin_trgm_ops);
CREATE INDEX "MedicationAdministration___reasonNotGiven_idx" ON "MedicationAdministration" USING gin ("__reasonNotGiven");
CREATE INDEX "MedicationAdministration___reasonNotGivenTextTrgm_idx" ON "MedicationAdministration" USING gin (token_array_to_text("__reasonNotGivenText") gin_trgm_ops);
CREATE INDEX "MedicationAdministration_request_idx" ON "MedicationAdministration" ("request");
CREATE INDEX "MedicationAdministration_status_idx" ON "MedicationAdministration" ("status");
CREATE INDEX "MedicationAdministration_subject_idx" ON "MedicationAdministration" ("subject");

CREATE TABLE  "MedicationAdministration_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicationAdministration_History_id_idx" ON "MedicationAdministration_History" ("id");
CREATE INDEX "MedicationAdministration_History_lastUpdated_idx" ON "MedicationAdministration_History" ("lastUpdated");

CREATE TABLE  "MedicationAdministration_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicationAdministration_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicationAdministration_Refs_targetId_code_idx" ON "MedicationAdministration_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicationDispense" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "medication" TEXT,
  "status" TEXT,
  "context" TEXT,
  "destination" TEXT,
  "performer" TEXT[],
  "prescription" TEXT[],
  "receiver" TEXT[],
  "responsibleparty" TEXT[],
  "subject" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "whenhandedover" TIMESTAMPTZ,
  "whenprepared" TIMESTAMPTZ,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__medicationIdentifierSort" TEXT,
  "__contextIdentifierSort" TEXT,
  "__destinationIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__prescriptionIdentifierSort" TEXT,
  "__receiverIdentifierSort" TEXT,
  "__responsiblepartyIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicationDispense_lastUpdated_idx" ON "MedicationDispense" ("lastUpdated");
CREATE INDEX "MedicationDispense_projectId_lastUpdated_idx" ON "MedicationDispense" ("projectId", "lastUpdated");
CREATE INDEX "MedicationDispense_projectId_idx" ON "MedicationDispense" ("projectId");
CREATE INDEX "MedicationDispense__source_idx" ON "MedicationDispense" ("_source");
CREATE INDEX "MedicationDispense__profile_idx" ON "MedicationDispense" USING gin ("_profile");
CREATE INDEX "MedicationDispense___version_idx" ON "MedicationDispense" ("__version");
CREATE INDEX "MedicationDispense_compartments_idx" ON "MedicationDispense" USING gin ("compartments");
CREATE INDEX "MedicationDispense___sharedTokens_idx" ON "MedicationDispense" USING gin ("__sharedTokens");
CREATE INDEX "MedicationDispense___sharedTokensTextTrgm_idx" ON "MedicationDispense" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicationDispense____tag_idx" ON "MedicationDispense" USING gin ("___tag");
CREATE INDEX "MedicationDispense____tagTextTrgm_idx" ON "MedicationDispense" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicationDispense___code_idx" ON "MedicationDispense" USING gin ("__code");
CREATE INDEX "MedicationDispense___codeTextTrgm_idx" ON "MedicationDispense" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "MedicationDispense___idnt_idx" ON "MedicationDispense" USING gin ("__identifier");
CREATE INDEX "MedicationDispense___idntTextTrgm_idx" ON "MedicationDispense" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MedicationDispense_patient_idx" ON "MedicationDispense" ("patient");
CREATE INDEX "MedicationDispense_medication_idx" ON "MedicationDispense" ("medication");
CREATE INDEX "MedicationDispense_status_idx" ON "MedicationDispense" ("status");
CREATE INDEX "MedicationDispense_context_idx" ON "MedicationDispense" ("context");
CREATE INDEX "MedicationDispense_destination_idx" ON "MedicationDispense" ("destination");
CREATE INDEX "MedicationDispense_performer_idx" ON "MedicationDispense" USING gin ("performer");
CREATE INDEX "MedicationDispense_prescription_idx" ON "MedicationDispense" USING gin ("prescription");
CREATE INDEX "MedicationDispense_receiver_idx" ON "MedicationDispense" USING gin ("receiver");
CREATE INDEX "MedicationDispense_responsibleparty_idx" ON "MedicationDispense" USING gin ("responsibleparty");
CREATE INDEX "MedicationDispense_subject_idx" ON "MedicationDispense" ("subject");
CREATE INDEX "MedicationDispense___type_idx" ON "MedicationDispense" USING gin ("__type");
CREATE INDEX "MedicationDispense___typeTextTrgm_idx" ON "MedicationDispense" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "MedicationDispense_whenhandedover_idx" ON "MedicationDispense" ("whenhandedover");
CREATE INDEX "MedicationDispense_whenprepared_idx" ON "MedicationDispense" ("whenprepared");

CREATE TABLE  "MedicationDispense_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicationDispense_History_id_idx" ON "MedicationDispense_History" ("id");
CREATE INDEX "MedicationDispense_History_lastUpdated_idx" ON "MedicationDispense_History" ("lastUpdated");

CREATE TABLE  "MedicationDispense_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicationDispense_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicationDispense_Refs_targetId_code_idx" ON "MedicationDispense_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicationKnowledge" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__classification" UUID[],
  "__classificationText" TEXT[],
  "__classificationSort" TEXT,
  "__classificationType" UUID[],
  "__classificationTypeText" TEXT[],
  "__classificationTypeSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__doseform" UUID[],
  "__doseformText" TEXT[],
  "__doseformSort" TEXT,
  "ingredient" TEXT[],
  "__ingredientCode" UUID[],
  "__ingredientCodeText" TEXT[],
  "__ingredientCodeSort" TEXT,
  "manufacturer" TEXT,
  "monitoringProgramName" TEXT[],
  "__monitoringProgramType" UUID[],
  "__monitoringProgramTypeText" TEXT[],
  "__monitoringProgramTypeSort" TEXT,
  "monograph" TEXT[],
  "__monographType" UUID[],
  "__monographTypeText" TEXT[],
  "__monographTypeSort" TEXT,
  "sourceCost" TEXT[],
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__ingredientIdentifierSort" TEXT,
  "__manufacturerIdentifierSort" TEXT,
  "__monographIdentifierSort" TEXT
);
CREATE INDEX "MedicationKnowledge_lastUpdated_idx" ON "MedicationKnowledge" ("lastUpdated");
CREATE INDEX "MedicationKnowledge_projectId_lastUpdated_idx" ON "MedicationKnowledge" ("projectId", "lastUpdated");
CREATE INDEX "MedicationKnowledge_projectId_idx" ON "MedicationKnowledge" ("projectId");
CREATE INDEX "MedicationKnowledge__source_idx" ON "MedicationKnowledge" ("_source");
CREATE INDEX "MedicationKnowledge__profile_idx" ON "MedicationKnowledge" USING gin ("_profile");
CREATE INDEX "MedicationKnowledge___version_idx" ON "MedicationKnowledge" ("__version");
CREATE INDEX "MedicationKnowledge_compartments_idx" ON "MedicationKnowledge" USING gin ("compartments");
CREATE INDEX "MedicationKnowledge___sharedTokens_idx" ON "MedicationKnowledge" USING gin ("__sharedTokens");
CREATE INDEX "MedicationKnowledge___sharedTokensTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge____tag_idx" ON "MedicationKnowledge" USING gin ("___tag");
CREATE INDEX "MedicationKnowledge____tagTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge___classification_idx" ON "MedicationKnowledge" USING gin ("__classification");
CREATE INDEX "MedicationKnowledge___classificationTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__classificationText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge___classificationType_idx" ON "MedicationKnowledge" USING gin ("__classificationType");
CREATE INDEX "MedicationKnowledge___classificationTypeTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__classificationTypeText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge___code_idx" ON "MedicationKnowledge" USING gin ("__code");
CREATE INDEX "MedicationKnowledge___codeTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge___doseform_idx" ON "MedicationKnowledge" USING gin ("__doseform");
CREATE INDEX "MedicationKnowledge___doseformTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__doseformText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge_ingredient_idx" ON "MedicationKnowledge" USING gin ("ingredient");
CREATE INDEX "MedicationKnowledge___ingredientCode_idx" ON "MedicationKnowledge" USING gin ("__ingredientCode");
CREATE INDEX "MedicationKnowledge___ingredientCodeTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__ingredientCodeText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge_manufacturer_idx" ON "MedicationKnowledge" ("manufacturer");
CREATE INDEX "MedicationKnowledge_monitoringProgramName_idx" ON "MedicationKnowledge" USING gin ("monitoringProgramName");
CREATE INDEX "MedicationKnowledge___monitoringProgramType_idx" ON "MedicationKnowledge" USING gin ("__monitoringProgramType");
CREATE INDEX "MedicationKnowledge___monitoringProgramTypeTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__monitoringProgramTypeText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge_monograph_idx" ON "MedicationKnowledge" USING gin ("monograph");
CREATE INDEX "MedicationKnowledge___monographType_idx" ON "MedicationKnowledge" USING gin ("__monographType");
CREATE INDEX "MedicationKnowledge___monographTypeTextTrgm_idx" ON "MedicationKnowledge" USING gin (token_array_to_text("__monographTypeText") gin_trgm_ops);
CREATE INDEX "MedicationKnowledge_sourceCost_idx" ON "MedicationKnowledge" USING gin ("sourceCost");
CREATE INDEX "MedicationKnowledge_status_idx" ON "MedicationKnowledge" ("status");

CREATE TABLE  "MedicationKnowledge_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicationKnowledge_History_id_idx" ON "MedicationKnowledge_History" ("id");
CREATE INDEX "MedicationKnowledge_History_lastUpdated_idx" ON "MedicationKnowledge_History" ("lastUpdated");

CREATE TABLE  "MedicationKnowledge_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicationKnowledge_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicationKnowledge_Refs_targetId_code_idx" ON "MedicationKnowledge_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicationRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "medication" TEXT,
  "status" TEXT,
  "authoredon" TIMESTAMPTZ,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "date" TIMESTAMPTZ[],
  "encounter" TEXT,
  "intendedDispenser" TEXT,
  "intendedPerformer" TEXT,
  "__intendedPerformertypeSort" TEXT,
  "intent" TEXT,
  "priority" TEXT,
  "requester" TEXT,
  "subject" TEXT,
  "priorityOrder" INTEGER,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__medicationIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__intendedDispenserIdentifierSort" TEXT,
  "__intendedPerformerIdentifierSort" TEXT,
  "__requesterIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicationRequest_lastUpdated_idx" ON "MedicationRequest" ("lastUpdated");
CREATE INDEX "MedicationRequest_projectId_lastUpdated_idx" ON "MedicationRequest" ("projectId", "lastUpdated");
CREATE INDEX "MedicationRequest_projectId_idx" ON "MedicationRequest" ("projectId");
CREATE INDEX "MedicationRequest__source_idx" ON "MedicationRequest" ("_source");
CREATE INDEX "MedicationRequest__profile_idx" ON "MedicationRequest" USING gin ("_profile");
CREATE INDEX "MedicationRequest___version_idx" ON "MedicationRequest" ("__version");
CREATE INDEX "MedicationRequest_compartments_idx" ON "MedicationRequest" USING gin ("compartments");
CREATE INDEX "MedicationRequest___sharedTokens_idx" ON "MedicationRequest" USING gin ("__sharedTokens");
CREATE INDEX "MedicationRequest___sharedTokensTextTrgm_idx" ON "MedicationRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicationRequest____tag_idx" ON "MedicationRequest" USING gin ("___tag");
CREATE INDEX "MedicationRequest____tagTextTrgm_idx" ON "MedicationRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicationRequest___code_idx" ON "MedicationRequest" USING gin ("__code");
CREATE INDEX "MedicationRequest___codeTextTrgm_idx" ON "MedicationRequest" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "MedicationRequest___idnt_idx" ON "MedicationRequest" USING gin ("__identifier");
CREATE INDEX "MedicationRequest___idntTextTrgm_idx" ON "MedicationRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MedicationRequest_patient_idx" ON "MedicationRequest" ("patient");
CREATE INDEX "MedicationRequest_medication_idx" ON "MedicationRequest" ("medication");
CREATE INDEX "MedicationRequest_status_idx" ON "MedicationRequest" ("status");
CREATE INDEX "MedicationRequest_authoredon_idx" ON "MedicationRequest" ("authoredon");
CREATE INDEX "MedicationRequest___category_idx" ON "MedicationRequest" USING gin ("__category");
CREATE INDEX "MedicationRequest___categoryTextTrgm_idx" ON "MedicationRequest" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "MedicationRequest_date_idx" ON "MedicationRequest" USING gin ("date");
CREATE INDEX "MedicationRequest_encounter_idx" ON "MedicationRequest" ("encounter");
CREATE INDEX "MedicationRequest_intendedDispenser_idx" ON "MedicationRequest" ("intendedDispenser");
CREATE INDEX "MedicationRequest_intendedPerformer_idx" ON "MedicationRequest" ("intendedPerformer");
CREATE INDEX "MedicationRequest_intent_idx" ON "MedicationRequest" ("intent");
CREATE INDEX "MedicationRequest_priority_idx" ON "MedicationRequest" ("priority");
CREATE INDEX "MedicationRequest_requester_idx" ON "MedicationRequest" ("requester");
CREATE INDEX "MedicationRequest_subject_idx" ON "MedicationRequest" ("subject");
CREATE INDEX "MedicationRequest_priorityOrder_idx" ON "MedicationRequest" ("priorityOrder");

CREATE TABLE  "MedicationRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicationRequest_History_id_idx" ON "MedicationRequest_History" ("id");
CREATE INDEX "MedicationRequest_History_lastUpdated_idx" ON "MedicationRequest_History" ("lastUpdated");

CREATE TABLE  "MedicationRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicationRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicationRequest_Refs_targetId_code_idx" ON "MedicationRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicationStatement" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "medication" TEXT,
  "status" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "context" TEXT,
  "effective" TIMESTAMPTZ,
  "partOf" TEXT[],
  "source" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__medicationIdentifierSort" TEXT,
  "__contextIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicationStatement_lastUpdated_idx" ON "MedicationStatement" ("lastUpdated");
CREATE INDEX "MedicationStatement_projectId_lastUpdated_idx" ON "MedicationStatement" ("projectId", "lastUpdated");
CREATE INDEX "MedicationStatement_projectId_idx" ON "MedicationStatement" ("projectId");
CREATE INDEX "MedicationStatement__source_idx" ON "MedicationStatement" ("_source");
CREATE INDEX "MedicationStatement__profile_idx" ON "MedicationStatement" USING gin ("_profile");
CREATE INDEX "MedicationStatement___version_idx" ON "MedicationStatement" ("__version");
CREATE INDEX "MedicationStatement_compartments_idx" ON "MedicationStatement" USING gin ("compartments");
CREATE INDEX "MedicationStatement___sharedTokens_idx" ON "MedicationStatement" USING gin ("__sharedTokens");
CREATE INDEX "MedicationStatement___sharedTokensTextTrgm_idx" ON "MedicationStatement" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicationStatement____tag_idx" ON "MedicationStatement" USING gin ("___tag");
CREATE INDEX "MedicationStatement____tagTextTrgm_idx" ON "MedicationStatement" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicationStatement___code_idx" ON "MedicationStatement" USING gin ("__code");
CREATE INDEX "MedicationStatement___codeTextTrgm_idx" ON "MedicationStatement" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "MedicationStatement___idnt_idx" ON "MedicationStatement" USING gin ("__identifier");
CREATE INDEX "MedicationStatement___idntTextTrgm_idx" ON "MedicationStatement" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MedicationStatement_patient_idx" ON "MedicationStatement" ("patient");
CREATE INDEX "MedicationStatement_medication_idx" ON "MedicationStatement" ("medication");
CREATE INDEX "MedicationStatement_status_idx" ON "MedicationStatement" ("status");
CREATE INDEX "MedicationStatement___category_idx" ON "MedicationStatement" USING gin ("__category");
CREATE INDEX "MedicationStatement___categoryTextTrgm_idx" ON "MedicationStatement" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "MedicationStatement_context_idx" ON "MedicationStatement" ("context");
CREATE INDEX "MedicationStatement_effective_idx" ON "MedicationStatement" ("effective");
CREATE INDEX "MedicationStatement_partOf_idx" ON "MedicationStatement" USING gin ("partOf");
CREATE INDEX "MedicationStatement_source_idx" ON "MedicationStatement" ("source");
CREATE INDEX "MedicationStatement_subject_idx" ON "MedicationStatement" ("subject");

CREATE TABLE  "MedicationStatement_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicationStatement_History_id_idx" ON "MedicationStatement_History" ("id");
CREATE INDEX "MedicationStatement_History_lastUpdated_idx" ON "MedicationStatement_History" ("lastUpdated");

CREATE TABLE  "MedicationStatement_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicationStatement_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicationStatement_Refs_targetId_code_idx" ON "MedicationStatement_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProduct" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT[],
  "__nameLanguage" UUID[],
  "__nameLanguageText" TEXT[],
  "__nameLanguageSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "MedicinalProduct_lastUpdated_idx" ON "MedicinalProduct" ("lastUpdated");
CREATE INDEX "MedicinalProduct_projectId_lastUpdated_idx" ON "MedicinalProduct" ("projectId", "lastUpdated");
CREATE INDEX "MedicinalProduct_projectId_idx" ON "MedicinalProduct" ("projectId");
CREATE INDEX "MedicinalProduct__source_idx" ON "MedicinalProduct" ("_source");
CREATE INDEX "MedicinalProduct__profile_idx" ON "MedicinalProduct" USING gin ("_profile");
CREATE INDEX "MedicinalProduct___version_idx" ON "MedicinalProduct" ("__version");
CREATE INDEX "MedicinalProduct_compartments_idx" ON "MedicinalProduct" USING gin ("compartments");
CREATE INDEX "MedicinalProduct___sharedTokens_idx" ON "MedicinalProduct" USING gin ("__sharedTokens");
CREATE INDEX "MedicinalProduct___sharedTokensTextTrgm_idx" ON "MedicinalProduct" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicinalProduct____tag_idx" ON "MedicinalProduct" USING gin ("___tag");
CREATE INDEX "MedicinalProduct____tagTextTrgm_idx" ON "MedicinalProduct" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicinalProduct___idnt_idx" ON "MedicinalProduct" USING gin ("__identifier");
CREATE INDEX "MedicinalProduct___idntTextTrgm_idx" ON "MedicinalProduct" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MedicinalProduct_name_idx" ON "MedicinalProduct" USING gin ("name");
CREATE INDEX "MedicinalProduct___nameLanguage_idx" ON "MedicinalProduct" USING gin ("__nameLanguage");
CREATE INDEX "MedicinalProduct___nameLanguageTextTrgm_idx" ON "MedicinalProduct" USING gin (token_array_to_text("__nameLanguageText") gin_trgm_ops);

CREATE TABLE  "MedicinalProduct_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicinalProduct_History_id_idx" ON "MedicinalProduct_History" ("id");
CREATE INDEX "MedicinalProduct_History_lastUpdated_idx" ON "MedicinalProduct_History" ("lastUpdated");

CREATE TABLE  "MedicinalProduct_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProduct_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicinalProduct_Refs_targetId_code_idx" ON "MedicinalProduct_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductAuthorization" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__country" UUID[],
  "__countryText" TEXT[],
  "__countrySort" TEXT,
  "holder" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__status" UUID[],
  "__statusText" TEXT[],
  "__statusSort" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__holderIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MPA_lastUpdated_idx" ON "MedicinalProductAuthorization" ("lastUpdated");
CREATE INDEX "MPA_projectId_lastUpdated_idx" ON "MedicinalProductAuthorization" ("projectId", "lastUpdated");
CREATE INDEX "MPA_projectId_idx" ON "MedicinalProductAuthorization" ("projectId");
CREATE INDEX "MPA__source_idx" ON "MedicinalProductAuthorization" ("_source");
CREATE INDEX "MPA__profile_idx" ON "MedicinalProductAuthorization" USING gin ("_profile");
CREATE INDEX "MPA___version_idx" ON "MedicinalProductAuthorization" ("__version");
CREATE INDEX "MPA_compartments_idx" ON "MedicinalProductAuthorization" USING gin ("compartments");
CREATE INDEX "MPA___sharedTokens_idx" ON "MedicinalProductAuthorization" USING gin ("__sharedTokens");
CREATE INDEX "MPA___sharedTokensTextTrgm_idx" ON "MedicinalProductAuthorization" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MPA____tag_idx" ON "MedicinalProductAuthorization" USING gin ("___tag");
CREATE INDEX "MPA____tagTextTrgm_idx" ON "MedicinalProductAuthorization" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MPA___country_idx" ON "MedicinalProductAuthorization" USING gin ("__country");
CREATE INDEX "MPA___countryTextTrgm_idx" ON "MedicinalProductAuthorization" USING gin (token_array_to_text("__countryText") gin_trgm_ops);
CREATE INDEX "MPA_holder_idx" ON "MedicinalProductAuthorization" ("holder");
CREATE INDEX "MPA___idnt_idx" ON "MedicinalProductAuthorization" USING gin ("__identifier");
CREATE INDEX "MPA___idntTextTrgm_idx" ON "MedicinalProductAuthorization" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MPA___status_idx" ON "MedicinalProductAuthorization" USING gin ("__status");
CREATE INDEX "MPA___statusTextTrgm_idx" ON "MedicinalProductAuthorization" USING gin (token_array_to_text("__statusText") gin_trgm_ops);
CREATE INDEX "MPA_subject_idx" ON "MedicinalProductAuthorization" ("subject");

CREATE TABLE  "MedicinalProductAuthorization_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MPA_History_id_idx" ON "MedicinalProductAuthorization_History" ("id");
CREATE INDEX "MPA_History_lastUpdated_idx" ON "MedicinalProductAuthorization_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductAuthorization_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductAuthorization_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MPA_Refs_targetId_code_idx" ON "MedicinalProductAuthorization_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductContraindication" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "subject" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MPC_lastUpdated_idx" ON "MedicinalProductContraindication" ("lastUpdated");
CREATE INDEX "MPC_projectId_lastUpdated_idx" ON "MedicinalProductContraindication" ("projectId", "lastUpdated");
CREATE INDEX "MPC_projectId_idx" ON "MedicinalProductContraindication" ("projectId");
CREATE INDEX "MPC__source_idx" ON "MedicinalProductContraindication" ("_source");
CREATE INDEX "MPC__profile_idx" ON "MedicinalProductContraindication" USING gin ("_profile");
CREATE INDEX "MPC___version_idx" ON "MedicinalProductContraindication" ("__version");
CREATE INDEX "MPC_compartments_idx" ON "MedicinalProductContraindication" USING gin ("compartments");
CREATE INDEX "MPC___sharedTokens_idx" ON "MedicinalProductContraindication" USING gin ("__sharedTokens");
CREATE INDEX "MPC___sharedTokensTextTrgm_idx" ON "MedicinalProductContraindication" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MPC____tag_idx" ON "MedicinalProductContraindication" USING gin ("___tag");
CREATE INDEX "MPC____tagTextTrgm_idx" ON "MedicinalProductContraindication" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MPC_subject_idx" ON "MedicinalProductContraindication" USING gin ("subject");

CREATE TABLE  "MedicinalProductContraindication_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MPC_History_id_idx" ON "MedicinalProductContraindication_History" ("id");
CREATE INDEX "MPC_History_lastUpdated_idx" ON "MedicinalProductContraindication_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductContraindication_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductContraindication_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MPC_Refs_targetId_code_idx" ON "MedicinalProductContraindication_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductIndication" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "subject" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicinalProductIndication_lastUpdated_idx" ON "MedicinalProductIndication" ("lastUpdated");
CREATE INDEX "MedicinalProductIndication_projectId_lastUpdated_idx" ON "MedicinalProductIndication" ("projectId", "lastUpdated");
CREATE INDEX "MedicinalProductIndication_projectId_idx" ON "MedicinalProductIndication" ("projectId");
CREATE INDEX "MedicinalProductIndication__source_idx" ON "MedicinalProductIndication" ("_source");
CREATE INDEX "MedicinalProductIndication__profile_idx" ON "MedicinalProductIndication" USING gin ("_profile");
CREATE INDEX "MedicinalProductIndication___version_idx" ON "MedicinalProductIndication" ("__version");
CREATE INDEX "MedicinalProductIndication_compartments_idx" ON "MedicinalProductIndication" USING gin ("compartments");
CREATE INDEX "MedicinalProductIndication___sharedTokens_idx" ON "MedicinalProductIndication" USING gin ("__sharedTokens");
CREATE INDEX "MedicinalProductIndication___sharedTokensTextTrgm_idx" ON "MedicinalProductIndication" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicinalProductIndication____tag_idx" ON "MedicinalProductIndication" USING gin ("___tag");
CREATE INDEX "MedicinalProductIndication____tagTextTrgm_idx" ON "MedicinalProductIndication" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicinalProductIndication_subject_idx" ON "MedicinalProductIndication" USING gin ("subject");

CREATE TABLE  "MedicinalProductIndication_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicinalProductIndication_History_id_idx" ON "MedicinalProductIndication_History" ("id");
CREATE INDEX "MedicinalProductIndication_History_lastUpdated_idx" ON "MedicinalProductIndication_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductIndication_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductIndication_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicinalProductIndication_Refs_targetId_code_idx" ON "MedicinalProductIndication_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductIngredient" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "MedicinalProductIngredient_lastUpdated_idx" ON "MedicinalProductIngredient" ("lastUpdated");
CREATE INDEX "MedicinalProductIngredient_projectId_lastUpdated_idx" ON "MedicinalProductIngredient" ("projectId", "lastUpdated");
CREATE INDEX "MedicinalProductIngredient_projectId_idx" ON "MedicinalProductIngredient" ("projectId");
CREATE INDEX "MedicinalProductIngredient__source_idx" ON "MedicinalProductIngredient" ("_source");
CREATE INDEX "MedicinalProductIngredient__profile_idx" ON "MedicinalProductIngredient" USING gin ("_profile");
CREATE INDEX "MedicinalProductIngredient___version_idx" ON "MedicinalProductIngredient" ("__version");
CREATE INDEX "MedicinalProductIngredient_compartments_idx" ON "MedicinalProductIngredient" USING gin ("compartments");
CREATE INDEX "MedicinalProductIngredient___sharedTokens_idx" ON "MedicinalProductIngredient" USING gin ("__sharedTokens");
CREATE INDEX "MedicinalProductIngredient___sharedTokensTextTrgm_idx" ON "MedicinalProductIngredient" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicinalProductIngredient____tag_idx" ON "MedicinalProductIngredient" USING gin ("___tag");
CREATE INDEX "MedicinalProductIngredient____tagTextTrgm_idx" ON "MedicinalProductIngredient" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "MedicinalProductIngredient_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicinalProductIngredient_History_id_idx" ON "MedicinalProductIngredient_History" ("id");
CREATE INDEX "MedicinalProductIngredient_History_lastUpdated_idx" ON "MedicinalProductIngredient_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductIngredient_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductIngredient_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicinalProductIngredient_Refs_targetId_code_idx" ON "MedicinalProductIngredient_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductInteraction" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "subject" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicinalProductInteraction_lastUpdated_idx" ON "MedicinalProductInteraction" ("lastUpdated");
CREATE INDEX "MedicinalProductInteraction_projectId_lastUpdated_idx" ON "MedicinalProductInteraction" ("projectId", "lastUpdated");
CREATE INDEX "MedicinalProductInteraction_projectId_idx" ON "MedicinalProductInteraction" ("projectId");
CREATE INDEX "MedicinalProductInteraction__source_idx" ON "MedicinalProductInteraction" ("_source");
CREATE INDEX "MedicinalProductInteraction__profile_idx" ON "MedicinalProductInteraction" USING gin ("_profile");
CREATE INDEX "MedicinalProductInteraction___version_idx" ON "MedicinalProductInteraction" ("__version");
CREATE INDEX "MedicinalProductInteraction_compartments_idx" ON "MedicinalProductInteraction" USING gin ("compartments");
CREATE INDEX "MedicinalProductInteraction___sharedTokens_idx" ON "MedicinalProductInteraction" USING gin ("__sharedTokens");
CREATE INDEX "MedicinalProductInteraction___sharedTokensTextTrgm_idx" ON "MedicinalProductInteraction" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicinalProductInteraction____tag_idx" ON "MedicinalProductInteraction" USING gin ("___tag");
CREATE INDEX "MedicinalProductInteraction____tagTextTrgm_idx" ON "MedicinalProductInteraction" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicinalProductInteraction_subject_idx" ON "MedicinalProductInteraction" USING gin ("subject");

CREATE TABLE  "MedicinalProductInteraction_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicinalProductInteraction_History_id_idx" ON "MedicinalProductInteraction_History" ("id");
CREATE INDEX "MedicinalProductInteraction_History_lastUpdated_idx" ON "MedicinalProductInteraction_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductInteraction_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductInteraction_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicinalProductInteraction_Refs_targetId_code_idx" ON "MedicinalProductInteraction_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductManufactured" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "MedicinalProductManufactured_lastUpdated_idx" ON "MedicinalProductManufactured" ("lastUpdated");
CREATE INDEX "MedicinalProductManufactured_projectId_lastUpdated_idx" ON "MedicinalProductManufactured" ("projectId", "lastUpdated");
CREATE INDEX "MedicinalProductManufactured_projectId_idx" ON "MedicinalProductManufactured" ("projectId");
CREATE INDEX "MedicinalProductManufactured__source_idx" ON "MedicinalProductManufactured" ("_source");
CREATE INDEX "MedicinalProductManufactured__profile_idx" ON "MedicinalProductManufactured" USING gin ("_profile");
CREATE INDEX "MedicinalProductManufactured___version_idx" ON "MedicinalProductManufactured" ("__version");
CREATE INDEX "MedicinalProductManufactured_compartments_idx" ON "MedicinalProductManufactured" USING gin ("compartments");
CREATE INDEX "MedicinalProductManufactured___sharedTokens_idx" ON "MedicinalProductManufactured" USING gin ("__sharedTokens");
CREATE INDEX "MedicinalProductManufactured___sharedTokensTextTrgm_idx" ON "MedicinalProductManufactured" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicinalProductManufactured____tag_idx" ON "MedicinalProductManufactured" USING gin ("___tag");
CREATE INDEX "MedicinalProductManufactured____tagTextTrgm_idx" ON "MedicinalProductManufactured" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "MedicinalProductManufactured_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicinalProductManufactured_History_id_idx" ON "MedicinalProductManufactured_History" ("id");
CREATE INDEX "MedicinalProductManufactured_History_lastUpdated_idx" ON "MedicinalProductManufactured_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductManufactured_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductManufactured_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicinalProductManufactured_Refs_targetId_code_idx" ON "MedicinalProductManufactured_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductPackaged" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "subject" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MedicinalProductPackaged_lastUpdated_idx" ON "MedicinalProductPackaged" ("lastUpdated");
CREATE INDEX "MedicinalProductPackaged_projectId_lastUpdated_idx" ON "MedicinalProductPackaged" ("projectId", "lastUpdated");
CREATE INDEX "MedicinalProductPackaged_projectId_idx" ON "MedicinalProductPackaged" ("projectId");
CREATE INDEX "MedicinalProductPackaged__source_idx" ON "MedicinalProductPackaged" ("_source");
CREATE INDEX "MedicinalProductPackaged__profile_idx" ON "MedicinalProductPackaged" USING gin ("_profile");
CREATE INDEX "MedicinalProductPackaged___version_idx" ON "MedicinalProductPackaged" ("__version");
CREATE INDEX "MedicinalProductPackaged_compartments_idx" ON "MedicinalProductPackaged" USING gin ("compartments");
CREATE INDEX "MedicinalProductPackaged___sharedTokens_idx" ON "MedicinalProductPackaged" USING gin ("__sharedTokens");
CREATE INDEX "MedicinalProductPackaged___sharedTokensTextTrgm_idx" ON "MedicinalProductPackaged" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MedicinalProductPackaged____tag_idx" ON "MedicinalProductPackaged" USING gin ("___tag");
CREATE INDEX "MedicinalProductPackaged____tagTextTrgm_idx" ON "MedicinalProductPackaged" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MedicinalProductPackaged___idnt_idx" ON "MedicinalProductPackaged" USING gin ("__identifier");
CREATE INDEX "MedicinalProductPackaged___idntTextTrgm_idx" ON "MedicinalProductPackaged" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MedicinalProductPackaged_subject_idx" ON "MedicinalProductPackaged" USING gin ("subject");

CREATE TABLE  "MedicinalProductPackaged_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MedicinalProductPackaged_History_id_idx" ON "MedicinalProductPackaged_History" ("id");
CREATE INDEX "MedicinalProductPackaged_History_lastUpdated_idx" ON "MedicinalProductPackaged_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductPackaged_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductPackaged_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MedicinalProductPackaged_Refs_targetId_code_idx" ON "MedicinalProductPackaged_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductPharmaceutical" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__route" UUID[],
  "__routeText" TEXT[],
  "__routeSort" TEXT,
  "__targetSpecies" UUID[],
  "__targetSpeciesText" TEXT[],
  "__targetSpeciesSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "MPP_lastUpdated_idx" ON "MedicinalProductPharmaceutical" ("lastUpdated");
CREATE INDEX "MPP_projectId_lastUpdated_idx" ON "MedicinalProductPharmaceutical" ("projectId", "lastUpdated");
CREATE INDEX "MPP_projectId_idx" ON "MedicinalProductPharmaceutical" ("projectId");
CREATE INDEX "MPP__source_idx" ON "MedicinalProductPharmaceutical" ("_source");
CREATE INDEX "MPP__profile_idx" ON "MedicinalProductPharmaceutical" USING gin ("_profile");
CREATE INDEX "MPP___version_idx" ON "MedicinalProductPharmaceutical" ("__version");
CREATE INDEX "MPP_compartments_idx" ON "MedicinalProductPharmaceutical" USING gin ("compartments");
CREATE INDEX "MPP___sharedTokens_idx" ON "MedicinalProductPharmaceutical" USING gin ("__sharedTokens");
CREATE INDEX "MPP___sharedTokensTextTrgm_idx" ON "MedicinalProductPharmaceutical" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MPP____tag_idx" ON "MedicinalProductPharmaceutical" USING gin ("___tag");
CREATE INDEX "MPP____tagTextTrgm_idx" ON "MedicinalProductPharmaceutical" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MPP___idnt_idx" ON "MedicinalProductPharmaceutical" USING gin ("__identifier");
CREATE INDEX "MPP___idntTextTrgm_idx" ON "MedicinalProductPharmaceutical" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MPP___route_idx" ON "MedicinalProductPharmaceutical" USING gin ("__route");
CREATE INDEX "MPP___routeTextTrgm_idx" ON "MedicinalProductPharmaceutical" USING gin (token_array_to_text("__routeText") gin_trgm_ops);
CREATE INDEX "MPP___targetSpecies_idx" ON "MedicinalProductPharmaceutical" USING gin ("__targetSpecies");
CREATE INDEX "MPP___targetSpeciesTextTrgm_idx" ON "MedicinalProductPharmaceutical" USING gin (token_array_to_text("__targetSpeciesText") gin_trgm_ops);

CREATE TABLE  "MedicinalProductPharmaceutical_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MPP_History_id_idx" ON "MedicinalProductPharmaceutical_History" ("id");
CREATE INDEX "MPP_History_lastUpdated_idx" ON "MedicinalProductPharmaceutical_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductPharmaceutical_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductPharmaceutical_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MPP_Refs_targetId_code_idx" ON "MedicinalProductPharmaceutical_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MedicinalProductUndesirableEffect" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "subject" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "MPUE_lastUpdated_idx" ON "MedicinalProductUndesirableEffect" ("lastUpdated");
CREATE INDEX "MPUE_projectId_lastUpdated_idx" ON "MedicinalProductUndesirableEffect" ("projectId", "lastUpdated");
CREATE INDEX "MPUE_projectId_idx" ON "MedicinalProductUndesirableEffect" ("projectId");
CREATE INDEX "MPUE__source_idx" ON "MedicinalProductUndesirableEffect" ("_source");
CREATE INDEX "MPUE__profile_idx" ON "MedicinalProductUndesirableEffect" USING gin ("_profile");
CREATE INDEX "MPUE___version_idx" ON "MedicinalProductUndesirableEffect" ("__version");
CREATE INDEX "MPUE_compartments_idx" ON "MedicinalProductUndesirableEffect" USING gin ("compartments");
CREATE INDEX "MPUE___sharedTokens_idx" ON "MedicinalProductUndesirableEffect" USING gin ("__sharedTokens");
CREATE INDEX "MPUE___sharedTokensTextTrgm_idx" ON "MedicinalProductUndesirableEffect" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MPUE____tag_idx" ON "MedicinalProductUndesirableEffect" USING gin ("___tag");
CREATE INDEX "MPUE____tagTextTrgm_idx" ON "MedicinalProductUndesirableEffect" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MPUE_subject_idx" ON "MedicinalProductUndesirableEffect" USING gin ("subject");

CREATE TABLE  "MedicinalProductUndesirableEffect_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MPUE_History_id_idx" ON "MedicinalProductUndesirableEffect_History" ("id");
CREATE INDEX "MPUE_History_lastUpdated_idx" ON "MedicinalProductUndesirableEffect_History" ("lastUpdated");

CREATE TABLE  "MedicinalProductUndesirableEffect_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MedicinalProductUndesirableEffect_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MPUE_Refs_targetId_code_idx" ON "MedicinalProductUndesirableEffect_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MessageDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "category" TEXT,
  "__event" UUID[],
  "__eventText" TEXT[],
  "__eventSort" TEXT,
  "focus" TEXT[],
  "parent" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__parentIdentifierSort" TEXT
);
CREATE INDEX "MessageDefinition_lastUpdated_idx" ON "MessageDefinition" ("lastUpdated");
CREATE INDEX "MessageDefinition_projectId_lastUpdated_idx" ON "MessageDefinition" ("projectId", "lastUpdated");
CREATE INDEX "MessageDefinition_projectId_idx" ON "MessageDefinition" ("projectId");
CREATE INDEX "MessageDefinition__source_idx" ON "MessageDefinition" ("_source");
CREATE INDEX "MessageDefinition__profile_idx" ON "MessageDefinition" USING gin ("_profile");
CREATE INDEX "MessageDefinition___version_idx" ON "MessageDefinition" ("__version");
CREATE INDEX "MessageDefinition_compartments_idx" ON "MessageDefinition" USING gin ("compartments");
CREATE INDEX "MessageDefinition___sharedTokens_idx" ON "MessageDefinition" USING gin ("__sharedTokens");
CREATE INDEX "MessageDefinition___sharedTokensTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MessageDefinition____tag_idx" ON "MessageDefinition" USING gin ("___tag");
CREATE INDEX "MessageDefinition____tagTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MessageDefinition___context_idx" ON "MessageDefinition" USING gin ("__context");
CREATE INDEX "MessageDefinition___contextTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "MessageDefinition_contextQuantity_idx" ON "MessageDefinition" USING gin ("contextQuantity");
CREATE INDEX "MessageDefinition___contextType_idx" ON "MessageDefinition" USING gin ("__contextType");
CREATE INDEX "MessageDefinition___contextTypeTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "MessageDefinition_date_idx" ON "MessageDefinition" ("date");
CREATE INDEX "MessageDefinition_projectId_date_idx" ON "MessageDefinition" ("projectId", "date");
CREATE INDEX "MessageDefinition_description_idx" ON "MessageDefinition" ("description");
CREATE INDEX "MessageDefinition___jurisdiction_idx" ON "MessageDefinition" USING gin ("__jurisdiction");
CREATE INDEX "MessageDefinition___jurisdictionTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "MessageDefinition_name_idx" ON "MessageDefinition" ("name");
CREATE INDEX "MessageDefinition_publisher_idx" ON "MessageDefinition" ("publisher");
CREATE INDEX "MessageDefinition_status_idx" ON "MessageDefinition" ("status");
CREATE INDEX "MessageDefinition_title_idx" ON "MessageDefinition" ("title");
CREATE INDEX "MessageDefinition_url_idx" ON "MessageDefinition" ("url");
CREATE INDEX "MessageDefinition_version_idx" ON "MessageDefinition" ("version");
CREATE INDEX "MessageDefinition___idnt_idx" ON "MessageDefinition" USING gin ("__identifier");
CREATE INDEX "MessageDefinition___idntTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MessageDefinition_category_idx" ON "MessageDefinition" ("category");
CREATE INDEX "MessageDefinition___event_idx" ON "MessageDefinition" USING gin ("__event");
CREATE INDEX "MessageDefinition___eventTextTrgm_idx" ON "MessageDefinition" USING gin (token_array_to_text("__eventText") gin_trgm_ops);
CREATE INDEX "MessageDefinition_focus_idx" ON "MessageDefinition" USING gin ("focus");
CREATE INDEX "MessageDefinition_parent_idx" ON "MessageDefinition" USING gin ("parent");

CREATE TABLE  "MessageDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MessageDefinition_History_id_idx" ON "MessageDefinition_History" ("id");
CREATE INDEX "MessageDefinition_History_lastUpdated_idx" ON "MessageDefinition_History" ("lastUpdated");

CREATE TABLE  "MessageDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MessageDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MessageDefinition_Refs_targetId_code_idx" ON "MessageDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MessageHeader" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "author" TEXT,
  "code" TEXT,
  "destination" TEXT[],
  "destinationUri" TEXT[],
  "enterer" TEXT,
  "__event" UUID[],
  "__eventText" TEXT[],
  "__eventSort" TEXT,
  "focus" TEXT[],
  "receiver" TEXT[],
  "responseId" TEXT,
  "responsible" TEXT,
  "sender" TEXT,
  "source" TEXT,
  "sourceUri" TEXT,
  "target" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__entererIdentifierSort" TEXT,
  "__focusIdentifierSort" TEXT,
  "__receiverIdentifierSort" TEXT,
  "__responsibleIdentifierSort" TEXT,
  "__senderIdentifierSort" TEXT,
  "__targetIdentifierSort" TEXT
);
CREATE INDEX "MessageHeader_lastUpdated_idx" ON "MessageHeader" ("lastUpdated");
CREATE INDEX "MessageHeader_projectId_lastUpdated_idx" ON "MessageHeader" ("projectId", "lastUpdated");
CREATE INDEX "MessageHeader_projectId_idx" ON "MessageHeader" ("projectId");
CREATE INDEX "MessageHeader__source_idx" ON "MessageHeader" ("_source");
CREATE INDEX "MessageHeader__profile_idx" ON "MessageHeader" USING gin ("_profile");
CREATE INDEX "MessageHeader___version_idx" ON "MessageHeader" ("__version");
CREATE INDEX "MessageHeader_compartments_idx" ON "MessageHeader" USING gin ("compartments");
CREATE INDEX "MessageHeader___sharedTokens_idx" ON "MessageHeader" USING gin ("__sharedTokens");
CREATE INDEX "MessageHeader___sharedTokensTextTrgm_idx" ON "MessageHeader" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MessageHeader____tag_idx" ON "MessageHeader" USING gin ("___tag");
CREATE INDEX "MessageHeader____tagTextTrgm_idx" ON "MessageHeader" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MessageHeader_author_idx" ON "MessageHeader" ("author");
CREATE INDEX "MessageHeader_code_idx" ON "MessageHeader" ("code");
CREATE INDEX "MessageHeader_destination_idx" ON "MessageHeader" USING gin ("destination");
CREATE INDEX "MessageHeader_destinationUri_idx" ON "MessageHeader" USING gin ("destinationUri");
CREATE INDEX "MessageHeader_enterer_idx" ON "MessageHeader" ("enterer");
CREATE INDEX "MessageHeader___event_idx" ON "MessageHeader" USING gin ("__event");
CREATE INDEX "MessageHeader___eventTextTrgm_idx" ON "MessageHeader" USING gin (token_array_to_text("__eventText") gin_trgm_ops);
CREATE INDEX "MessageHeader_focus_idx" ON "MessageHeader" USING gin ("focus");
CREATE INDEX "MessageHeader_receiver_idx" ON "MessageHeader" USING gin ("receiver");
CREATE INDEX "MessageHeader_responseId_idx" ON "MessageHeader" ("responseId");
CREATE INDEX "MessageHeader_responsible_idx" ON "MessageHeader" ("responsible");
CREATE INDEX "MessageHeader_sender_idx" ON "MessageHeader" ("sender");
CREATE INDEX "MessageHeader_source_idx" ON "MessageHeader" ("source");
CREATE INDEX "MessageHeader_sourceUri_idx" ON "MessageHeader" ("sourceUri");
CREATE INDEX "MessageHeader_target_idx" ON "MessageHeader" USING gin ("target");

CREATE TABLE  "MessageHeader_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MessageHeader_History_id_idx" ON "MessageHeader_History" ("id");
CREATE INDEX "MessageHeader_History_lastUpdated_idx" ON "MessageHeader_History" ("lastUpdated");

CREATE TABLE  "MessageHeader_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MessageHeader_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MessageHeader_Refs_targetId_code_idx" ON "MessageHeader_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "MolecularSequence" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__chromosome" UUID[],
  "__chromosomeText" TEXT[],
  "__chromosomeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__referenceseqid" UUID[],
  "__referenceseqidText" TEXT[],
  "__referenceseqidSort" TEXT,
  "type" TEXT,
  "variantEnd" DOUBLE PRECISION[],
  "variantStart" DOUBLE PRECISION[],
  "windowEnd" DOUBLE PRECISION,
  "windowStart" DOUBLE PRECISION,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT
);
CREATE INDEX "MolecularSequence_lastUpdated_idx" ON "MolecularSequence" ("lastUpdated");
CREATE INDEX "MolecularSequence_projectId_lastUpdated_idx" ON "MolecularSequence" ("projectId", "lastUpdated");
CREATE INDEX "MolecularSequence_projectId_idx" ON "MolecularSequence" ("projectId");
CREATE INDEX "MolecularSequence__source_idx" ON "MolecularSequence" ("_source");
CREATE INDEX "MolecularSequence__profile_idx" ON "MolecularSequence" USING gin ("_profile");
CREATE INDEX "MolecularSequence___version_idx" ON "MolecularSequence" ("__version");
CREATE INDEX "MolecularSequence_compartments_idx" ON "MolecularSequence" USING gin ("compartments");
CREATE INDEX "MolecularSequence___sharedTokens_idx" ON "MolecularSequence" USING gin ("__sharedTokens");
CREATE INDEX "MolecularSequence___sharedTokensTextTrgm_idx" ON "MolecularSequence" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "MolecularSequence____tag_idx" ON "MolecularSequence" USING gin ("___tag");
CREATE INDEX "MolecularSequence____tagTextTrgm_idx" ON "MolecularSequence" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "MolecularSequence___chromosome_idx" ON "MolecularSequence" USING gin ("__chromosome");
CREATE INDEX "MolecularSequence___chromosomeTextTrgm_idx" ON "MolecularSequence" USING gin (token_array_to_text("__chromosomeText") gin_trgm_ops);
CREATE INDEX "MolecularSequence___idnt_idx" ON "MolecularSequence" USING gin ("__identifier");
CREATE INDEX "MolecularSequence___idntTextTrgm_idx" ON "MolecularSequence" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "MolecularSequence_patient_idx" ON "MolecularSequence" ("patient");
CREATE INDEX "MolecularSequence___referenceseqid_idx" ON "MolecularSequence" USING gin ("__referenceseqid");
CREATE INDEX "MolecularSequence___referenceseqidTextTrgm_idx" ON "MolecularSequence" USING gin (token_array_to_text("__referenceseqidText") gin_trgm_ops);
CREATE INDEX "MolecularSequence_type_idx" ON "MolecularSequence" ("type");
CREATE INDEX "MolecularSequence_variantEnd_idx" ON "MolecularSequence" USING gin ("variantEnd");
CREATE INDEX "MolecularSequence_variantStart_idx" ON "MolecularSequence" USING gin ("variantStart");
CREATE INDEX "MolecularSequence_windowEnd_idx" ON "MolecularSequence" ("windowEnd");
CREATE INDEX "MolecularSequence_windowStart_idx" ON "MolecularSequence" ("windowStart");

CREATE TABLE  "MolecularSequence_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "MolecularSequence_History_id_idx" ON "MolecularSequence_History" ("id");
CREATE INDEX "MolecularSequence_History_lastUpdated_idx" ON "MolecularSequence_History" ("lastUpdated");

CREATE TABLE  "MolecularSequence_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "MolecularSequence_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "MolecularSequence_Refs_targetId_code_idx" ON "MolecularSequence_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "NamingSystem" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "contact" TEXT[],
  "idType" TEXT[],
  "kind" TEXT,
  "period" TIMESTAMPTZ[],
  "responsible" TEXT,
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "value" TEXT[],
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "NamingSystem_lastUpdated_idx" ON "NamingSystem" ("lastUpdated");
CREATE INDEX "NamingSystem_projectId_lastUpdated_idx" ON "NamingSystem" ("projectId", "lastUpdated");
CREATE INDEX "NamingSystem_projectId_idx" ON "NamingSystem" ("projectId");
CREATE INDEX "NamingSystem__source_idx" ON "NamingSystem" ("_source");
CREATE INDEX "NamingSystem__profile_idx" ON "NamingSystem" USING gin ("_profile");
CREATE INDEX "NamingSystem___version_idx" ON "NamingSystem" ("__version");
CREATE INDEX "NamingSystem_compartments_idx" ON "NamingSystem" USING gin ("compartments");
CREATE INDEX "NamingSystem___sharedTokens_idx" ON "NamingSystem" USING gin ("__sharedTokens");
CREATE INDEX "NamingSystem___sharedTokensTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "NamingSystem____tag_idx" ON "NamingSystem" USING gin ("___tag");
CREATE INDEX "NamingSystem____tagTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "NamingSystem___context_idx" ON "NamingSystem" USING gin ("__context");
CREATE INDEX "NamingSystem___contextTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "NamingSystem_contextQuantity_idx" ON "NamingSystem" USING gin ("contextQuantity");
CREATE INDEX "NamingSystem___contextType_idx" ON "NamingSystem" USING gin ("__contextType");
CREATE INDEX "NamingSystem___contextTypeTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "NamingSystem_date_idx" ON "NamingSystem" ("date");
CREATE INDEX "NamingSystem_projectId_date_idx" ON "NamingSystem" ("projectId", "date");
CREATE INDEX "NamingSystem_description_idx" ON "NamingSystem" ("description");
CREATE INDEX "NamingSystem___jurisdiction_idx" ON "NamingSystem" USING gin ("__jurisdiction");
CREATE INDEX "NamingSystem___jurisdictionTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "NamingSystem_name_idx" ON "NamingSystem" ("name");
CREATE INDEX "NamingSystem_publisher_idx" ON "NamingSystem" ("publisher");
CREATE INDEX "NamingSystem_status_idx" ON "NamingSystem" ("status");
CREATE INDEX "NamingSystem_contact_idx" ON "NamingSystem" USING gin ("contact");
CREATE INDEX "NamingSystem_idType_idx" ON "NamingSystem" USING gin ("idType");
CREATE INDEX "NamingSystem_kind_idx" ON "NamingSystem" ("kind");
CREATE INDEX "NamingSystem_period_idx" ON "NamingSystem" USING gin ("period");
CREATE INDEX "NamingSystem_responsible_idx" ON "NamingSystem" ("responsible");
CREATE INDEX "NamingSystem___telecom_idx" ON "NamingSystem" USING gin ("__telecom");
CREATE INDEX "NamingSystem___telecomTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);
CREATE INDEX "NamingSystem___type_idx" ON "NamingSystem" USING gin ("__type");
CREATE INDEX "NamingSystem___typeTextTrgm_idx" ON "NamingSystem" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "NamingSystem_value_idx" ON "NamingSystem" USING gin ("value");

CREATE TABLE  "NamingSystem_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "NamingSystem_History_id_idx" ON "NamingSystem_History" ("id");
CREATE INDEX "NamingSystem_History_lastUpdated_idx" ON "NamingSystem_History" ("lastUpdated");

CREATE TABLE  "NamingSystem_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "NamingSystem_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "NamingSystem_Refs_targetId_code_idx" ON "NamingSystem_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "NutritionOrder" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "__additive" UUID[],
  "__additiveText" TEXT[],
  "__additiveSort" TEXT,
  "datetime" TIMESTAMPTZ,
  "__formula" UUID[],
  "__formulaText" TEXT[],
  "__formulaSort" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "__oraldiet" UUID[],
  "__oraldietText" TEXT[],
  "__oraldietSort" TEXT,
  "provider" TEXT,
  "status" TEXT,
  "__supplement" UUID[],
  "__supplementText" TEXT[],
  "__supplementSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__providerIdentifierSort" TEXT
);
CREATE INDEX "NutritionOrder_lastUpdated_idx" ON "NutritionOrder" ("lastUpdated");
CREATE INDEX "NutritionOrder_projectId_lastUpdated_idx" ON "NutritionOrder" ("projectId", "lastUpdated");
CREATE INDEX "NutritionOrder_projectId_idx" ON "NutritionOrder" ("projectId");
CREATE INDEX "NutritionOrder__source_idx" ON "NutritionOrder" ("_source");
CREATE INDEX "NutritionOrder__profile_idx" ON "NutritionOrder" USING gin ("_profile");
CREATE INDEX "NutritionOrder___version_idx" ON "NutritionOrder" ("__version");
CREATE INDEX "NutritionOrder_compartments_idx" ON "NutritionOrder" USING gin ("compartments");
CREATE INDEX "NutritionOrder___sharedTokens_idx" ON "NutritionOrder" USING gin ("__sharedTokens");
CREATE INDEX "NutritionOrder___sharedTokensTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "NutritionOrder____tag_idx" ON "NutritionOrder" USING gin ("___tag");
CREATE INDEX "NutritionOrder____tagTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "NutritionOrder___idnt_idx" ON "NutritionOrder" USING gin ("__identifier");
CREATE INDEX "NutritionOrder___idntTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "NutritionOrder_patient_idx" ON "NutritionOrder" ("patient");
CREATE INDEX "NutritionOrder_encounter_idx" ON "NutritionOrder" ("encounter");
CREATE INDEX "NutritionOrder___additive_idx" ON "NutritionOrder" USING gin ("__additive");
CREATE INDEX "NutritionOrder___additiveTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("__additiveText") gin_trgm_ops);
CREATE INDEX "NutritionOrder_datetime_idx" ON "NutritionOrder" ("datetime");
CREATE INDEX "NutritionOrder___formula_idx" ON "NutritionOrder" USING gin ("__formula");
CREATE INDEX "NutritionOrder___formulaTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("__formulaText") gin_trgm_ops);
CREATE INDEX "NutritionOrder_instantiatesCanonical_idx" ON "NutritionOrder" USING gin ("instantiatesCanonical");
CREATE INDEX "NutritionOrder_instantiatesUri_idx" ON "NutritionOrder" USING gin ("instantiatesUri");
CREATE INDEX "NutritionOrder___oraldiet_idx" ON "NutritionOrder" USING gin ("__oraldiet");
CREATE INDEX "NutritionOrder___oraldietTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("__oraldietText") gin_trgm_ops);
CREATE INDEX "NutritionOrder_provider_idx" ON "NutritionOrder" ("provider");
CREATE INDEX "NutritionOrder_status_idx" ON "NutritionOrder" ("status");
CREATE INDEX "NutritionOrder___supplement_idx" ON "NutritionOrder" USING gin ("__supplement");
CREATE INDEX "NutritionOrder___supplementTextTrgm_idx" ON "NutritionOrder" USING gin (token_array_to_text("__supplementText") gin_trgm_ops);

CREATE TABLE  "NutritionOrder_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "NutritionOrder_History_id_idx" ON "NutritionOrder_History" ("id");
CREATE INDEX "NutritionOrder_History_lastUpdated_idx" ON "NutritionOrder_History" ("lastUpdated");

CREATE TABLE  "NutritionOrder_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "NutritionOrder_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "NutritionOrder_Refs_targetId_code_idx" ON "NutritionOrder_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Observation" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "basedOn" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "__comboCode" UUID[],
  "__comboCodeText" TEXT[],
  "__comboCodeSort" TEXT,
  "__comboDataAbsentReason" UUID[],
  "__comboDataAbsentReasonText" TEXT[],
  "__comboDataAbsentReasonSort" TEXT,
  "__comboValueConcept" UUID[],
  "__comboValueConceptText" TEXT[],
  "__comboValueConceptSort" TEXT,
  "comboValueQuantity" DOUBLE PRECISION[],
  "__componentCode" UUID[],
  "__componentCodeText" TEXT[],
  "__componentCodeSort" TEXT,
  "__componentDataAbsentReasonSort" TEXT,
  "__componentValueConcept" UUID[],
  "__componentValueConceptText" TEXT[],
  "__componentValueConceptSort" TEXT,
  "componentValueQuantity" DOUBLE PRECISION[],
  "__dataAbsentReason" UUID[],
  "__dataAbsentReasonText" TEXT[],
  "__dataAbsentReasonSort" TEXT,
  "derivedFrom" TEXT[],
  "device" TEXT,
  "focus" TEXT[],
  "hasMember" TEXT[],
  "__method" UUID[],
  "__methodText" TEXT[],
  "__methodSort" TEXT,
  "partOf" TEXT[],
  "performer" TEXT[],
  "specimen" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "__valueConcept" UUID[],
  "__valueConceptText" TEXT[],
  "__valueConceptSort" TEXT,
  "valueDate" TIMESTAMPTZ,
  "valueQuantity" DOUBLE PRECISION,
  "valueString" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifier" UUID[],
  "__patientIdentifierText" TEXT[],
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__deviceIdentifierSort" TEXT,
  "__focusIdentifierSort" TEXT,
  "__hasMemberIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__performerIdentifier" UUID[],
  "__performerIdentifierText" TEXT[],
  "__performerIdentifierSort" TEXT,
  "__specimenIdentifierSort" TEXT,
  "__subjectIdentifier" UUID[],
  "__subjectIdentifierText" TEXT[],
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Observation_lastUpdated_idx" ON "Observation" ("lastUpdated");
CREATE INDEX "Observation_projectId_lastUpdated_idx" ON "Observation" ("projectId", "lastUpdated");
CREATE INDEX "Observation_projectId_idx" ON "Observation" ("projectId");
CREATE INDEX "Observation__source_idx" ON "Observation" ("_source");
CREATE INDEX "Observation__profile_idx" ON "Observation" USING gin ("_profile");
CREATE INDEX "Observation___version_idx" ON "Observation" ("__version");
CREATE INDEX "Observation_compartments_idx" ON "Observation" USING gin ("compartments");
CREATE INDEX "Observation___sharedTokens_idx" ON "Observation" USING gin ("__sharedTokens");
CREATE INDEX "Observation___sharedTokensTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Observation____tag_idx" ON "Observation" USING gin ("___tag");
CREATE INDEX "Observation____tagTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Observation___code_idx" ON "Observation" USING gin ("__code");
CREATE INDEX "Observation___codeTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Observation_date_idx" ON "Observation" ("date");
CREATE INDEX "Observation_projectId_date_idx" ON "Observation" ("projectId", "date");
CREATE INDEX "Observation___idnt_idx" ON "Observation" USING gin ("__identifier");
CREATE INDEX "Observation___idntTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Observation_patient_idx" ON "Observation" ("patient");
CREATE INDEX "Observation_encounter_idx" ON "Observation" ("encounter");
CREATE INDEX "Observation_basedOn_idx" ON "Observation" USING gin ("basedOn");
CREATE INDEX "Observation___category_idx" ON "Observation" USING gin ("__category");
CREATE INDEX "Observation___categoryTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Observation___comboCode_idx" ON "Observation" USING gin ("__comboCode");
CREATE INDEX "Observation___comboCodeTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__comboCodeText") gin_trgm_ops);
CREATE INDEX "Observation___comboDataAbsentReason_idx" ON "Observation" USING gin ("__comboDataAbsentReason");
CREATE INDEX "Observation___comboDataAbsentReasonTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__comboDataAbsentReasonText") gin_trgm_ops);
CREATE INDEX "Observation___comboValueConcept_idx" ON "Observation" USING gin ("__comboValueConcept");
CREATE INDEX "Observation___comboValueConceptTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__comboValueConceptText") gin_trgm_ops);
CREATE INDEX "Observation_comboValueQuantity_idx" ON "Observation" USING gin ("comboValueQuantity");
CREATE INDEX "Observation___componentCode_idx" ON "Observation" USING gin ("__componentCode");
CREATE INDEX "Observation___componentCodeTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__componentCodeText") gin_trgm_ops);
CREATE INDEX "Observation___componentValueConcept_idx" ON "Observation" USING gin ("__componentValueConcept");
CREATE INDEX "Observation___componentValueConceptTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__componentValueConceptText") gin_trgm_ops);
CREATE INDEX "Observation_componentValueQuantity_idx" ON "Observation" USING gin ("componentValueQuantity");
CREATE INDEX "Observation___dataAbsentReason_idx" ON "Observation" USING gin ("__dataAbsentReason");
CREATE INDEX "Observation___dataAbsentReasonTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__dataAbsentReasonText") gin_trgm_ops);
CREATE INDEX "Observation_derivedFrom_idx" ON "Observation" USING gin ("derivedFrom");
CREATE INDEX "Observation_device_idx" ON "Observation" ("device");
CREATE INDEX "Observation_focus_idx" ON "Observation" USING gin ("focus");
CREATE INDEX "Observation_hasMember_idx" ON "Observation" USING gin ("hasMember");
CREATE INDEX "Observation___method_idx" ON "Observation" USING gin ("__method");
CREATE INDEX "Observation___methodTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__methodText") gin_trgm_ops);
CREATE INDEX "Observation_partOf_idx" ON "Observation" USING gin ("partOf");
CREATE INDEX "Observation_performer_idx" ON "Observation" USING gin ("performer");
CREATE INDEX "Observation_specimen_idx" ON "Observation" ("specimen");
CREATE INDEX "Observation_status_idx" ON "Observation" ("status");
CREATE INDEX "Observation_subject_idx" ON "Observation" ("subject");
CREATE INDEX "Observation___valueConcept_idx" ON "Observation" USING gin ("__valueConcept");
CREATE INDEX "Observation___valueConceptTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__valueConceptText") gin_trgm_ops);
CREATE INDEX "Observation_valueDate_idx" ON "Observation" ("valueDate");
CREATE INDEX "Observation_valueQuantity_idx" ON "Observation" ("valueQuantity");
CREATE INDEX "Observation_valueString_idx" ON "Observation" ("valueString");
CREATE INDEX "Observation___patientIdnt_idx" ON "Observation" USING gin ("__patientIdentifier");
CREATE INDEX "Observation___patientIdntTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__patientIdentifierText") gin_trgm_ops);
CREATE INDEX "Observation___performerIdnt_idx" ON "Observation" USING gin ("__performerIdentifier");
CREATE INDEX "Observation___performerIdntTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__performerIdentifierText") gin_trgm_ops);
CREATE INDEX "Observation___subjectIdnt_idx" ON "Observation" USING gin ("__subjectIdentifier");
CREATE INDEX "Observation___subjectIdntTextTrgm_idx" ON "Observation" USING gin (token_array_to_text("__subjectIdentifierText") gin_trgm_ops);

CREATE TABLE  "Observation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Observation_History_id_idx" ON "Observation_History" ("id");
CREATE INDEX "Observation_History_lastUpdated_idx" ON "Observation_History" ("lastUpdated");

CREATE TABLE  "Observation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Observation_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Observation_Refs_targetId_code_idx" ON "Observation_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ObservationDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "publisher" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__publisherIdentifierSort" TEXT
);
CREATE INDEX "ObservationDefinition_lastUpdated_idx" ON "ObservationDefinition" ("lastUpdated");
CREATE INDEX "ObservationDefinition_projectId_lastUpdated_idx" ON "ObservationDefinition" ("projectId", "lastUpdated");
CREATE INDEX "ObservationDefinition_projectId_idx" ON "ObservationDefinition" ("projectId");
CREATE INDEX "ObservationDefinition__source_idx" ON "ObservationDefinition" ("_source");
CREATE INDEX "ObservationDefinition__profile_idx" ON "ObservationDefinition" USING gin ("_profile");
CREATE INDEX "ObservationDefinition___version_idx" ON "ObservationDefinition" ("__version");
CREATE INDEX "ObservationDefinition_compartments_idx" ON "ObservationDefinition" USING gin ("compartments");
CREATE INDEX "ObservationDefinition___sharedTokens_idx" ON "ObservationDefinition" USING gin ("__sharedTokens");
CREATE INDEX "ObservationDefinition___sharedTokensTextTrgm_idx" ON "ObservationDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ObservationDefinition____tag_idx" ON "ObservationDefinition" USING gin ("___tag");
CREATE INDEX "ObservationDefinition____tagTextTrgm_idx" ON "ObservationDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ObservationDefinition___code_idx" ON "ObservationDefinition" USING gin ("__code");
CREATE INDEX "ObservationDefinition___codeTextTrgm_idx" ON "ObservationDefinition" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "ObservationDefinition_publisher_idx" ON "ObservationDefinition" ("publisher");

CREATE TABLE  "ObservationDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ObservationDefinition_History_id_idx" ON "ObservationDefinition_History" ("id");
CREATE INDEX "ObservationDefinition_History_lastUpdated_idx" ON "ObservationDefinition_History" ("lastUpdated");

CREATE TABLE  "ObservationDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ObservationDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ObservationDefinition_Refs_targetId_code_idx" ON "ObservationDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "OperationDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "base" TEXT,
  "code" TEXT,
  "inputProfile" TEXT,
  "instance" BOOLEAN,
  "kind" TEXT,
  "outputProfile" TEXT,
  "system" BOOLEAN,
  "type" BOOLEAN,
  "___compartmentIdentifierSort" TEXT,
  "__baseIdentifierSort" TEXT,
  "__inputProfileIdentifierSort" TEXT,
  "__outputProfileIdentifierSort" TEXT
);
CREATE INDEX "OperationDefinition_lastUpdated_idx" ON "OperationDefinition" ("lastUpdated");
CREATE INDEX "OperationDefinition_projectId_lastUpdated_idx" ON "OperationDefinition" ("projectId", "lastUpdated");
CREATE INDEX "OperationDefinition_projectId_idx" ON "OperationDefinition" ("projectId");
CREATE INDEX "OperationDefinition__source_idx" ON "OperationDefinition" ("_source");
CREATE INDEX "OperationDefinition__profile_idx" ON "OperationDefinition" USING gin ("_profile");
CREATE INDEX "OperationDefinition___version_idx" ON "OperationDefinition" ("__version");
CREATE INDEX "OperationDefinition_compartments_idx" ON "OperationDefinition" USING gin ("compartments");
CREATE INDEX "OperationDefinition___sharedTokens_idx" ON "OperationDefinition" USING gin ("__sharedTokens");
CREATE INDEX "OperationDefinition___sharedTokensTextTrgm_idx" ON "OperationDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "OperationDefinition____tag_idx" ON "OperationDefinition" USING gin ("___tag");
CREATE INDEX "OperationDefinition____tagTextTrgm_idx" ON "OperationDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "OperationDefinition___context_idx" ON "OperationDefinition" USING gin ("__context");
CREATE INDEX "OperationDefinition___contextTextTrgm_idx" ON "OperationDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "OperationDefinition_contextQuantity_idx" ON "OperationDefinition" USING gin ("contextQuantity");
CREATE INDEX "OperationDefinition___contextType_idx" ON "OperationDefinition" USING gin ("__contextType");
CREATE INDEX "OperationDefinition___contextTypeTextTrgm_idx" ON "OperationDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "OperationDefinition_date_idx" ON "OperationDefinition" ("date");
CREATE INDEX "OperationDefinition_projectId_date_idx" ON "OperationDefinition" ("projectId", "date");
CREATE INDEX "OperationDefinition_description_idx" ON "OperationDefinition" ("description");
CREATE INDEX "OperationDefinition___jurisdiction_idx" ON "OperationDefinition" USING gin ("__jurisdiction");
CREATE INDEX "OperationDefinition___jurisdictionTextTrgm_idx" ON "OperationDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "OperationDefinition_name_idx" ON "OperationDefinition" ("name");
CREATE INDEX "OperationDefinition_publisher_idx" ON "OperationDefinition" ("publisher");
CREATE INDEX "OperationDefinition_status_idx" ON "OperationDefinition" ("status");
CREATE INDEX "OperationDefinition_title_idx" ON "OperationDefinition" ("title");
CREATE INDEX "OperationDefinition_url_idx" ON "OperationDefinition" ("url");
CREATE INDEX "OperationDefinition_version_idx" ON "OperationDefinition" ("version");
CREATE INDEX "OperationDefinition_base_idx" ON "OperationDefinition" ("base");
CREATE INDEX "OperationDefinition_code_idx" ON "OperationDefinition" ("code");
CREATE INDEX "OperationDefinition_inputProfile_idx" ON "OperationDefinition" ("inputProfile");
CREATE INDEX "OperationDefinition_instance_idx" ON "OperationDefinition" ("instance");
CREATE INDEX "OperationDefinition_kind_idx" ON "OperationDefinition" ("kind");
CREATE INDEX "OperationDefinition_outputProfile_idx" ON "OperationDefinition" ("outputProfile");
CREATE INDEX "OperationDefinition_system_idx" ON "OperationDefinition" ("system");
CREATE INDEX "OperationDefinition_type_idx" ON "OperationDefinition" ("type");

CREATE TABLE  "OperationDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "OperationDefinition_History_id_idx" ON "OperationDefinition_History" ("id");
CREATE INDEX "OperationDefinition_History_lastUpdated_idx" ON "OperationDefinition_History" ("lastUpdated");

CREATE TABLE  "OperationDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "OperationDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "OperationDefinition_Refs_targetId_code_idx" ON "OperationDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "OperationOutcome" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "OperationOutcome_lastUpdated_idx" ON "OperationOutcome" ("lastUpdated");
CREATE INDEX "OperationOutcome_projectId_lastUpdated_idx" ON "OperationOutcome" ("projectId", "lastUpdated");
CREATE INDEX "OperationOutcome_projectId_idx" ON "OperationOutcome" ("projectId");
CREATE INDEX "OperationOutcome__source_idx" ON "OperationOutcome" ("_source");
CREATE INDEX "OperationOutcome__profile_idx" ON "OperationOutcome" USING gin ("_profile");
CREATE INDEX "OperationOutcome___version_idx" ON "OperationOutcome" ("__version");
CREATE INDEX "OperationOutcome_compartments_idx" ON "OperationOutcome" USING gin ("compartments");
CREATE INDEX "OperationOutcome___sharedTokens_idx" ON "OperationOutcome" USING gin ("__sharedTokens");
CREATE INDEX "OperationOutcome___sharedTokensTextTrgm_idx" ON "OperationOutcome" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "OperationOutcome____tag_idx" ON "OperationOutcome" USING gin ("___tag");
CREATE INDEX "OperationOutcome____tagTextTrgm_idx" ON "OperationOutcome" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "OperationOutcome_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "OperationOutcome_History_id_idx" ON "OperationOutcome_History" ("id");
CREATE INDEX "OperationOutcome_History_lastUpdated_idx" ON "OperationOutcome_History" ("lastUpdated");

CREATE TABLE  "OperationOutcome_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "OperationOutcome_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "OperationOutcome_Refs_targetId_code_idx" ON "OperationOutcome_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Organization" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "active" BOOLEAN,
  "endpoint" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT[],
  "partof" TEXT,
  "phonetic" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__partofIdentifierSort" TEXT
);
CREATE INDEX "Organization_lastUpdated_idx" ON "Organization" ("lastUpdated");
CREATE INDEX "Organization_projectId_lastUpdated_idx" ON "Organization" ("projectId", "lastUpdated");
CREATE INDEX "Organization_projectId_idx" ON "Organization" ("projectId");
CREATE INDEX "Organization__source_idx" ON "Organization" ("_source");
CREATE INDEX "Organization__profile_idx" ON "Organization" USING gin ("_profile");
CREATE INDEX "Organization___version_idx" ON "Organization" ("__version");
CREATE INDEX "Organization_compartments_idx" ON "Organization" USING gin ("compartments");
CREATE INDEX "Organization___sharedTokens_idx" ON "Organization" USING gin ("__sharedTokens");
CREATE INDEX "Organization___sharedTokensTextTrgm_idx" ON "Organization" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Organization____tag_idx" ON "Organization" USING gin ("___tag");
CREATE INDEX "Organization____tagTextTrgm_idx" ON "Organization" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Organization_active_idx" ON "Organization" ("active");
CREATE INDEX "Organization_endpoint_idx" ON "Organization" USING gin ("endpoint");
CREATE INDEX "Organization___idnt_idx" ON "Organization" USING gin ("__identifier");
CREATE INDEX "Organization___idntTextTrgm_idx" ON "Organization" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Organization_name_idx" ON "Organization" USING gin ("name");
CREATE INDEX "Organization_partof_idx" ON "Organization" ("partof");
CREATE INDEX "Organization_phonetic_idx" ON "Organization" ("phonetic");
CREATE INDEX "Organization___type_idx" ON "Organization" USING gin ("__type");
CREATE INDEX "Organization___typeTextTrgm_idx" ON "Organization" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "Organization_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Organization_History_id_idx" ON "Organization_History" ("id");
CREATE INDEX "Organization_History_lastUpdated_idx" ON "Organization_History" ("lastUpdated");

CREATE TABLE  "Organization_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Organization_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Organization_Refs_targetId_code_idx" ON "Organization_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "OrganizationAffiliation" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "active" BOOLEAN,
  "date" TIMESTAMPTZ,
  "__email" UUID[],
  "__emailText" TEXT[],
  "__emailSort" TEXT,
  "endpoint" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "location" TEXT[],
  "network" TEXT[],
  "participatingOrganization" TEXT,
  "__phone" UUID[],
  "__phoneText" TEXT[],
  "__phoneSort" TEXT,
  "primaryOrganization" TEXT,
  "__role" UUID[],
  "__roleText" TEXT[],
  "__roleSort" TEXT,
  "service" TEXT[],
  "__specialty" UUID[],
  "__specialtyText" TEXT[],
  "__specialtySort" TEXT,
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__networkIdentifierSort" TEXT,
  "__participatingOrganizationIdentifierSort" TEXT,
  "__primaryOrganizationIdentifierSort" TEXT,
  "__serviceIdentifierSort" TEXT
);
CREATE INDEX "OrganizationAffiliation_lastUpdated_idx" ON "OrganizationAffiliation" ("lastUpdated");
CREATE INDEX "OrganizationAffiliation_projectId_lastUpdated_idx" ON "OrganizationAffiliation" ("projectId", "lastUpdated");
CREATE INDEX "OrganizationAffiliation_projectId_idx" ON "OrganizationAffiliation" ("projectId");
CREATE INDEX "OrganizationAffiliation__source_idx" ON "OrganizationAffiliation" ("_source");
CREATE INDEX "OrganizationAffiliation__profile_idx" ON "OrganizationAffiliation" USING gin ("_profile");
CREATE INDEX "OrganizationAffiliation___version_idx" ON "OrganizationAffiliation" ("__version");
CREATE INDEX "OrganizationAffiliation_compartments_idx" ON "OrganizationAffiliation" USING gin ("compartments");
CREATE INDEX "OrganizationAffiliation___sharedTokens_idx" ON "OrganizationAffiliation" USING gin ("__sharedTokens");
CREATE INDEX "OrganizationAffiliation___sharedTokensTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation____tag_idx" ON "OrganizationAffiliation" USING gin ("___tag");
CREATE INDEX "OrganizationAffiliation____tagTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation_active_idx" ON "OrganizationAffiliation" ("active");
CREATE INDEX "OrganizationAffiliation_date_idx" ON "OrganizationAffiliation" ("date");
CREATE INDEX "OrganizationAffiliation_projectId_date_idx" ON "OrganizationAffiliation" ("projectId", "date");
CREATE INDEX "OrganizationAffiliation___email_idx" ON "OrganizationAffiliation" USING gin ("__email");
CREATE INDEX "OrganizationAffiliation___emailTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__emailText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation_endpoint_idx" ON "OrganizationAffiliation" USING gin ("endpoint");
CREATE INDEX "OrganizationAffiliation___idnt_idx" ON "OrganizationAffiliation" USING gin ("__identifier");
CREATE INDEX "OrganizationAffiliation___idntTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation_location_idx" ON "OrganizationAffiliation" USING gin ("location");
CREATE INDEX "OrganizationAffiliation_network_idx" ON "OrganizationAffiliation" USING gin ("network");
CREATE INDEX "OrganizationAffiliation_partOrg_idx" ON "OrganizationAffiliation" ("participatingOrganization");
CREATE INDEX "OrganizationAffiliation___phone_idx" ON "OrganizationAffiliation" USING gin ("__phone");
CREATE INDEX "OrganizationAffiliation___phoneTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__phoneText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation_primOrg_idx" ON "OrganizationAffiliation" ("primaryOrganization");
CREATE INDEX "OrganizationAffiliation___role_idx" ON "OrganizationAffiliation" USING gin ("__role");
CREATE INDEX "OrganizationAffiliation___roleTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__roleText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation_service_idx" ON "OrganizationAffiliation" USING gin ("service");
CREATE INDEX "OrganizationAffiliation___specialty_idx" ON "OrganizationAffiliation" USING gin ("__specialty");
CREATE INDEX "OrganizationAffiliation___specialtyTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__specialtyText") gin_trgm_ops);
CREATE INDEX "OrganizationAffiliation___telecom_idx" ON "OrganizationAffiliation" USING gin ("__telecom");
CREATE INDEX "OrganizationAffiliation___telecomTextTrgm_idx" ON "OrganizationAffiliation" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);

CREATE TABLE  "OrganizationAffiliation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "OrganizationAffiliation_History_id_idx" ON "OrganizationAffiliation_History" ("id");
CREATE INDEX "OrganizationAffiliation_History_lastUpdated_idx" ON "OrganizationAffiliation_History" ("lastUpdated");

CREATE TABLE  "OrganizationAffiliation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "OrganizationAffiliation_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "OrganizationAffiliation_Refs_targetId_code_idx" ON "OrganizationAffiliation_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Parameters" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "Parameters_lastUpdated_idx" ON "Parameters" ("lastUpdated");
CREATE INDEX "Parameters_projectId_lastUpdated_idx" ON "Parameters" ("projectId", "lastUpdated");
CREATE INDEX "Parameters_projectId_idx" ON "Parameters" ("projectId");
CREATE INDEX "Parameters__source_idx" ON "Parameters" ("_source");
CREATE INDEX "Parameters__profile_idx" ON "Parameters" USING gin ("_profile");
CREATE INDEX "Parameters___version_idx" ON "Parameters" ("__version");
CREATE INDEX "Parameters_compartments_idx" ON "Parameters" USING gin ("compartments");
CREATE INDEX "Parameters___sharedTokens_idx" ON "Parameters" USING gin ("__sharedTokens");
CREATE INDEX "Parameters___sharedTokensTextTrgm_idx" ON "Parameters" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Parameters____tag_idx" ON "Parameters" USING gin ("___tag");
CREATE INDEX "Parameters____tagTextTrgm_idx" ON "Parameters" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "Parameters_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Parameters_History_id_idx" ON "Parameters_History" ("id");
CREATE INDEX "Parameters_History_lastUpdated_idx" ON "Parameters_History" ("lastUpdated");

CREATE TABLE  "Parameters_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Parameters_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Parameters_Refs_targetId_code_idx" ON "Parameters_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Patient" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "active" BOOLEAN,
  "birthdate" DATE,
  "deathDate" TIMESTAMPTZ,
  "deceased" BOOLEAN,
  "__email" UUID[],
  "__emailText" TEXT[],
  "__emailSort" TEXT,
  "gender" TEXT,
  "generalPractitioner" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__language" UUID[],
  "__languageText" TEXT[],
  "__languageSort" TEXT,
  "link" TEXT[],
  "organization" TEXT,
  "__phone" UUID[],
  "__phoneText" TEXT[],
  "__phoneSort" TEXT,
  "phonetic" TEXT[],
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "ethnicity" TEXT[],
  "genderIdentity" TEXT[],
  "race" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__generalPractitionerIdentifierSort" TEXT,
  "__linkIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT
);
CREATE INDEX "Patient_lastUpdated_idx" ON "Patient" ("lastUpdated");
CREATE INDEX "Patient_projectId_lastUpdated_idx" ON "Patient" ("projectId", "lastUpdated");
CREATE INDEX "Patient_projectId_idx" ON "Patient" ("projectId");
CREATE INDEX "Patient__source_idx" ON "Patient" ("_source");
CREATE INDEX "Patient__profile_idx" ON "Patient" USING gin ("_profile");
CREATE INDEX "Patient___version_idx" ON "Patient" ("__version");
CREATE INDEX "Patient_compartments_idx" ON "Patient" USING gin ("compartments");
CREATE INDEX "Patient___sharedTokens_idx" ON "Patient" USING gin ("__sharedTokens");
CREATE INDEX "Patient___sharedTokensTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Patient____tag_idx" ON "Patient" USING gin ("___tag");
CREATE INDEX "Patient____tagTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Patient_active_idx" ON "Patient" ("active");
CREATE INDEX "Patient_birthdate_idx" ON "Patient" ("birthdate");
CREATE INDEX "Patient_deathDate_idx" ON "Patient" ("deathDate");
CREATE INDEX "Patient_deceased_idx" ON "Patient" ("deceased");
CREATE INDEX "Patient___email_idx" ON "Patient" USING gin ("__email");
CREATE INDEX "Patient___emailTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("__emailText") gin_trgm_ops);
CREATE INDEX "Patient_gender_idx" ON "Patient" ("gender");
CREATE INDEX "Patient_generalPractitioner_idx" ON "Patient" USING gin ("generalPractitioner");
CREATE INDEX "Patient___idnt_idx" ON "Patient" USING gin ("__identifier");
CREATE INDEX "Patient___idntTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Patient___language_idx" ON "Patient" USING gin ("__language");
CREATE INDEX "Patient___languageTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("__languageText") gin_trgm_ops);
CREATE INDEX "Patient_link_idx" ON "Patient" USING gin ("link");
CREATE INDEX "Patient_organization_idx" ON "Patient" ("organization");
CREATE INDEX "Patient___phone_idx" ON "Patient" USING gin ("__phone");
CREATE INDEX "Patient___phoneTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("__phoneText") gin_trgm_ops);
CREATE INDEX "Patient_phonetic_idx" ON "Patient" USING gin ("phonetic");
CREATE INDEX "Patient___telecom_idx" ON "Patient" USING gin ("__telecom");
CREATE INDEX "Patient___telecomTextTrgm_idx" ON "Patient" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);
CREATE INDEX "Patient_ethnicity_idx" ON "Patient" USING gin ("ethnicity");
CREATE INDEX "Patient_genderIdentity_idx" ON "Patient" USING gin ("genderIdentity");
CREATE INDEX "Patient_race_idx" ON "Patient" USING gin ("race");

CREATE TABLE  "Patient_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Patient_History_id_idx" ON "Patient_History" ("id");
CREATE INDEX "Patient_History_lastUpdated_idx" ON "Patient_History" ("lastUpdated");

CREATE TABLE  "Patient_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Patient_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Patient_Refs_targetId_code_idx" ON "Patient_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "PaymentNotice" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "created" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__paymentStatus" UUID[],
  "__paymentStatusText" TEXT[],
  "__paymentStatusSort" TEXT,
  "provider" TEXT,
  "request" TEXT,
  "response" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__providerIdentifierSort" TEXT,
  "__requestIdentifierSort" TEXT,
  "__responseIdentifierSort" TEXT
);
CREATE INDEX "PaymentNotice_lastUpdated_idx" ON "PaymentNotice" ("lastUpdated");
CREATE INDEX "PaymentNotice_projectId_lastUpdated_idx" ON "PaymentNotice" ("projectId", "lastUpdated");
CREATE INDEX "PaymentNotice_projectId_idx" ON "PaymentNotice" ("projectId");
CREATE INDEX "PaymentNotice__source_idx" ON "PaymentNotice" ("_source");
CREATE INDEX "PaymentNotice__profile_idx" ON "PaymentNotice" USING gin ("_profile");
CREATE INDEX "PaymentNotice___version_idx" ON "PaymentNotice" ("__version");
CREATE INDEX "PaymentNotice_compartments_idx" ON "PaymentNotice" USING gin ("compartments");
CREATE INDEX "PaymentNotice___sharedTokens_idx" ON "PaymentNotice" USING gin ("__sharedTokens");
CREATE INDEX "PaymentNotice___sharedTokensTextTrgm_idx" ON "PaymentNotice" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "PaymentNotice____tag_idx" ON "PaymentNotice" USING gin ("___tag");
CREATE INDEX "PaymentNotice____tagTextTrgm_idx" ON "PaymentNotice" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "PaymentNotice_created_idx" ON "PaymentNotice" ("created");
CREATE INDEX "PaymentNotice___idnt_idx" ON "PaymentNotice" USING gin ("__identifier");
CREATE INDEX "PaymentNotice___idntTextTrgm_idx" ON "PaymentNotice" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "PaymentNotice___paymentStatus_idx" ON "PaymentNotice" USING gin ("__paymentStatus");
CREATE INDEX "PaymentNotice___paymentStatusTextTrgm_idx" ON "PaymentNotice" USING gin (token_array_to_text("__paymentStatusText") gin_trgm_ops);
CREATE INDEX "PaymentNotice_provider_idx" ON "PaymentNotice" ("provider");
CREATE INDEX "PaymentNotice_request_idx" ON "PaymentNotice" ("request");
CREATE INDEX "PaymentNotice_response_idx" ON "PaymentNotice" ("response");
CREATE INDEX "PaymentNotice_status_idx" ON "PaymentNotice" ("status");

CREATE TABLE  "PaymentNotice_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "PaymentNotice_History_id_idx" ON "PaymentNotice_History" ("id");
CREATE INDEX "PaymentNotice_History_lastUpdated_idx" ON "PaymentNotice_History" ("lastUpdated");

CREATE TABLE  "PaymentNotice_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "PaymentNotice_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "PaymentNotice_Refs_targetId_code_idx" ON "PaymentNotice_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "PaymentReconciliation" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "created" TIMESTAMPTZ,
  "disposition" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "outcome" TEXT,
  "paymentIssuer" TEXT,
  "request" TEXT,
  "requestor" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__paymentIssuerIdentifierSort" TEXT,
  "__requestIdentifierSort" TEXT,
  "__requestorIdentifierSort" TEXT
);
CREATE INDEX "PaymentReconciliation_lastUpdated_idx" ON "PaymentReconciliation" ("lastUpdated");
CREATE INDEX "PaymentReconciliation_projectId_lastUpdated_idx" ON "PaymentReconciliation" ("projectId", "lastUpdated");
CREATE INDEX "PaymentReconciliation_projectId_idx" ON "PaymentReconciliation" ("projectId");
CREATE INDEX "PaymentReconciliation__source_idx" ON "PaymentReconciliation" ("_source");
CREATE INDEX "PaymentReconciliation__profile_idx" ON "PaymentReconciliation" USING gin ("_profile");
CREATE INDEX "PaymentReconciliation___version_idx" ON "PaymentReconciliation" ("__version");
CREATE INDEX "PaymentReconciliation_compartments_idx" ON "PaymentReconciliation" USING gin ("compartments");
CREATE INDEX "PaymentReconciliation___sharedTokens_idx" ON "PaymentReconciliation" USING gin ("__sharedTokens");
CREATE INDEX "PaymentReconciliation___sharedTokensTextTrgm_idx" ON "PaymentReconciliation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "PaymentReconciliation____tag_idx" ON "PaymentReconciliation" USING gin ("___tag");
CREATE INDEX "PaymentReconciliation____tagTextTrgm_idx" ON "PaymentReconciliation" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "PaymentReconciliation_created_idx" ON "PaymentReconciliation" ("created");
CREATE INDEX "PaymentReconciliation_disposition_idx" ON "PaymentReconciliation" ("disposition");
CREATE INDEX "PaymentReconciliation___idnt_idx" ON "PaymentReconciliation" USING gin ("__identifier");
CREATE INDEX "PaymentReconciliation___idntTextTrgm_idx" ON "PaymentReconciliation" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "PaymentReconciliation_outcome_idx" ON "PaymentReconciliation" ("outcome");
CREATE INDEX "PaymentReconciliation_paymentIssuer_idx" ON "PaymentReconciliation" ("paymentIssuer");
CREATE INDEX "PaymentReconciliation_request_idx" ON "PaymentReconciliation" ("request");
CREATE INDEX "PaymentReconciliation_requestor_idx" ON "PaymentReconciliation" ("requestor");
CREATE INDEX "PaymentReconciliation_status_idx" ON "PaymentReconciliation" ("status");

CREATE TABLE  "PaymentReconciliation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "PaymentReconciliation_History_id_idx" ON "PaymentReconciliation_History" ("id");
CREATE INDEX "PaymentReconciliation_History_lastUpdated_idx" ON "PaymentReconciliation_History" ("lastUpdated");

CREATE TABLE  "PaymentReconciliation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "PaymentReconciliation_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "PaymentReconciliation_Refs_targetId_code_idx" ON "PaymentReconciliation_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Person" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "birthdate" DATE,
  "__email" UUID[],
  "__emailText" TEXT[],
  "__emailSort" TEXT,
  "gender" TEXT,
  "__phone" UUID[],
  "__phoneText" TEXT[],
  "__phoneSort" TEXT,
  "phonetic" TEXT[],
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "link" TEXT[],
  "organization" TEXT,
  "patient" TEXT[],
  "practitioner" TEXT[],
  "relatedperson" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__linkIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__practitionerIdentifierSort" TEXT,
  "__relatedpersonIdentifierSort" TEXT
);
CREATE INDEX "Person_lastUpdated_idx" ON "Person" ("lastUpdated");
CREATE INDEX "Person_projectId_lastUpdated_idx" ON "Person" ("projectId", "lastUpdated");
CREATE INDEX "Person_projectId_idx" ON "Person" ("projectId");
CREATE INDEX "Person__source_idx" ON "Person" ("_source");
CREATE INDEX "Person__profile_idx" ON "Person" USING gin ("_profile");
CREATE INDEX "Person___version_idx" ON "Person" ("__version");
CREATE INDEX "Person_compartments_idx" ON "Person" USING gin ("compartments");
CREATE INDEX "Person___sharedTokens_idx" ON "Person" USING gin ("__sharedTokens");
CREATE INDEX "Person___sharedTokensTextTrgm_idx" ON "Person" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Person____tag_idx" ON "Person" USING gin ("___tag");
CREATE INDEX "Person____tagTextTrgm_idx" ON "Person" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Person_birthdate_idx" ON "Person" ("birthdate");
CREATE INDEX "Person___email_idx" ON "Person" USING gin ("__email");
CREATE INDEX "Person___emailTextTrgm_idx" ON "Person" USING gin (token_array_to_text("__emailText") gin_trgm_ops);
CREATE INDEX "Person_gender_idx" ON "Person" ("gender");
CREATE INDEX "Person___phone_idx" ON "Person" USING gin ("__phone");
CREATE INDEX "Person___phoneTextTrgm_idx" ON "Person" USING gin (token_array_to_text("__phoneText") gin_trgm_ops);
CREATE INDEX "Person_phonetic_idx" ON "Person" USING gin ("phonetic");
CREATE INDEX "Person___telecom_idx" ON "Person" USING gin ("__telecom");
CREATE INDEX "Person___telecomTextTrgm_idx" ON "Person" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);
CREATE INDEX "Person___idnt_idx" ON "Person" USING gin ("__identifier");
CREATE INDEX "Person___idntTextTrgm_idx" ON "Person" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Person_link_idx" ON "Person" USING gin ("link");
CREATE INDEX "Person_organization_idx" ON "Person" ("organization");
CREATE INDEX "Person_patient_idx" ON "Person" USING gin ("patient");
CREATE INDEX "Person_practitioner_idx" ON "Person" USING gin ("practitioner");
CREATE INDEX "Person_relatedperson_idx" ON "Person" USING gin ("relatedperson");

CREATE TABLE  "Person_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Person_History_id_idx" ON "Person_History" ("id");
CREATE INDEX "Person_History_lastUpdated_idx" ON "Person_History" ("lastUpdated");

CREATE TABLE  "Person_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Person_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Person_Refs_targetId_code_idx" ON "Person_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "PlanDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "definition" TEXT[],
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__definitionIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "PlanDefinition_lastUpdated_idx" ON "PlanDefinition" ("lastUpdated");
CREATE INDEX "PlanDefinition_projectId_lastUpdated_idx" ON "PlanDefinition" ("projectId", "lastUpdated");
CREATE INDEX "PlanDefinition_projectId_idx" ON "PlanDefinition" ("projectId");
CREATE INDEX "PlanDefinition__source_idx" ON "PlanDefinition" ("_source");
CREATE INDEX "PlanDefinition__profile_idx" ON "PlanDefinition" USING gin ("_profile");
CREATE INDEX "PlanDefinition___version_idx" ON "PlanDefinition" ("__version");
CREATE INDEX "PlanDefinition_compartments_idx" ON "PlanDefinition" USING gin ("compartments");
CREATE INDEX "PlanDefinition___sharedTokens_idx" ON "PlanDefinition" USING gin ("__sharedTokens");
CREATE INDEX "PlanDefinition___sharedTokensTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "PlanDefinition____tag_idx" ON "PlanDefinition" USING gin ("___tag");
CREATE INDEX "PlanDefinition____tagTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "PlanDefinition_composedOf_idx" ON "PlanDefinition" USING gin ("composedOf");
CREATE INDEX "PlanDefinition___context_idx" ON "PlanDefinition" USING gin ("__context");
CREATE INDEX "PlanDefinition___contextTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "PlanDefinition_contextQuantity_idx" ON "PlanDefinition" USING gin ("contextQuantity");
CREATE INDEX "PlanDefinition___contextType_idx" ON "PlanDefinition" USING gin ("__contextType");
CREATE INDEX "PlanDefinition___contextTypeTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "PlanDefinition_date_idx" ON "PlanDefinition" ("date");
CREATE INDEX "PlanDefinition_projectId_date_idx" ON "PlanDefinition" ("projectId", "date");
CREATE INDEX "PlanDefinition_definition_idx" ON "PlanDefinition" USING gin ("definition");
CREATE INDEX "PlanDefinition_dependsOn_idx" ON "PlanDefinition" USING gin ("dependsOn");
CREATE INDEX "PlanDefinition_derivedFrom_idx" ON "PlanDefinition" USING gin ("derivedFrom");
CREATE INDEX "PlanDefinition_description_idx" ON "PlanDefinition" ("description");
CREATE INDEX "PlanDefinition_effective_idx" ON "PlanDefinition" ("effective");
CREATE INDEX "PlanDefinition___idnt_idx" ON "PlanDefinition" USING gin ("__identifier");
CREATE INDEX "PlanDefinition___idntTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "PlanDefinition___jurisdiction_idx" ON "PlanDefinition" USING gin ("__jurisdiction");
CREATE INDEX "PlanDefinition___jurisdictionTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "PlanDefinition_name_idx" ON "PlanDefinition" ("name");
CREATE INDEX "PlanDefinition_predecessor_idx" ON "PlanDefinition" USING gin ("predecessor");
CREATE INDEX "PlanDefinition_publisher_idx" ON "PlanDefinition" ("publisher");
CREATE INDEX "PlanDefinition_status_idx" ON "PlanDefinition" ("status");
CREATE INDEX "PlanDefinition_successor_idx" ON "PlanDefinition" USING gin ("successor");
CREATE INDEX "PlanDefinition_title_idx" ON "PlanDefinition" ("title");
CREATE INDEX "PlanDefinition___topic_idx" ON "PlanDefinition" USING gin ("__topic");
CREATE INDEX "PlanDefinition___topicTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "PlanDefinition___type_idx" ON "PlanDefinition" USING gin ("__type");
CREATE INDEX "PlanDefinition___typeTextTrgm_idx" ON "PlanDefinition" USING gin (token_array_to_text("__typeText") gin_trgm_ops);
CREATE INDEX "PlanDefinition_url_idx" ON "PlanDefinition" ("url");
CREATE INDEX "PlanDefinition_version_idx" ON "PlanDefinition" ("version");

CREATE TABLE  "PlanDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "PlanDefinition_History_id_idx" ON "PlanDefinition_History" ("id");
CREATE INDEX "PlanDefinition_History_lastUpdated_idx" ON "PlanDefinition_History" ("lastUpdated");

CREATE TABLE  "PlanDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "PlanDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "PlanDefinition_Refs_targetId_code_idx" ON "PlanDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Practitioner" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__email" UUID[],
  "__emailText" TEXT[],
  "__emailSort" TEXT,
  "gender" TEXT,
  "__phone" UUID[],
  "__phoneText" TEXT[],
  "__phoneSort" TEXT,
  "phonetic" TEXT[],
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "active" BOOLEAN,
  "__communication" UUID[],
  "__communicationText" TEXT[],
  "__communicationSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__qualificationCode" UUID[],
  "__qualificationCodeText" TEXT[],
  "__qualificationCodeSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "Practitioner_lastUpdated_idx" ON "Practitioner" ("lastUpdated");
CREATE INDEX "Practitioner_projectId_lastUpdated_idx" ON "Practitioner" ("projectId", "lastUpdated");
CREATE INDEX "Practitioner_projectId_idx" ON "Practitioner" ("projectId");
CREATE INDEX "Practitioner__source_idx" ON "Practitioner" ("_source");
CREATE INDEX "Practitioner__profile_idx" ON "Practitioner" USING gin ("_profile");
CREATE INDEX "Practitioner___version_idx" ON "Practitioner" ("__version");
CREATE INDEX "Practitioner_compartments_idx" ON "Practitioner" USING gin ("compartments");
CREATE INDEX "Practitioner___sharedTokens_idx" ON "Practitioner" USING gin ("__sharedTokens");
CREATE INDEX "Practitioner___sharedTokensTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Practitioner____tag_idx" ON "Practitioner" USING gin ("___tag");
CREATE INDEX "Practitioner____tagTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Practitioner___email_idx" ON "Practitioner" USING gin ("__email");
CREATE INDEX "Practitioner___emailTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__emailText") gin_trgm_ops);
CREATE INDEX "Practitioner_gender_idx" ON "Practitioner" ("gender");
CREATE INDEX "Practitioner___phone_idx" ON "Practitioner" USING gin ("__phone");
CREATE INDEX "Practitioner___phoneTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__phoneText") gin_trgm_ops);
CREATE INDEX "Practitioner_phonetic_idx" ON "Practitioner" USING gin ("phonetic");
CREATE INDEX "Practitioner___telecom_idx" ON "Practitioner" USING gin ("__telecom");
CREATE INDEX "Practitioner___telecomTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);
CREATE INDEX "Practitioner_active_idx" ON "Practitioner" ("active");
CREATE INDEX "Practitioner___communication_idx" ON "Practitioner" USING gin ("__communication");
CREATE INDEX "Practitioner___communicationTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__communicationText") gin_trgm_ops);
CREATE INDEX "Practitioner___idnt_idx" ON "Practitioner" USING gin ("__identifier");
CREATE INDEX "Practitioner___idntTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Practitioner___qualificationCode_idx" ON "Practitioner" USING gin ("__qualificationCode");
CREATE INDEX "Practitioner___qualificationCodeTextTrgm_idx" ON "Practitioner" USING gin (token_array_to_text("__qualificationCodeText") gin_trgm_ops);

CREATE TABLE  "Practitioner_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Practitioner_History_id_idx" ON "Practitioner_History" ("id");
CREATE INDEX "Practitioner_History_lastUpdated_idx" ON "Practitioner_History" ("lastUpdated");

CREATE TABLE  "Practitioner_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Practitioner_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Practitioner_Refs_targetId_code_idx" ON "Practitioner_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "PractitionerRole" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__email" UUID[],
  "__emailText" TEXT[],
  "__emailSort" TEXT,
  "__phone" UUID[],
  "__phoneText" TEXT[],
  "__phoneSort" TEXT,
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "active" BOOLEAN,
  "date" TIMESTAMPTZ,
  "endpoint" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "location" TEXT[],
  "organization" TEXT,
  "practitioner" TEXT,
  "__role" UUID[],
  "__roleText" TEXT[],
  "__roleSort" TEXT,
  "service" TEXT[],
  "__specialty" UUID[],
  "__specialtyText" TEXT[],
  "__specialtySort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__endpointIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__organizationIdentifierSort" TEXT,
  "__practitionerIdentifierSort" TEXT,
  "__serviceIdentifierSort" TEXT
);
CREATE INDEX "PractitionerRole_lastUpdated_idx" ON "PractitionerRole" ("lastUpdated");
CREATE INDEX "PractitionerRole_projectId_lastUpdated_idx" ON "PractitionerRole" ("projectId", "lastUpdated");
CREATE INDEX "PractitionerRole_projectId_idx" ON "PractitionerRole" ("projectId");
CREATE INDEX "PractitionerRole__source_idx" ON "PractitionerRole" ("_source");
CREATE INDEX "PractitionerRole__profile_idx" ON "PractitionerRole" USING gin ("_profile");
CREATE INDEX "PractitionerRole___version_idx" ON "PractitionerRole" ("__version");
CREATE INDEX "PractitionerRole_compartments_idx" ON "PractitionerRole" USING gin ("compartments");
CREATE INDEX "PractitionerRole___sharedTokens_idx" ON "PractitionerRole" USING gin ("__sharedTokens");
CREATE INDEX "PractitionerRole___sharedTokensTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "PractitionerRole____tag_idx" ON "PractitionerRole" USING gin ("___tag");
CREATE INDEX "PractitionerRole____tagTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "PractitionerRole___email_idx" ON "PractitionerRole" USING gin ("__email");
CREATE INDEX "PractitionerRole___emailTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__emailText") gin_trgm_ops);
CREATE INDEX "PractitionerRole___phone_idx" ON "PractitionerRole" USING gin ("__phone");
CREATE INDEX "PractitionerRole___phoneTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__phoneText") gin_trgm_ops);
CREATE INDEX "PractitionerRole___telecom_idx" ON "PractitionerRole" USING gin ("__telecom");
CREATE INDEX "PractitionerRole___telecomTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);
CREATE INDEX "PractitionerRole_active_idx" ON "PractitionerRole" ("active");
CREATE INDEX "PractitionerRole_date_idx" ON "PractitionerRole" ("date");
CREATE INDEX "PractitionerRole_projectId_date_idx" ON "PractitionerRole" ("projectId", "date");
CREATE INDEX "PractitionerRole_endpoint_idx" ON "PractitionerRole" USING gin ("endpoint");
CREATE INDEX "PractitionerRole___idnt_idx" ON "PractitionerRole" USING gin ("__identifier");
CREATE INDEX "PractitionerRole___idntTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "PractitionerRole_location_idx" ON "PractitionerRole" USING gin ("location");
CREATE INDEX "PractitionerRole_organization_idx" ON "PractitionerRole" ("organization");
CREATE INDEX "PractitionerRole_practitioner_idx" ON "PractitionerRole" ("practitioner");
CREATE INDEX "PractitionerRole___role_idx" ON "PractitionerRole" USING gin ("__role");
CREATE INDEX "PractitionerRole___roleTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__roleText") gin_trgm_ops);
CREATE INDEX "PractitionerRole_service_idx" ON "PractitionerRole" USING gin ("service");
CREATE INDEX "PractitionerRole___specialty_idx" ON "PractitionerRole" USING gin ("__specialty");
CREATE INDEX "PractitionerRole___specialtyTextTrgm_idx" ON "PractitionerRole" USING gin (token_array_to_text("__specialtyText") gin_trgm_ops);

CREATE TABLE  "PractitionerRole_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "PractitionerRole_History_id_idx" ON "PractitionerRole_History" ("id");
CREATE INDEX "PractitionerRole_History_lastUpdated_idx" ON "PractitionerRole_History" ("lastUpdated");

CREATE TABLE  "PractitionerRole_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "PractitionerRole_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "PractitionerRole_Refs_targetId_code_idx" ON "PractitionerRole_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Procedure" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "basedOn" TEXT[],
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "location" TEXT,
  "partOf" TEXT[],
  "performer" TEXT[],
  "__reasonCode" UUID[],
  "__reasonCodeText" TEXT[],
  "__reasonCodeSort" TEXT,
  "reasonReference" TEXT[],
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__reasonReferenceIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Procedure_lastUpdated_idx" ON "Procedure" ("lastUpdated");
CREATE INDEX "Procedure_projectId_lastUpdated_idx" ON "Procedure" ("projectId", "lastUpdated");
CREATE INDEX "Procedure_projectId_idx" ON "Procedure" ("projectId");
CREATE INDEX "Procedure__source_idx" ON "Procedure" ("_source");
CREATE INDEX "Procedure__profile_idx" ON "Procedure" USING gin ("_profile");
CREATE INDEX "Procedure___version_idx" ON "Procedure" ("__version");
CREATE INDEX "Procedure_compartments_idx" ON "Procedure" USING gin ("compartments");
CREATE INDEX "Procedure___sharedTokens_idx" ON "Procedure" USING gin ("__sharedTokens");
CREATE INDEX "Procedure___sharedTokensTextTrgm_idx" ON "Procedure" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Procedure____tag_idx" ON "Procedure" USING gin ("___tag");
CREATE INDEX "Procedure____tagTextTrgm_idx" ON "Procedure" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Procedure___code_idx" ON "Procedure" USING gin ("__code");
CREATE INDEX "Procedure___codeTextTrgm_idx" ON "Procedure" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Procedure_date_idx" ON "Procedure" ("date");
CREATE INDEX "Procedure_projectId_date_idx" ON "Procedure" ("projectId", "date");
CREATE INDEX "Procedure___idnt_idx" ON "Procedure" USING gin ("__identifier");
CREATE INDEX "Procedure___idntTextTrgm_idx" ON "Procedure" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Procedure_patient_idx" ON "Procedure" ("patient");
CREATE INDEX "Procedure_encounter_idx" ON "Procedure" ("encounter");
CREATE INDEX "Procedure_basedOn_idx" ON "Procedure" USING gin ("basedOn");
CREATE INDEX "Procedure___category_idx" ON "Procedure" USING gin ("__category");
CREATE INDEX "Procedure___categoryTextTrgm_idx" ON "Procedure" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Procedure_instantiatesCanonical_idx" ON "Procedure" USING gin ("instantiatesCanonical");
CREATE INDEX "Procedure_instantiatesUri_idx" ON "Procedure" USING gin ("instantiatesUri");
CREATE INDEX "Procedure_location_idx" ON "Procedure" ("location");
CREATE INDEX "Procedure_partOf_idx" ON "Procedure" USING gin ("partOf");
CREATE INDEX "Procedure_performer_idx" ON "Procedure" USING gin ("performer");
CREATE INDEX "Procedure___reasonCode_idx" ON "Procedure" USING gin ("__reasonCode");
CREATE INDEX "Procedure___reasonCodeTextTrgm_idx" ON "Procedure" USING gin (token_array_to_text("__reasonCodeText") gin_trgm_ops);
CREATE INDEX "Procedure_reasonReference_idx" ON "Procedure" USING gin ("reasonReference");
CREATE INDEX "Procedure_status_idx" ON "Procedure" ("status");
CREATE INDEX "Procedure_subject_idx" ON "Procedure" ("subject");

CREATE TABLE  "Procedure_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Procedure_History_id_idx" ON "Procedure_History" ("id");
CREATE INDEX "Procedure_History_lastUpdated_idx" ON "Procedure_History" ("lastUpdated");

CREATE TABLE  "Procedure_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Procedure_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Procedure_Refs_targetId_code_idx" ON "Procedure_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Provenance" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "agent" TEXT[],
  "__agentRole" UUID[],
  "__agentRoleText" TEXT[],
  "__agentRoleSort" TEXT,
  "__agentType" UUID[],
  "__agentTypeText" TEXT[],
  "__agentTypeSort" TEXT,
  "entity" TEXT[],
  "location" TEXT,
  "patient" TEXT[],
  "recorded" TIMESTAMPTZ,
  "__signatureType" UUID[],
  "__signatureTypeText" TEXT[],
  "__signatureTypeSort" TEXT,
  "target" TEXT[],
  "when" TIMESTAMPTZ,
  "___compartmentIdentifierSort" TEXT,
  "__agentIdentifierSort" TEXT,
  "__entityIdentifierSort" TEXT,
  "__locationIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__targetIdentifierSort" TEXT
);
CREATE INDEX "Provenance_lastUpdated_idx" ON "Provenance" ("lastUpdated");
CREATE INDEX "Provenance_projectId_lastUpdated_idx" ON "Provenance" ("projectId", "lastUpdated");
CREATE INDEX "Provenance_projectId_idx" ON "Provenance" ("projectId");
CREATE INDEX "Provenance__source_idx" ON "Provenance" ("_source");
CREATE INDEX "Provenance__profile_idx" ON "Provenance" USING gin ("_profile");
CREATE INDEX "Provenance___version_idx" ON "Provenance" ("__version");
CREATE INDEX "Provenance_compartments_idx" ON "Provenance" USING gin ("compartments");
CREATE INDEX "Provenance___sharedTokens_idx" ON "Provenance" USING gin ("__sharedTokens");
CREATE INDEX "Provenance___sharedTokensTextTrgm_idx" ON "Provenance" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Provenance____tag_idx" ON "Provenance" USING gin ("___tag");
CREATE INDEX "Provenance____tagTextTrgm_idx" ON "Provenance" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Provenance_agent_idx" ON "Provenance" USING gin ("agent");
CREATE INDEX "Provenance___agentRole_idx" ON "Provenance" USING gin ("__agentRole");
CREATE INDEX "Provenance___agentRoleTextTrgm_idx" ON "Provenance" USING gin (token_array_to_text("__agentRoleText") gin_trgm_ops);
CREATE INDEX "Provenance___agentType_idx" ON "Provenance" USING gin ("__agentType");
CREATE INDEX "Provenance___agentTypeTextTrgm_idx" ON "Provenance" USING gin (token_array_to_text("__agentTypeText") gin_trgm_ops);
CREATE INDEX "Provenance_entity_idx" ON "Provenance" USING gin ("entity");
CREATE INDEX "Provenance_location_idx" ON "Provenance" ("location");
CREATE INDEX "Provenance_patient_idx" ON "Provenance" USING gin ("patient");
CREATE INDEX "Provenance_recorded_idx" ON "Provenance" ("recorded");
CREATE INDEX "Provenance___signatureType_idx" ON "Provenance" USING gin ("__signatureType");
CREATE INDEX "Provenance___signatureTypeTextTrgm_idx" ON "Provenance" USING gin (token_array_to_text("__signatureTypeText") gin_trgm_ops);
CREATE INDEX "Provenance_target_idx" ON "Provenance" USING gin ("target");
CREATE INDEX "Provenance_when_idx" ON "Provenance" ("when");

CREATE TABLE  "Provenance_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Provenance_History_id_idx" ON "Provenance_History" ("id");
CREATE INDEX "Provenance_History_lastUpdated_idx" ON "Provenance_History" ("lastUpdated");

CREATE TABLE  "Provenance_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Provenance_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Provenance_Refs_targetId_code_idx" ON "Provenance_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Questionnaire" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "definition" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "subjectType" TEXT[],
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "Questionnaire_lastUpdated_idx" ON "Questionnaire" ("lastUpdated");
CREATE INDEX "Questionnaire_projectId_lastUpdated_idx" ON "Questionnaire" ("projectId", "lastUpdated");
CREATE INDEX "Questionnaire_projectId_idx" ON "Questionnaire" ("projectId");
CREATE INDEX "Questionnaire__source_idx" ON "Questionnaire" ("_source");
CREATE INDEX "Questionnaire__profile_idx" ON "Questionnaire" USING gin ("_profile");
CREATE INDEX "Questionnaire___version_idx" ON "Questionnaire" ("__version");
CREATE INDEX "Questionnaire_compartments_idx" ON "Questionnaire" USING gin ("compartments");
CREATE INDEX "Questionnaire___sharedTokens_idx" ON "Questionnaire" USING gin ("__sharedTokens");
CREATE INDEX "Questionnaire___sharedTokensTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Questionnaire____tag_idx" ON "Questionnaire" USING gin ("___tag");
CREATE INDEX "Questionnaire____tagTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Questionnaire___code_idx" ON "Questionnaire" USING gin ("__code");
CREATE INDEX "Questionnaire___codeTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Questionnaire___context_idx" ON "Questionnaire" USING gin ("__context");
CREATE INDEX "Questionnaire___contextTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "Questionnaire_contextQuantity_idx" ON "Questionnaire" USING gin ("contextQuantity");
CREATE INDEX "Questionnaire___contextType_idx" ON "Questionnaire" USING gin ("__contextType");
CREATE INDEX "Questionnaire___contextTypeTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "Questionnaire_date_idx" ON "Questionnaire" ("date");
CREATE INDEX "Questionnaire_projectId_date_idx" ON "Questionnaire" ("projectId", "date");
CREATE INDEX "Questionnaire_definition_idx" ON "Questionnaire" USING gin ("definition");
CREATE INDEX "Questionnaire_description_idx" ON "Questionnaire" ("description");
CREATE INDEX "Questionnaire_effective_idx" ON "Questionnaire" ("effective");
CREATE INDEX "Questionnaire___idnt_idx" ON "Questionnaire" USING gin ("__identifier");
CREATE INDEX "Questionnaire___idntTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Questionnaire___jurisdiction_idx" ON "Questionnaire" USING gin ("__jurisdiction");
CREATE INDEX "Questionnaire___jurisdictionTextTrgm_idx" ON "Questionnaire" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "Questionnaire_name_idx" ON "Questionnaire" ("name");
CREATE INDEX "Questionnaire_publisher_idx" ON "Questionnaire" ("publisher");
CREATE INDEX "Questionnaire_status_idx" ON "Questionnaire" ("status");
CREATE INDEX "Questionnaire_subjectType_idx" ON "Questionnaire" USING gin ("subjectType");
CREATE INDEX "Questionnaire_title_idx" ON "Questionnaire" ("title");
CREATE INDEX "Questionnaire_url_idx" ON "Questionnaire" ("url");
CREATE INDEX "Questionnaire_version_idx" ON "Questionnaire" ("version");

CREATE TABLE  "Questionnaire_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Questionnaire_History_id_idx" ON "Questionnaire_History" ("id");
CREATE INDEX "Questionnaire_History_lastUpdated_idx" ON "Questionnaire_History" ("lastUpdated");

CREATE TABLE  "Questionnaire_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Questionnaire_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Questionnaire_Refs_targetId_code_idx" ON "Questionnaire_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "QuestionnaireResponse" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "author" TEXT,
  "authored" TIMESTAMPTZ,
  "basedOn" TEXT[],
  "encounter" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "partOf" TEXT[],
  "patient" TEXT,
  "questionnaire" TEXT,
  "source" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__questionnaireIdentifierSort" TEXT,
  "__sourceIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "QuestionnaireResponse_lastUpdated_idx" ON "QuestionnaireResponse" ("lastUpdated");
CREATE INDEX "QuestionnaireResponse_projectId_lastUpdated_idx" ON "QuestionnaireResponse" ("projectId", "lastUpdated");
CREATE INDEX "QuestionnaireResponse_projectId_idx" ON "QuestionnaireResponse" ("projectId");
CREATE INDEX "QuestionnaireResponse__source_idx" ON "QuestionnaireResponse" ("_source");
CREATE INDEX "QuestionnaireResponse__profile_idx" ON "QuestionnaireResponse" USING gin ("_profile");
CREATE INDEX "QuestionnaireResponse___version_idx" ON "QuestionnaireResponse" ("__version");
CREATE INDEX "QuestionnaireResponse_compartments_idx" ON "QuestionnaireResponse" USING gin ("compartments");
CREATE INDEX "QuestionnaireResponse___sharedTokens_idx" ON "QuestionnaireResponse" USING gin ("__sharedTokens");
CREATE INDEX "QuestionnaireResponse___sharedTokensTextTrgm_idx" ON "QuestionnaireResponse" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "QuestionnaireResponse____tag_idx" ON "QuestionnaireResponse" USING gin ("___tag");
CREATE INDEX "QuestionnaireResponse____tagTextTrgm_idx" ON "QuestionnaireResponse" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "QuestionnaireResponse_author_idx" ON "QuestionnaireResponse" ("author");
CREATE INDEX "QuestionnaireResponse_authored_idx" ON "QuestionnaireResponse" ("authored");
CREATE INDEX "QuestionnaireResponse_basedOn_idx" ON "QuestionnaireResponse" USING gin ("basedOn");
CREATE INDEX "QuestionnaireResponse_encounter_idx" ON "QuestionnaireResponse" ("encounter");
CREATE INDEX "QuestionnaireResponse___idnt_idx" ON "QuestionnaireResponse" USING gin ("__identifier");
CREATE INDEX "QuestionnaireResponse___idntTextTrgm_idx" ON "QuestionnaireResponse" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "QuestionnaireResponse_partOf_idx" ON "QuestionnaireResponse" USING gin ("partOf");
CREATE INDEX "QuestionnaireResponse_patient_idx" ON "QuestionnaireResponse" ("patient");
CREATE INDEX "QuestionnaireResponse_questionnaire_idx" ON "QuestionnaireResponse" ("questionnaire");
CREATE INDEX "QuestionnaireResponse_source_idx" ON "QuestionnaireResponse" ("source");
CREATE INDEX "QuestionnaireResponse_status_idx" ON "QuestionnaireResponse" ("status");
CREATE INDEX "QuestionnaireResponse_subject_idx" ON "QuestionnaireResponse" ("subject");

CREATE TABLE  "QuestionnaireResponse_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "QuestionnaireResponse_History_id_idx" ON "QuestionnaireResponse_History" ("id");
CREATE INDEX "QuestionnaireResponse_History_lastUpdated_idx" ON "QuestionnaireResponse_History" ("lastUpdated");

CREATE TABLE  "QuestionnaireResponse_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "QuestionnaireResponse_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "QuestionnaireResponse_Refs_targetId_code_idx" ON "QuestionnaireResponse_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "RelatedPerson" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "birthdate" DATE,
  "__email" UUID[],
  "__emailText" TEXT[],
  "__emailSort" TEXT,
  "gender" TEXT,
  "__phone" UUID[],
  "__phoneText" TEXT[],
  "__phoneSort" TEXT,
  "phonetic" TEXT[],
  "__telecom" UUID[],
  "__telecomText" TEXT[],
  "__telecomSort" TEXT,
  "active" BOOLEAN,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "__relationship" UUID[],
  "__relationshipText" TEXT[],
  "__relationshipSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT
);
CREATE INDEX "RelatedPerson_lastUpdated_idx" ON "RelatedPerson" ("lastUpdated");
CREATE INDEX "RelatedPerson_projectId_lastUpdated_idx" ON "RelatedPerson" ("projectId", "lastUpdated");
CREATE INDEX "RelatedPerson_projectId_idx" ON "RelatedPerson" ("projectId");
CREATE INDEX "RelatedPerson__source_idx" ON "RelatedPerson" ("_source");
CREATE INDEX "RelatedPerson__profile_idx" ON "RelatedPerson" USING gin ("_profile");
CREATE INDEX "RelatedPerson___version_idx" ON "RelatedPerson" ("__version");
CREATE INDEX "RelatedPerson_compartments_idx" ON "RelatedPerson" USING gin ("compartments");
CREATE INDEX "RelatedPerson___sharedTokens_idx" ON "RelatedPerson" USING gin ("__sharedTokens");
CREATE INDEX "RelatedPerson___sharedTokensTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "RelatedPerson____tag_idx" ON "RelatedPerson" USING gin ("___tag");
CREATE INDEX "RelatedPerson____tagTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "RelatedPerson_birthdate_idx" ON "RelatedPerson" ("birthdate");
CREATE INDEX "RelatedPerson___email_idx" ON "RelatedPerson" USING gin ("__email");
CREATE INDEX "RelatedPerson___emailTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("__emailText") gin_trgm_ops);
CREATE INDEX "RelatedPerson_gender_idx" ON "RelatedPerson" ("gender");
CREATE INDEX "RelatedPerson___phone_idx" ON "RelatedPerson" USING gin ("__phone");
CREATE INDEX "RelatedPerson___phoneTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("__phoneText") gin_trgm_ops);
CREATE INDEX "RelatedPerson_phonetic_idx" ON "RelatedPerson" USING gin ("phonetic");
CREATE INDEX "RelatedPerson___telecom_idx" ON "RelatedPerson" USING gin ("__telecom");
CREATE INDEX "RelatedPerson___telecomTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("__telecomText") gin_trgm_ops);
CREATE INDEX "RelatedPerson_active_idx" ON "RelatedPerson" ("active");
CREATE INDEX "RelatedPerson___idnt_idx" ON "RelatedPerson" USING gin ("__identifier");
CREATE INDEX "RelatedPerson___idntTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "RelatedPerson_patient_idx" ON "RelatedPerson" ("patient");
CREATE INDEX "RelatedPerson___relationship_idx" ON "RelatedPerson" USING gin ("__relationship");
CREATE INDEX "RelatedPerson___relationshipTextTrgm_idx" ON "RelatedPerson" USING gin (token_array_to_text("__relationshipText") gin_trgm_ops);

CREATE TABLE  "RelatedPerson_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "RelatedPerson_History_id_idx" ON "RelatedPerson_History" ("id");
CREATE INDEX "RelatedPerson_History_lastUpdated_idx" ON "RelatedPerson_History" ("lastUpdated");

CREATE TABLE  "RelatedPerson_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "RelatedPerson_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "RelatedPerson_Refs_targetId_code_idx" ON "RelatedPerson_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "RequestGroup" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "author" TEXT,
  "authored" TIMESTAMPTZ,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "encounter" TEXT,
  "__groupIdentifier" UUID[],
  "__groupIdentifierText" TEXT[],
  "__groupIdentifierSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "intent" TEXT,
  "participant" TEXT[],
  "patient" TEXT,
  "priority" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "priorityOrder" INTEGER,
  "___compartmentIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__participantIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "RequestGroup_lastUpdated_idx" ON "RequestGroup" ("lastUpdated");
CREATE INDEX "RequestGroup_projectId_lastUpdated_idx" ON "RequestGroup" ("projectId", "lastUpdated");
CREATE INDEX "RequestGroup_projectId_idx" ON "RequestGroup" ("projectId");
CREATE INDEX "RequestGroup__source_idx" ON "RequestGroup" ("_source");
CREATE INDEX "RequestGroup__profile_idx" ON "RequestGroup" USING gin ("_profile");
CREATE INDEX "RequestGroup___version_idx" ON "RequestGroup" ("__version");
CREATE INDEX "RequestGroup_compartments_idx" ON "RequestGroup" USING gin ("compartments");
CREATE INDEX "RequestGroup___sharedTokens_idx" ON "RequestGroup" USING gin ("__sharedTokens");
CREATE INDEX "RequestGroup___sharedTokensTextTrgm_idx" ON "RequestGroup" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "RequestGroup____tag_idx" ON "RequestGroup" USING gin ("___tag");
CREATE INDEX "RequestGroup____tagTextTrgm_idx" ON "RequestGroup" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "RequestGroup_author_idx" ON "RequestGroup" ("author");
CREATE INDEX "RequestGroup_authored_idx" ON "RequestGroup" ("authored");
CREATE INDEX "RequestGroup___code_idx" ON "RequestGroup" USING gin ("__code");
CREATE INDEX "RequestGroup___codeTextTrgm_idx" ON "RequestGroup" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "RequestGroup_encounter_idx" ON "RequestGroup" ("encounter");
CREATE INDEX "RequestGroup___groupIdnt_idx" ON "RequestGroup" USING gin ("__groupIdentifier");
CREATE INDEX "RequestGroup___groupIdntTextTrgm_idx" ON "RequestGroup" USING gin (token_array_to_text("__groupIdentifierText") gin_trgm_ops);
CREATE INDEX "RequestGroup___idnt_idx" ON "RequestGroup" USING gin ("__identifier");
CREATE INDEX "RequestGroup___idntTextTrgm_idx" ON "RequestGroup" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "RequestGroup_instantiatesCanonical_idx" ON "RequestGroup" USING gin ("instantiatesCanonical");
CREATE INDEX "RequestGroup_instantiatesUri_idx" ON "RequestGroup" USING gin ("instantiatesUri");
CREATE INDEX "RequestGroup_intent_idx" ON "RequestGroup" ("intent");
CREATE INDEX "RequestGroup_participant_idx" ON "RequestGroup" USING gin ("participant");
CREATE INDEX "RequestGroup_patient_idx" ON "RequestGroup" ("patient");
CREATE INDEX "RequestGroup_priority_idx" ON "RequestGroup" ("priority");
CREATE INDEX "RequestGroup_status_idx" ON "RequestGroup" ("status");
CREATE INDEX "RequestGroup_subject_idx" ON "RequestGroup" ("subject");
CREATE INDEX "RequestGroup_priorityOrder_idx" ON "RequestGroup" ("priorityOrder");

CREATE TABLE  "RequestGroup_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "RequestGroup_History_id_idx" ON "RequestGroup_History" ("id");
CREATE INDEX "RequestGroup_History_lastUpdated_idx" ON "RequestGroup_History" ("lastUpdated");

CREATE TABLE  "RequestGroup_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "RequestGroup_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "RequestGroup_Refs_targetId_code_idx" ON "RequestGroup_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ResearchDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "ResearchDefinition_lastUpdated_idx" ON "ResearchDefinition" ("lastUpdated");
CREATE INDEX "ResearchDefinition_projectId_lastUpdated_idx" ON "ResearchDefinition" ("projectId", "lastUpdated");
CREATE INDEX "ResearchDefinition_projectId_idx" ON "ResearchDefinition" ("projectId");
CREATE INDEX "ResearchDefinition__source_idx" ON "ResearchDefinition" ("_source");
CREATE INDEX "ResearchDefinition__profile_idx" ON "ResearchDefinition" USING gin ("_profile");
CREATE INDEX "ResearchDefinition___version_idx" ON "ResearchDefinition" ("__version");
CREATE INDEX "ResearchDefinition_compartments_idx" ON "ResearchDefinition" USING gin ("compartments");
CREATE INDEX "ResearchDefinition___sharedTokens_idx" ON "ResearchDefinition" USING gin ("__sharedTokens");
CREATE INDEX "ResearchDefinition___sharedTokensTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition____tag_idx" ON "ResearchDefinition" USING gin ("___tag");
CREATE INDEX "ResearchDefinition____tagTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition_composedOf_idx" ON "ResearchDefinition" USING gin ("composedOf");
CREATE INDEX "ResearchDefinition___context_idx" ON "ResearchDefinition" USING gin ("__context");
CREATE INDEX "ResearchDefinition___contextTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition_contextQuantity_idx" ON "ResearchDefinition" USING gin ("contextQuantity");
CREATE INDEX "ResearchDefinition___contextType_idx" ON "ResearchDefinition" USING gin ("__contextType");
CREATE INDEX "ResearchDefinition___contextTypeTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition_date_idx" ON "ResearchDefinition" ("date");
CREATE INDEX "ResearchDefinition_projectId_date_idx" ON "ResearchDefinition" ("projectId", "date");
CREATE INDEX "ResearchDefinition_dependsOn_idx" ON "ResearchDefinition" USING gin ("dependsOn");
CREATE INDEX "ResearchDefinition_derivedFrom_idx" ON "ResearchDefinition" USING gin ("derivedFrom");
CREATE INDEX "ResearchDefinition_description_idx" ON "ResearchDefinition" ("description");
CREATE INDEX "ResearchDefinition_effective_idx" ON "ResearchDefinition" ("effective");
CREATE INDEX "ResearchDefinition___idnt_idx" ON "ResearchDefinition" USING gin ("__identifier");
CREATE INDEX "ResearchDefinition___idntTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition___jurisdiction_idx" ON "ResearchDefinition" USING gin ("__jurisdiction");
CREATE INDEX "ResearchDefinition___jurisdictionTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition_name_idx" ON "ResearchDefinition" ("name");
CREATE INDEX "ResearchDefinition_predecessor_idx" ON "ResearchDefinition" USING gin ("predecessor");
CREATE INDEX "ResearchDefinition_publisher_idx" ON "ResearchDefinition" ("publisher");
CREATE INDEX "ResearchDefinition_status_idx" ON "ResearchDefinition" ("status");
CREATE INDEX "ResearchDefinition_successor_idx" ON "ResearchDefinition" USING gin ("successor");
CREATE INDEX "ResearchDefinition_title_idx" ON "ResearchDefinition" ("title");
CREATE INDEX "ResearchDefinition___topic_idx" ON "ResearchDefinition" USING gin ("__topic");
CREATE INDEX "ResearchDefinition___topicTextTrgm_idx" ON "ResearchDefinition" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "ResearchDefinition_url_idx" ON "ResearchDefinition" ("url");
CREATE INDEX "ResearchDefinition_version_idx" ON "ResearchDefinition" ("version");

CREATE TABLE  "ResearchDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ResearchDefinition_History_id_idx" ON "ResearchDefinition_History" ("id");
CREATE INDEX "ResearchDefinition_History_lastUpdated_idx" ON "ResearchDefinition_History" ("lastUpdated");

CREATE TABLE  "ResearchDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ResearchDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ResearchDefinition_Refs_targetId_code_idx" ON "ResearchDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ResearchElementDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "composedOf" TEXT[],
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "dependsOn" TEXT[],
  "derivedFrom" TEXT[],
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "predecessor" TEXT[],
  "publisher" TEXT,
  "status" TEXT,
  "successor" TEXT[],
  "title" TEXT,
  "__topic" UUID[],
  "__topicText" TEXT[],
  "__topicSort" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__composedOfIdentifierSort" TEXT,
  "__dependsOnIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT,
  "__predecessorIdentifierSort" TEXT,
  "__successorIdentifierSort" TEXT
);
CREATE INDEX "ResearchElementDefinition_lastUpdated_idx" ON "ResearchElementDefinition" ("lastUpdated");
CREATE INDEX "ResearchElementDefinition_projectId_lastUpdated_idx" ON "ResearchElementDefinition" ("projectId", "lastUpdated");
CREATE INDEX "ResearchElementDefinition_projectId_idx" ON "ResearchElementDefinition" ("projectId");
CREATE INDEX "ResearchElementDefinition__source_idx" ON "ResearchElementDefinition" ("_source");
CREATE INDEX "ResearchElementDefinition__profile_idx" ON "ResearchElementDefinition" USING gin ("_profile");
CREATE INDEX "ResearchElementDefinition___version_idx" ON "ResearchElementDefinition" ("__version");
CREATE INDEX "ResearchElementDefinition_compartments_idx" ON "ResearchElementDefinition" USING gin ("compartments");
CREATE INDEX "ResearchElementDefinition___sharedTokens_idx" ON "ResearchElementDefinition" USING gin ("__sharedTokens");
CREATE INDEX "ResearchElementDefinition___sharedTokensTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition____tag_idx" ON "ResearchElementDefinition" USING gin ("___tag");
CREATE INDEX "ResearchElementDefinition____tagTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition_composedOf_idx" ON "ResearchElementDefinition" USING gin ("composedOf");
CREATE INDEX "ResearchElementDefinition___context_idx" ON "ResearchElementDefinition" USING gin ("__context");
CREATE INDEX "ResearchElementDefinition___contextTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition_contextQuantity_idx" ON "ResearchElementDefinition" USING gin ("contextQuantity");
CREATE INDEX "ResearchElementDefinition___contextType_idx" ON "ResearchElementDefinition" USING gin ("__contextType");
CREATE INDEX "ResearchElementDefinition___contextTypeTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition_date_idx" ON "ResearchElementDefinition" ("date");
CREATE INDEX "ResearchElementDefinition_projectId_date_idx" ON "ResearchElementDefinition" ("projectId", "date");
CREATE INDEX "ResearchElementDefinition_dependsOn_idx" ON "ResearchElementDefinition" USING gin ("dependsOn");
CREATE INDEX "ResearchElementDefinition_derivedFrom_idx" ON "ResearchElementDefinition" USING gin ("derivedFrom");
CREATE INDEX "ResearchElementDefinition_description_idx" ON "ResearchElementDefinition" ("description");
CREATE INDEX "ResearchElementDefinition_effective_idx" ON "ResearchElementDefinition" ("effective");
CREATE INDEX "ResearchElementDefinition___idnt_idx" ON "ResearchElementDefinition" USING gin ("__identifier");
CREATE INDEX "ResearchElementDefinition___idntTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition___jurisdiction_idx" ON "ResearchElementDefinition" USING gin ("__jurisdiction");
CREATE INDEX "ResearchElementDefinition___jurisdictionTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition_name_idx" ON "ResearchElementDefinition" ("name");
CREATE INDEX "ResearchElementDefinition_predecessor_idx" ON "ResearchElementDefinition" USING gin ("predecessor");
CREATE INDEX "ResearchElementDefinition_publisher_idx" ON "ResearchElementDefinition" ("publisher");
CREATE INDEX "ResearchElementDefinition_status_idx" ON "ResearchElementDefinition" ("status");
CREATE INDEX "ResearchElementDefinition_successor_idx" ON "ResearchElementDefinition" USING gin ("successor");
CREATE INDEX "ResearchElementDefinition_title_idx" ON "ResearchElementDefinition" ("title");
CREATE INDEX "ResearchElementDefinition___topic_idx" ON "ResearchElementDefinition" USING gin ("__topic");
CREATE INDEX "ResearchElementDefinition___topicTextTrgm_idx" ON "ResearchElementDefinition" USING gin (token_array_to_text("__topicText") gin_trgm_ops);
CREATE INDEX "ResearchElementDefinition_url_idx" ON "ResearchElementDefinition" ("url");
CREATE INDEX "ResearchElementDefinition_version_idx" ON "ResearchElementDefinition" ("version");

CREATE TABLE  "ResearchElementDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ResearchElementDefinition_History_id_idx" ON "ResearchElementDefinition_History" ("id");
CREATE INDEX "ResearchElementDefinition_History_lastUpdated_idx" ON "ResearchElementDefinition_History" ("lastUpdated");

CREATE TABLE  "ResearchElementDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ResearchElementDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ResearchElementDefinition_Refs_targetId_code_idx" ON "ResearchElementDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ResearchStudy" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__categorySort" TEXT,
  "date" TIMESTAMPTZ,
  "__focusSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__keyword" UUID[],
  "__keywordText" TEXT[],
  "__keywordSort" TEXT,
  "__locationSort" TEXT,
  "partof" TEXT[],
  "principalinvestigator" TEXT,
  "protocol" TEXT[],
  "site" TEXT[],
  "sponsor" TEXT,
  "status" TEXT,
  "title" TEXT,
  "__classifierSort" TEXT,
  "__condition" UUID[],
  "__conditionText" TEXT[],
  "__conditionSort" TEXT,
  "description" TEXT,
  "eligibility" TEXT,
  "name" TEXT,
  "objectiveDescription" TEXT[],
  "__objectiveTypeSort" TEXT,
  "partOf" TEXT[],
  "__phase" UUID[],
  "__phaseText" TEXT[],
  "__phaseSort" TEXT,
  "recruitmentActual" DOUBLE PRECISION,
  "recruitmentTarget" DOUBLE PRECISION,
  "__regionSort" TEXT,
  "__studyDesign" UUID[],
  "__studyDesignText" TEXT[],
  "__studyDesignSort" TEXT,
  "outcomeMeasureReference" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__partofIdentifierSort" TEXT,
  "__principalinvestigatorIdentifierSort" TEXT,
  "__protocolIdentifierSort" TEXT,
  "__siteIdentifierSort" TEXT,
  "__sponsorIdentifierSort" TEXT,
  "__eligibilityIdentifier" UUID[],
  "__eligibilityIdentifierText" TEXT[],
  "__eligibilityIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__outcomeMeasureReferenceIdentifierSort" TEXT
);
CREATE INDEX "ResearchStudy_lastUpdated_idx" ON "ResearchStudy" ("lastUpdated");
CREATE INDEX "ResearchStudy_projectId_lastUpdated_idx" ON "ResearchStudy" ("projectId", "lastUpdated");
CREATE INDEX "ResearchStudy_projectId_idx" ON "ResearchStudy" ("projectId");
CREATE INDEX "ResearchStudy__source_idx" ON "ResearchStudy" ("_source");
CREATE INDEX "ResearchStudy__profile_idx" ON "ResearchStudy" USING gin ("_profile");
CREATE INDEX "ResearchStudy___version_idx" ON "ResearchStudy" ("__version");
CREATE INDEX "ResearchStudy_compartments_idx" ON "ResearchStudy" USING gin ("compartments");
CREATE INDEX "ResearchStudy___sharedTokens_idx" ON "ResearchStudy" USING gin ("__sharedTokens");
CREATE INDEX "ResearchStudy___sharedTokensTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ResearchStudy____tag_idx" ON "ResearchStudy" USING gin ("___tag");
CREATE INDEX "ResearchStudy____tagTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ResearchStudy_date_idx" ON "ResearchStudy" ("date");
CREATE INDEX "ResearchStudy_projectId_date_idx" ON "ResearchStudy" ("projectId", "date");
CREATE INDEX "ResearchStudy___idnt_idx" ON "ResearchStudy" USING gin ("__identifier");
CREATE INDEX "ResearchStudy___idntTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ResearchStudy___keyword_idx" ON "ResearchStudy" USING gin ("__keyword");
CREATE INDEX "ResearchStudy___keywordTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__keywordText") gin_trgm_ops);
CREATE INDEX "ResearchStudy_partof_idx" ON "ResearchStudy" USING gin ("partof");
CREATE INDEX "ResearchStudy_principalinvestigator_idx" ON "ResearchStudy" ("principalinvestigator");
CREATE INDEX "ResearchStudy_protocol_idx" ON "ResearchStudy" USING gin ("protocol");
CREATE INDEX "ResearchStudy_site_idx" ON "ResearchStudy" USING gin ("site");
CREATE INDEX "ResearchStudy_sponsor_idx" ON "ResearchStudy" ("sponsor");
CREATE INDEX "ResearchStudy_status_idx" ON "ResearchStudy" ("status");
CREATE INDEX "ResearchStudy_title_idx" ON "ResearchStudy" ("title");
CREATE INDEX "ResearchStudy___condition_idx" ON "ResearchStudy" USING gin ("__condition");
CREATE INDEX "ResearchStudy___conditionTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__conditionText") gin_trgm_ops);
CREATE INDEX "ResearchStudy_description_idx" ON "ResearchStudy" ("description");
CREATE INDEX "ResearchStudy_eligibility_idx" ON "ResearchStudy" ("eligibility");
CREATE INDEX "ResearchStudy_name_idx" ON "ResearchStudy" ("name");
CREATE INDEX "ResearchStudy_objectiveDescription_idx" ON "ResearchStudy" USING gin ("objectiveDescription");
CREATE INDEX "ResearchStudy_partOf_idx" ON "ResearchStudy" USING gin ("partOf");
CREATE INDEX "ResearchStudy___phase_idx" ON "ResearchStudy" USING gin ("__phase");
CREATE INDEX "ResearchStudy___phaseTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__phaseText") gin_trgm_ops);
CREATE INDEX "ResearchStudy_recruitmentActual_idx" ON "ResearchStudy" ("recruitmentActual");
CREATE INDEX "ResearchStudy_recruitmentTarget_idx" ON "ResearchStudy" ("recruitmentTarget");
CREATE INDEX "ResearchStudy___studyDesign_idx" ON "ResearchStudy" USING gin ("__studyDesign");
CREATE INDEX "ResearchStudy___studyDesignTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__studyDesignText") gin_trgm_ops);
CREATE INDEX "ResearchStudy_outcomeMeasureReference_idx" ON "ResearchStudy" USING gin ("outcomeMeasureReference");
CREATE INDEX "ResearchStudy___eligibilityIdnt_idx" ON "ResearchStudy" USING gin ("__eligibilityIdentifier");
CREATE INDEX "ResearchStudy___eligibilityIdntTextTrgm_idx" ON "ResearchStudy" USING gin (token_array_to_text("__eligibilityIdentifierText") gin_trgm_ops);

CREATE TABLE  "ResearchStudy_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ResearchStudy_History_id_idx" ON "ResearchStudy_History" ("id");
CREATE INDEX "ResearchStudy_History_lastUpdated_idx" ON "ResearchStudy_History" ("lastUpdated");

CREATE TABLE  "ResearchStudy_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ResearchStudy_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ResearchStudy_Refs_targetId_code_idx" ON "ResearchStudy_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ResearchSubject" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "individual" TEXT,
  "patient" TEXT,
  "status" TEXT,
  "study" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__individualIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__studyIdentifierSort" TEXT
);
CREATE INDEX "ResearchSubject_lastUpdated_idx" ON "ResearchSubject" ("lastUpdated");
CREATE INDEX "ResearchSubject_projectId_lastUpdated_idx" ON "ResearchSubject" ("projectId", "lastUpdated");
CREATE INDEX "ResearchSubject_projectId_idx" ON "ResearchSubject" ("projectId");
CREATE INDEX "ResearchSubject__source_idx" ON "ResearchSubject" ("_source");
CREATE INDEX "ResearchSubject__profile_idx" ON "ResearchSubject" USING gin ("_profile");
CREATE INDEX "ResearchSubject___version_idx" ON "ResearchSubject" ("__version");
CREATE INDEX "ResearchSubject_compartments_idx" ON "ResearchSubject" USING gin ("compartments");
CREATE INDEX "ResearchSubject___sharedTokens_idx" ON "ResearchSubject" USING gin ("__sharedTokens");
CREATE INDEX "ResearchSubject___sharedTokensTextTrgm_idx" ON "ResearchSubject" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ResearchSubject____tag_idx" ON "ResearchSubject" USING gin ("___tag");
CREATE INDEX "ResearchSubject____tagTextTrgm_idx" ON "ResearchSubject" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ResearchSubject_date_idx" ON "ResearchSubject" ("date");
CREATE INDEX "ResearchSubject_projectId_date_idx" ON "ResearchSubject" ("projectId", "date");
CREATE INDEX "ResearchSubject___idnt_idx" ON "ResearchSubject" USING gin ("__identifier");
CREATE INDEX "ResearchSubject___idntTextTrgm_idx" ON "ResearchSubject" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ResearchSubject_individual_idx" ON "ResearchSubject" ("individual");
CREATE INDEX "ResearchSubject_patient_idx" ON "ResearchSubject" ("patient");
CREATE INDEX "ResearchSubject_status_idx" ON "ResearchSubject" ("status");
CREATE INDEX "ResearchSubject_study_idx" ON "ResearchSubject" ("study");

CREATE TABLE  "ResearchSubject_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ResearchSubject_History_id_idx" ON "ResearchSubject_History" ("id");
CREATE INDEX "ResearchSubject_History_lastUpdated_idx" ON "ResearchSubject_History" ("lastUpdated");

CREATE TABLE  "ResearchSubject_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ResearchSubject_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ResearchSubject_Refs_targetId_code_idx" ON "ResearchSubject_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "RiskAssessment" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "condition" TEXT,
  "__method" UUID[],
  "__methodText" TEXT[],
  "__methodSort" TEXT,
  "performer" TEXT,
  "probability" DOUBLE PRECISION[],
  "__risk" UUID[],
  "__riskText" TEXT[],
  "__riskSort" TEXT,
  "subject" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__conditionIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "RiskAssessment_lastUpdated_idx" ON "RiskAssessment" ("lastUpdated");
CREATE INDEX "RiskAssessment_projectId_lastUpdated_idx" ON "RiskAssessment" ("projectId", "lastUpdated");
CREATE INDEX "RiskAssessment_projectId_idx" ON "RiskAssessment" ("projectId");
CREATE INDEX "RiskAssessment__source_idx" ON "RiskAssessment" ("_source");
CREATE INDEX "RiskAssessment__profile_idx" ON "RiskAssessment" USING gin ("_profile");
CREATE INDEX "RiskAssessment___version_idx" ON "RiskAssessment" ("__version");
CREATE INDEX "RiskAssessment_compartments_idx" ON "RiskAssessment" USING gin ("compartments");
CREATE INDEX "RiskAssessment___sharedTokens_idx" ON "RiskAssessment" USING gin ("__sharedTokens");
CREATE INDEX "RiskAssessment___sharedTokensTextTrgm_idx" ON "RiskAssessment" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "RiskAssessment____tag_idx" ON "RiskAssessment" USING gin ("___tag");
CREATE INDEX "RiskAssessment____tagTextTrgm_idx" ON "RiskAssessment" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "RiskAssessment_date_idx" ON "RiskAssessment" ("date");
CREATE INDEX "RiskAssessment_projectId_date_idx" ON "RiskAssessment" ("projectId", "date");
CREATE INDEX "RiskAssessment___idnt_idx" ON "RiskAssessment" USING gin ("__identifier");
CREATE INDEX "RiskAssessment___idntTextTrgm_idx" ON "RiskAssessment" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "RiskAssessment_patient_idx" ON "RiskAssessment" ("patient");
CREATE INDEX "RiskAssessment_encounter_idx" ON "RiskAssessment" ("encounter");
CREATE INDEX "RiskAssessment_condition_idx" ON "RiskAssessment" ("condition");
CREATE INDEX "RiskAssessment___method_idx" ON "RiskAssessment" USING gin ("__method");
CREATE INDEX "RiskAssessment___methodTextTrgm_idx" ON "RiskAssessment" USING gin (token_array_to_text("__methodText") gin_trgm_ops);
CREATE INDEX "RiskAssessment_performer_idx" ON "RiskAssessment" ("performer");
CREATE INDEX "RiskAssessment_probability_idx" ON "RiskAssessment" USING gin ("probability");
CREATE INDEX "RiskAssessment___risk_idx" ON "RiskAssessment" USING gin ("__risk");
CREATE INDEX "RiskAssessment___riskTextTrgm_idx" ON "RiskAssessment" USING gin (token_array_to_text("__riskText") gin_trgm_ops);
CREATE INDEX "RiskAssessment_subject_idx" ON "RiskAssessment" ("subject");

CREATE TABLE  "RiskAssessment_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "RiskAssessment_History_id_idx" ON "RiskAssessment_History" ("id");
CREATE INDEX "RiskAssessment_History_lastUpdated_idx" ON "RiskAssessment_History" ("lastUpdated");

CREATE TABLE  "RiskAssessment_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "RiskAssessment_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "RiskAssessment_Refs_targetId_code_idx" ON "RiskAssessment_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "RiskEvidenceSynthesis" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "effective" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "RiskEvidenceSynthesis_lastUpdated_idx" ON "RiskEvidenceSynthesis" ("lastUpdated");
CREATE INDEX "RiskEvidenceSynthesis_projectId_lastUpdated_idx" ON "RiskEvidenceSynthesis" ("projectId", "lastUpdated");
CREATE INDEX "RiskEvidenceSynthesis_projectId_idx" ON "RiskEvidenceSynthesis" ("projectId");
CREATE INDEX "RiskEvidenceSynthesis__source_idx" ON "RiskEvidenceSynthesis" ("_source");
CREATE INDEX "RiskEvidenceSynthesis__profile_idx" ON "RiskEvidenceSynthesis" USING gin ("_profile");
CREATE INDEX "RiskEvidenceSynthesis___version_idx" ON "RiskEvidenceSynthesis" ("__version");
CREATE INDEX "RiskEvidenceSynthesis_compartments_idx" ON "RiskEvidenceSynthesis" USING gin ("compartments");
CREATE INDEX "RiskEvidenceSynthesis___sharedTokens_idx" ON "RiskEvidenceSynthesis" USING gin ("__sharedTokens");
CREATE INDEX "RiskEvidenceSynthesis___sharedTokensTextTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "RiskEvidenceSynthesis____tag_idx" ON "RiskEvidenceSynthesis" USING gin ("___tag");
CREATE INDEX "RiskEvidenceSynthesis____tagTextTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "RiskEvidenceSynthesis___context_idx" ON "RiskEvidenceSynthesis" USING gin ("__context");
CREATE INDEX "RiskEvidenceSynthesis___contextTextTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "RiskEvidenceSynthesis_contextQuantity_idx" ON "RiskEvidenceSynthesis" USING gin ("contextQuantity");
CREATE INDEX "RiskEvidenceSynthesis___contextType_idx" ON "RiskEvidenceSynthesis" USING gin ("__contextType");
CREATE INDEX "RiskEvidenceSynthesis___contextTypeTextTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "RiskEvidenceSynthesis_date_idx" ON "RiskEvidenceSynthesis" ("date");
CREATE INDEX "RiskEvidenceSynthesis_projectId_date_idx" ON "RiskEvidenceSynthesis" ("projectId", "date");
CREATE INDEX "RiskEvidenceSynthesis_description_idx" ON "RiskEvidenceSynthesis" ("description");
CREATE INDEX "RiskEvidenceSynthesis_effective_idx" ON "RiskEvidenceSynthesis" ("effective");
CREATE INDEX "RiskEvidenceSynthesis___idnt_idx" ON "RiskEvidenceSynthesis" USING gin ("__identifier");
CREATE INDEX "RiskEvidenceSynthesis___idntTextTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "RiskEvidenceSynthesis___jurisdiction_idx" ON "RiskEvidenceSynthesis" USING gin ("__jurisdiction");
CREATE INDEX "RiskEvidenceSynthesis___jurisdictionTextTrgm_idx" ON "RiskEvidenceSynthesis" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "RiskEvidenceSynthesis_name_idx" ON "RiskEvidenceSynthesis" ("name");
CREATE INDEX "RiskEvidenceSynthesis_publisher_idx" ON "RiskEvidenceSynthesis" ("publisher");
CREATE INDEX "RiskEvidenceSynthesis_status_idx" ON "RiskEvidenceSynthesis" ("status");
CREATE INDEX "RiskEvidenceSynthesis_title_idx" ON "RiskEvidenceSynthesis" ("title");
CREATE INDEX "RiskEvidenceSynthesis_url_idx" ON "RiskEvidenceSynthesis" ("url");
CREATE INDEX "RiskEvidenceSynthesis_version_idx" ON "RiskEvidenceSynthesis" ("version");

CREATE TABLE  "RiskEvidenceSynthesis_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "RiskEvidenceSynthesis_History_id_idx" ON "RiskEvidenceSynthesis_History" ("id");
CREATE INDEX "RiskEvidenceSynthesis_History_lastUpdated_idx" ON "RiskEvidenceSynthesis_History" ("lastUpdated");

CREATE TABLE  "RiskEvidenceSynthesis_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "RiskEvidenceSynthesis_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "RiskEvidenceSynthesis_Refs_targetId_code_idx" ON "RiskEvidenceSynthesis_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Schedule" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "active" BOOLEAN,
  "actor" TEXT[],
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__serviceCategory" UUID[],
  "__serviceCategoryText" TEXT[],
  "__serviceCategorySort" TEXT,
  "__serviceType" UUID[],
  "__serviceTypeText" TEXT[],
  "__serviceTypeSort" TEXT,
  "__specialty" UUID[],
  "__specialtyText" TEXT[],
  "__specialtySort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__actorIdentifierSort" TEXT
);
CREATE INDEX "Schedule_lastUpdated_idx" ON "Schedule" ("lastUpdated");
CREATE INDEX "Schedule_projectId_lastUpdated_idx" ON "Schedule" ("projectId", "lastUpdated");
CREATE INDEX "Schedule_projectId_idx" ON "Schedule" ("projectId");
CREATE INDEX "Schedule__source_idx" ON "Schedule" ("_source");
CREATE INDEX "Schedule__profile_idx" ON "Schedule" USING gin ("_profile");
CREATE INDEX "Schedule___version_idx" ON "Schedule" ("__version");
CREATE INDEX "Schedule_compartments_idx" ON "Schedule" USING gin ("compartments");
CREATE INDEX "Schedule___sharedTokens_idx" ON "Schedule" USING gin ("__sharedTokens");
CREATE INDEX "Schedule___sharedTokensTextTrgm_idx" ON "Schedule" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Schedule____tag_idx" ON "Schedule" USING gin ("___tag");
CREATE INDEX "Schedule____tagTextTrgm_idx" ON "Schedule" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Schedule_active_idx" ON "Schedule" ("active");
CREATE INDEX "Schedule_actor_idx" ON "Schedule" USING gin ("actor");
CREATE INDEX "Schedule_date_idx" ON "Schedule" ("date");
CREATE INDEX "Schedule_projectId_date_idx" ON "Schedule" ("projectId", "date");
CREATE INDEX "Schedule___idnt_idx" ON "Schedule" USING gin ("__identifier");
CREATE INDEX "Schedule___idntTextTrgm_idx" ON "Schedule" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Schedule___serviceCategory_idx" ON "Schedule" USING gin ("__serviceCategory");
CREATE INDEX "Schedule___serviceCategoryTextTrgm_idx" ON "Schedule" USING gin (token_array_to_text("__serviceCategoryText") gin_trgm_ops);
CREATE INDEX "Schedule___serviceType_idx" ON "Schedule" USING gin ("__serviceType");
CREATE INDEX "Schedule___serviceTypeTextTrgm_idx" ON "Schedule" USING gin (token_array_to_text("__serviceTypeText") gin_trgm_ops);
CREATE INDEX "Schedule___specialty_idx" ON "Schedule" USING gin ("__specialty");
CREATE INDEX "Schedule___specialtyTextTrgm_idx" ON "Schedule" USING gin (token_array_to_text("__specialtyText") gin_trgm_ops);

CREATE TABLE  "Schedule_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Schedule_History_id_idx" ON "Schedule_History" ("id");
CREATE INDEX "Schedule_History_lastUpdated_idx" ON "Schedule_History" ("lastUpdated");

CREATE TABLE  "Schedule_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Schedule_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Schedule_Refs_targetId_code_idx" ON "Schedule_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SearchParameter" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "url" TEXT,
  "version" TEXT,
  "base" TEXT[],
  "code" TEXT,
  "component" TEXT[],
  "derivedFrom" TEXT,
  "target" TEXT[],
  "type" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__componentIdentifierSort" TEXT,
  "__derivedFromIdentifierSort" TEXT
);
CREATE INDEX "SearchParameter_lastUpdated_idx" ON "SearchParameter" ("lastUpdated");
CREATE INDEX "SearchParameter_projectId_lastUpdated_idx" ON "SearchParameter" ("projectId", "lastUpdated");
CREATE INDEX "SearchParameter_projectId_idx" ON "SearchParameter" ("projectId");
CREATE INDEX "SearchParameter__source_idx" ON "SearchParameter" ("_source");
CREATE INDEX "SearchParameter__profile_idx" ON "SearchParameter" USING gin ("_profile");
CREATE INDEX "SearchParameter___version_idx" ON "SearchParameter" ("__version");
CREATE INDEX "SearchParameter_compartments_idx" ON "SearchParameter" USING gin ("compartments");
CREATE INDEX "SearchParameter___sharedTokens_idx" ON "SearchParameter" USING gin ("__sharedTokens");
CREATE INDEX "SearchParameter___sharedTokensTextTrgm_idx" ON "SearchParameter" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SearchParameter____tag_idx" ON "SearchParameter" USING gin ("___tag");
CREATE INDEX "SearchParameter____tagTextTrgm_idx" ON "SearchParameter" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "SearchParameter___context_idx" ON "SearchParameter" USING gin ("__context");
CREATE INDEX "SearchParameter___contextTextTrgm_idx" ON "SearchParameter" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "SearchParameter_contextQuantity_idx" ON "SearchParameter" USING gin ("contextQuantity");
CREATE INDEX "SearchParameter___contextType_idx" ON "SearchParameter" USING gin ("__contextType");
CREATE INDEX "SearchParameter___contextTypeTextTrgm_idx" ON "SearchParameter" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "SearchParameter_date_idx" ON "SearchParameter" ("date");
CREATE INDEX "SearchParameter_projectId_date_idx" ON "SearchParameter" ("projectId", "date");
CREATE INDEX "SearchParameter_description_idx" ON "SearchParameter" ("description");
CREATE INDEX "SearchParameter___jurisdiction_idx" ON "SearchParameter" USING gin ("__jurisdiction");
CREATE INDEX "SearchParameter___jurisdictionTextTrgm_idx" ON "SearchParameter" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "SearchParameter_name_idx" ON "SearchParameter" ("name");
CREATE INDEX "SearchParameter_publisher_idx" ON "SearchParameter" ("publisher");
CREATE INDEX "SearchParameter_status_idx" ON "SearchParameter" ("status");
CREATE INDEX "SearchParameter_url_idx" ON "SearchParameter" ("url");
CREATE INDEX "SearchParameter_version_idx" ON "SearchParameter" ("version");
CREATE INDEX "SearchParameter_base_idx" ON "SearchParameter" USING gin ("base");
CREATE INDEX "SearchParameter_code_idx" ON "SearchParameter" ("code");
CREATE INDEX "SearchParameter_component_idx" ON "SearchParameter" USING gin ("component");
CREATE INDEX "SearchParameter_derivedFrom_idx" ON "SearchParameter" ("derivedFrom");
CREATE INDEX "SearchParameter_target_idx" ON "SearchParameter" USING gin ("target");
CREATE INDEX "SearchParameter_type_idx" ON "SearchParameter" ("type");

CREATE TABLE  "SearchParameter_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SearchParameter_History_id_idx" ON "SearchParameter_History" ("id");
CREATE INDEX "SearchParameter_History_lastUpdated_idx" ON "SearchParameter_History" ("lastUpdated");

CREATE TABLE  "SearchParameter_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SearchParameter_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SearchParameter_Refs_targetId_code_idx" ON "SearchParameter_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ServiceRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "authored" TIMESTAMPTZ,
  "basedOn" TEXT[],
  "__bodySiteSort" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "instantiatesCanonical" TEXT[],
  "instantiatesUri" TEXT[],
  "intent" TEXT,
  "occurrence" TIMESTAMPTZ,
  "orderDetail" TEXT[] DEFAULT '{}'::text[],
  "performer" TEXT[],
  "__performerType" UUID[],
  "__performerTypeText" TEXT[],
  "__performerTypeSort" TEXT,
  "priority" TEXT,
  "replaces" TEXT[],
  "requester" TEXT,
  "__requisition" UUID[],
  "__requisitionText" TEXT[],
  "__requisitionSort" TEXT,
  "specimen" TEXT[],
  "status" TEXT,
  "subject" TEXT,
  "priorityOrder" INTEGER,
  "__reasonCode" UUID[],
  "__reasonCodeText" TEXT[],
  "__reasonCodeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__instantiatesCanonicalIdentifierSort" TEXT,
  "__performerIdentifierSort" TEXT,
  "__replacesIdentifierSort" TEXT,
  "__requesterIdentifierSort" TEXT,
  "__specimenIdentifierSort" TEXT,
  "__subjectIdentifier" UUID[],
  "__subjectIdentifierText" TEXT[],
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "ServiceRequest_lastUpdated_idx" ON "ServiceRequest" ("lastUpdated");
CREATE INDEX "ServiceRequest_projectId_lastUpdated_idx" ON "ServiceRequest" ("projectId", "lastUpdated");
CREATE INDEX "ServiceRequest_projectId_idx" ON "ServiceRequest" ("projectId");
CREATE INDEX "ServiceRequest__source_idx" ON "ServiceRequest" ("_source");
CREATE INDEX "ServiceRequest__profile_idx" ON "ServiceRequest" USING gin ("_profile");
CREATE INDEX "ServiceRequest___version_idx" ON "ServiceRequest" ("__version");
CREATE INDEX "ServiceRequest_compartments_idx" ON "ServiceRequest" USING gin ("compartments");
CREATE INDEX "ServiceRequest___sharedTokens_idx" ON "ServiceRequest" USING gin ("__sharedTokens");
CREATE INDEX "ServiceRequest___sharedTokensTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ServiceRequest____tag_idx" ON "ServiceRequest" USING gin ("___tag");
CREATE INDEX "ServiceRequest____tagTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ServiceRequest___code_idx" ON "ServiceRequest" USING gin ("__code");
CREATE INDEX "ServiceRequest___codeTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "ServiceRequest___idnt_idx" ON "ServiceRequest" USING gin ("__identifier");
CREATE INDEX "ServiceRequest___idntTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ServiceRequest_patient_idx" ON "ServiceRequest" ("patient");
CREATE INDEX "ServiceRequest_encounter_idx" ON "ServiceRequest" ("encounter");
CREATE INDEX "ServiceRequest_authored_idx" ON "ServiceRequest" ("authored");
CREATE INDEX "ServiceRequest_basedOn_idx" ON "ServiceRequest" USING gin ("basedOn");
CREATE INDEX "ServiceRequest___category_idx" ON "ServiceRequest" USING gin ("__category");
CREATE INDEX "ServiceRequest___categoryTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "ServiceRequest_instantiatesCanonical_idx" ON "ServiceRequest" USING gin ("instantiatesCanonical");
CREATE INDEX "ServiceRequest_instantiatesUri_idx" ON "ServiceRequest" USING gin ("instantiatesUri");
CREATE INDEX "ServiceRequest_intent_idx" ON "ServiceRequest" ("intent");
CREATE INDEX "ServiceRequest_occurrence_idx" ON "ServiceRequest" ("occurrence");
CREATE INDEX "ServiceRequest_orderDetail_idx" ON "ServiceRequest" USING gin ("orderDetail");
CREATE INDEX "ServiceRequest_performer_idx" ON "ServiceRequest" USING gin ("performer");
CREATE INDEX "ServiceRequest___performerType_idx" ON "ServiceRequest" USING gin ("__performerType");
CREATE INDEX "ServiceRequest___performerTypeTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__performerTypeText") gin_trgm_ops);
CREATE INDEX "ServiceRequest_priority_idx" ON "ServiceRequest" ("priority");
CREATE INDEX "ServiceRequest_replaces_idx" ON "ServiceRequest" USING gin ("replaces");
CREATE INDEX "ServiceRequest_requester_idx" ON "ServiceRequest" ("requester");
CREATE INDEX "ServiceRequest___requisition_idx" ON "ServiceRequest" USING gin ("__requisition");
CREATE INDEX "ServiceRequest___requisitionTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__requisitionText") gin_trgm_ops);
CREATE INDEX "ServiceRequest_specimen_idx" ON "ServiceRequest" USING gin ("specimen");
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest" ("status");
CREATE INDEX "ServiceRequest_subject_idx" ON "ServiceRequest" ("subject");
CREATE INDEX "ServiceRequest_priorityOrder_idx" ON "ServiceRequest" ("priorityOrder");
CREATE INDEX "ServiceRequest___reasonCode_idx" ON "ServiceRequest" USING gin ("__reasonCode");
CREATE INDEX "ServiceRequest___reasonCodeTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__reasonCodeText") gin_trgm_ops);
CREATE INDEX "ServiceRequest___subjectIdnt_idx" ON "ServiceRequest" USING gin ("__subjectIdentifier");
CREATE INDEX "ServiceRequest___subjectIdntTextTrgm_idx" ON "ServiceRequest" USING gin (token_array_to_text("__subjectIdentifierText") gin_trgm_ops);

CREATE TABLE  "ServiceRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ServiceRequest_History_id_idx" ON "ServiceRequest_History" ("id");
CREATE INDEX "ServiceRequest_History_lastUpdated_idx" ON "ServiceRequest_History" ("lastUpdated");

CREATE TABLE  "ServiceRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ServiceRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ServiceRequest_Refs_targetId_code_idx" ON "ServiceRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Slot" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__appointmentType" UUID[],
  "__appointmentTypeText" TEXT[],
  "__appointmentTypeSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "schedule" TEXT,
  "__serviceCategory" UUID[],
  "__serviceCategoryText" TEXT[],
  "__serviceCategorySort" TEXT,
  "__serviceType" UUID[],
  "__serviceTypeText" TEXT[],
  "__serviceTypeSort" TEXT,
  "__specialty" UUID[],
  "__specialtyText" TEXT[],
  "__specialtySort" TEXT,
  "start" TIMESTAMPTZ,
  "status" TEXT,
  "end" TIMESTAMPTZ,
  "___compartmentIdentifierSort" TEXT,
  "__scheduleIdentifierSort" TEXT
);
CREATE INDEX "Slot_lastUpdated_idx" ON "Slot" ("lastUpdated");
CREATE INDEX "Slot_projectId_lastUpdated_idx" ON "Slot" ("projectId", "lastUpdated");
CREATE INDEX "Slot_projectId_idx" ON "Slot" ("projectId");
CREATE INDEX "Slot__source_idx" ON "Slot" ("_source");
CREATE INDEX "Slot__profile_idx" ON "Slot" USING gin ("_profile");
CREATE INDEX "Slot___version_idx" ON "Slot" ("__version");
CREATE INDEX "Slot_compartments_idx" ON "Slot" USING gin ("compartments");
CREATE INDEX "Slot___sharedTokens_idx" ON "Slot" USING gin ("__sharedTokens");
CREATE INDEX "Slot___sharedTokensTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Slot____tag_idx" ON "Slot" USING gin ("___tag");
CREATE INDEX "Slot____tagTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Slot___appointmentType_idx" ON "Slot" USING gin ("__appointmentType");
CREATE INDEX "Slot___appointmentTypeTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("__appointmentTypeText") gin_trgm_ops);
CREATE INDEX "Slot___idnt_idx" ON "Slot" USING gin ("__identifier");
CREATE INDEX "Slot___idntTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Slot_schedule_idx" ON "Slot" ("schedule");
CREATE INDEX "Slot___serviceCategory_idx" ON "Slot" USING gin ("__serviceCategory");
CREATE INDEX "Slot___serviceCategoryTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("__serviceCategoryText") gin_trgm_ops);
CREATE INDEX "Slot___serviceType_idx" ON "Slot" USING gin ("__serviceType");
CREATE INDEX "Slot___serviceTypeTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("__serviceTypeText") gin_trgm_ops);
CREATE INDEX "Slot___specialty_idx" ON "Slot" USING gin ("__specialty");
CREATE INDEX "Slot___specialtyTextTrgm_idx" ON "Slot" USING gin (token_array_to_text("__specialtyText") gin_trgm_ops);
CREATE INDEX "Slot_start_idx" ON "Slot" ("start");
CREATE INDEX "Slot_status_idx" ON "Slot" ("status");
CREATE INDEX "Slot_end_idx" ON "Slot" ("end");

CREATE TABLE  "Slot_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Slot_History_id_idx" ON "Slot_History" ("id");
CREATE INDEX "Slot_History_lastUpdated_idx" ON "Slot_History" ("lastUpdated");

CREATE TABLE  "Slot_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Slot_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Slot_Refs_targetId_code_idx" ON "Slot_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Specimen" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__accession" UUID[],
  "__accessionText" TEXT[],
  "__accessionSort" TEXT,
  "__bodysite" UUID[],
  "__bodysiteText" TEXT[],
  "__bodysiteSort" TEXT,
  "collected" TIMESTAMPTZ,
  "collector" TEXT,
  "__container" UUID[],
  "__containerText" TEXT[],
  "__containerSort" TEXT,
  "__containerId" UUID[],
  "__containerIdText" TEXT[],
  "__containerIdSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "parent" TEXT[],
  "patient" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__collectorIdentifierSort" TEXT,
  "__parentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Specimen_lastUpdated_idx" ON "Specimen" ("lastUpdated");
CREATE INDEX "Specimen_projectId_lastUpdated_idx" ON "Specimen" ("projectId", "lastUpdated");
CREATE INDEX "Specimen_projectId_idx" ON "Specimen" ("projectId");
CREATE INDEX "Specimen__source_idx" ON "Specimen" ("_source");
CREATE INDEX "Specimen__profile_idx" ON "Specimen" USING gin ("_profile");
CREATE INDEX "Specimen___version_idx" ON "Specimen" ("__version");
CREATE INDEX "Specimen_compartments_idx" ON "Specimen" USING gin ("compartments");
CREATE INDEX "Specimen___sharedTokens_idx" ON "Specimen" USING gin ("__sharedTokens");
CREATE INDEX "Specimen___sharedTokensTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Specimen____tag_idx" ON "Specimen" USING gin ("___tag");
CREATE INDEX "Specimen____tagTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Specimen___accession_idx" ON "Specimen" USING gin ("__accession");
CREATE INDEX "Specimen___accessionTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__accessionText") gin_trgm_ops);
CREATE INDEX "Specimen___bodysite_idx" ON "Specimen" USING gin ("__bodysite");
CREATE INDEX "Specimen___bodysiteTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__bodysiteText") gin_trgm_ops);
CREATE INDEX "Specimen_collected_idx" ON "Specimen" ("collected");
CREATE INDEX "Specimen_collector_idx" ON "Specimen" ("collector");
CREATE INDEX "Specimen___container_idx" ON "Specimen" USING gin ("__container");
CREATE INDEX "Specimen___containerTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__containerText") gin_trgm_ops);
CREATE INDEX "Specimen___containerId_idx" ON "Specimen" USING gin ("__containerId");
CREATE INDEX "Specimen___containerIdTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__containerIdText") gin_trgm_ops);
CREATE INDEX "Specimen___idnt_idx" ON "Specimen" USING gin ("__identifier");
CREATE INDEX "Specimen___idntTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Specimen_parent_idx" ON "Specimen" USING gin ("parent");
CREATE INDEX "Specimen_patient_idx" ON "Specimen" ("patient");
CREATE INDEX "Specimen_status_idx" ON "Specimen" ("status");
CREATE INDEX "Specimen_subject_idx" ON "Specimen" ("subject");
CREATE INDEX "Specimen___type_idx" ON "Specimen" USING gin ("__type");
CREATE INDEX "Specimen___typeTextTrgm_idx" ON "Specimen" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "Specimen_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Specimen_History_id_idx" ON "Specimen_History" ("id");
CREATE INDEX "Specimen_History_lastUpdated_idx" ON "Specimen_History" ("lastUpdated");

CREATE TABLE  "Specimen_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Specimen_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Specimen_Refs_targetId_code_idx" ON "Specimen_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SpecimenDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__container" UUID[],
  "__containerText" TEXT[],
  "__containerSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__type" UUID[],
  "__typeText" TEXT[],
  "__typeSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SpecimenDefinition_lastUpdated_idx" ON "SpecimenDefinition" ("lastUpdated");
CREATE INDEX "SpecimenDefinition_projectId_lastUpdated_idx" ON "SpecimenDefinition" ("projectId", "lastUpdated");
CREATE INDEX "SpecimenDefinition_projectId_idx" ON "SpecimenDefinition" ("projectId");
CREATE INDEX "SpecimenDefinition__source_idx" ON "SpecimenDefinition" ("_source");
CREATE INDEX "SpecimenDefinition__profile_idx" ON "SpecimenDefinition" USING gin ("_profile");
CREATE INDEX "SpecimenDefinition___version_idx" ON "SpecimenDefinition" ("__version");
CREATE INDEX "SpecimenDefinition_compartments_idx" ON "SpecimenDefinition" USING gin ("compartments");
CREATE INDEX "SpecimenDefinition___sharedTokens_idx" ON "SpecimenDefinition" USING gin ("__sharedTokens");
CREATE INDEX "SpecimenDefinition___sharedTokensTextTrgm_idx" ON "SpecimenDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SpecimenDefinition____tag_idx" ON "SpecimenDefinition" USING gin ("___tag");
CREATE INDEX "SpecimenDefinition____tagTextTrgm_idx" ON "SpecimenDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "SpecimenDefinition___container_idx" ON "SpecimenDefinition" USING gin ("__container");
CREATE INDEX "SpecimenDefinition___containerTextTrgm_idx" ON "SpecimenDefinition" USING gin (token_array_to_text("__containerText") gin_trgm_ops);
CREATE INDEX "SpecimenDefinition___idnt_idx" ON "SpecimenDefinition" USING gin ("__identifier");
CREATE INDEX "SpecimenDefinition___idntTextTrgm_idx" ON "SpecimenDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "SpecimenDefinition___type_idx" ON "SpecimenDefinition" USING gin ("__type");
CREATE INDEX "SpecimenDefinition___typeTextTrgm_idx" ON "SpecimenDefinition" USING gin (token_array_to_text("__typeText") gin_trgm_ops);

CREATE TABLE  "SpecimenDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SpecimenDefinition_History_id_idx" ON "SpecimenDefinition_History" ("id");
CREATE INDEX "SpecimenDefinition_History_lastUpdated_idx" ON "SpecimenDefinition_History" ("lastUpdated");

CREATE TABLE  "SpecimenDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SpecimenDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SpecimenDefinition_Refs_targetId_code_idx" ON "SpecimenDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "StructureDefinition" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "abstract" BOOLEAN,
  "base" TEXT,
  "basePath" TEXT[],
  "derivation" TEXT,
  "experimental" BOOLEAN,
  "extContext" TEXT[],
  "__keyword" UUID[],
  "__keywordText" TEXT[],
  "__keywordSort" TEXT,
  "kind" TEXT,
  "path" TEXT[],
  "type" TEXT,
  "valueset" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__baseIdentifierSort" TEXT,
  "__valuesetIdentifierSort" TEXT
);
CREATE INDEX "StructureDefinition_lastUpdated_idx" ON "StructureDefinition" ("lastUpdated");
CREATE INDEX "StructureDefinition_projectId_lastUpdated_idx" ON "StructureDefinition" ("projectId", "lastUpdated");
CREATE INDEX "StructureDefinition_projectId_idx" ON "StructureDefinition" ("projectId");
CREATE INDEX "StructureDefinition__source_idx" ON "StructureDefinition" ("_source");
CREATE INDEX "StructureDefinition__profile_idx" ON "StructureDefinition" USING gin ("_profile");
CREATE INDEX "StructureDefinition___version_idx" ON "StructureDefinition" ("__version");
CREATE INDEX "StructureDefinition_compartments_idx" ON "StructureDefinition" USING gin ("compartments");
CREATE INDEX "StructureDefinition___sharedTokens_idx" ON "StructureDefinition" USING gin ("__sharedTokens");
CREATE INDEX "StructureDefinition___sharedTokensTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "StructureDefinition____tag_idx" ON "StructureDefinition" USING gin ("___tag");
CREATE INDEX "StructureDefinition____tagTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "StructureDefinition___context_idx" ON "StructureDefinition" USING gin ("__context");
CREATE INDEX "StructureDefinition___contextTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "StructureDefinition_contextQuantity_idx" ON "StructureDefinition" USING gin ("contextQuantity");
CREATE INDEX "StructureDefinition___contextType_idx" ON "StructureDefinition" USING gin ("__contextType");
CREATE INDEX "StructureDefinition___contextTypeTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "StructureDefinition_date_idx" ON "StructureDefinition" ("date");
CREATE INDEX "StructureDefinition_projectId_date_idx" ON "StructureDefinition" ("projectId", "date");
CREATE INDEX "StructureDefinition_description_idx" ON "StructureDefinition" ("description");
CREATE INDEX "StructureDefinition___jurisdiction_idx" ON "StructureDefinition" USING gin ("__jurisdiction");
CREATE INDEX "StructureDefinition___jurisdictionTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "StructureDefinition_name_idx" ON "StructureDefinition" ("name");
CREATE INDEX "StructureDefinition_publisher_idx" ON "StructureDefinition" ("publisher");
CREATE INDEX "StructureDefinition_status_idx" ON "StructureDefinition" ("status");
CREATE INDEX "StructureDefinition_title_idx" ON "StructureDefinition" ("title");
CREATE INDEX "StructureDefinition_url_idx" ON "StructureDefinition" ("url");
CREATE INDEX "StructureDefinition_version_idx" ON "StructureDefinition" ("version");
CREATE INDEX "StructureDefinition___idnt_idx" ON "StructureDefinition" USING gin ("__identifier");
CREATE INDEX "StructureDefinition___idntTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "StructureDefinition_abstract_idx" ON "StructureDefinition" ("abstract");
CREATE INDEX "StructureDefinition_base_idx" ON "StructureDefinition" ("base");
CREATE INDEX "StructureDefinition_basePath_idx" ON "StructureDefinition" USING gin ("basePath");
CREATE INDEX "StructureDefinition_derivation_idx" ON "StructureDefinition" ("derivation");
CREATE INDEX "StructureDefinition_experimental_idx" ON "StructureDefinition" ("experimental");
CREATE INDEX "StructureDefinition_extContext_idx" ON "StructureDefinition" USING gin ("extContext");
CREATE INDEX "StructureDefinition___keyword_idx" ON "StructureDefinition" USING gin ("__keyword");
CREATE INDEX "StructureDefinition___keywordTextTrgm_idx" ON "StructureDefinition" USING gin (token_array_to_text("__keywordText") gin_trgm_ops);
CREATE INDEX "StructureDefinition_kind_idx" ON "StructureDefinition" ("kind");
CREATE INDEX "StructureDefinition_path_idx" ON "StructureDefinition" USING gin ("path");
CREATE INDEX "StructureDefinition_type_idx" ON "StructureDefinition" ("type");
CREATE INDEX "StructureDefinition_valueset_idx" ON "StructureDefinition" USING gin ("valueset");

CREATE TABLE  "StructureDefinition_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "StructureDefinition_History_id_idx" ON "StructureDefinition_History" ("id");
CREATE INDEX "StructureDefinition_History_lastUpdated_idx" ON "StructureDefinition_History" ("lastUpdated");

CREATE TABLE  "StructureDefinition_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "StructureDefinition_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "StructureDefinition_Refs_targetId_code_idx" ON "StructureDefinition_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "StructureMap" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "StructureMap_lastUpdated_idx" ON "StructureMap" ("lastUpdated");
CREATE INDEX "StructureMap_projectId_lastUpdated_idx" ON "StructureMap" ("projectId", "lastUpdated");
CREATE INDEX "StructureMap_projectId_idx" ON "StructureMap" ("projectId");
CREATE INDEX "StructureMap__source_idx" ON "StructureMap" ("_source");
CREATE INDEX "StructureMap__profile_idx" ON "StructureMap" USING gin ("_profile");
CREATE INDEX "StructureMap___version_idx" ON "StructureMap" ("__version");
CREATE INDEX "StructureMap_compartments_idx" ON "StructureMap" USING gin ("compartments");
CREATE INDEX "StructureMap___sharedTokens_idx" ON "StructureMap" USING gin ("__sharedTokens");
CREATE INDEX "StructureMap___sharedTokensTextTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "StructureMap____tag_idx" ON "StructureMap" USING gin ("___tag");
CREATE INDEX "StructureMap____tagTextTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "StructureMap___context_idx" ON "StructureMap" USING gin ("__context");
CREATE INDEX "StructureMap___contextTextTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "StructureMap_contextQuantity_idx" ON "StructureMap" USING gin ("contextQuantity");
CREATE INDEX "StructureMap___contextType_idx" ON "StructureMap" USING gin ("__contextType");
CREATE INDEX "StructureMap___contextTypeTextTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "StructureMap_date_idx" ON "StructureMap" ("date");
CREATE INDEX "StructureMap_projectId_date_idx" ON "StructureMap" ("projectId", "date");
CREATE INDEX "StructureMap_description_idx" ON "StructureMap" ("description");
CREATE INDEX "StructureMap___jurisdiction_idx" ON "StructureMap" USING gin ("__jurisdiction");
CREATE INDEX "StructureMap___jurisdictionTextTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "StructureMap_name_idx" ON "StructureMap" ("name");
CREATE INDEX "StructureMap_publisher_idx" ON "StructureMap" ("publisher");
CREATE INDEX "StructureMap_status_idx" ON "StructureMap" ("status");
CREATE INDEX "StructureMap_title_idx" ON "StructureMap" ("title");
CREATE INDEX "StructureMap_url_idx" ON "StructureMap" ("url");
CREATE INDEX "StructureMap_version_idx" ON "StructureMap" ("version");
CREATE INDEX "StructureMap___idnt_idx" ON "StructureMap" USING gin ("__identifier");
CREATE INDEX "StructureMap___idntTextTrgm_idx" ON "StructureMap" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);

CREATE TABLE  "StructureMap_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "StructureMap_History_id_idx" ON "StructureMap_History" ("id");
CREATE INDEX "StructureMap_History_lastUpdated_idx" ON "StructureMap_History" ("lastUpdated");

CREATE TABLE  "StructureMap_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "StructureMap_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "StructureMap_Refs_targetId_code_idx" ON "StructureMap_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Subscription" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__contact" UUID[],
  "__contactText" TEXT[],
  "__contactSort" TEXT,
  "criteria" TEXT,
  "payload" TEXT,
  "status" TEXT,
  "type" TEXT,
  "url" TEXT,
  "author" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__authorIdentifierSort" TEXT
);
CREATE INDEX "Subscription_lastUpdated_idx" ON "Subscription" ("lastUpdated");
CREATE INDEX "Subscription_projectId_lastUpdated_idx" ON "Subscription" ("projectId", "lastUpdated");
CREATE INDEX "Subscription_projectId_idx" ON "Subscription" ("projectId");
CREATE INDEX "Subscription__source_idx" ON "Subscription" ("_source");
CREATE INDEX "Subscription__profile_idx" ON "Subscription" USING gin ("_profile");
CREATE INDEX "Subscription___version_idx" ON "Subscription" ("__version");
CREATE INDEX "Subscription_compartments_idx" ON "Subscription" USING gin ("compartments");
CREATE INDEX "Subscription___sharedTokens_idx" ON "Subscription" USING gin ("__sharedTokens");
CREATE INDEX "Subscription___sharedTokensTextTrgm_idx" ON "Subscription" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Subscription____tag_idx" ON "Subscription" USING gin ("___tag");
CREATE INDEX "Subscription____tagTextTrgm_idx" ON "Subscription" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Subscription___contact_idx" ON "Subscription" USING gin ("__contact");
CREATE INDEX "Subscription___contactTextTrgm_idx" ON "Subscription" USING gin (token_array_to_text("__contactText") gin_trgm_ops);
CREATE INDEX "Subscription_criteria_idx" ON "Subscription" ("criteria");
CREATE INDEX "Subscription_payload_idx" ON "Subscription" ("payload");
CREATE INDEX "Subscription_status_idx" ON "Subscription" ("status");
CREATE INDEX "Subscription_type_idx" ON "Subscription" ("type");
CREATE INDEX "Subscription_url_idx" ON "Subscription" ("url");
CREATE INDEX "Subscription_author_idx" ON "Subscription" ("author");

CREATE TABLE  "Subscription_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Subscription_History_id_idx" ON "Subscription_History" ("id");
CREATE INDEX "Subscription_History_lastUpdated_idx" ON "Subscription_History" ("lastUpdated");

CREATE TABLE  "Subscription_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Subscription_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Subscription_Refs_targetId_code_idx" ON "Subscription_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubscriptionStatus" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubscriptionStatus_lastUpdated_idx" ON "SubscriptionStatus" ("lastUpdated");
CREATE INDEX "SubscriptionStatus_projectId_lastUpdated_idx" ON "SubscriptionStatus" ("projectId", "lastUpdated");
CREATE INDEX "SubscriptionStatus_projectId_idx" ON "SubscriptionStatus" ("projectId");
CREATE INDEX "SubscriptionStatus__source_idx" ON "SubscriptionStatus" ("_source");
CREATE INDEX "SubscriptionStatus__profile_idx" ON "SubscriptionStatus" USING gin ("_profile");
CREATE INDEX "SubscriptionStatus___version_idx" ON "SubscriptionStatus" ("__version");
CREATE INDEX "SubscriptionStatus_compartments_idx" ON "SubscriptionStatus" USING gin ("compartments");
CREATE INDEX "SubscriptionStatus___sharedTokens_idx" ON "SubscriptionStatus" USING gin ("__sharedTokens");
CREATE INDEX "SubscriptionStatus___sharedTokensTextTrgm_idx" ON "SubscriptionStatus" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubscriptionStatus____tag_idx" ON "SubscriptionStatus" USING gin ("___tag");
CREATE INDEX "SubscriptionStatus____tagTextTrgm_idx" ON "SubscriptionStatus" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SubscriptionStatus_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubscriptionStatus_History_id_idx" ON "SubscriptionStatus_History" ("id");
CREATE INDEX "SubscriptionStatus_History_lastUpdated_idx" ON "SubscriptionStatus_History" ("lastUpdated");

CREATE TABLE  "SubscriptionStatus_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubscriptionStatus_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubscriptionStatus_Refs_targetId_code_idx" ON "SubscriptionStatus_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Substance" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "__containerIdentifier" UUID[],
  "__containerIdentifierText" TEXT[],
  "__containerIdentifierSort" TEXT,
  "expiry" TIMESTAMPTZ[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "quantity" DOUBLE PRECISION[],
  "status" TEXT,
  "substanceReference" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__substanceReferenceIdentifierSort" TEXT
);
CREATE INDEX "Substance_lastUpdated_idx" ON "Substance" ("lastUpdated");
CREATE INDEX "Substance_projectId_lastUpdated_idx" ON "Substance" ("projectId", "lastUpdated");
CREATE INDEX "Substance_projectId_idx" ON "Substance" ("projectId");
CREATE INDEX "Substance__source_idx" ON "Substance" ("_source");
CREATE INDEX "Substance__profile_idx" ON "Substance" USING gin ("_profile");
CREATE INDEX "Substance___version_idx" ON "Substance" ("__version");
CREATE INDEX "Substance_compartments_idx" ON "Substance" USING gin ("compartments");
CREATE INDEX "Substance___sharedTokens_idx" ON "Substance" USING gin ("__sharedTokens");
CREATE INDEX "Substance___sharedTokensTextTrgm_idx" ON "Substance" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Substance____tag_idx" ON "Substance" USING gin ("___tag");
CREATE INDEX "Substance____tagTextTrgm_idx" ON "Substance" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Substance___category_idx" ON "Substance" USING gin ("__category");
CREATE INDEX "Substance___categoryTextTrgm_idx" ON "Substance" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "Substance___code_idx" ON "Substance" USING gin ("__code");
CREATE INDEX "Substance___codeTextTrgm_idx" ON "Substance" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Substance___containerIdnt_idx" ON "Substance" USING gin ("__containerIdentifier");
CREATE INDEX "Substance___containerIdntTextTrgm_idx" ON "Substance" USING gin (token_array_to_text("__containerIdentifierText") gin_trgm_ops);
CREATE INDEX "Substance_expiry_idx" ON "Substance" USING gin ("expiry");
CREATE INDEX "Substance___idnt_idx" ON "Substance" USING gin ("__identifier");
CREATE INDEX "Substance___idntTextTrgm_idx" ON "Substance" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Substance_quantity_idx" ON "Substance" USING gin ("quantity");
CREATE INDEX "Substance_status_idx" ON "Substance" ("status");
CREATE INDEX "Substance_substanceReference_idx" ON "Substance" USING gin ("substanceReference");

CREATE TABLE  "Substance_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Substance_History_id_idx" ON "Substance_History" ("id");
CREATE INDEX "Substance_History_lastUpdated_idx" ON "Substance_History" ("lastUpdated");

CREATE TABLE  "Substance_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Substance_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Substance_Refs_targetId_code_idx" ON "Substance_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubstanceNucleicAcid" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubstanceNucleicAcid_lastUpdated_idx" ON "SubstanceNucleicAcid" ("lastUpdated");
CREATE INDEX "SubstanceNucleicAcid_projectId_lastUpdated_idx" ON "SubstanceNucleicAcid" ("projectId", "lastUpdated");
CREATE INDEX "SubstanceNucleicAcid_projectId_idx" ON "SubstanceNucleicAcid" ("projectId");
CREATE INDEX "SubstanceNucleicAcid__source_idx" ON "SubstanceNucleicAcid" ("_source");
CREATE INDEX "SubstanceNucleicAcid__profile_idx" ON "SubstanceNucleicAcid" USING gin ("_profile");
CREATE INDEX "SubstanceNucleicAcid___version_idx" ON "SubstanceNucleicAcid" ("__version");
CREATE INDEX "SubstanceNucleicAcid_compartments_idx" ON "SubstanceNucleicAcid" USING gin ("compartments");
CREATE INDEX "SubstanceNucleicAcid___sharedTokens_idx" ON "SubstanceNucleicAcid" USING gin ("__sharedTokens");
CREATE INDEX "SubstanceNucleicAcid___sharedTokensTextTrgm_idx" ON "SubstanceNucleicAcid" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubstanceNucleicAcid____tag_idx" ON "SubstanceNucleicAcid" USING gin ("___tag");
CREATE INDEX "SubstanceNucleicAcid____tagTextTrgm_idx" ON "SubstanceNucleicAcid" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SubstanceNucleicAcid_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubstanceNucleicAcid_History_id_idx" ON "SubstanceNucleicAcid_History" ("id");
CREATE INDEX "SubstanceNucleicAcid_History_lastUpdated_idx" ON "SubstanceNucleicAcid_History" ("lastUpdated");

CREATE TABLE  "SubstanceNucleicAcid_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubstanceNucleicAcid_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubstanceNucleicAcid_Refs_targetId_code_idx" ON "SubstanceNucleicAcid_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubstancePolymer" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubstancePolymer_lastUpdated_idx" ON "SubstancePolymer" ("lastUpdated");
CREATE INDEX "SubstancePolymer_projectId_lastUpdated_idx" ON "SubstancePolymer" ("projectId", "lastUpdated");
CREATE INDEX "SubstancePolymer_projectId_idx" ON "SubstancePolymer" ("projectId");
CREATE INDEX "SubstancePolymer__source_idx" ON "SubstancePolymer" ("_source");
CREATE INDEX "SubstancePolymer__profile_idx" ON "SubstancePolymer" USING gin ("_profile");
CREATE INDEX "SubstancePolymer___version_idx" ON "SubstancePolymer" ("__version");
CREATE INDEX "SubstancePolymer_compartments_idx" ON "SubstancePolymer" USING gin ("compartments");
CREATE INDEX "SubstancePolymer___sharedTokens_idx" ON "SubstancePolymer" USING gin ("__sharedTokens");
CREATE INDEX "SubstancePolymer___sharedTokensTextTrgm_idx" ON "SubstancePolymer" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubstancePolymer____tag_idx" ON "SubstancePolymer" USING gin ("___tag");
CREATE INDEX "SubstancePolymer____tagTextTrgm_idx" ON "SubstancePolymer" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SubstancePolymer_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubstancePolymer_History_id_idx" ON "SubstancePolymer_History" ("id");
CREATE INDEX "SubstancePolymer_History_lastUpdated_idx" ON "SubstancePolymer_History" ("lastUpdated");

CREATE TABLE  "SubstancePolymer_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubstancePolymer_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubstancePolymer_Refs_targetId_code_idx" ON "SubstancePolymer_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubstanceProtein" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubstanceProtein_lastUpdated_idx" ON "SubstanceProtein" ("lastUpdated");
CREATE INDEX "SubstanceProtein_projectId_lastUpdated_idx" ON "SubstanceProtein" ("projectId", "lastUpdated");
CREATE INDEX "SubstanceProtein_projectId_idx" ON "SubstanceProtein" ("projectId");
CREATE INDEX "SubstanceProtein__source_idx" ON "SubstanceProtein" ("_source");
CREATE INDEX "SubstanceProtein__profile_idx" ON "SubstanceProtein" USING gin ("_profile");
CREATE INDEX "SubstanceProtein___version_idx" ON "SubstanceProtein" ("__version");
CREATE INDEX "SubstanceProtein_compartments_idx" ON "SubstanceProtein" USING gin ("compartments");
CREATE INDEX "SubstanceProtein___sharedTokens_idx" ON "SubstanceProtein" USING gin ("__sharedTokens");
CREATE INDEX "SubstanceProtein___sharedTokensTextTrgm_idx" ON "SubstanceProtein" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubstanceProtein____tag_idx" ON "SubstanceProtein" USING gin ("___tag");
CREATE INDEX "SubstanceProtein____tagTextTrgm_idx" ON "SubstanceProtein" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SubstanceProtein_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubstanceProtein_History_id_idx" ON "SubstanceProtein_History" ("id");
CREATE INDEX "SubstanceProtein_History_lastUpdated_idx" ON "SubstanceProtein_History" ("lastUpdated");

CREATE TABLE  "SubstanceProtein_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubstanceProtein_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubstanceProtein_Refs_targetId_code_idx" ON "SubstanceProtein_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubstanceReferenceInformation" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubstanceReferenceInformation_lastUpdated_idx" ON "SubstanceReferenceInformation" ("lastUpdated");
CREATE INDEX "SubstanceReferenceInformation_projectId_lastUpdated_idx" ON "SubstanceReferenceInformation" ("projectId", "lastUpdated");
CREATE INDEX "SubstanceReferenceInformation_projectId_idx" ON "SubstanceReferenceInformation" ("projectId");
CREATE INDEX "SubstanceReferenceInformation__source_idx" ON "SubstanceReferenceInformation" ("_source");
CREATE INDEX "SubstanceReferenceInformation__profile_idx" ON "SubstanceReferenceInformation" USING gin ("_profile");
CREATE INDEX "SubstanceReferenceInformation___version_idx" ON "SubstanceReferenceInformation" ("__version");
CREATE INDEX "SubstanceReferenceInformation_compartments_idx" ON "SubstanceReferenceInformation" USING gin ("compartments");
CREATE INDEX "SubstanceReferenceInformation___sharedTokens_idx" ON "SubstanceReferenceInformation" USING gin ("__sharedTokens");
CREATE INDEX "SubstanceReferenceInformation___sharedTokensTextTrgm_idx" ON "SubstanceReferenceInformation" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubstanceReferenceInformation____tag_idx" ON "SubstanceReferenceInformation" USING gin ("___tag");
CREATE INDEX "SubstanceReferenceInformation____tagTextTrgm_idx" ON "SubstanceReferenceInformation" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SubstanceReferenceInformation_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubstanceReferenceInformation_History_id_idx" ON "SubstanceReferenceInformation_History" ("id");
CREATE INDEX "SubstanceReferenceInformation_History_lastUpdated_idx" ON "SubstanceReferenceInformation_History" ("lastUpdated");

CREATE TABLE  "SubstanceReferenceInformation_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubstanceReferenceInformation_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubstanceReferenceInformation_Refs_targetId_code_idx" ON "SubstanceReferenceInformation_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubstanceSourceMaterial" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubstanceSourceMaterial_lastUpdated_idx" ON "SubstanceSourceMaterial" ("lastUpdated");
CREATE INDEX "SubstanceSourceMaterial_projectId_lastUpdated_idx" ON "SubstanceSourceMaterial" ("projectId", "lastUpdated");
CREATE INDEX "SubstanceSourceMaterial_projectId_idx" ON "SubstanceSourceMaterial" ("projectId");
CREATE INDEX "SubstanceSourceMaterial__source_idx" ON "SubstanceSourceMaterial" ("_source");
CREATE INDEX "SubstanceSourceMaterial__profile_idx" ON "SubstanceSourceMaterial" USING gin ("_profile");
CREATE INDEX "SubstanceSourceMaterial___version_idx" ON "SubstanceSourceMaterial" ("__version");
CREATE INDEX "SubstanceSourceMaterial_compartments_idx" ON "SubstanceSourceMaterial" USING gin ("compartments");
CREATE INDEX "SubstanceSourceMaterial___sharedTokens_idx" ON "SubstanceSourceMaterial" USING gin ("__sharedTokens");
CREATE INDEX "SubstanceSourceMaterial___sharedTokensTextTrgm_idx" ON "SubstanceSourceMaterial" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubstanceSourceMaterial____tag_idx" ON "SubstanceSourceMaterial" USING gin ("___tag");
CREATE INDEX "SubstanceSourceMaterial____tagTextTrgm_idx" ON "SubstanceSourceMaterial" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SubstanceSourceMaterial_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubstanceSourceMaterial_History_id_idx" ON "SubstanceSourceMaterial_History" ("id");
CREATE INDEX "SubstanceSourceMaterial_History_lastUpdated_idx" ON "SubstanceSourceMaterial_History" ("lastUpdated");

CREATE TABLE  "SubstanceSourceMaterial_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubstanceSourceMaterial_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubstanceSourceMaterial_Refs_targetId_code_idx" ON "SubstanceSourceMaterial_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SubstanceSpecification" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SubstanceSpecification_lastUpdated_idx" ON "SubstanceSpecification" ("lastUpdated");
CREATE INDEX "SubstanceSpecification_projectId_lastUpdated_idx" ON "SubstanceSpecification" ("projectId", "lastUpdated");
CREATE INDEX "SubstanceSpecification_projectId_idx" ON "SubstanceSpecification" ("projectId");
CREATE INDEX "SubstanceSpecification__source_idx" ON "SubstanceSpecification" ("_source");
CREATE INDEX "SubstanceSpecification__profile_idx" ON "SubstanceSpecification" USING gin ("_profile");
CREATE INDEX "SubstanceSpecification___version_idx" ON "SubstanceSpecification" ("__version");
CREATE INDEX "SubstanceSpecification_compartments_idx" ON "SubstanceSpecification" USING gin ("compartments");
CREATE INDEX "SubstanceSpecification___sharedTokens_idx" ON "SubstanceSpecification" USING gin ("__sharedTokens");
CREATE INDEX "SubstanceSpecification___sharedTokensTextTrgm_idx" ON "SubstanceSpecification" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SubstanceSpecification____tag_idx" ON "SubstanceSpecification" USING gin ("___tag");
CREATE INDEX "SubstanceSpecification____tagTextTrgm_idx" ON "SubstanceSpecification" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "SubstanceSpecification___code_idx" ON "SubstanceSpecification" USING gin ("__code");
CREATE INDEX "SubstanceSpecification___codeTextTrgm_idx" ON "SubstanceSpecification" USING gin (token_array_to_text("__codeText") gin_trgm_ops);

CREATE TABLE  "SubstanceSpecification_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SubstanceSpecification_History_id_idx" ON "SubstanceSpecification_History" ("id");
CREATE INDEX "SubstanceSpecification_History_lastUpdated_idx" ON "SubstanceSpecification_History" ("lastUpdated");

CREATE TABLE  "SubstanceSpecification_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SubstanceSpecification_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SubstanceSpecification_Refs_targetId_code_idx" ON "SubstanceSpecification_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SupplyDelivery" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "receiver" TEXT[],
  "status" TEXT,
  "supplier" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__receiverIdentifierSort" TEXT,
  "__supplierIdentifierSort" TEXT
);
CREATE INDEX "SupplyDelivery_lastUpdated_idx" ON "SupplyDelivery" ("lastUpdated");
CREATE INDEX "SupplyDelivery_projectId_lastUpdated_idx" ON "SupplyDelivery" ("projectId", "lastUpdated");
CREATE INDEX "SupplyDelivery_projectId_idx" ON "SupplyDelivery" ("projectId");
CREATE INDEX "SupplyDelivery__source_idx" ON "SupplyDelivery" ("_source");
CREATE INDEX "SupplyDelivery__profile_idx" ON "SupplyDelivery" USING gin ("_profile");
CREATE INDEX "SupplyDelivery___version_idx" ON "SupplyDelivery" ("__version");
CREATE INDEX "SupplyDelivery_compartments_idx" ON "SupplyDelivery" USING gin ("compartments");
CREATE INDEX "SupplyDelivery___sharedTokens_idx" ON "SupplyDelivery" USING gin ("__sharedTokens");
CREATE INDEX "SupplyDelivery___sharedTokensTextTrgm_idx" ON "SupplyDelivery" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SupplyDelivery____tag_idx" ON "SupplyDelivery" USING gin ("___tag");
CREATE INDEX "SupplyDelivery____tagTextTrgm_idx" ON "SupplyDelivery" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "SupplyDelivery___idnt_idx" ON "SupplyDelivery" USING gin ("__identifier");
CREATE INDEX "SupplyDelivery___idntTextTrgm_idx" ON "SupplyDelivery" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "SupplyDelivery_patient_idx" ON "SupplyDelivery" ("patient");
CREATE INDEX "SupplyDelivery_receiver_idx" ON "SupplyDelivery" USING gin ("receiver");
CREATE INDEX "SupplyDelivery_status_idx" ON "SupplyDelivery" ("status");
CREATE INDEX "SupplyDelivery_supplier_idx" ON "SupplyDelivery" ("supplier");

CREATE TABLE  "SupplyDelivery_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SupplyDelivery_History_id_idx" ON "SupplyDelivery_History" ("id");
CREATE INDEX "SupplyDelivery_History_lastUpdated_idx" ON "SupplyDelivery_History" ("lastUpdated");

CREATE TABLE  "SupplyDelivery_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SupplyDelivery_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SupplyDelivery_Refs_targetId_code_idx" ON "SupplyDelivery_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SupplyRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "date" TIMESTAMPTZ,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "requester" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "supplier" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__requesterIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT,
  "__supplierIdentifierSort" TEXT
);
CREATE INDEX "SupplyRequest_lastUpdated_idx" ON "SupplyRequest" ("lastUpdated");
CREATE INDEX "SupplyRequest_projectId_lastUpdated_idx" ON "SupplyRequest" ("projectId", "lastUpdated");
CREATE INDEX "SupplyRequest_projectId_idx" ON "SupplyRequest" ("projectId");
CREATE INDEX "SupplyRequest__source_idx" ON "SupplyRequest" ("_source");
CREATE INDEX "SupplyRequest__profile_idx" ON "SupplyRequest" USING gin ("_profile");
CREATE INDEX "SupplyRequest___version_idx" ON "SupplyRequest" ("__version");
CREATE INDEX "SupplyRequest_compartments_idx" ON "SupplyRequest" USING gin ("compartments");
CREATE INDEX "SupplyRequest___sharedTokens_idx" ON "SupplyRequest" USING gin ("__sharedTokens");
CREATE INDEX "SupplyRequest___sharedTokensTextTrgm_idx" ON "SupplyRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SupplyRequest____tag_idx" ON "SupplyRequest" USING gin ("___tag");
CREATE INDEX "SupplyRequest____tagTextTrgm_idx" ON "SupplyRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "SupplyRequest_date_idx" ON "SupplyRequest" ("date");
CREATE INDEX "SupplyRequest_projectId_date_idx" ON "SupplyRequest" ("projectId", "date");
CREATE INDEX "SupplyRequest___idnt_idx" ON "SupplyRequest" USING gin ("__identifier");
CREATE INDEX "SupplyRequest___idntTextTrgm_idx" ON "SupplyRequest" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "SupplyRequest___category_idx" ON "SupplyRequest" USING gin ("__category");
CREATE INDEX "SupplyRequest___categoryTextTrgm_idx" ON "SupplyRequest" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);
CREATE INDEX "SupplyRequest_requester_idx" ON "SupplyRequest" ("requester");
CREATE INDEX "SupplyRequest_status_idx" ON "SupplyRequest" ("status");
CREATE INDEX "SupplyRequest_subject_idx" ON "SupplyRequest" ("subject");
CREATE INDEX "SupplyRequest_supplier_idx" ON "SupplyRequest" USING gin ("supplier");

CREATE TABLE  "SupplyRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SupplyRequest_History_id_idx" ON "SupplyRequest_History" ("id");
CREATE INDEX "SupplyRequest_History_lastUpdated_idx" ON "SupplyRequest_History" ("lastUpdated");

CREATE TABLE  "SupplyRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SupplyRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SupplyRequest_Refs_targetId_code_idx" ON "SupplyRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Task" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "authoredOn" TIMESTAMPTZ,
  "basedOn" TEXT[],
  "__businessStatus" UUID[],
  "__businessStatusText" TEXT[],
  "__businessStatusSort" TEXT,
  "__code" UUID[],
  "__codeText" TEXT[],
  "__codeSort" TEXT,
  "encounter" TEXT,
  "focus" TEXT,
  "__groupIdentifier" UUID[],
  "__groupIdentifierText" TEXT[],
  "__groupIdentifierSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "intent" TEXT,
  "modified" TIMESTAMPTZ,
  "owner" TEXT,
  "partOf" TEXT[],
  "patient" TEXT,
  "__performer" UUID[],
  "__performerText" TEXT[],
  "__performerSort" TEXT,
  "period" TIMESTAMPTZ,
  "priority" TEXT,
  "requester" TEXT,
  "status" TEXT,
  "subject" TEXT,
  "dueDate" TIMESTAMPTZ,
  "priorityOrder" INTEGER,
  "___compartmentIdentifierSort" TEXT,
  "__basedOnIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__focusIdentifierSort" TEXT,
  "__ownerIdentifierSort" TEXT,
  "__partOfIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__requesterIdentifierSort" TEXT,
  "__subjectIdentifierSort" TEXT
);
CREATE INDEX "Task_lastUpdated_idx" ON "Task" ("lastUpdated");
CREATE INDEX "Task_projectId_lastUpdated_idx" ON "Task" ("projectId", "lastUpdated");
CREATE INDEX "Task_projectId_idx" ON "Task" ("projectId");
CREATE INDEX "Task__source_idx" ON "Task" ("_source");
CREATE INDEX "Task__profile_idx" ON "Task" USING gin ("_profile");
CREATE INDEX "Task___version_idx" ON "Task" ("__version");
CREATE INDEX "Task_compartments_idx" ON "Task" USING gin ("compartments");
CREATE INDEX "Task___sharedTokens_idx" ON "Task" USING gin ("__sharedTokens");
CREATE INDEX "Task___sharedTokensTextTrgm_idx" ON "Task" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Task____tag_idx" ON "Task" USING gin ("___tag");
CREATE INDEX "Task____tagTextTrgm_idx" ON "Task" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Task_authoredOn_idx" ON "Task" ("authoredOn");
CREATE INDEX "Task_basedOn_idx" ON "Task" USING gin ("basedOn");
CREATE INDEX "Task___businessStatus_idx" ON "Task" USING gin ("__businessStatus");
CREATE INDEX "Task___businessStatusTextTrgm_idx" ON "Task" USING gin (token_array_to_text("__businessStatusText") gin_trgm_ops);
CREATE INDEX "Task___code_idx" ON "Task" USING gin ("__code");
CREATE INDEX "Task___codeTextTrgm_idx" ON "Task" USING gin (token_array_to_text("__codeText") gin_trgm_ops);
CREATE INDEX "Task_encounter_idx" ON "Task" ("encounter");
CREATE INDEX "Task_focus_idx" ON "Task" ("focus");
CREATE INDEX "Task___groupIdnt_idx" ON "Task" USING gin ("__groupIdentifier");
CREATE INDEX "Task___groupIdntTextTrgm_idx" ON "Task" USING gin (token_array_to_text("__groupIdentifierText") gin_trgm_ops);
CREATE INDEX "Task___idnt_idx" ON "Task" USING gin ("__identifier");
CREATE INDEX "Task___idntTextTrgm_idx" ON "Task" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Task_intent_idx" ON "Task" ("intent");
CREATE INDEX "Task_modified_idx" ON "Task" ("modified");
CREATE INDEX "Task_owner_idx" ON "Task" ("owner");
CREATE INDEX "Task_partOf_idx" ON "Task" USING gin ("partOf");
CREATE INDEX "Task_patient_idx" ON "Task" ("patient");
CREATE INDEX "Task___performer_idx" ON "Task" USING gin ("__performer");
CREATE INDEX "Task___performerTextTrgm_idx" ON "Task" USING gin (token_array_to_text("__performerText") gin_trgm_ops);
CREATE INDEX "Task_period_idx" ON "Task" ("period");
CREATE INDEX "Task_priority_idx" ON "Task" ("priority");
CREATE INDEX "Task_requester_idx" ON "Task" ("requester");
CREATE INDEX "Task_status_idx" ON "Task" ("status");
CREATE INDEX "Task_subject_idx" ON "Task" ("subject");
CREATE INDEX "Task_dueDate_idx" ON "Task" ("dueDate");
CREATE INDEX "Task_priorityOrder_idx" ON "Task" ("priorityOrder");

CREATE TABLE  "Task_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Task_History_id_idx" ON "Task_History" ("id");
CREATE INDEX "Task_History_lastUpdated_idx" ON "Task_History" ("lastUpdated");

CREATE TABLE  "Task_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Task_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Task_Refs_targetId_code_idx" ON "Task_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "TerminologyCapabilities" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "TerminologyCapabilities_lastUpdated_idx" ON "TerminologyCapabilities" ("lastUpdated");
CREATE INDEX "TerminologyCapabilities_projectId_lastUpdated_idx" ON "TerminologyCapabilities" ("projectId", "lastUpdated");
CREATE INDEX "TerminologyCapabilities_projectId_idx" ON "TerminologyCapabilities" ("projectId");
CREATE INDEX "TerminologyCapabilities__source_idx" ON "TerminologyCapabilities" ("_source");
CREATE INDEX "TerminologyCapabilities__profile_idx" ON "TerminologyCapabilities" USING gin ("_profile");
CREATE INDEX "TerminologyCapabilities___version_idx" ON "TerminologyCapabilities" ("__version");
CREATE INDEX "TerminologyCapabilities_compartments_idx" ON "TerminologyCapabilities" USING gin ("compartments");
CREATE INDEX "TerminologyCapabilities___sharedTokens_idx" ON "TerminologyCapabilities" USING gin ("__sharedTokens");
CREATE INDEX "TerminologyCapabilities___sharedTokensTextTrgm_idx" ON "TerminologyCapabilities" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "TerminologyCapabilities____tag_idx" ON "TerminologyCapabilities" USING gin ("___tag");
CREATE INDEX "TerminologyCapabilities____tagTextTrgm_idx" ON "TerminologyCapabilities" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "TerminologyCapabilities___context_idx" ON "TerminologyCapabilities" USING gin ("__context");
CREATE INDEX "TerminologyCapabilities___contextTextTrgm_idx" ON "TerminologyCapabilities" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "TerminologyCapabilities_contextQuantity_idx" ON "TerminologyCapabilities" USING gin ("contextQuantity");
CREATE INDEX "TerminologyCapabilities___contextType_idx" ON "TerminologyCapabilities" USING gin ("__contextType");
CREATE INDEX "TerminologyCapabilities___contextTypeTextTrgm_idx" ON "TerminologyCapabilities" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "TerminologyCapabilities_date_idx" ON "TerminologyCapabilities" ("date");
CREATE INDEX "TerminologyCapabilities_projectId_date_idx" ON "TerminologyCapabilities" ("projectId", "date");
CREATE INDEX "TerminologyCapabilities_description_idx" ON "TerminologyCapabilities" ("description");
CREATE INDEX "TerminologyCapabilities___jurisdiction_idx" ON "TerminologyCapabilities" USING gin ("__jurisdiction");
CREATE INDEX "TerminologyCapabilities___jurisdictionTextTrgm_idx" ON "TerminologyCapabilities" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "TerminologyCapabilities_name_idx" ON "TerminologyCapabilities" ("name");
CREATE INDEX "TerminologyCapabilities_publisher_idx" ON "TerminologyCapabilities" ("publisher");
CREATE INDEX "TerminologyCapabilities_status_idx" ON "TerminologyCapabilities" ("status");
CREATE INDEX "TerminologyCapabilities_title_idx" ON "TerminologyCapabilities" ("title");
CREATE INDEX "TerminologyCapabilities_url_idx" ON "TerminologyCapabilities" ("url");
CREATE INDEX "TerminologyCapabilities_version_idx" ON "TerminologyCapabilities" ("version");

CREATE TABLE  "TerminologyCapabilities_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "TerminologyCapabilities_History_id_idx" ON "TerminologyCapabilities_History" ("id");
CREATE INDEX "TerminologyCapabilities_History_lastUpdated_idx" ON "TerminologyCapabilities_History" ("lastUpdated");

CREATE TABLE  "TerminologyCapabilities_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "TerminologyCapabilities_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "TerminologyCapabilities_Refs_targetId_code_idx" ON "TerminologyCapabilities_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "TestReport" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "issued" TIMESTAMPTZ,
  "participant" TEXT[],
  "result" TEXT,
  "tester" TEXT,
  "testscript" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__testscriptIdentifierSort" TEXT
);
CREATE INDEX "TestReport_lastUpdated_idx" ON "TestReport" ("lastUpdated");
CREATE INDEX "TestReport_projectId_lastUpdated_idx" ON "TestReport" ("projectId", "lastUpdated");
CREATE INDEX "TestReport_projectId_idx" ON "TestReport" ("projectId");
CREATE INDEX "TestReport__source_idx" ON "TestReport" ("_source");
CREATE INDEX "TestReport__profile_idx" ON "TestReport" USING gin ("_profile");
CREATE INDEX "TestReport___version_idx" ON "TestReport" ("__version");
CREATE INDEX "TestReport_compartments_idx" ON "TestReport" USING gin ("compartments");
CREATE INDEX "TestReport___sharedTokens_idx" ON "TestReport" USING gin ("__sharedTokens");
CREATE INDEX "TestReport___sharedTokensTextTrgm_idx" ON "TestReport" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "TestReport____tag_idx" ON "TestReport" USING gin ("___tag");
CREATE INDEX "TestReport____tagTextTrgm_idx" ON "TestReport" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "TestReport___idnt_idx" ON "TestReport" USING gin ("__identifier");
CREATE INDEX "TestReport___idntTextTrgm_idx" ON "TestReport" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "TestReport_issued_idx" ON "TestReport" ("issued");
CREATE INDEX "TestReport_participant_idx" ON "TestReport" USING gin ("participant");
CREATE INDEX "TestReport_result_idx" ON "TestReport" ("result");
CREATE INDEX "TestReport_tester_idx" ON "TestReport" ("tester");
CREATE INDEX "TestReport_testscript_idx" ON "TestReport" ("testscript");

CREATE TABLE  "TestReport_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "TestReport_History_id_idx" ON "TestReport_History" ("id");
CREATE INDEX "TestReport_History_lastUpdated_idx" ON "TestReport_History" ("lastUpdated");

CREATE TABLE  "TestReport_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "TestReport_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "TestReport_Refs_targetId_code_idx" ON "TestReport_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "TestScript" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "testscriptCapability" TEXT[],
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "TestScript_lastUpdated_idx" ON "TestScript" ("lastUpdated");
CREATE INDEX "TestScript_projectId_lastUpdated_idx" ON "TestScript" ("projectId", "lastUpdated");
CREATE INDEX "TestScript_projectId_idx" ON "TestScript" ("projectId");
CREATE INDEX "TestScript__source_idx" ON "TestScript" ("_source");
CREATE INDEX "TestScript__profile_idx" ON "TestScript" USING gin ("_profile");
CREATE INDEX "TestScript___version_idx" ON "TestScript" ("__version");
CREATE INDEX "TestScript_compartments_idx" ON "TestScript" USING gin ("compartments");
CREATE INDEX "TestScript___sharedTokens_idx" ON "TestScript" USING gin ("__sharedTokens");
CREATE INDEX "TestScript___sharedTokensTextTrgm_idx" ON "TestScript" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "TestScript____tag_idx" ON "TestScript" USING gin ("___tag");
CREATE INDEX "TestScript____tagTextTrgm_idx" ON "TestScript" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "TestScript___context_idx" ON "TestScript" USING gin ("__context");
CREATE INDEX "TestScript___contextTextTrgm_idx" ON "TestScript" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "TestScript_contextQuantity_idx" ON "TestScript" USING gin ("contextQuantity");
CREATE INDEX "TestScript___contextType_idx" ON "TestScript" USING gin ("__contextType");
CREATE INDEX "TestScript___contextTypeTextTrgm_idx" ON "TestScript" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "TestScript_date_idx" ON "TestScript" ("date");
CREATE INDEX "TestScript_projectId_date_idx" ON "TestScript" ("projectId", "date");
CREATE INDEX "TestScript_description_idx" ON "TestScript" ("description");
CREATE INDEX "TestScript___idnt_idx" ON "TestScript" USING gin ("__identifier");
CREATE INDEX "TestScript___idntTextTrgm_idx" ON "TestScript" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "TestScript___jurisdiction_idx" ON "TestScript" USING gin ("__jurisdiction");
CREATE INDEX "TestScript___jurisdictionTextTrgm_idx" ON "TestScript" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "TestScript_name_idx" ON "TestScript" ("name");
CREATE INDEX "TestScript_publisher_idx" ON "TestScript" ("publisher");
CREATE INDEX "TestScript_status_idx" ON "TestScript" ("status");
CREATE INDEX "TestScript_testscriptCapability_idx" ON "TestScript" USING gin ("testscriptCapability");
CREATE INDEX "TestScript_title_idx" ON "TestScript" ("title");
CREATE INDEX "TestScript_url_idx" ON "TestScript" ("url");
CREATE INDEX "TestScript_version_idx" ON "TestScript" ("version");

CREATE TABLE  "TestScript_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "TestScript_History_id_idx" ON "TestScript_History" ("id");
CREATE INDEX "TestScript_History_lastUpdated_idx" ON "TestScript_History" ("lastUpdated");

CREATE TABLE  "TestScript_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "TestScript_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "TestScript_Refs_targetId_code_idx" ON "TestScript_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ValueSet" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__context" UUID[],
  "__contextText" TEXT[],
  "__contextSort" TEXT,
  "contextQuantity" DOUBLE PRECISION[],
  "__contextType" UUID[],
  "__contextTypeText" TEXT[],
  "__contextTypeSort" TEXT,
  "date" TIMESTAMPTZ,
  "description" TEXT,
  "__jurisdiction" UUID[],
  "__jurisdictionText" TEXT[],
  "__jurisdictionSort" TEXT,
  "name" TEXT,
  "publisher" TEXT,
  "status" TEXT,
  "title" TEXT,
  "url" TEXT,
  "version" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "code" TEXT[],
  "expansion" TEXT,
  "reference" TEXT[],
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "ValueSet_lastUpdated_idx" ON "ValueSet" ("lastUpdated");
CREATE INDEX "ValueSet_projectId_lastUpdated_idx" ON "ValueSet" ("projectId", "lastUpdated");
CREATE INDEX "ValueSet_projectId_idx" ON "ValueSet" ("projectId");
CREATE INDEX "ValueSet__source_idx" ON "ValueSet" ("_source");
CREATE INDEX "ValueSet__profile_idx" ON "ValueSet" USING gin ("_profile");
CREATE INDEX "ValueSet___version_idx" ON "ValueSet" ("__version");
CREATE INDEX "ValueSet_compartments_idx" ON "ValueSet" USING gin ("compartments");
CREATE INDEX "ValueSet___sharedTokens_idx" ON "ValueSet" USING gin ("__sharedTokens");
CREATE INDEX "ValueSet___sharedTokensTextTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ValueSet____tag_idx" ON "ValueSet" USING gin ("___tag");
CREATE INDEX "ValueSet____tagTextTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ValueSet___context_idx" ON "ValueSet" USING gin ("__context");
CREATE INDEX "ValueSet___contextTextTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("__contextText") gin_trgm_ops);
CREATE INDEX "ValueSet_contextQuantity_idx" ON "ValueSet" USING gin ("contextQuantity");
CREATE INDEX "ValueSet___contextType_idx" ON "ValueSet" USING gin ("__contextType");
CREATE INDEX "ValueSet___contextTypeTextTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("__contextTypeText") gin_trgm_ops);
CREATE INDEX "ValueSet_date_idx" ON "ValueSet" ("date");
CREATE INDEX "ValueSet_projectId_date_idx" ON "ValueSet" ("projectId", "date");
CREATE INDEX "ValueSet_description_idx" ON "ValueSet" ("description");
CREATE INDEX "ValueSet___jurisdiction_idx" ON "ValueSet" USING gin ("__jurisdiction");
CREATE INDEX "ValueSet___jurisdictionTextTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("__jurisdictionText") gin_trgm_ops);
CREATE INDEX "ValueSet_name_idx" ON "ValueSet" ("name");
CREATE INDEX "ValueSet_publisher_idx" ON "ValueSet" ("publisher");
CREATE INDEX "ValueSet_status_idx" ON "ValueSet" ("status");
CREATE INDEX "ValueSet_title_idx" ON "ValueSet" ("title");
CREATE INDEX "ValueSet_url_idx" ON "ValueSet" ("url");
CREATE INDEX "ValueSet_version_idx" ON "ValueSet" ("version");
CREATE INDEX "ValueSet___idnt_idx" ON "ValueSet" USING gin ("__identifier");
CREATE INDEX "ValueSet___idntTextTrgm_idx" ON "ValueSet" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "ValueSet_code_idx" ON "ValueSet" USING gin ("code");
CREATE INDEX "ValueSet_expansion_idx" ON "ValueSet" ("expansion");
CREATE INDEX "ValueSet_reference_idx" ON "ValueSet" USING gin ("reference");

CREATE TABLE  "ValueSet_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ValueSet_History_id_idx" ON "ValueSet_History" ("id");
CREATE INDEX "ValueSet_History_lastUpdated_idx" ON "ValueSet_History" ("lastUpdated");

CREATE TABLE  "ValueSet_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ValueSet_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ValueSet_Refs_targetId_code_idx" ON "ValueSet_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "VerificationResult" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "target" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__targetIdentifierSort" TEXT
);
CREATE INDEX "VerificationResult_lastUpdated_idx" ON "VerificationResult" ("lastUpdated");
CREATE INDEX "VerificationResult_projectId_lastUpdated_idx" ON "VerificationResult" ("projectId", "lastUpdated");
CREATE INDEX "VerificationResult_projectId_idx" ON "VerificationResult" ("projectId");
CREATE INDEX "VerificationResult__source_idx" ON "VerificationResult" ("_source");
CREATE INDEX "VerificationResult__profile_idx" ON "VerificationResult" USING gin ("_profile");
CREATE INDEX "VerificationResult___version_idx" ON "VerificationResult" ("__version");
CREATE INDEX "VerificationResult_compartments_idx" ON "VerificationResult" USING gin ("compartments");
CREATE INDEX "VerificationResult___sharedTokens_idx" ON "VerificationResult" USING gin ("__sharedTokens");
CREATE INDEX "VerificationResult___sharedTokensTextTrgm_idx" ON "VerificationResult" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "VerificationResult____tag_idx" ON "VerificationResult" USING gin ("___tag");
CREATE INDEX "VerificationResult____tagTextTrgm_idx" ON "VerificationResult" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "VerificationResult_target_idx" ON "VerificationResult" USING gin ("target");

CREATE TABLE  "VerificationResult_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "VerificationResult_History_id_idx" ON "VerificationResult_History" ("id");
CREATE INDEX "VerificationResult_History_lastUpdated_idx" ON "VerificationResult_History" ("lastUpdated");

CREATE TABLE  "VerificationResult_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "VerificationResult_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "VerificationResult_Refs_targetId_code_idx" ON "VerificationResult_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "VisionPrescription" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "patient" TEXT,
  "encounter" TEXT,
  "datewritten" TIMESTAMPTZ,
  "prescriber" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__patientIdentifierSort" TEXT,
  "__encounterIdentifierSort" TEXT,
  "__prescriberIdentifierSort" TEXT
);
CREATE INDEX "VisionPrescription_lastUpdated_idx" ON "VisionPrescription" ("lastUpdated");
CREATE INDEX "VisionPrescription_projectId_lastUpdated_idx" ON "VisionPrescription" ("projectId", "lastUpdated");
CREATE INDEX "VisionPrescription_projectId_idx" ON "VisionPrescription" ("projectId");
CREATE INDEX "VisionPrescription__source_idx" ON "VisionPrescription" ("_source");
CREATE INDEX "VisionPrescription__profile_idx" ON "VisionPrescription" USING gin ("_profile");
CREATE INDEX "VisionPrescription___version_idx" ON "VisionPrescription" ("__version");
CREATE INDEX "VisionPrescription_compartments_idx" ON "VisionPrescription" USING gin ("compartments");
CREATE INDEX "VisionPrescription___sharedTokens_idx" ON "VisionPrescription" USING gin ("__sharedTokens");
CREATE INDEX "VisionPrescription___sharedTokensTextTrgm_idx" ON "VisionPrescription" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "VisionPrescription____tag_idx" ON "VisionPrescription" USING gin ("___tag");
CREATE INDEX "VisionPrescription____tagTextTrgm_idx" ON "VisionPrescription" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "VisionPrescription___idnt_idx" ON "VisionPrescription" USING gin ("__identifier");
CREATE INDEX "VisionPrescription___idntTextTrgm_idx" ON "VisionPrescription" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "VisionPrescription_patient_idx" ON "VisionPrescription" ("patient");
CREATE INDEX "VisionPrescription_encounter_idx" ON "VisionPrescription" ("encounter");
CREATE INDEX "VisionPrescription_datewritten_idx" ON "VisionPrescription" ("datewritten");
CREATE INDEX "VisionPrescription_prescriber_idx" ON "VisionPrescription" ("prescriber");
CREATE INDEX "VisionPrescription_status_idx" ON "VisionPrescription" ("status");

CREATE TABLE  "VisionPrescription_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "VisionPrescription_History_id_idx" ON "VisionPrescription_History" ("id");
CREATE INDEX "VisionPrescription_History_lastUpdated_idx" ON "VisionPrescription_History" ("lastUpdated");

CREATE TABLE  "VisionPrescription_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "VisionPrescription_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "VisionPrescription_Refs_targetId_code_idx" ON "VisionPrescription_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Project" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT,
  "owner" TEXT,
  "googleClientId" TEXT[],
  "recaptchaSiteKey" TEXT[],
  "___compartmentIdentifierSort" TEXT,
  "__ownerIdentifierSort" TEXT
);
CREATE INDEX "Project_lastUpdated_idx" ON "Project" ("lastUpdated");
CREATE INDEX "Project_projectId_lastUpdated_idx" ON "Project" ("projectId", "lastUpdated");
CREATE INDEX "Project_projectId_idx" ON "Project" ("projectId");
CREATE INDEX "Project__source_idx" ON "Project" ("_source");
CREATE INDEX "Project__profile_idx" ON "Project" USING gin ("_profile");
CREATE INDEX "Project___version_idx" ON "Project" ("__version");
CREATE INDEX "Project_compartments_idx" ON "Project" USING gin ("compartments");
CREATE INDEX "Project___sharedTokens_idx" ON "Project" USING gin ("__sharedTokens");
CREATE INDEX "Project___sharedTokensTextTrgm_idx" ON "Project" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Project____tag_idx" ON "Project" USING gin ("___tag");
CREATE INDEX "Project____tagTextTrgm_idx" ON "Project" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Project___idnt_idx" ON "Project" USING gin ("__identifier");
CREATE INDEX "Project___idntTextTrgm_idx" ON "Project" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Project_name_idx" ON "Project" ("name");
CREATE INDEX "Project_owner_idx" ON "Project" ("owner");
CREATE INDEX "Project_googleClientId_idx" ON "Project" USING gin ("googleClientId");
CREATE INDEX "Project_recaptchaSiteKey_idx" ON "Project" USING gin ("recaptchaSiteKey");

CREATE TABLE  "Project_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Project_History_id_idx" ON "Project_History" ("id");
CREATE INDEX "Project_History_lastUpdated_idx" ON "Project_History" ("lastUpdated");

CREATE TABLE  "Project_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Project_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Project_Refs_targetId_code_idx" ON "Project_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ClientApplication" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "name" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "ClientApplication_lastUpdated_idx" ON "ClientApplication" ("lastUpdated");
CREATE INDEX "ClientApplication_projectId_lastUpdated_idx" ON "ClientApplication" ("projectId", "lastUpdated");
CREATE INDEX "ClientApplication_projectId_idx" ON "ClientApplication" ("projectId");
CREATE INDEX "ClientApplication__source_idx" ON "ClientApplication" ("_source");
CREATE INDEX "ClientApplication__profile_idx" ON "ClientApplication" USING gin ("_profile");
CREATE INDEX "ClientApplication___version_idx" ON "ClientApplication" ("__version");
CREATE INDEX "ClientApplication_compartments_idx" ON "ClientApplication" USING gin ("compartments");
CREATE INDEX "ClientApplication___sharedTokens_idx" ON "ClientApplication" USING gin ("__sharedTokens");
CREATE INDEX "ClientApplication___sharedTokensTextTrgm_idx" ON "ClientApplication" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ClientApplication____tag_idx" ON "ClientApplication" USING gin ("___tag");
CREATE INDEX "ClientApplication____tagTextTrgm_idx" ON "ClientApplication" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ClientApplication_name_idx" ON "ClientApplication" ("name");

CREATE TABLE  "ClientApplication_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ClientApplication_History_id_idx" ON "ClientApplication_History" ("id");
CREATE INDEX "ClientApplication_History_lastUpdated_idx" ON "ClientApplication_History" ("lastUpdated");

CREATE TABLE  "ClientApplication_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ClientApplication_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ClientApplication_Refs_targetId_code_idx" ON "ClientApplication_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "User" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "email" TEXT,
  "externalId" TEXT,
  "project" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__projectIdentifierSort" TEXT
);
CREATE INDEX "User_lastUpdated_idx" ON "User" ("lastUpdated");
CREATE INDEX "User_projectId_lastUpdated_idx" ON "User" ("projectId", "lastUpdated");
CREATE INDEX "User_projectId_idx" ON "User" ("projectId");
CREATE INDEX "User__source_idx" ON "User" ("_source");
CREATE INDEX "User__profile_idx" ON "User" USING gin ("_profile");
CREATE INDEX "User___version_idx" ON "User" ("__version");
CREATE INDEX "User_compartments_idx" ON "User" USING gin ("compartments");
CREATE INDEX "User___sharedTokens_idx" ON "User" USING gin ("__sharedTokens");
CREATE INDEX "User___sharedTokensTextTrgm_idx" ON "User" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "User____tag_idx" ON "User" USING gin ("___tag");
CREATE INDEX "User____tagTextTrgm_idx" ON "User" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "User___idnt_idx" ON "User" USING gin ("__identifier");
CREATE INDEX "User___idntTextTrgm_idx" ON "User" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "User_email_idx" ON "User" ("email");
CREATE INDEX "User_externalId_idx" ON "User" ("externalId");
CREATE INDEX "User_project_idx" ON "User" ("project");
CREATE UNIQUE INDEX "User_project_email_idx" ON "User" ("project", "email");
CREATE UNIQUE INDEX "User_project_externalId_idx" ON "User" ("project", "externalId");

CREATE TABLE  "User_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "User_History_id_idx" ON "User_History" ("id");
CREATE INDEX "User_History_lastUpdated_idx" ON "User_History" ("lastUpdated");

CREATE TABLE  "User_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "User_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "User_Refs_targetId_code_idx" ON "User_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "ProjectMembership" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "project" TEXT,
  "user" TEXT,
  "profile" TEXT DEFAULT ''::text,
  "profileType" TEXT,
  "userName" TEXT,
  "externalId" TEXT,
  "accessPolicy" TEXT[],
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__projectIdentifierSort" TEXT,
  "__userIdentifierSort" TEXT,
  "__profileIdentifierSort" TEXT,
  "__accessPolicyIdentifierSort" TEXT
);
CREATE INDEX "ProjectMembership_lastUpdated_idx" ON "ProjectMembership" ("lastUpdated");
CREATE INDEX "ProjectMembership_projectId_lastUpdated_idx" ON "ProjectMembership" ("projectId", "lastUpdated");
CREATE INDEX "ProjectMembership_projectId_idx" ON "ProjectMembership" ("projectId");
CREATE INDEX "ProjectMembership__source_idx" ON "ProjectMembership" ("_source");
CREATE INDEX "ProjectMembership__profile_idx" ON "ProjectMembership" USING gin ("_profile");
CREATE INDEX "ProjectMembership___version_idx" ON "ProjectMembership" ("__version");
CREATE INDEX "ProjectMembership_compartments_idx" ON "ProjectMembership" USING gin ("compartments");
CREATE INDEX "ProjectMembership___sharedTokens_idx" ON "ProjectMembership" USING gin ("__sharedTokens");
CREATE INDEX "ProjectMembership___sharedTokensTextTrgm_idx" ON "ProjectMembership" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "ProjectMembership____tag_idx" ON "ProjectMembership" USING gin ("___tag");
CREATE INDEX "ProjectMembership____tagTextTrgm_idx" ON "ProjectMembership" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "ProjectMembership_project_idx" ON "ProjectMembership" ("project");
CREATE INDEX "ProjectMembership_user_idx" ON "ProjectMembership" ("user");
CREATE INDEX "ProjectMembership_profile_idx" ON "ProjectMembership" ("profile");
CREATE INDEX "ProjectMembership_profileType_idx" ON "ProjectMembership" ("profileType");
CREATE INDEX "ProjectMembership_userName_idx" ON "ProjectMembership" ("userName");
CREATE INDEX "ProjectMembership_externalId_idx" ON "ProjectMembership" ("externalId");
CREATE INDEX "ProjectMembership_accessPolicy_idx" ON "ProjectMembership" USING gin ("accessPolicy");
CREATE INDEX "ProjectMembership___idnt_idx" ON "ProjectMembership" USING gin ("__identifier");
CREATE INDEX "ProjectMembership___idntTextTrgm_idx" ON "ProjectMembership" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE UNIQUE INDEX "ProjectMembership_project_externalId_idx" ON "ProjectMembership" ("project", "externalId");
CREATE UNIQUE INDEX "ProjectMembership_project_userName_idx" ON "ProjectMembership" ("project", "userName");

CREATE TABLE  "ProjectMembership_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "ProjectMembership_History_id_idx" ON "ProjectMembership_History" ("id");
CREATE INDEX "ProjectMembership_History_lastUpdated_idx" ON "ProjectMembership_History" ("lastUpdated");

CREATE TABLE  "ProjectMembership_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "ProjectMembership_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "ProjectMembership_Refs_targetId_code_idx" ON "ProjectMembership_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Bot" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT,
  "__category" UUID[],
  "__categoryText" TEXT[],
  "__categorySort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "Bot_lastUpdated_idx" ON "Bot" ("lastUpdated");
CREATE INDEX "Bot_projectId_lastUpdated_idx" ON "Bot" ("projectId", "lastUpdated");
CREATE INDEX "Bot_projectId_idx" ON "Bot" ("projectId");
CREATE INDEX "Bot__source_idx" ON "Bot" ("_source");
CREATE INDEX "Bot__profile_idx" ON "Bot" USING gin ("_profile");
CREATE INDEX "Bot___version_idx" ON "Bot" ("__version");
CREATE INDEX "Bot_compartments_idx" ON "Bot" USING gin ("compartments");
CREATE INDEX "Bot___sharedTokens_idx" ON "Bot" USING gin ("__sharedTokens");
CREATE INDEX "Bot___sharedTokensTextTrgm_idx" ON "Bot" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Bot____tag_idx" ON "Bot" USING gin ("___tag");
CREATE INDEX "Bot____tagTextTrgm_idx" ON "Bot" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Bot___idnt_idx" ON "Bot" USING gin ("__identifier");
CREATE INDEX "Bot___idntTextTrgm_idx" ON "Bot" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Bot_name_idx" ON "Bot" ("name");
CREATE INDEX "Bot___category_idx" ON "Bot" USING gin ("__category");
CREATE INDEX "Bot___categoryTextTrgm_idx" ON "Bot" USING gin (token_array_to_text("__categoryText") gin_trgm_ops);

CREATE TABLE  "Bot_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Bot_History_id_idx" ON "Bot_History" ("id");
CREATE INDEX "Bot_History_lastUpdated_idx" ON "Bot_History" ("lastUpdated");

CREATE TABLE  "Bot_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Bot_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Bot_Refs_targetId_code_idx" ON "Bot_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Login" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "user" TEXT,
  "code" TEXT,
  "cookie" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__userIdentifierSort" TEXT
);
CREATE INDEX "Login_lastUpdated_idx" ON "Login" ("lastUpdated");
CREATE INDEX "Login_projectId_lastUpdated_idx" ON "Login" ("projectId", "lastUpdated");
CREATE INDEX "Login_projectId_idx" ON "Login" ("projectId");
CREATE INDEX "Login__source_idx" ON "Login" ("_source");
CREATE INDEX "Login__profile_idx" ON "Login" USING gin ("_profile");
CREATE INDEX "Login___version_idx" ON "Login" ("__version");
CREATE INDEX "Login_compartments_idx" ON "Login" USING gin ("compartments");
CREATE INDEX "Login___sharedTokens_idx" ON "Login" USING gin ("__sharedTokens");
CREATE INDEX "Login___sharedTokensTextTrgm_idx" ON "Login" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Login____tag_idx" ON "Login" USING gin ("___tag");
CREATE INDEX "Login____tagTextTrgm_idx" ON "Login" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Login_user_idx" ON "Login" ("user");
CREATE INDEX "Login_code_idx" ON "Login" ("code");
CREATE INDEX "Login_cookie_idx" ON "Login" ("cookie");

CREATE TABLE  "Login_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Login_History_id_idx" ON "Login_History" ("id");
CREATE INDEX "Login_History_lastUpdated_idx" ON "Login_History" ("lastUpdated");

CREATE TABLE  "Login_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Login_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Login_Refs_targetId_code_idx" ON "Login_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "PasswordChangeRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "user" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__userIdentifierSort" TEXT
);
CREATE INDEX "PasswordChangeRequest_lastUpdated_idx" ON "PasswordChangeRequest" ("lastUpdated");
CREATE INDEX "PasswordChangeRequest_projectId_lastUpdated_idx" ON "PasswordChangeRequest" ("projectId", "lastUpdated");
CREATE INDEX "PasswordChangeRequest_projectId_idx" ON "PasswordChangeRequest" ("projectId");
CREATE INDEX "PasswordChangeRequest__source_idx" ON "PasswordChangeRequest" ("_source");
CREATE INDEX "PasswordChangeRequest__profile_idx" ON "PasswordChangeRequest" USING gin ("_profile");
CREATE INDEX "PasswordChangeRequest___version_idx" ON "PasswordChangeRequest" ("__version");
CREATE INDEX "PasswordChangeRequest_compartments_idx" ON "PasswordChangeRequest" USING gin ("compartments");
CREATE INDEX "PasswordChangeRequest___sharedTokens_idx" ON "PasswordChangeRequest" USING gin ("__sharedTokens");
CREATE INDEX "PasswordChangeRequest___sharedTokensTextTrgm_idx" ON "PasswordChangeRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "PasswordChangeRequest____tag_idx" ON "PasswordChangeRequest" USING gin ("___tag");
CREATE INDEX "PasswordChangeRequest____tagTextTrgm_idx" ON "PasswordChangeRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "PasswordChangeRequest_user_idx" ON "PasswordChangeRequest" ("user");

CREATE TABLE  "PasswordChangeRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "PasswordChangeRequest_History_id_idx" ON "PasswordChangeRequest_History" ("id");
CREATE INDEX "PasswordChangeRequest_History_lastUpdated_idx" ON "PasswordChangeRequest_History" ("lastUpdated");

CREATE TABLE  "PasswordChangeRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "PasswordChangeRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "PasswordChangeRequest_Refs_targetId_code_idx" ON "PasswordChangeRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "UserSecurityRequest" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "user" TEXT,
  "___compartmentIdentifierSort" TEXT,
  "__userIdentifierSort" TEXT
);
CREATE INDEX "UserSecurityRequest_lastUpdated_idx" ON "UserSecurityRequest" ("lastUpdated");
CREATE INDEX "UserSecurityRequest_projectId_lastUpdated_idx" ON "UserSecurityRequest" ("projectId", "lastUpdated");
CREATE INDEX "UserSecurityRequest_projectId_idx" ON "UserSecurityRequest" ("projectId");
CREATE INDEX "UserSecurityRequest__source_idx" ON "UserSecurityRequest" ("_source");
CREATE INDEX "UserSecurityRequest__profile_idx" ON "UserSecurityRequest" USING gin ("_profile");
CREATE INDEX "UserSecurityRequest___version_idx" ON "UserSecurityRequest" ("__version");
CREATE INDEX "UserSecurityRequest_compartments_idx" ON "UserSecurityRequest" USING gin ("compartments");
CREATE INDEX "UserSecurityRequest___sharedTokens_idx" ON "UserSecurityRequest" USING gin ("__sharedTokens");
CREATE INDEX "UserSecurityRequest___sharedTokensTextTrgm_idx" ON "UserSecurityRequest" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "UserSecurityRequest____tag_idx" ON "UserSecurityRequest" USING gin ("___tag");
CREATE INDEX "UserSecurityRequest____tagTextTrgm_idx" ON "UserSecurityRequest" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "UserSecurityRequest_user_idx" ON "UserSecurityRequest" ("user");

CREATE TABLE  "UserSecurityRequest_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "UserSecurityRequest_History_id_idx" ON "UserSecurityRequest_History" ("id");
CREATE INDEX "UserSecurityRequest_History_lastUpdated_idx" ON "UserSecurityRequest_History" ("lastUpdated");

CREATE TABLE  "UserSecurityRequest_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "UserSecurityRequest_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "UserSecurityRequest_Refs_targetId_code_idx" ON "UserSecurityRequest_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "JsonWebKey" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "active" BOOLEAN,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "JsonWebKey_lastUpdated_idx" ON "JsonWebKey" ("lastUpdated");
CREATE INDEX "JsonWebKey_projectId_lastUpdated_idx" ON "JsonWebKey" ("projectId", "lastUpdated");
CREATE INDEX "JsonWebKey_projectId_idx" ON "JsonWebKey" ("projectId");
CREATE INDEX "JsonWebKey__source_idx" ON "JsonWebKey" ("_source");
CREATE INDEX "JsonWebKey__profile_idx" ON "JsonWebKey" USING gin ("_profile");
CREATE INDEX "JsonWebKey___version_idx" ON "JsonWebKey" ("__version");
CREATE INDEX "JsonWebKey_compartments_idx" ON "JsonWebKey" USING gin ("compartments");
CREATE INDEX "JsonWebKey___sharedTokens_idx" ON "JsonWebKey" USING gin ("__sharedTokens");
CREATE INDEX "JsonWebKey___sharedTokensTextTrgm_idx" ON "JsonWebKey" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "JsonWebKey____tag_idx" ON "JsonWebKey" USING gin ("___tag");
CREATE INDEX "JsonWebKey____tagTextTrgm_idx" ON "JsonWebKey" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "JsonWebKey_active_idx" ON "JsonWebKey" ("active");

CREATE TABLE  "JsonWebKey_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "JsonWebKey_History_id_idx" ON "JsonWebKey_History" ("id");
CREATE INDEX "JsonWebKey_History_lastUpdated_idx" ON "JsonWebKey_History" ("lastUpdated");

CREATE TABLE  "JsonWebKey_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "JsonWebKey_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "JsonWebKey_Refs_targetId_code_idx" ON "JsonWebKey_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "AccessPolicy" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "name" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "AccessPolicy_lastUpdated_idx" ON "AccessPolicy" ("lastUpdated");
CREATE INDEX "AccessPolicy_projectId_lastUpdated_idx" ON "AccessPolicy" ("projectId", "lastUpdated");
CREATE INDEX "AccessPolicy_projectId_idx" ON "AccessPolicy" ("projectId");
CREATE INDEX "AccessPolicy__source_idx" ON "AccessPolicy" ("_source");
CREATE INDEX "AccessPolicy__profile_idx" ON "AccessPolicy" USING gin ("_profile");
CREATE INDEX "AccessPolicy___version_idx" ON "AccessPolicy" ("__version");
CREATE INDEX "AccessPolicy_compartments_idx" ON "AccessPolicy" USING gin ("compartments");
CREATE INDEX "AccessPolicy___sharedTokens_idx" ON "AccessPolicy" USING gin ("__sharedTokens");
CREATE INDEX "AccessPolicy___sharedTokensTextTrgm_idx" ON "AccessPolicy" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "AccessPolicy____tag_idx" ON "AccessPolicy" USING gin ("___tag");
CREATE INDEX "AccessPolicy____tagTextTrgm_idx" ON "AccessPolicy" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "AccessPolicy_name_idx" ON "AccessPolicy" ("name");

CREATE TABLE  "AccessPolicy_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AccessPolicy_History_id_idx" ON "AccessPolicy_History" ("id");
CREATE INDEX "AccessPolicy_History_lastUpdated_idx" ON "AccessPolicy_History" ("lastUpdated");

CREATE TABLE  "AccessPolicy_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "AccessPolicy_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "AccessPolicy_Refs_targetId_code_idx" ON "AccessPolicy_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "UserConfiguration" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "name" TEXT DEFAULT ''::text,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "UserConfiguration_lastUpdated_idx" ON "UserConfiguration" ("lastUpdated");
CREATE INDEX "UserConfiguration_projectId_lastUpdated_idx" ON "UserConfiguration" ("projectId", "lastUpdated");
CREATE INDEX "UserConfiguration_projectId_idx" ON "UserConfiguration" ("projectId");
CREATE INDEX "UserConfiguration__source_idx" ON "UserConfiguration" ("_source");
CREATE INDEX "UserConfiguration__profile_idx" ON "UserConfiguration" USING gin ("_profile");
CREATE INDEX "UserConfiguration___version_idx" ON "UserConfiguration" ("__version");
CREATE INDEX "UserConfiguration_compartments_idx" ON "UserConfiguration" USING gin ("compartments");
CREATE INDEX "UserConfiguration___sharedTokens_idx" ON "UserConfiguration" USING gin ("__sharedTokens");
CREATE INDEX "UserConfiguration___sharedTokensTextTrgm_idx" ON "UserConfiguration" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "UserConfiguration____tag_idx" ON "UserConfiguration" USING gin ("___tag");
CREATE INDEX "UserConfiguration____tagTextTrgm_idx" ON "UserConfiguration" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "UserConfiguration_name_idx" ON "UserConfiguration" ("name");

CREATE TABLE  "UserConfiguration_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "UserConfiguration_History_id_idx" ON "UserConfiguration_History" ("id");
CREATE INDEX "UserConfiguration_History_lastUpdated_idx" ON "UserConfiguration_History" ("lastUpdated");

CREATE TABLE  "UserConfiguration_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "UserConfiguration_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "UserConfiguration_Refs_targetId_code_idx" ON "UserConfiguration_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "BulkDataExport" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "BulkDataExport_lastUpdated_idx" ON "BulkDataExport" ("lastUpdated");
CREATE INDEX "BulkDataExport_projectId_lastUpdated_idx" ON "BulkDataExport" ("projectId", "lastUpdated");
CREATE INDEX "BulkDataExport_projectId_idx" ON "BulkDataExport" ("projectId");
CREATE INDEX "BulkDataExport__source_idx" ON "BulkDataExport" ("_source");
CREATE INDEX "BulkDataExport__profile_idx" ON "BulkDataExport" USING gin ("_profile");
CREATE INDEX "BulkDataExport___version_idx" ON "BulkDataExport" ("__version");
CREATE INDEX "BulkDataExport_compartments_idx" ON "BulkDataExport" USING gin ("compartments");
CREATE INDEX "BulkDataExport___sharedTokens_idx" ON "BulkDataExport" USING gin ("__sharedTokens");
CREATE INDEX "BulkDataExport___sharedTokensTextTrgm_idx" ON "BulkDataExport" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "BulkDataExport____tag_idx" ON "BulkDataExport" USING gin ("___tag");
CREATE INDEX "BulkDataExport____tagTextTrgm_idx" ON "BulkDataExport" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "BulkDataExport_status_idx" ON "BulkDataExport" ("status");

CREATE TABLE  "BulkDataExport_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "BulkDataExport_History_id_idx" ON "BulkDataExport_History" ("id");
CREATE INDEX "BulkDataExport_History_lastUpdated_idx" ON "BulkDataExport_History" ("lastUpdated");

CREATE TABLE  "BulkDataExport_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "BulkDataExport_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "BulkDataExport_Refs_targetId_code_idx" ON "BulkDataExport_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "SmartAppLaunch" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "SmartAppLaunch_lastUpdated_idx" ON "SmartAppLaunch" ("lastUpdated");
CREATE INDEX "SmartAppLaunch_projectId_lastUpdated_idx" ON "SmartAppLaunch" ("projectId", "lastUpdated");
CREATE INDEX "SmartAppLaunch_projectId_idx" ON "SmartAppLaunch" ("projectId");
CREATE INDEX "SmartAppLaunch__source_idx" ON "SmartAppLaunch" ("_source");
CREATE INDEX "SmartAppLaunch__profile_idx" ON "SmartAppLaunch" USING gin ("_profile");
CREATE INDEX "SmartAppLaunch___version_idx" ON "SmartAppLaunch" ("__version");
CREATE INDEX "SmartAppLaunch_compartments_idx" ON "SmartAppLaunch" USING gin ("compartments");
CREATE INDEX "SmartAppLaunch___sharedTokens_idx" ON "SmartAppLaunch" USING gin ("__sharedTokens");
CREATE INDEX "SmartAppLaunch___sharedTokensTextTrgm_idx" ON "SmartAppLaunch" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "SmartAppLaunch____tag_idx" ON "SmartAppLaunch" USING gin ("___tag");
CREATE INDEX "SmartAppLaunch____tagTextTrgm_idx" ON "SmartAppLaunch" USING gin (token_array_to_text("___tagText") gin_trgm_ops);

CREATE TABLE  "SmartAppLaunch_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "SmartAppLaunch_History_id_idx" ON "SmartAppLaunch_History" ("id");
CREATE INDEX "SmartAppLaunch_History_lastUpdated_idx" ON "SmartAppLaunch_History" ("lastUpdated");

CREATE TABLE  "SmartAppLaunch_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "SmartAppLaunch_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "SmartAppLaunch_Refs_targetId_code_idx" ON "SmartAppLaunch_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "DomainConfiguration" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "domain" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "DomainConfiguration_lastUpdated_idx" ON "DomainConfiguration" ("lastUpdated");
CREATE INDEX "DomainConfiguration_projectId_lastUpdated_idx" ON "DomainConfiguration" ("projectId", "lastUpdated");
CREATE INDEX "DomainConfiguration_projectId_idx" ON "DomainConfiguration" ("projectId");
CREATE INDEX "DomainConfiguration__source_idx" ON "DomainConfiguration" ("_source");
CREATE INDEX "DomainConfiguration__profile_idx" ON "DomainConfiguration" USING gin ("_profile");
CREATE INDEX "DomainConfiguration___version_idx" ON "DomainConfiguration" ("__version");
CREATE INDEX "DomainConfiguration_compartments_idx" ON "DomainConfiguration" USING gin ("compartments");
CREATE INDEX "DomainConfiguration___sharedTokens_idx" ON "DomainConfiguration" USING gin ("__sharedTokens");
CREATE INDEX "DomainConfiguration___sharedTokensTextTrgm_idx" ON "DomainConfiguration" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "DomainConfiguration____tag_idx" ON "DomainConfiguration" USING gin ("___tag");
CREATE INDEX "DomainConfiguration____tagTextTrgm_idx" ON "DomainConfiguration" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE UNIQUE INDEX "DomainConfiguration_domain_idx" ON "DomainConfiguration" ("domain");

CREATE TABLE  "DomainConfiguration_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "DomainConfiguration_History_id_idx" ON "DomainConfiguration_History" ("id");
CREATE INDEX "DomainConfiguration_History_lastUpdated_idx" ON "DomainConfiguration_History" ("lastUpdated");

CREATE TABLE  "DomainConfiguration_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "DomainConfiguration_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "DomainConfiguration_Refs_targetId_code_idx" ON "DomainConfiguration_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "AsyncJob" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "type" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "AsyncJob_lastUpdated_idx" ON "AsyncJob" ("lastUpdated");
CREATE INDEX "AsyncJob_projectId_lastUpdated_idx" ON "AsyncJob" ("projectId", "lastUpdated");
CREATE INDEX "AsyncJob_projectId_idx" ON "AsyncJob" ("projectId");
CREATE INDEX "AsyncJob__source_idx" ON "AsyncJob" ("_source");
CREATE INDEX "AsyncJob__profile_idx" ON "AsyncJob" USING gin ("_profile");
CREATE INDEX "AsyncJob___version_idx" ON "AsyncJob" ("__version");
CREATE INDEX "AsyncJob_compartments_idx" ON "AsyncJob" USING gin ("compartments");
CREATE INDEX "AsyncJob___sharedTokens_idx" ON "AsyncJob" USING gin ("__sharedTokens");
CREATE INDEX "AsyncJob___sharedTokensTextTrgm_idx" ON "AsyncJob" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "AsyncJob____tag_idx" ON "AsyncJob" USING gin ("___tag");
CREATE INDEX "AsyncJob____tagTextTrgm_idx" ON "AsyncJob" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "AsyncJob_type_idx" ON "AsyncJob" ("type");
CREATE INDEX "AsyncJob_status_idx" ON "AsyncJob" ("status");

CREATE TABLE  "AsyncJob_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "AsyncJob_History_id_idx" ON "AsyncJob_History" ("id");
CREATE INDEX "AsyncJob_History_lastUpdated_idx" ON "AsyncJob_History" ("lastUpdated");

CREATE TABLE  "AsyncJob_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "AsyncJob_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "AsyncJob_Refs_targetId_code_idx" ON "AsyncJob_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Agent" (
  "id" UUID PRIMARY KEY,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "projectId" UUID,
  "__version" INTEGER,
  "_source" TEXT,
  "_profile" TEXT[],
  "compartments" UUID[] NOT NULL,
  "__sharedTokens" UUID[],
  "__sharedTokensText" TEXT[],
  "___securitySort" TEXT,
  "___tag" UUID[],
  "___tagText" TEXT[],
  "___tagSort" TEXT,
  "__identifier" UUID[],
  "__identifierText" TEXT[],
  "__identifierSort" TEXT,
  "name" TEXT,
  "status" TEXT,
  "___compartmentIdentifierSort" TEXT
);
CREATE INDEX "Agent_lastUpdated_idx" ON "Agent" ("lastUpdated");
CREATE INDEX "Agent_projectId_lastUpdated_idx" ON "Agent" ("projectId", "lastUpdated");
CREATE INDEX "Agent_projectId_idx" ON "Agent" ("projectId");
CREATE INDEX "Agent__source_idx" ON "Agent" ("_source");
CREATE INDEX "Agent__profile_idx" ON "Agent" USING gin ("_profile");
CREATE INDEX "Agent___version_idx" ON "Agent" ("__version");
CREATE INDEX "Agent_compartments_idx" ON "Agent" USING gin ("compartments");
CREATE INDEX "Agent___sharedTokens_idx" ON "Agent" USING gin ("__sharedTokens");
CREATE INDEX "Agent___sharedTokensTextTrgm_idx" ON "Agent" USING gin (token_array_to_text("__sharedTokensText") gin_trgm_ops);
CREATE INDEX "Agent____tag_idx" ON "Agent" USING gin ("___tag");
CREATE INDEX "Agent____tagTextTrgm_idx" ON "Agent" USING gin (token_array_to_text("___tagText") gin_trgm_ops);
CREATE INDEX "Agent___idnt_idx" ON "Agent" USING gin ("__identifier");
CREATE INDEX "Agent___idntTextTrgm_idx" ON "Agent" USING gin (token_array_to_text("__identifierText") gin_trgm_ops);
CREATE INDEX "Agent_name_idx" ON "Agent" ("name");
CREATE INDEX "Agent_status_idx" ON "Agent" ("status");

CREATE TABLE  "Agent_History" (
  "versionId" UUID PRIMARY KEY,
  "id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "lastUpdated" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "Agent_History_id_idx" ON "Agent_History" ("id");
CREATE INDEX "Agent_History_lastUpdated_idx" ON "Agent_History" ("lastUpdated");

CREATE TABLE  "Agent_References" (
  "resourceId" UUID NOT NULL,
  "targetId" UUID NOT NULL,
  "code" TEXT NOT NULL
);
ALTER TABLE  "Agent_References" ADD PRIMARY KEY ("resourceId", "targetId", "code");
CREATE INDEX "Agent_Refs_targetId_code_idx" ON "Agent_References" ("targetId", "code") INCLUDE ("resourceId");

CREATE TABLE  "Address" (
  "resourceId" UUID NOT NULL,
  "address" TEXT,
  "city" TEXT,
  "country" TEXT,
  "postalCode" TEXT,
  "state" TEXT,
  "use" TEXT
);
CREATE INDEX "Address_resourceId_idx" ON "Address" ("resourceId");
CREATE INDEX "Address_address_idx" ON "Address" ("address");
CREATE INDEX "Address_city_idx" ON "Address" ("city");
CREATE INDEX "Address_country_idx" ON "Address" ("country");
CREATE INDEX "Address_postalCode_idx" ON "Address" ("postalCode");
CREATE INDEX "Address_state_idx" ON "Address" ("state");
CREATE INDEX "Address_use_idx" ON "Address" ("use");
CREATE INDEX "Address_address_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, address));
CREATE INDEX "Address_postalCode_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, "postalCode"));
CREATE INDEX "Address_city_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, city));
CREATE INDEX "Address_use_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, use));
CREATE INDEX "Address_country_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, country));
CREATE INDEX "Address_state_idx_tsv" ON "Address" USING gin (to_tsvector('simple'::regconfig, state));

CREATE TABLE  "ContactPoint" (
  "resourceId" UUID NOT NULL,
  "system" TEXT,
  "value" TEXT
);
CREATE INDEX "ContactPoint_resourceId_idx" ON "ContactPoint" ("resourceId");
CREATE INDEX "ContactPoint_system_idx" ON "ContactPoint" ("system");
CREATE INDEX "ContactPoint_value_idx" ON "ContactPoint" ("value");

CREATE TABLE  "Identifier" (
  "resourceId" UUID NOT NULL,
  "system" TEXT,
  "value" TEXT
);
CREATE INDEX "Identifier_resourceId_idx" ON "Identifier" ("resourceId");
CREATE INDEX "Identifier_system_idx" ON "Identifier" ("system");
CREATE INDEX "Identifier_value_idx" ON "Identifier" ("value");

CREATE TABLE  "HumanName" (
  "resourceId" UUID NOT NULL,
  "name" TEXT,
  "given" TEXT,
  "family" TEXT
);
CREATE INDEX "HumanName_resourceId_idx" ON "HumanName" ("resourceId");
CREATE INDEX "HumanName_name_idx" ON "HumanName" ("name");
CREATE INDEX "HumanName_given_idx" ON "HumanName" ("given");
CREATE INDEX "HumanName_family_idx" ON "HumanName" ("family");
CREATE INDEX "HumanName_nameTrgm_idx" ON "HumanName" USING gin (name gin_trgm_ops);
CREATE INDEX "HumanName_givenTrgm_idx" ON "HumanName" USING gin (given gin_trgm_ops);
CREATE INDEX "HumanName_familyTrgm_idx" ON "HumanName" USING gin (family gin_trgm_ops);
CREATE INDEX "HumanName_name_idx_tsv" ON "HumanName" USING gin (to_tsvector('simple'::regconfig, name));
CREATE INDEX "HumanName_given_idx_tsv" ON "HumanName" USING gin (to_tsvector('simple'::regconfig, given));
CREATE INDEX "HumanName_family_idx_tsv" ON "HumanName" USING gin (to_tsvector('simple'::regconfig, family));

CREATE TABLE  "Coding" (
  "id" BIGSERIAL PRIMARY KEY,
  "system" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "display" TEXT,
  "isSynonym" BOOLEAN NOT NULL,
  "synonymOf" BIGINT
);
CREATE UNIQUE INDEX "Coding_id_idx" ON "Coding" ("id");
CREATE UNIQUE INDEX "Coding_system_code_primary_idx" ON "Coding" ("system", "code") INCLUDE ("id") WHERE ("synonymOf" IS NULL);
CREATE UNIQUE INDEX "Coding_system_code_display_synonymOf_idx" ON "Coding" ("system", "code", "display", COALESCE("synonymOf", ('-1'::integer)::bigint));
CREATE INDEX "Coding_system_displayTrgm_idx" ON "Coding" USING gin ("system", display gin_trgm_ops);

CREATE TABLE  "Coding_Property" (
  "coding" BIGINT NOT NULL,
  "property" BIGINT NOT NULL,
  "target" BIGINT,
  "value" TEXT NOT NULL
);
CREATE INDEX "Coding_Property_target_property_coding_idx" ON "Coding_Property" ("target", "property", "coding") WHERE (target IS NOT NULL);
CREATE INDEX "Coding_Property_coding_property__idx" ON "Coding_Property" ("coding", "property");
CREATE UNIQUE INDEX "Coding_Property_property_value_coding_target_full_idx" ON "Coding_Property" ("property", "value", "coding", "target");

CREATE TABLE  "CodeSystem_Property" (
  "id" BIGSERIAL PRIMARY KEY,
  "system" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "uri" TEXT,
  "description" TEXT
);
CREATE UNIQUE INDEX "CodeSystem_Property_system_code_idx" ON "CodeSystem_Property" ("system", "code") INCLUDE ("id");

CREATE TABLE  "DatabaseMigration" (
  "id" INTEGER PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "dataVersion" INTEGER NOT NULL,
  "firstBoot" BOOLEAN NOT NULL DEFAULT false
);

