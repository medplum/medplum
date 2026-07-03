library FHIRHelpers version '4.0.0'

using FHIR version '4.0.0'

define function ToInterval(period FHIR.Period):
    if period is null then
        null
    else
        Interval[period."start".value, period."end".value]

define function ToQuantity(quantity FHIR.Quantity):
    if quantity is null then
        null
    else
        System.Quantity { value: quantity.value.value, unit: quantity.unit.value }

define function ToInterval(range FHIR.Range):
    if range is null then
        null
    else
        Interval[ToQuantity(range.low), ToQuantity(range.high)]

define function ToCode(coding FHIR.Coding):
    if coding is null then
        null
    else
        System.Code {
          code: coding.code.value,
          system: coding.system.value,
          version: coding.version.value,
          display: coding.display.value
        }

define function ToConcept(concept FHIR.CodeableConcept):
    if concept is null then
        null
    else
        System.Concept {
            codes: concept.coding C return ToCode(C),
            display: concept.text.value
        }

define function ToString(value FHIR.uuid): value.value
define function ToString(value FHIR.TestScriptRequestMethodCode): value.value
define function ToString(value FHIR.SortDirection): value.value
define function ToString(value FHIR.BiologicallyDerivedProductStatus): value.value
define function ToString(value FHIR.UnitsOfTime): value.value
define function ToString(value FHIR.AddressType): value.value
define function ToString(value FHIR.AllergyIntoleranceCategory): value.value
define function ToString(value FHIR.IssueSeverity): value.value
define function ToString(value FHIR.CareTeamStatus): value.value
define function ToString(value FHIR.EncounterStatus): value.value
define function ToString(value FHIR.StructureDefinitionKind): value.value
define function ToString(value FHIR.PublicationStatus): value.value
define function ToString(value FHIR.FHIRVersion): value.value
define function ToString(value FHIR.CarePlanActivityKind): value.value
define function ToString(value FHIR.StructureMapSourceListMode): value.value
define function ToString(value FHIR.RequestStatus): value.value
define function ToString(value FHIR.strandType): value.value
define function ToString(value FHIR.QuestionnaireResponseStatus): value.value
define function ToString(value FHIR.SearchComparator): value.value
define function ToString(value FHIR.ChargeItemStatus): value.value
define function ToString(value FHIR.ActionParticipantType): value.value
define function ToString(value FHIR.AllergyIntoleranceType): value.value
define function ToString(value FHIR.CarePlanActivityStatus): value.value
define function ToString(value FHIR.InvoiceStatus): value.value
define function ToString(value FHIR.ClaimProcessingCodes): value.value
define function ToString(value FHIR.RequestResourceType): value.value
define function ToString(value FHIR.ParticipationStatus): value.value
define function ToString(value FHIR.DeviceNameType): value.value
define function ToString(value FHIR.DocumentMode): value.value
define function ToString(value FHIR.AssertionOperatorType): value.value
define function ToString(value FHIR.DaysOfWeek): value.value
define function ToString(value FHIR.IssueType): value.value
define function ToString(value FHIR.canonical): value.value
define function ToString(value FHIR.StructureMapContextType): value.value
define function ToString(value FHIR.FamilyHistoryStatus): value.value
define function ToString(value FHIR.status): value.value
define function ToString(value FHIR.ExtensionContextType): value.value
define function ToString(value FHIR.AssertionResponseTypes): value.value
define function ToString(value FHIR.RequestIntent): value.value
define function ToString(value FHIR.string): value.value
define function ToString(value FHIR.ActionRequiredBehavior): value.value
define function ToString(value FHIR.GraphCompartmentUse): value.value
define function ToString(value FHIR.orientationType): value.value
define function ToString(value FHIR.AccountStatus): value.value
define function ToString(value FHIR.IdentifierUse): value.value
define function ToString(value FHIR.StructureMapTargetListMode): value.value
define function ToString(value FHIR.ExposureState): value.value
define function ToString(value FHIR.TestReportParticipantType): value.value
define function ToString(value FHIR.BindingStrength): value.value
define function ToString(value FHIR.RequestPriority): value.value
define function ToString(value FHIR.ParticipantRequired): value.value
define function ToString(value FHIR.XPathUsageType): value.value
define function ToString(value FHIR.id): value.value
define function ToString(value FHIR.FilterOperator): value.value
define function ToString(value FHIR.NamingSystemType): value.value
define function ToString(value FHIR.ContractResourceStatusCodes): value.value
define function ToString(value FHIR.ResearchSubjectStatus): value.value
define function ToString(value FHIR.StructureMapTransform): value.value
define function ToString(value FHIR.ResponseType): value.value
define function ToDecimal(value FHIR.decimal): value.value
define function ToString(value FHIR.AggregationMode): value.value
define function ToString(value FHIR.sequenceType): value.value
define function ToString(value FHIR.SystemRestfulInteraction): value.value
define function ToString(value FHIR.AdverseEventActuality): value.value
define function ToString(value FHIR.SubscriptionChannelType): value.value
define function ToString(value FHIR.AssertionDirectionType): value.value
define function ToString(value FHIR.CarePlanIntent): value.value
define function ToString(value FHIR.AllergyIntoleranceCriticality): value.value
define function ToString(value FHIR.PropertyRepresentation): value.value
define function ToString(value FHIR.TriggerType): value.value
define function ToString(value FHIR.CompositionStatus): value.value
define function ToString(value FHIR.AppointmentStatus): value.value
define function ToString(value FHIR.MessageSignificanceCategory): value.value
define function ToString(value FHIR.ListMode): value.value
define function ToString(value FHIR.ResearchElementType): value.value
define function ToString(value FHIR.ObservationStatus): value.value
define function ToString(value FHIR.ResourceType): value.value
define function ToBoolean(value FHIR.boolean): value.value
define function ToString(value FHIR.StructureMapGroupTypeMode): value.value
define function ToString(value FHIR.SupplyRequestStatus): value.value
define function ToString(value FHIR.EncounterLocationStatus): value.value
define function ToString(value FHIR.ConditionalDeleteStatus): value.value
define function ToString(value FHIR.url): value.value
define function ToString(value FHIR.uri): value.value
define function ToString(value FHIR.Use): value.value
define function ToString(value FHIR.MedicationRequestStatus): value.value
define function ToString(value FHIR.IdentityAssuranceLevel): value.value
define function ToString(value FHIR.DeviceMetricColor): value.value
define function ToTime(value FHIR.time): value.value
define function ToString(value FHIR.ConditionalReadStatus): value.value
define function ToString(value FHIR.AllergyIntoleranceSeverity): value.value
define function ToString(value FHIR.FinancialResourceStatusCodes): value.value
define function ToString(value FHIR.OperationKind): value.value
define function ToString(value FHIR.SubscriptionStatus): value.value
define function ToString(value FHIR.GoalLifecycleStatus): value.value
define function ToString(value FHIR.ObservationDataType): value.value
define function ToString(value FHIR.DocumentReferenceStatus): value.value
define function ToString(value FHIR.repositoryType): value.value
define function ToString(value FHIR.LocationStatus): value.value
define function ToString(value FHIR.NoteType): value.value
define function ToString(value FHIR.TestReportStatus): value.value
define function ToString(value FHIR.CodeSystemContentMode): value.value
define function ToString(value FHIR.FHIRDeviceStatus): value.value
define function ToString(value FHIR.ContactPointSystem): value.value
define function ToString(value FHIR.SlotStatus): value.value
define function ToString(value FHIR.PropertyType): value.value
define function ToString(value FHIR.TypeDerivationRule): value.value
define function ToString(value FHIR.GuidanceResponseStatus): value.value
define function ToString(value FHIR.RelatedArtifactType): value.value
define function ToString(value FHIR.oid): value.value
define function ToString(value FHIR.CompartmentType): value.value
define function ToString(value FHIR.MedicationRequestIntent): value.value
define function ToString(value FHIR.InvoicePriceComponentType): value.value
define function ToString(value FHIR.DeviceMetricCalibrationState): value.value
define function ToString(value FHIR.GroupType): value.value
define function ToString(value FHIR.EnableWhenBehavior): value.value
define function ToString(value FHIR.TaskIntent): value.value
define function ToString(value FHIR.ImmunizationEvaluationStatusCodes): value.value
define function ToString(value FHIR.ExampleScenarioActorType): value.value
define function ToString(value FHIR.ProvenanceEntityRole): value.value
define function ToString(value FHIR.SpecimenStatus): value.value
define function ToString(value FHIR.RestfulCapabilityMode): value.value
define function ToString(value FHIR.DetectedIssueSeverity): value.value
define function ToString(value FHIR.VisionEyes): value.value
define function ToString(value FHIR.ConsentDataMeaning): value.value
define function ToString(value FHIR.messageheaderResponseRequest): value.value
define function ToString(value FHIR.GuidePageGeneration): value.value
define function ToString(value FHIR.DocumentRelationshipType): value.value
define function ToString(value FHIR.VariableType): value.value
define function ToString(value FHIR.TestReportResult): value.value
define function ToString(value FHIR.ConceptMapGroupUnmappedMode): value.value
define function ToDateTime(value FHIR.instant): value.value
define function ToDateTime(value FHIR.dateTime): value.value
define function ToDate(value FHIR.date): value.value
define function ToInteger(value FHIR.positiveInt): value.value
define function ToString(value FHIR.ClinicalImpressionStatus): value.value
define function ToString(value FHIR.EligibilityResponsePurpose): value.value
define function ToString(value FHIR.NarrativeStatus): value.value
define function ToString(value FHIR.ImagingStudyStatus): value.value
define function ToString(value FHIR.EndpointStatus): value.value
define function ToString(value FHIR.BiologicallyDerivedProductCategory): value.value
define function ToString(value FHIR.ResourceVersionPolicy): value.value
define function ToString(value FHIR.ActionCardinalityBehavior): value.value
define function ToString(value FHIR.GroupMeasure): value.value
define function ToString(value FHIR.NamingSystemIdentifierType): value.value
define function ToString(value FHIR.ImmunizationStatusCodes): value.value
define function ToString(value FHIR.MedicationStatusCodes): value.value
define function ToString(value FHIR.DiscriminatorType): value.value
define function ToString(value FHIR.StructureMapInputMode): value.value
define function ToString(value FHIR.LinkageType): value.value
define function ToString(value FHIR.ReferenceHandlingPolicy): value.value
define function ToString(value FHIR.ResearchStudyStatus): value.value
define function ToString(value FHIR.AuditEventOutcome): value.value
define function ToString(value FHIR.SpecimenContainedPreference): value.value
define function ToString(value FHIR.ActionRelationshipType): value.value
define function ToString(value FHIR.ConstraintSeverity): value.value
define function ToString(value FHIR.EventCapabilityMode): value.value
define function ToString(value FHIR.CodeSearchSupport): value.value
define function ToString(value FHIR.ObservationRangeCategory): value.value
define function ToString(value FHIR.UDIEntryType): value.value
define function ToString(value FHIR.DeviceMetricCategory): value.value
define function ToString(value FHIR.TestReportActionResult): value.value
define function ToString(value FHIR.CapabilityStatementKind): value.value
define function ToString(value FHIR.EventTiming): value.value
define function ToString(value FHIR.SearchParamType): value.value
define function ToString(value FHIR.ActionGroupingBehavior): value.value
define function ToString(value FHIR.StructureMapModelMode): value.value
define function ToString(value FHIR.TaskStatus): value.value
define function ToString(value FHIR.BiologicallyDerivedProductStorageScale): value.value
define function ToString(value FHIR.GraphCompartmentRule): value.value
define function ToString(value FHIR.SlicingRules): value.value
define function ToString(value FHIR.ExplanationOfBenefitStatus): value.value
define function ToString(value FHIR.GuideParameterCode): value.value
define function ToString(value FHIR.CatalogEntryRelationType): value.value
define function ToString(value FHIR.LinkType): value.value
define function ToString(value FHIR.ConceptMapEquivalence): value.value
define function ToString(value FHIR.AuditEventAction): value.value
define function ToString(value FHIR.SearchModifierCode): value.value
define function ToString(value FHIR.EventStatus): value.value
define function ToString(value FHIR.OperationParameterUse): value.value
define function ToString(value FHIR.ConsentProvisionType): value.value
define function ToString(value FHIR.ActionConditionKind): value.value
define function ToString(value FHIR.qualityType): value.value
define function ToString(value FHIR.AdministrativeGender): value.value
define function ToString(value FHIR.QuestionnaireItemType): value.value
define function ToString(value FHIR.DeviceMetricCalibrationType): value.value
define function ToString(value FHIR.EvidenceVariableType): value.value
define function ToString(value FHIR.code): value.value
define function ToString(value FHIR.ActionSelectionBehavior): value.value
define function ToString(value FHIR.SupplyDeliveryStatus): value.value
define function ToString(value FHIR.DiagnosticReportStatus): value.value
define function ToString(value FHIR.FlagStatus): value.value
define function ToString(value FHIR.SPDXLicense): value.value
define function ToString(value FHIR.ListStatus): value.value
define function ToString(value FHIR.base64Binary): value.value
define function ToString(value FHIR.DeviceUseStatementStatus): value.value
define function ToString(value FHIR.AuditEventAgentNetworkType): value.value
define function ToString(value FHIR.ExpressionLanguage): value.value
define function ToString(value FHIR.AddressUse): value.value
define function ToString(value FHIR.ContactPointUse): value.value
define function ToString(value FHIR.DeviceMetricOperationalStatus): value.value
define function ToString(value FHIR.ContributorType): value.value
define function ToString(value FHIR.ReferenceVersionRules): value.value
define function ToString(value FHIR.MeasureReportStatus): value.value
define function ToString(value FHIR.SearchEntryMode): value.value
define function ToInteger(value FHIR.unsignedInt): value.value
define function ToString(value FHIR.NameUse): value.value
define function ToString(value FHIR.LocationMode): value.value
define function ToInteger(value FHIR.integer): value.value
define function ToString(value FHIR.FHIRSubstanceStatus): value.value
define function ToString(value FHIR.QuestionnaireItemOperator): value.value
define function ToString(value FHIR.HTTPVerb): value.value
define function ToString(value FHIR.EpisodeOfCareStatus): value.value
define function ToString(value FHIR.RemittanceOutcome): value.value
define function ToString(value FHIR.markdown): value.value
define function ToString(value FHIR.EligibilityRequestPurpose): value.value
define function ToString(value FHIR.QuantityComparator): value.value
define function ToString(value FHIR.MeasureReportType): value.value
define function ToString(value FHIR.ActionPrecheckBehavior): value.value
define function ToString(value FHIR.SampledDataDataType): value.value
define function ToString(value FHIR.CompositionAttestationMode): value.value
define function ToString(value FHIR.TypeRestfulInteraction): value.value
define function ToString(value FHIR.CodeSystemHierarchyMeaning): value.value
define function ToString(value FHIR.vConfidentialityClassification): value.value
define function ToString(value FHIR.ContractResourcePublicationStatusCodes): value.value
define function ToString(value FHIR.VisionBase): value.value
define function ToString(value FHIR.BundleType): value.value

