## NTP Technology DOT Protocol for Audio Router Control

This module will control the NTP Audio Routers that support DOT Protocol.

- [NTP Technology Page](https://www.ntp.dk/)

## Configuration
Enter the IP address of the control port of the router controller. The default port is 10005, but this can be changed if the system is configured to use a different port.
In the case of redundant router controllers, enter the secondary controller IP and port, and enable the redundant controllers switch. When the module is enabled it will try and connect to the Primary IP, if this fails at anytime, it will try and connect to the Secondary, and visa versa.

Configure the Source and Destination count, this should be equal to highest number used for each. The system will limit values entered to the specified range.

Default address, is a message passed to the controller with each command, and returned back. It performs no function beyond indentification. A default address can be configured and will be applied to all actions unless changed.

## Actions

- **Crosspoint - Set**
- **Crosspoint - Remove**
- **Crosspoint - Interrogate**

## Variables
- **Destination - Source** The source routed to a given destination

## Feedbacks
- **Crosspoint - Check** True if the specified crosspoint is connected

## Version History

### Version 0.8.0
- W.I.P.
