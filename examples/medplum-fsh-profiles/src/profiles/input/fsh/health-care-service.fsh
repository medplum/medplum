CodeSystem: ServiceTypes
Id: service-types
Title: "Service Types Code System"
Description: "Codes for different types of healthcare services"
* #task-mgmt "Task Management" "Services related to clinical task tracking and management"
* #order-mgmt "Order Management" "Services handling clinical orders and signatures"
* #scheduling "Scheduling Services" "Services related to appointment and visit scheduling"
* #referral-mgmt "Referral Management" "Services handling patient referrals and coordination"

CodeSystem: ServiceCategories
Id: service-categories
Title: "Service Categories Code System"
Description: "Codes for different categories of healthcare services"
* #lab-orders "Laboratory Orders" "Management of laboratory test orders"
* #imaging-orders "Imaging Orders" "Management of imaging and radiology orders"
* #medication-orders "Medication Orders" "Management of medication and prescription orders"
* #visit-scheduling "Visit Scheduling" "Scheduling of patient visits and appointments"
* #clinical-tasks "Clinical Tasks" "General clinical task management"
* #admin-tasks "Administrative Tasks" "Administrative task management"

ValueSet: ServiceTypesVS
Id: service-types-vs
Title: "Service Types Value Set"
Description: "Value set for service types"
* include codes from system ServiceTypes

ValueSet: ServiceCategoriesVS
Id: service-categories-vs
Title: "Service Categories Value Set"
Description: "Value set for service categories"
* include codes from system ServiceCategories

Profile: ServiceManagementHealthcareService
Parent: HealthcareService
Id: service-management-healthcare-service
Title: "Service Management HealthcareService Profile"
Description: "Profile for healthcare services used in service management"

* ^url = "https://yourdomain.com/fhir/StructureDefinition/service-management-healthcare-service"
* ^version = "1.0.0"
* ^status = #active
* ^experimental = false
* ^date = "2024-01-16"

* . ^short = "Healthcare Service for Service Management"
* . ^definition = "A profile of HealthcareService for managing different types of services"

* type 1..1 MS
* type from ServiceTypesVS (required)
* category 1..1 MS
* category from ServiceCategoriesVS (required)
