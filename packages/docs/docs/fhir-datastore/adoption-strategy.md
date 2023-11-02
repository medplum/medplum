---
id: adoption-strategy
toc_max_heading_level: 2
sidebar_position: 2
---

# Adoption Strategy

Consider the following common scenario:

- You have an existing digital healthcare platform running active operations
- You decided to adopt a standards based architecture, such as Medplum
- You want to migrate operations without service interruption or degradation

While this is a common scenario, it is not an easy one. System migrations are hard and require careful planning.

:::info

System migrations are challenging concepts. Please contact us at hello@medplum.com to learn how Medplum can help with your migration.

:::

## Planning

The key to success for any data migration is planning. It is critical to know the data, know the systems, and communication with all stakeholders. The planning process begins before you write a single line of code.

Questions:

- What is the timeline for migration?
- Who are the key stakeholders in the migration?
- What data is required?
- What is the tolerance for downtime during migration?
- Which end-user tools will change?
- What end-user training is required?

## Big Bang

A Big Bang transition is when an organization switches from the existing system to the new system at one singular point in time. There will be a period of planning, engineering, and training leading up to the transition point.

Pros:

- Can be the fastest option
- Less "throwaway" engineering work
- Limited active-active synchronization

Cons:

- Most risky option
- High penalty for failure

In general, Medplum only recommends the Big Bang strategy for small or early stage projects without significant operational complexity. Medplum does not recommend the Big Bang strategy for large organizations with significant active operations due to the high risk factors.

## Parallel or Phased Adoption

The opposite of Big Bang is Parallel Adoption, when an organization runs both the existing system and the new system together.

Similar to Parallel Adoption, Phased Adoption runs both systems in parallel, but includes a predetermined sequence of small "bite sized" cutovers. Usually this is done business unit by business unit or team-by-team.

Pros:

- Safest option
- Low penalty for bugs or errors

Cons:

- High engineering cost to build and maintain active-active synchronization
- Prolonged migration period

In most cases, Medplum recommends Phased Adoption. While there is some additional engineering cost, it is the safest option, and lowest risk to business operations.

## References

- [Adoption (software implementation)](<https://en.wikipedia.org/wiki/Adoption_(software_implementation)>)
- [Big bang adoption](https://en.wikipedia.org/wiki/Big_bang_adoption)
- [Parallel adoption](https://en.wikipedia.org/wiki/Parallel_adoption)
- [Phased adoption](https://en.wikipedia.org/wiki/Phased_adoption)
