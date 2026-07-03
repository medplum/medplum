library BasicPractitionerInfoPrepopulation version '0.1.0'
using FHIR version '4.0.0'
include FHIRHelpers version '4.0.0' called FHIRHelpers

parameter device_request DeviceRequest
parameter service_request ServiceRequest
parameter medication_request MedicationRequest

context Patient

define function GetMiddleInitials(name FHIR.HumanName):
  Substring(Combine((name.given given return Substring(given.value,0,1)),', '),3)

define Today: Today()

define "SigningProviderReference": Coalesce(device_request.performer.reference.value, service_request.performer.reference.value, medication_request.requester.reference.value)
// Get Practitioner
define OrderingProvider: singleton from (
  [Practitioner] practitioner
    where ('Practitioner/' + practitioner.id) =  SigningProviderReference)

// Get Practitioner's Name
define Name: singleton from (
  ("OrderingProvider".name name where name.use.value = 'official') 
  union 
  "OrderingProvider".name)

// Get Practitioner's Name elements
define LastName: "Name".family.value
define MiddleInitial: GetMiddleInitials("Name")
define FirstName: "Name".given[0].value
define FullName:
  Coalesce("FirstName" + ' ' + "MiddleInitial" + ' ' + "LastName", "FirstName" + ' ' + "LastName")

// Get Practitioner's NPI
define NPI: (singleton from (
  "OrderingProvider".identifier identifier
    where identifier.system.value = 'http://hl7.org/fhir/sid/us-npi')).value.value

define Address: singleton from (
  ("OrderingProvider".address address where address.use.value = 'postal' or address.use.value = 'work')
  union
  "OrderingProvider".address)

define Line: "Address".line.value
define City: "Address".city.value
define State: "Address".state.value
define Zip: "Address".postalCode.value

define Phone: (singleton from (
  "OrderingProvider".telecom telecom where telecom.system.value = 'phone')).value.value

define Email: (singleton from (
  "OrderingProvider".telecom telecom where telecom.system.value = 'email')).value.value