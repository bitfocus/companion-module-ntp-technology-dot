## NTP Technology DOT Protocol for Audio Router Control

This module will control NTP Audio Routers that support DOT Protocol.

- [NTP Technology Page](https://www.ntp.dk/)

Requires Companion 5.1 or later.

## Configuration

Enter the IP address of the control port of the router controller. The default port is 10005.

In the case of redundant router controllers, enter the secondary controller IP and port, and enable the redundant
controllers' switch. When the module is enabled it connects to the Primary. Whenever a connection fails or closes, the
next attempt, 2 seconds later, is to the other controller. An attempt that has not connected within 5 seconds counts as
failed.

Configure the Source and Destination count, this should be equal to highest index number used for each. The system will
limit values entered to the specified range. Refer to the VMC-Config app, Configure>Logical Lines to identify Index
values.

The alarms should match the number of configured alarm indexes in your system. Refer to VMC-Config, Configure>Messages.
You can edit each entry and check/set the Number field to set the Alarm index.

The module requests alive notifications every 60 seconds as a keepalive. A router that has answered one, and then does
not answer the next within 10 seconds, is taken to have gone, and the module reconnects: to the other controller, if
redundant.

## Actions

- **Crosspoint** Set, Remove or Interrogate a crosspoint

- **Input - Delay** Set input delay
- **Input - Gain** Set input gain
- **Input - P48** Set input phantom power

Destinations, sources and gain are chosen from a list, or with an expression. An expression must return a destination
number from 1 to the destination count, a source number from 1 to the source count, or a gain step from 0 to 7. For
Crosspoint the source may also be 0, for no source. Anything else and the action is not run.

Each message waits for a reply from the router, for up to a second, before the next is sent. Button presses are sent
ahead of the interrogations made for feedbacks.

Messages still waiting to be sent are merged. A destination asked for more than once is interrogated once, and several
settings of one crosspoint, or of one input's gain, phantom power or delay, go as one, with the last value chosen, in the
place of the first.

## Variables

- **Destination - Source** The source routed to a given destination, or `unknown` until the router reports it

## Feedbacks

- **Alarm** True if the alarm index is asserted. Alarm text is written to the log. Warn level when asserted, Info level
  when removed.
- **Crosspoint** True if the specified crosspoint is connected

## Action Recorder

The Action Recorder will translate any crosspoint notifications into new crosspoint actions, to quickly build salvos.
Other actions are not supported.
