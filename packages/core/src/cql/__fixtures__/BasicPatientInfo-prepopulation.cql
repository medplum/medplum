library BasicPatientInfoPrepopulation version '0.2.0'
using FHIR version '4.0.0'
include FHIRHelpers version '4.0.0' called FHIRHelpers

parameter device_request DeviceRequest
parameter service_request ServiceRequest
parameter medication_request MedicationRequest

context Patient

define function GetMiddleInitials(name FHIR.HumanName):
  Substring(Combine((name.given given return Substring(given.value,0,1)),', '),3)

define Today: Today()

// Grab patient FHIR HumanName
define Name: singleton from (Patient.name name where name.use.value = 'official')

// Extract useful name elements
define LastName: "Name".family.value
define MiddleInitial: GetMiddleInitials("Name")
define FirstName: "Name".given[0].value

define FullName:
  Coalesce("FirstName" + ' ' + "MiddleInitial" + ' ' + "LastName", "FirstName" + ' ' + "LastName")

define Gender: Patient.gender.value
define DateOfBirth: Patient.birthDate.value

define "RequestCoverage": Coalesce(device_request.insurance, service_request.insurance, medication_request.insurance)

define CoverageResource: singleton from (
  [Coverage] coverage
    // pull coverage resource id from the device request insurance extension
    where ('Coverage/' + coverage.id) = RequestCoverage[0].reference.value)

define MedicareId: "CoverageResource".subscriberId.value

// Get Patient home address
define HomeAddress: singleton from (Patient.address address where address.use.value = 'home')
define Line: HomeAddress.line[0].value
define City: HomeAddress.city.value
define State: HomeAddress.state.value
define Zip: HomeAddress.postalCode.value

define Telecom: Coalesce( Patient.telecom telecom where telecom.system.value = 'phone' )
define Phone: Telecom.value.value
