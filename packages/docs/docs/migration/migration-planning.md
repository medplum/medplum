---
toc_max_heading_level: 3
sidebar_position: 1
---

# Planning your Migration

The key to success for any data migration is planning. It is critical to know the data, know the systems, and communication with all stakeholders. The planning process begins before you write a single line of code.

**Key Questions**

- What is the timeline for migration?
- Who are the key stakeholders in the migration?
- What data is required?
- What is the tolerance for downtime during migration?
- Which end-user tools will change?
- What end-user training is required?
- What will your data pipeline look like?

## Adoption Strategies

### Phased Adoption
The opposite of Big Bang is Parallel Adoption, when an organization runs both the existing system and the new system together. **For moderately complex deployments, this is our recommended approach.** You can read more about implementing this phased adoption approach [here](/docs/migration/adoption-strategy).

Similar to Parallel Adoption, Phased Adoption runs both systems in parallel, but includes a predetermined sequence of small "bite sized" cutovers. Usually this is done business unit by business unit or team-by-team.

**Pros:**
- Safest option
- More opportunity for clinician / patient feedback
- Low penalty for bugs or errors

**Cons:**
- High engineering cost to build and maintain active-active synchronization
- Prolonged migration period

In most cases, Medplum recommends Phased Adoption. While there is some additional engineering cost, it is the safest option, and lowest risk to business operations.


### Big Bang Adoption

A Big Bang transition is when an organization switches from the existing system to the new system at one singular point in time. There will be a period of planning, engineering, and training leading up to the transition point.

**Pros:**
- Can be the fastest option
- Less "throwaway" engineering work
- Limited active-active synchronization

**Cons:**
- Most risky option
- High penalty for failure

In general, Medplum only recommends the Big Bang strategy for small or early stage projects without significant operational complexity. Medplum does not recommend the Big Bang strategy for large organizations with significant active operations due to the high risk factors.

Next, we'll talk about the best **sequence for migrating your data.**