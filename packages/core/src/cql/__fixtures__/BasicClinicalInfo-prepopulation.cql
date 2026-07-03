library BasicClinicalInfoPrepopulation version '0.1.0'
using FHIR version '4.0.0'
include FHIRHelpers version '4.0.0' called FHIRHelpers

codesystem "HL7-V2-0136": 'http://terminology.hl7.org/CodeSystem/v2-0136' 

code "Yes": 'Y' from "HL7-V2-0136" display 'Yes'
code "No": 'N' from "HL7-V2-0136" display 'No'

parameter device_request DeviceRequest
parameter service_request ServiceRequest
parameter medication_request MedicationRequest

context Patient

define "Today": Today()

define "OrderingProviderReference": Coalesce(device_request.performer.reference.value, service_request.performer.reference.value, medication_request.performer.reference.value)
define "OrderingProvider": singleton from (
  [Practitioner] practitioner
    where ('Practitioner/' + practitioner.id) = "OrderingProviderReference")

define "RequestEncounterReference": Coalesce(device_request.encounter.reference.value, service_request.encounter.reference.value, medication_request.encounter.reference.value)
define "RequestEncounter": 
  [Encounter] E
  where 'Encounter/'+ E.id = "RequestEncounterReference"

define "RequestEncounterDate":
  if exists("RequestEncounter") then "RequestEncounter".period.start.value
  else null

define "RequestEncounterParticipants": "RequestEncounter".participant
define "RequestEncounterFirstParticipantReference": 
  if exists("RequestEncounterParticipants")
    then "RequestEncounterParticipants"[0].individual.reference.value
  else null  

define "IsEncounterProviderSameAsOrderingProvider": "OrderingProviderReference" = "RequestEncounterFirstParticipantReference"

define "OrderingProviderName": singleton from (
  ("OrderingProvider".name name where name.use.value = 'official') 
  union 
  "OrderingProvider".name)

// Get Practitioner's Name elements
define "OrderingProviderLastName": "OrderingProviderName".family.value
define "OrderingProviderMiddleInitial": GetMiddleInitials("OrderingProviderName")
define "OrderingProviderFirstName": "OrderingProviderName".given[0].value
define "OrderingProviderFullName":
  "OrderingProviderFirstName" + ' ' + "OrderingProviderMiddleInitial" + ' ' + "OrderingProviderLastName"

// Get Practitioner's NPI
define "OrderingProviderNPI": (singleton from (
  "OrderingProvider".identifier identifier
    where identifier.system.value = 'http://hl7.org/fhir/sid/us-npi')).value.value

// Encounter provider's information
define "EncounterProviderLastName": 
  if "IsEncounterProviderSameAsOrderingProvider" then "OrderingProviderLastName"
  else null

define "EncounterProviderMiddleInitial": 
  if "IsEncounterProviderSameAsOrderingProvider" then "OrderingProviderMiddleInitial"
  else null

define "EncounterProviderFirstName": 
  if "IsEncounterProviderSameAsOrderingProvider" then "OrderingProviderFirstName"
  else null

define "EncounterProviderFullName": 
  if "IsEncounterProviderSameAsOrderingProvider" then "OrderingProviderFullName"
  else null

define "EncounterProviderNPI":
  if "IsEncounterProviderSameAsOrderingProvider" then "OrderingProviderNPI"
  else null

define function GetMiddleInitials(name FHIR.HumanName):
  Substring(Combine((name.given given return Substring(given.value,0,1)),', '),3)

 
/* This is a work around to prepopulate with Yes answer for Yes/No question.
   The blocking issue is that when LHC form control merge Questionnaire (the compiled static form)
   and QuestionnaireResponse (the CQL expression results) to create a form representation, 
   the initial value in Questionnaire are ingored. 
   So we cannot use Questionnaire initial to setup the default value. 
*/
define AnswerYes: "Yes"
define AnswerNo: "No"

define Allergies:
  CodesFromAllergies(ConfirmedAllergies([AllergyIntolerance]))

define function CodesFromAllergies(AllergyList List<AllergyIntolerance>):
  distinct(flatten(
    AllergyList C
      let AllergyCodings:
          (C.code.coding) CODING where CODING.system.value in {
            'http://www.nlm.nih.gov/research/umls/rxnorm'
          }
          return FHIRHelpers.ToCode(CODING)
      return AllergyCodings
  ))

define function ConfirmedAllergies(AllergyList List<AllergyIntolerance>):
  AllergyList C where C.verificationStatus.coding.code = 'confirmed'

define "AllDiagnoses": ActiveConfirmedDiagnoses([Condition])

define function ActiveConfirmedDiagnoses(CondList List<FHIR.Condition>):
  distinct(
    flatten(
      CondList C
        let DiagnosesCodings:
          (C.code.coding) CODING where CODING.system.value in {
            'http://hl7.org/fhir/sid/icd-10',
            'http://hl7.org/fhir/sid/icd-10-cm',
            'http://snomed.info/sct'
          }
          return FHIRHelpers.ToCode(CODING)
        where C.verificationStatus.coding.code = 'confirmed'
          and C.clinicalStatus.coding.code in {'active', 'relapse'}
          and exists(DiagnosesCodings)
        return DiagnosesCodings
    )
  )  
define "AllProcedures": ProcedureCoding([Procedure])
define function ProcedureCoding(ProcedureList List<FHIR.Procedure>):
  distinct(
    flatten(
      ProcedureList P
        let ProcedureCodings:
          (P.code.coding) CODING 
          return FHIRHelpers.ToCode(CODING)
        return ProcedureCodings
    )
  )

  define "True": true

 define "MedicationTupleList": GetMedicationsTupleList([MedicationStatement])
 define function GetMedicationsTupleList(MedStatementList List<MedicationStatement>):
    distinct(
      flatten(
        MedStatementList MedStatement
          let MedicationList:
            (MedStatement.medication.coding) CODING
            return Tuple {
              RxNorm: FHIRHelpers.ToCode(CODING).display + '-' + FHIRHelpers.ToCode(CODING).code ,
              Description: FHIRHelpers.ToCode(CODING).display
            }
          return MedicationList  
      )
    )   


