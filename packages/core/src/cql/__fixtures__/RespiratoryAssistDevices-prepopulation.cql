library RespiratoryAssistDevicesPrepopulation  version '0.1.0'
using FHIR version '4.0.0'
include FHIRHelpers version '4.0.0' called FHIRHelpers
include CDS_Connect_Commons_for_FHIRv400 version '1.0.2' called CDS
include DTRHelpers version '0.1.0' called DTR

// This cql and questionnaire combo can be considered a partial implementation of these forms:
//  https://www.cms.gov/Research-Statistics-Data-and-Systems/Computer-Data-and-Systems/Electronic-Clinical-Templates/Downloads/Respiratory-Assist-Device-Order-Template-Draft-20180412-R10b.pdf

codesystem "ICD-10-CM": 'http://hl7.org/fhir/sid/icd-10-cm'
codesystem "LOINC": 'http://loinc.org'

// Value sets
valueset "RADLaboratoryTestValueSet": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1219.106'
valueset "BreathingTestProcedureDuringSleepValueSet": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1219.107'
valueset "RADQualifyingDiagnosisValueSet": 'http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1219.122'

// Lab Codes
// code for Oxygen saturation in Arterial blood by Pulse oximetry --during treatment
code "59409-3": '59409-3' from "LOINC"

// code for Carbon dioxide [Partial pressure] in Arterial blood
code "2019-8": '2019-8' from "LOINC"

// code for ph in arterial blood
code "2744-1": '2744-1' from "LOINC"

// code for SaO2 Resting % BldA PulseOx
code "59417-6": '59417-6' from "LOINC"

// code for HCO3
code "1960-4": '1960-4' from "LOINC"

// code for Hematocrit
code "32354-3": '32354-3' from "LOINC"

// code for PaO2
code "2703-7": '2703-7' from "LOINC"

parameter device_request DeviceRequest

context Patient

// coverage requirement info
define "RADDiagnoses":[Condition: "RADQualifyingDiagnosisValueSet"]
define "RADCodings": DTR.CodesFromConditions(CDS.Confirmed(CDS.ActiveOrRecurring("RADDiagnoses")))
define "OtherDiagnoses": [Condition] except "RADDiagnoses"
define "OtherDiagnosesCodings": DTR.CodesFromConditions(CDS.Confirmed(CDS.ActiveOrRecurring("OtherDiagnoses")))

define DeviceRequestHcpcsCoding: singleton from (
  ((cast device_request.code as CodeableConcept).coding) coding
    where coding.system.value = 'https://bluebutton.cms.gov/resources/codesystem/hcpcs')

define DeviceRequestDescription: 'HCPCS ' + "DeviceRequestHcpcsCoding".code.value + ' - ' + "DeviceRequestHcpcsCoding".display.value
define RadDeviceRequested:
  if "DeviceRequestHcpcsCoding".code.value = 'E0470' then 'E0470'
  else if  "DeviceRequestHcpcsCoding".code.value = 'E0471' then 'E0471'
  else 'null'

define "RequestEncounter": singleton from (
  [Encounter] encounter
    where ('Encounter/' + encounter.id) = device_request.encounter.reference.value)
define "EncounterDate": "RequestEncounter".period.start.value
define "EncounterParticipants": "RequestEncounter".participant

// Tester and Lab information
define "RADTestList": [Observation: "RADLaboratoryTestValueSet"]
define "RADTestListFromF2FEncounter": 
  "RADTestList" R
  where EndsWith(R.encounter.reference.value, "RequestEncounter".id)
define "TestPerformers":   
  if exists("RADTestListFromF2FEncounter") then "RADTestListFromF2FEncounter"[0].performer
  else null
define "Tester":
  if exists("TestPerformers") then 
    "TestPerformers" P
    where P.type = 'Practitioner'
    return P.display.value
  else
    null  
define "TestLaboratory":
  if exists("TestPerformers") then 
    "TestPerformers" P
    where P.type = 'Organization'
    return P.display.value
  else
    null  

// O2 Saturation Test with treatment 
define "ObservationO2SatTreatmentList": [Observation: "59409-3"]
define "LatestO2SatTreatmentObservation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationO2SatTreatmentList"),'%'))
define "LatestO2SatTreatmentResult": DTR.GetObservationValue("LatestO2SatTreatmentObservation")
define "IsPatientReceivingOxygenDuringTest": exists("LatestO2SatTreatmentResult")
define "LatestO2SatTreatmentTestDate": "LatestO2SatTreatmentObservation".issued.value

// O2 Sat during sleep
define "O2SatDuringSleepTestList": [Observation: "BreathingTestProcedureDuringSleepValueSet"]
define "LatestO2SatDuringSleepObservation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("O2SatDuringSleepTestList"),'%'))
define "LatestO2SatDuringSleepResult": DTR.GetObservationValue("LatestO2SatDuringSleepObservation")
define "LatestO2SatDuringSleepTestDate": "LatestO2SatDuringSleepObservation".issued.value

// ph in arterial blood
define "ObservationPHList": [Observation: "2744-1"]
define "LatestPHObservation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationPHList"), 'pH'))
define "LatestPHResult": DTR.GetObservationValue("LatestPHObservation")
define "LatestPHTestDate": "LatestPHObservation".issued.value

// PaCO2
define "ObservationPaCO2List": [Observation: "2019-8"]
define "LatestPaCO2Observation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationPaCO2List"), 'mm[Hg]'))
define "LatestPaCO2Result": DTR.GetObservationValue("LatestPaCO2Observation")
define "LatestPaCO2TestDate": "LatestPaCO2Observation".issued.value

// O2Sat Resting
define "ObservationO2SatRestingList": [Observation: "59417-6"]
define "LatestO2SatRestingObservation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationO2SatRestingList"), '%'))
define "LatestO2SatRestingResult": DTR.GetObservationValue("LatestO2SatRestingObservation")
define "LatestO2SatRestingTestDate": "LatestO2SatRestingObservation".issued.value

// HCO3
define "ObservationHCO3List": [Observation: "1960-4"]
define "LatestHCO3Observation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationHCO3List"), 'mmol/L'))
define "LatestHCO3Result": DTR.GetObservationValue("LatestHCO3Observation")
define "LatestHCO3TestDate": "LatestHCO3Observation".issued.value

// Hematocrit
define "ObservationHematocritList": [Observation: "32354-3"]
define "LatestHematocritObservation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationHematocritList"), '%'))
define "LatestHematocritResult": DTR.GetObservationValue("LatestHematocritObservation")
define "LatestHematocritTestDate": "LatestHematocritObservation".issued.value

// PaO2
define "ObservationPaO2List": [Observation: "2703-7"]
define "LatestPaO2Observation": CDS.MostRecent(CDS.WithUnit(CDS.Verified("ObservationPaO2List"), 'mm[Hg]'))
define "LatestPaO2Result": DTR.GetObservationValue("LatestPaO2Observation")
define "LatestPaO2TestDate": "LatestPaO2Observation".issued.value