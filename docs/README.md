# Narrator backend documentation

Use this index to find domain documentation. The feature catalogue is the
cross-repository overview of what the app currently does; the other folders
describe implementation rules, operational configuration, plans, and deferred
work.

## Start here

- [Feature catalogue](features/README.md) — implemented user-facing and
  developer-facing capabilities across backend and frontend.
- [Change history](history.md) — chronological milestones and complete
  committed-change index for this repository.
- [Architecture](architecture/README.md) — module boundaries and delivery
  checklist.
- [API](api/README.md) — REST, OpenAPI, validation, error, and browser-request
  conventions.

## Domains

- [Books](books/README.md) — chapter parsing/curation design and segmentation
  investigation.
- [Text to speech](tts/README.md) — Fish Audio, local models, worker behavior,
  and model-catalogue maintenance.
- [Integrations](integrations/README.md) — third-party research notes.
- [Issues](issues/README.md) — intentionally deferred lifecycle work.

## Maintenance rule

Put a document in the folder of the domain it describes. Add it to that
folder's README and update this index when it creates a new top-level domain.
