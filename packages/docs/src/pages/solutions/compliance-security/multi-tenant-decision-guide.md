# Multi-Tenant System Design Guide
## For Clinical Operations Leaders

**Who this is for:** Clinic managers, head nurses, practice administrators, and healthcare startup founders who need to set up a system where different groups of staff can only see certain patients.

**What you'll accomplish:** By answering these questions, you'll have a complete blueprint that your development team (or an AI coding assistant) can use to build your access control system.

---

## Part 1: Do You Actually Need Separate Groups?

### Question 1.1: How many distinct organizations or locations will use this system?

**Pick one:**

- [ ] **A) Just one organization** (single clinic, single practice, single company)
- [ ] **B) Multiple locations of the same company** (e.g., "Acme Primary Care" with 5 clinic locations)
- [ ] **C) Completely separate organizations sharing my platform** (e.g., you're a technology vendor serving independent medical practices)
- [ ] **D) Different departments or service lines within one organization** (e.g., cardiology vs. dermatology at the same hospital)

**Why this matters:**
- If you answered **A**, you might not need multi-tenancy at all. Everyone can see everything. Skip to Part 5.
- If you answered **B, C, or D**, continue to Question 1.2.

---

### Question 1.2: Should a staff member at Location A ever see patients from Location B?

**Pick one:**

- [ ] **A) Never.** Each location's data must be completely isolated (e.g., legal or contractual requirements)
- [ ] **B) Sometimes.** Some staff work across multiple locations or have oversight roles
- [ ] **C) Usually yes.** We want unified reporting but still want to know which location "owns" each patient

**Why this matters:**
- **A** suggests you need the strongest isolation (separate databases)
- **B or C** suggests you can use a shared database with access rules

---

### Question 1.3: Are you hosting Medplum yourself, or using Medplum's cloud service?

**Pick one:**

- [ ] **A) We're self-hosting** (running Medplum on our own servers or cloud account)
- [ ] **B) We're using Medplum's cloud service** (app.medplum.com)

**Why this matters:**
- Complete database separation is only available for self-hosted customers
- Cloud customers will use the "shared database with access rules" approach

---

## Part 2: What Type of Groups Do You Have?

Think about how you naturally organize your staff and patients today. The answer determines the best technical approach.

### Question 2.1: What's the primary way you group patients and staff?

**Pick the one that best describes your situation:**

- [ ] **A) By clinic or practice location**
  - *Examples: "Downtown Clinic," "Westside Family Medicine," "Dr. Smith's Practice"*
  - *Staff belong to specific clinics; patients are registered at specific clinics*

- [ ] **B) By type of service or specialty**
  - *Examples: "Weight Loss Program," "Diabetes Management," "Mental Health Services"*
  - *Patients are enrolled in specific programs; staff work in specific service areas*

- [ ] **C) By care team assigned to a patient**
  - *Examples: "Maria's Care Team" (her doctor, nurse, care coordinator)*
  - *Small groups of providers are assigned to work with specific patients*

- [ ] **D) By employer or health plan**
  - *Examples: "Acme Corp employees," "BlueCross members," "Medicare patients"*
  - *Patients grouped by who pays for their care or who their employer is*

- [ ] **E) Some combination of the above**
  - *Please describe:* _______________________________________________

---

### Question 2.2: What do you call these groups internally?

**Fill in the blank with whatever term your team actually uses:**

We call them: ________________________________________________
*(Examples: "clinics," "practices," "programs," "sites," "partners," "accounts," "teams")*

This becomes the name for your "tenant" in the system.

---

## Part 3: Staff Access Rules

### Question 3.1: Can one staff member belong to multiple groups?

**Pick one:**

- [ ] **A) No.** Each staff member works at exactly one [clinic/program/team]
- [ ] **B) Yes, some staff work across multiple** [clinics/programs/teams]
  - *Example: A traveling nurse who covers 3 clinics*
- [ ] **C) Yes, and some staff need to see ALL** [clinics/programs/teams]
  - *Example: A medical director who oversees everything*

---

### Question 3.2: When a staff member works at multiple locations, how should their access work?

*(Skip if you answered A above)*

**Pick one:**

- [ ] **A) Combined view:** They see patients from all their locations mixed together
- [ ] **B) Switchable view:** They pick which location they're "working in" and only see those patients
- [ ] **C) Either option works for us**

---

### Question 3.3: What types of staff roles do you have?

**Check all that apply:**

- [ ] Physicians / Doctors
- [ ] Nurse Practitioners / PAs
- [ ] Registered Nurses
- [ ] Medical Assistants
- [ ] Care Coordinators / Case Managers
- [ ] Front Desk / Schedulers
- [ ] Billing Staff
- [ ] Administrative Staff
- [ ] Clinical Leadership (Medical Directors, etc.)
- [ ] Other: _______________________

