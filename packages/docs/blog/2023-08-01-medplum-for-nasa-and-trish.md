---
slug: medplum-for-nasa-and-trish
title: Medplum's Proposal for NASA's Health Tech RFP
authors:
  name: Cody Ebberson
  title: Medplum Core Team
  url: https://github.com/codyebberson
  image_url: https://github.com/codyebberson.png
tags: [react, self-host]
---

# Medplum's Proposal for NASA's Health Tech RFP

NASA's [TRISH team](https://www.nasa.gov/hrp/tri) (Translational Research Institute for Space Health) recently issued an RFP for a healthcare tech platform designed for monitoring spaceflight participant health metrics during space missions. TRISH is a virtual consortium focused on applied research to ensure astronaut health during space exploration.

As avid space enthusiasts, and [NASA Space Camp](https://www.rocketcenter.com/SpaceCamp) alumni, we were eager to apply.

![Cody at Space Camp](/img/blog/cody-at-spacecamp.jpg)

Medplum submitted a proposal. We were invited to present to the TRISH team in June!

![Medplum for TRISH](/img/blog/medplum-for-trish.webp)

We're now anxiously awaiting the results.

### Adapting to Space Challenges

A notable challenge in the RFP was the solution's ability to operate in a low power environment. To address this:

#### Medplum on Raspberry Pi

We successfully set up the entire Medplum tech stack on a Raspberry Pi 4 (8gb edition). Due to Medplum's open source nature and its reliance only on widely-used open source dependencies, this transition was quite smooth. For those curious, here's the Raspberry Pi 4 model we used.

#### Raspberry Pi OS Selection

A necessary adjustment was using the 64-bit edition of the Raspberry Pi OS because 32-bit Postgres isn’t widely supported or available as a Debian package. Following that, the Medplum installation mirrored the process on any other Linux server, as detailed in our Ubuntu installation guide.

![Satya with Raspberry Pi](/img/blog/satya-with-raspberry-pi.jpg)

#### Monitoring Power Consumption

With everything up and running, it became pertinent to gauge the power consumption. Using the SURAIELEC Watt Meter, we observed that when Medplum operates idly, the power consumption hovers around 1-1.5 watts.

![Raspberry Pi CPU usage](/img/blog/raspberry-pi-cpu-usage.png)

![Raspberry Pi power consumption](/img/blog/raspberry-pi-power-consumption.jpg)

### UI Development

Once power constraints were addressed, we used the [Medplum React components](/docs/react) to assemble a mock dashboard showcasing health metrics of Artemis mission astronauts, monitoring vital signs and other crucial health parameters. We also included the spacecraft's intrinsic metrics, such as cabin temperature, pressure, oxygen levels, CO2 concentrations, and radiation readings.

![Medplum Space EHR](/img/blog/space-ehr-screenshot.png)

### Conclusion

This exercise provided a practical demonstration of Medplum’s adaptability and versatility, underscored by the strength of open source tools. We believe the exercise emphasizes Medplum's flexibility and readiness for diverse challenges.
