## NTP Technology DOT Protocol for Audio Router Control

This module will control the NTP Audio Routers that support DOT Protocol.

- [NTP Technology Page](https://www.ntp.dk/)

## Configuration
Enter the IP address of the control port of the router controller. The default port is 10005, but this can be changed if the system is configured to use a different port.
In the case of redundant router controllers, enter the secondary controller IP and port, and enable the redundant controllers switch. When the module is enabled it will try and connect to the Primary IP, if this fails at anytime, it will try and connect to the Secondary, and visa versa.

Configure the Source and Destination count, this should be equal to highest number used for each. The system will limit values entered to the specified range.

The alarms should match the number of configured alarm indexs in your system.

## Actions

- **Crosspoint** Set, Remove or Interrogate a crosspoint

- **Input - Delay** Set input delay
- **Input - Gain** Set input gain
- **Input - P48** Set input phantom power

## Variables
- **Destination - Source** The source routed to a given destination

## Feedbacks
- **Alarm** True if the alarm index is asserted
- **Crosspoint** True if the specified crosspoint is connected

## Version History

### Version 0.8.0
- W.I.P.