---

### Question 3.4: Do different roles need different levels of access within the same group?

**Pick one:**

- [ ] **A) No.** Everyone in a [clinic/program/team] sees the same patient information
- [ ] **B) Yes.** For example:
  - [ ] Front desk sees limited info (name, contact, insurance)
  - [ ] Clinical staff see full medical records
  - [ ] Billing sees financial information
  - [ ] Other pattern: _______________________________________________

---

## Part 4: Patient Assignment Rules

### Question 4.1: Can a patient belong to multiple groups at the same time?

**Pick one:**

- [ ] **A) No.** A patient is registered at exactly one [clinic/program/team]
- [ ] **B) Yes.** A patient might be enrolled in multiple [clinics/programs/teams]
  - *Example: Patient sees a cardiologist at one clinic and their PCP at another*
- [ ] **C) It depends on the situation**
  - *Please explain:* _______________________________________________

---

### Question 4.2: When does a patient get assigned to a group?

**Check all that apply:**

- [ ] When they first register / create an account
- [ ] When they book their first appointment
- [ ] When a staff member manually assigns them
- [ ] When they're referred from another location
- [ ] Based on their insurance or employer
- [ ] Based on their home address / service area
- [ ] Other: _______________________________________________

---

### Question 4.3: Who can move a patient between groups?

**Check all that apply:**

- [ ] Any clinician who can see the patient
- [ ] Only administrative staff
- [ ] Only managers/supervisors
- [ ] It happens automatically based on rules
- [ ] Patients can request transfers themselves
- [ ] Other: _______________________________________________

---

### Question 4.4: When a patient moves between groups, what happens to their old records?

**Pick one:**

- [ ] **A) Records stay with original group.** New group starts fresh (rare, but some legal situations require this)
- [ ] **B) Records follow the patient.** New group sees full history
- [ ] **C) Records are shared.** Both old and new group can see the patient

---

## Part 5: Shared Resources

Some things probably shouldn't be restricted by group—everyone might need access to them.

### Question 5.1: What should ALL staff be able to see, regardless of which group they belong to?

**Check all that apply:**

- [ ] **Staff directory** (see other providers' names, credentials, contact info)
- [ ] **Intake forms / questionnaires** (the blank forms patients fill out)
- [ ] **Care protocol templates** (standard workflows, order sets)
- [ ] **Medication lists / formularies**
- [ ] **Reference documents** (policies, procedures, guidelines)
- [ ] **Nothing—everything should be restricted by group**
- [ ] **Other:** _______________________________________________

---

### Question 5.2: Should patients be able to see staff from groups they're not enrolled in?

*Example: Can a patient at Clinic A look up Dr. Smith who works at Clinic B?*

**Pick one:**

- [ ] **A) No.** Patients only see staff at their own [clinic/program/team]
- [ ] **B) Yes.** Patients can see the full provider directory
- [ ] **C) Limited.** Patients can see basic info (names), but not detailed profiles

---

## Part 6: Patient Self-Service

### Question 6.1: Will patients log into this system?

**Pick one:**

- [ ] **A) No.** This is staff-only
- [ ] **B) Yes.** Patients have their own accounts

*(If A, skip to Part 7)*

---

### Question 6.2: What can patients see about their own records?

**Check all that apply:**

- [ ] Their demographic information (name, address, contact)
- [ ] Their appointment history
- [ ] Their medical records / clinical notes
- [ ] Their test results (labs, imaging)
- [ ] Their medications
- [ ] Their care plans / treatment plans
- [ ] Messages with their care team
- [ ] Their bills / statements
- [ ] Other: _______________________________________________

---

### Question 6.3: If a patient belongs to multiple groups, how should their experience work?

*(Skip if patients can only belong to one group)*

**Pick one:**

- [ ] **A) Unified view.** They see everything from all their [clinics/programs/teams] in one place
- [ ] **B) Separated view.** They switch between [clinics/programs/teams] to see different information
- [ ] **C) We haven't decided yet**

---

## Part 7: Reporting & Analytics

### Question 7.1: Who needs to see reports across multiple groups?

**Check all that apply:**

- [ ] Executive leadership / C-suite
- [ ] Quality / compliance teams
- [ ] Operations managers
- [ ] Billing / revenue cycle teams
- [ ] No one—each group only reports on their own data
- [ ] Other: _______________________________________________

---

### Question 7.2: For cross-group reporting, what's needed?

**Check all that apply:**

