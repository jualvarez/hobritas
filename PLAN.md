# Work and payment tracking system

## Status

Initial implementation in progress.

## Milestone 1

Payment tracking system.

The administrator will enter data submitted by workers through a responsive web interface.

## Input methods

- Manual entry and exit recording.
- Pasted conversations from which Coddy can try to identify who, when, and where.
- A documented API for Coddy and other agents to create and modify records.

## Design decisions

- Manual entry will be simple and show the worker's latest record.
- Alerts will flag overlapping schedules across sites and entries without an exit at the end of the day.
- Alerts will show the records that require attention.
- Missing-exit alerts will be visible only to administrators.
- Alerts will not prevent saving a record.
- Records interpreted by Coddy will be drafts that an administrator must review and confirm.
- The web interface, Coddy, and other agents will use the same API.
- The API will use OpenAPI and apply the same validations and alerts as the web interface.
- Each record will show the hours worked.
- Users will be able to navigate to previous days.
- Summaries can be grouped by worker or site.
- Grouped summaries can expand to show details by site or worker.
- One workday equals 8 hours.
- The week starts on Sunday and ends at the start of the following Sunday.
- A foreman will see workers assigned to their site.
- The first tap records entry at the current time and displays the worker in green.
- The second tap records exit at the current time.
- The next tap creates another record for the same worker and site.
- Each worker will show all records and total hours.
- Each record can be edited and deleted individually.
- Entry and exit times can be edited.
- An exit may include an optional reason.
- A foreman can close every open shift at their site using the current time.

## Profiles

### Foreman

- Has one assigned site and can see its workers.
- Uses a mobile-friendly shift entry interface.
- Can view the site's weekly summary and navigate backward.
- Can correct records up to one week back.

### Administrator

- Can see every site.
- Uses summary and management views without the foreman shift-entry panel.
- Can switch between daily and weekly summaries.
- Can group summaries by site or worker.
- Can open a record in a modal to correct it.
- Can create and deactivate workers.
- Can assign a worker to one or more sites.
- Can optionally assign a username, password, and role.
- Can create and rename sites and manage their active workers.
- Can see who created each record and its change history.

### Access

- The system requires login.
- The interface and permissions depend on the user's role.
- API endpoints enforce the same permissions.
- Users and passwords can be managed in the administration interface or through administrative commands.
- Password recovery is not implemented initially.
- The web uses sessions; agents use revocable tokens.

## Implementation

- FastAPI, SQLAlchemy, Alembic, and pytest backend.
- SQLite database.
- Versioned `/api/v1` API documented with OpenAPI.
- Configurable timezone, defaulting to `America/Argentina/Buenos_Aires`.
- Audited corrections and soft deletion.

## Current problems

- Information is submitted without a defined structure.
- Missing data must be requested later.
- Incorrectly recorded data leads to later claims.
