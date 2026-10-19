# companion-module-ntp-technology-dot

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Version History

### Version 2.0.0

- Update to Companion module API 2.2, which needs Companion 5.1 or later
- Convert to TypeScript
- Destinations, sources and gain take variables by expression only. Existing custom values and variables are converted
- Fix the gain action sending the text of a variable, rather than its value
- Destination variables read `unknown` until the router reports them. Before this version they were not set until then
- The crosspoint feedback no longer shows no source as connected on a destination the router has not reported
- Learn asks the router for a crosspoint it has not reported yet, rather than learning no source
- A message the router does not answer no longer holds up every message after it
- Fix the module hanging on a line from the router with no `.` in it, and stopping on a lone `.`
- Redundant controllers: wait 2 seconds between connection attempts, rather than retrying at once, and give up on an
  attempt that has not connected within 5 seconds
- Reconnect when a router that answers the keepalive stops responding
- A keepalive is no longer duplicated on each reconnection or config change
- Messages still queued when an action is aborted are not sent
- Messages still queued are merged, and button presses are sent ahead of feedback interrogations
- Requests the router refuses as invalid are logged as warnings
- Alarm text containing commas is logged whole

### Version 1.2.3

- Parse variables with context object

### Version 1.2.2

- Use Node 22

### Version 1.2.1

- Debounce command queue
- Update dependencies

### Version 1.2.0

- Add variable support for crosspoint feedback
- Convert to ESM
- Minor fixes

### Version 1.1.0

- Add action recorder support

### Version 1.0.4

- Hide redundant config fields when not required

### Version 1.0.3

- Better status updates
- Update dependencies

### Version 1.0.2

- Minor TCP improvements & fixes

### Version 1.0.1

- Update dependencies

### Version 1.0.0

- Initial Release