- [ ] Patient counts by group
- [ ] Visit/encounter volumes
- [ ] Revenue by group
- [ ] Quality metrics (outcomes, satisfaction)
- [ ] Staff productivity
- [ ] Comparison between groups
- [ ] Other: _______________________________________________

---

## Part 8: Starting Configuration

### Question 8.1: List your initial groups

**Fill in your groups (add more rows if needed):**

| Group Name | Type (Clinic/Program/Team/Other) | Approximate # of Staff | Approximate # of Patients |
|------------|----------------------------------|------------------------|---------------------------|
| Example: Downtown Clinic | Clinic | 15 | 2,000 |
|            |        |    |     |
|            |        |    |     |
|            |        |    |     |
|            |        |    |     |

---

### Question 8.2: Who will manage the system?

**List the people who should be able to:**

**Add new staff to groups:**
- Name: _____________ Role: _____________
- Name: _____________ Role: _____________

**Add new groups to the system:**
- Name: _____________ Role: _____________
- Name: _____________ Role: _____________

**See everything (super admin):**
- Name: _____________ Role: _____________
- Name: _____________ Role: _____________

---

## Part 9: Summary & Technical Translation

*This section is for your development team. Based on your answers, here's the technical blueprint:*

### Multi-Tenancy Model
Based on your answers to Part 1:

| Your Answer | Technical Approach |
|-------------|-------------------|
| 1.1 = A (single org) | No multi-tenancy needed |
| 1.2 = A (strict isolation) + 1.3 = A (self-hosted) | Separate Medplum Projects per tenant |
| 1.2 = B or C (some sharing) OR 1.3 = B (cloud) | Single Project with MSO access model |

### Tenant Resource Type
Based on your answer to Question 2.1:

| Your Answer | FHIR Resource Type |
|-------------|-------------------|
| A) Clinic/practice location | `Organization` |
| B) Service or specialty | `HealthcareService` |
| C) Care team | `CareTeam` |
| D) Employer/health plan | `Organization` (with appropriate type code) |

### Access Policy Configuration
Based on your answers to Part 3 and 4:

- **Staff multi-group access:** Yes/No (from 3.1)
- **Role-based restrictions:** Yes/No (from 3.4)
- **Patient multi-group enrollment:** Yes/No (from 4.1)

### Shared Resources (Non-Tenanted)
Based on Question 5.1, these resource types should NOT have tenant restrictions:
- *(List based on their checkboxes)*

---

## Next Steps

Once you've completed this guide:

1. **Review with your team** to make sure everyone agrees on the access model
2. **Share with your developers** (or AI coding assistant) along with this document
3. **Start with a pilot group** to test the access rules before rolling out widely
4. **Document your decisions** for future reference and compliance purposes

---

## Quick Reference: Common Scenarios

### Scenario A: "We're a multi-location medical group"
*Typical answers: 1.1=B, 1.2=B, 2.1=A, 3.1=B, 4.1=A*

**Result:** Organization-based tenancy. Staff assigned to their clinic(s). Patients belong to one clinic. Some staff (medical directors) see all clinics.

### Scenario B: "We're a telehealth platform serving multiple employer clients"
*Typical answers: 1.1=C, 1.2=A, 2.1=D, 3.1=A, 4.1=A*

**Result:** Organization-based tenancy with strict isolation. Each employer is a separate tenant. Their employees (patients) and contracted providers only see data for that employer.

### Scenario C: "We're a specialty care practice with multiple service lines"
*Typical answers: 1.1=D, 1.2=B, 2.1=B, 3.1=B, 4.1=B*

**Result:** HealthcareService-based tenancy. Patients can be enrolled in multiple programs (e.g., diabetes management AND weight loss). Staff work in specific programs but some float between them.

### Scenario D: "We're a care coordination company managing high-risk patients"
*Typical answers: 1.1=A, 2.1=C, 3.1=A, 4.1=A*

**Result:** CareTeam-based tenancy. Each patient has a dedicated small team. Staff see only their assigned patients. Good for intensive case management.

---

## Glossary: What We Mean vs. Technical Terms

| What you might say | Technical term |
|-------------------|----------------|
| "Group," "Location," "Practice," "Site" | Tenant |
| "Who can see what" | Access Control / Access Policy |
| "Staff member's account" | User / ProjectMembership |
| "Staff member's profile" | Practitioner resource |
| "Patient's account" | User / ProjectMembership |
| "Patient's chart" | Patient resource + related clinical data |
| "Assigning a patient to a clinic" | Setting the account/compartment |
| "Giving someone access" | Enrolling in a tenant |

---

*Document Version: 1.0*
*Generated for use with Medplum multi-tenant access control*
