## Usage

A task resource describes an activity that can be performed and tracks the state of completion of that activity. It is a representation that an activity should be or has been initiated, and eventually, represents the successful or unsuccessful completion of that activity.

Note that there are a variety of processes associated with making and processing orders. Some orders may be handled immediately by automated systems but most require real world actions by one or more humans. Some orders can only be processed when other real world actions happen, such as a patient presenting themselves so that the action to be performed can actually be performed. Often these real world dependencies are only implicit in the order details.

## Relationships

Task spans both intent and event and tracks the execution through to completion. A [Task](/docs/api/fhir/resources/task) is a workflow step such as cancelling an order, fulfilling an order, signing an order, merging a set of records, admitting a patient. In contrast, [Procedures](/docs/api/fhir/resources/procedure) are actions that are intended to result in a physical or mental change to or for the subject (for example, surgery, physiotherapy, training, counseling). A [Task](/docs/api/fhir/resources/task) resource often exists in parallel with clinical resources. For example, a [Task](/docs/api/fhir/resources/task) could request fulfillment of a [ServiceRequest](/docs/api/fhir/resources/servicerequest) ordering a [Procedure](/docs/api/fhir/resources/procedure) that would result in a [Procedure](/docs/api/fhir/resources/procedure), [Observation](/docs/api/fhir/resources/observation), [DiagnosticReport](/docs/api/fhir/resources/diagnosticreport), [ImagingStudy](/docs/api/fhir/resources/imagingstudy) or similar resource. Another example would be a [Task](/docs/api/fhir/resources/task) that requests fulfillment of a [CommunicationRequest](/docs/api/fhir/resources/communicationrequest) to be performed between various actors.

As stated above, the task resource tracks the state of a task, enabling systems to ensure that tasks are completed. This information is kept separate from the operational details necessary to complete the task, as those details vary across and even within workflows. That detail is expected to be carried in the referenced \`focus\` of the task.

Tasks may have named inputs and outputs. Inputs represent information that may or must be present in order for a task to complete. Outputs represent intermediate or final results produced by a task. For example, in a task supporting reading of radiology image, the inputs might include both the imaging study to be read, as well as relevant prior images. Outputs could represent radiology measurements as well as the Radiologist's diagnostic report.

Inputs and outputs are tracked by the task because workflow management activity may automate the transfer of outputs from one task to inputs to a subsequent task.

To facilitate the integration of off the shelf workflow applications with FHIR, the task resource may reference a definition. This definition can represent a description of the workflow activity to be performed, using a standard workflow description language such as BPEL, BPMN, or XPDL, a workflow definition such as those defined in IHE profiles, or even simple written instructions explaining a process to be performed.

## Background and Context

#### Using [Tasks](/docs/api/fhir/resources/task) in a RESTful context[](https://www.hl7.org/fhir/task.html#12.1.2.1 'link to here')

In a RESTful context, a server functions as a repository of tasks. The server itself, or other agents are expected to monitor task activity and initiate appropriate actions to ensure task completion, updating the status of the task as it proceeds through its various stages of completion. These agents can be coordinated, following well choreographed business logic to ensure that tasks are completed. [Task](/docs/api/fhir/resources/task) management may also be centrally controlled using some form of a workflow engine, in which case, the workflow engine itself may update and maintain the task resources in the server, and through its orchestration activities ensure that tasks are completed. The task resource enables either model of task management yet provides a consistent view of the status of tasks being executed in support of healthcare workflows.

The assignment of tasks into categories by type of task, type of performer and task status enable the server to function as a queue of work items. This queue can be polled or subscribed to by various agents, enabling automation of workflows in FHIR using existing search and subscription mechanisms. Owners, requesters, other agents (e.g. workflow managers) can thus be ready to initiate the next steps in a complex workflow.

#### [Tasks](/docs/api/fhir/resources/task) State Machine[](https://www.hl7.org/fhir/task.html#12.1.2.2 'link to here')

Tasks start in a Created state. Once they have been assigned to an owner they transition to the Ready state, indicating that they are ready to be performed. Once the owner initiates activity on the task, the task transitions to the In Progress state, indicating that work is being performed. Upon normal completion, the task enters the Completed state. If there is a failure during the task execution that prevents the task from being completed, it can also enter a Failed state, indicating an abnormal termination of the task. A task in any non-terminal state may also be Cancelled, representing an abnormal termination of the task due to external forces, rather than an error condition.

Tasks in any non-terminal state (Created, Ready, In Progress) can be suspended and resumed. When a task is suspended, it is typically resumed in the state it was in when it was originally suspended. Suspending a task suspends all of its children as well. Resuming a task resumes all of its children.

An In-progress task can also be stopped, returning it to a Ready state. This may be in preparation for delegation or reassignment (e.g., because it cannot be completed by the current owner), to restart a task due to a temporary failure (e.g., to reattempt completion of the activity), or in preparation to allow others to claim the task.

The task history allows applications monitoring the state of a workflow to identify tasks that are long running, perhaps stuck in some queue, to enable management activities that could ensure completion. It also enables tracking of task statistics such as wait time, or time in progress, or time to completion, enabling capture of important task metrics in support of optimization and quality improvement.

> **Note:** Currently, task pre-requisites can be represented using [Task](/docs/api/fhir/resources/task)'s \`description\` element or the [RequestGroup](/docs/api/fhir/resources/requestgroup) resource. We are seeking input from the implementer community in evaluating whether there is need for adding another mechanism to this resource for this purpose.
>
> Feedback [here](https://chat.fhir.org/#narrow/stream/103-Orders-and.20Observation.20WG) .
