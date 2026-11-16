# Aged book-cover variants

Status: deferred. Generate an optional worn, scratched version of a book's
existing cover so library tiles can have a more tactile, used-book appearance.

## Scope

- Start a durable worker job after upload or an explicit user action; never
  generate an image during an HTTP request.
- Give the image model the existing private cover as image-to-image input and
  store the result as a separate, private derived asset. Keep the original
  cover unchanged and selectable.
- Persist generation status and the active cover choice, so the client recovers
  correctly after a reload or worker retry.
- Treat model output as untrusted binary: enforce image type and size limits,
  do not expose a storage key, and remove an incomplete or failed derived
  asset.

## Deliberate deferrals

- Model selection, GPU/container provisioning, prompt tuning, and quotas need
  a separate implementation decision. This service already has GPU TTS
  capacity constraints; image generation must not contend with a narration job.
- Do not overwrite user-uploaded covers, change public-cover permissions, or
  apply the effect without an owner opt-in.

The frontend companion is
[`docs/issues/aged-book-covers.md`](../../../narrator-fe/docs/issues/aged-book-covers.md).
