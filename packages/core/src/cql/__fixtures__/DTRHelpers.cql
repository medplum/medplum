library DTRHelpers version '0.1.0'
using FHIR version '4.0.0'
include FHIRHelpers version '4.0.0' called FHIRHelpers
include CDS_Connect_Commons_for_FHIRv400 version '1.0.2' called CDS

context Patient

// -------------------------------------------------- CONDITIONS -----------------------------------------------------

// Returns formatted relvant diagnoses codes from a list of conditions
// Use Case: Retrieve DeviceRequest relevant diagnoses
define function CodesFromConditions(CondList List<Condition>):
  distinct(flatten(
    CondList C
      let DiagnosesCodings:
          (C.code.coding) CODING where CODING.system.value in {
            'http://hl7.org/fhir/sid/icd-10',
            'http://hl7.org/fhir/sid/icd-10-cm',
            'http://snomed.info/sct'
          }
          return FHIRHelpers.ToCode(CODING)
      return DiagnosesCodings
  ))

// Returns the first chronologically recorded condition of a ConditionList
// Use Case: Access earlierst condition from a list
define function FirstDateConditionRecorded(ConditionList List<FHIR.Condition>):
  First(ConditionList C sort by FHIRHelpers."ToDateTime"(recordedDate))  

// -------------------------------------------------- OBSERVATIONS -----------------------------------------------------

// Returns the Observation with the lowest value from an ObservationList
// Use Case: Finding the lowest numerical lab result
define function LowestObservation(ObsList List<Observation>):
  Min(ObsList O return FHIRHelpers.ToQuantity(O.value as Quantity))

// Returns the numerical value of an Observation, without a unit
// Use Case: Displaying only the numerical part of a lab result
define function GetObservationValue(Obs Observation): 
  NullSafeToQuantityWithoutUnit(cast Obs.value as Quantity)

// Retrieve the numerical value of a FHIR quantity, without units
// Use Case: Helper function for GetObservationValue() 
define function NullSafeToQuantityWithoutUnit(Qty FHIR.Quantity):
  if Qty is not null then Qty.value.value 
  else null

// -------------------------------------------------- ENCOUNTERS -----------------------------------------------------

// Takes in a list of encounters and a lookback period, and returns a subset of that list containing encounters occuring during that lookback period.
// Use Case: Retrieve encounters that occur during a recent time period
define function EncounterLookBack(EncounterList List<Encounter>, LookBack System.Quantity):
  EncounterList E
    let LookBackInterval: Interval[Now() - LookBack, Now()]
    where (cast E.period.start as dateTime).value in LookBackInterval
      or CDS.PeriodToInterval(cast E.period as Period) overlaps LookBackInterval

// Returns formatted codings from a list of Encounters
// Use Case: Query relevant Encounters
define function ConvertEncounterDetails(EncounterList List<Encounter>):
  distinct(
    flatten(
      EncounterList E
        let EncounterCodings:
          (E.type.coding) CODING
          return Tuple {
            code: CODING.code.value,
            system: CODING.system.value,
            display: CODING.display.value,
            periodStart: E.period.start.value,
            encounterReason: E.reasonCode[0].coding.display.value,
            type: 'encounter'
          }
        return EncounterCodings
    )
  )

  // -------------------------------------------------- PROCEDURES -----------------------------------------------------
// Returns formatted codings from a list of Procedures
// Use Case: Query relevant procedures for a MedicationRequest
define function ProcedureCoding(ProcedureList List<FHIR.Procedure>):
  distinct(
    flatten(
      ProcedureList P
        let DiagnosesCodings:
          (P.code.coding) CODING 
          return Tuple {
            code: CODING.code.value,
            system: CODING.system.value,
            display: CODING.display.value
          }
        return DiagnosesCodings
    )
  )

// Returns formatted codings from a list of Procedures
// Use Case: Query relevant procedures for a MedicationRequest
  define function CodesFromProcedures(ProcedureList List<FHIR.Procedure>):
    distinct(flatten(
      ProcedureList P
        let DiagnosesCodings:
            (P.code.coding) CODING where CODING.system.value in {
              'http://hl7.org/fhir/sid/icd-10',
              'http://hl7.org/fhir/sid/icd-10-cm',
              'http://snomed.info/sct'
            }
            return FHIRHelpers.ToCode(CODING)
        return DiagnosesCodings
  ))