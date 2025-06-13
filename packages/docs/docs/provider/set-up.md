# Set Up

This section covers the initial setup process for your Medplum system, including how to add practitioners and import existing data through the Medplum App.

<br />

--- 

## **Adding Practitioners (via Medplum App)**

Setting up practitioners is one of the first steps in configuring your Medplum system and will need to be completed using the Medplum App (app.medplum.com). Practitioners represent healthcare providers, clinicians, and other staff members who will be using the system.

### **Prerequisites**

* Administrative access to the Medplum App  
* Practitioner information including names, credentials, and contact details  
* Valid email addresses for each practitioner (required for system access)

### **How to Add Practitioners**

1. **Access the Practitioners Section**  
   * Log into the Medplum App with your administrator credentials  
   * Select "Practitioner" from the left navigation menu  
2. **Create a New Practitioner**  
   * On the Practitioners page, click the "New…" action button at the top of the page  
   * Fill in the required practitioner information  
3. **Verify and Save**  
   * Review all entered information and then click "Create” or "Create Practitioner" to complete the setup  
   * The system will generate a unique practitioner ID automatically  
4. **Share Credentials**  
   * \[Send login credentials to the practitioner\]

<br />
<br />

--- 

## **Importing Data (via Medplum App)**

The data import feature allows you to transfer existing patient records, medical histories, and other healthcare data from previous systems into Medplum.

### **Prerequisites**

* Data files in supported formats (CSV, JSON, HL7 FHIR, or XML)  
* Properly formatted data that matches Medplum's data structure requirements

### **Supported Data Types**

* Patient demographics and contact information  
* Medical histories and clinical notes  
* Medication lists and prescriptions  
* Lab results and diagnostic reports  
* Insurance and billing information  
* Appointment schedules and provider assignments

### **How to Import Data**

1. **Access the Import Feature**  
   * Log into the Medplum App with your administrator credentials  
   * Select "Batch" from the left navigation menu  
2. **Upload Data Files**  
   * Drag and drop or click the upload area to add your prepared data file  
   * Wait for the system to validate the file structure and content  
3. **Verify Upload**  
   * If the upload was successful, navigate to a section where your data may have been added (such as the Patients section) and verify that it was added

<br />

***Note: this import function only supports FHIR-formated data—all other types will not be added to your project.***

<br />