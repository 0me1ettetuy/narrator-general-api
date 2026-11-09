# Fish free model turning paid

## Status

Deferred. Not implemented.

## Problem

`fish.s2.1-pro-free` is listed as selectable for every user with a valid key. If
Fish ends the free tier, the model would behave like the paid one: generation
fails with a `402`, and the Models page still offers it. Fish has no endpoint
that reports a model's pricing, so this cannot be detected ahead of time.

The credit check added for `fish.s2.1-pro` (`requiresCredit`,
`FishCredentialService.hasApiCredit`) does not cover it. Applying it to the free
model would block accounts with a zero balance, who are exactly the users the
free model is for while it is still free.

## Options considered

- **Config switch.** Setting `requiresCredit` for the free model from an env flag
  once Fish announces the change, so the existing balance check applies. Manual,
  but explicit and predictable.
- **Reactive `402` flag.** Remember a `402` per user and model for a few minutes
  and list the model as unavailable. Rejected for now: it is a workaround that
  only reacts after a failed generation, and it hides the real cause.
- **Map the `402` to a clear error.** At minimum, show "no credit" instead of a
  generic failure when Fish returns `402`. Not built yet.

## Today

- A Fish `402` surfaces as a generic generation failure.
- `TTS_FISH_S2_1_PRO_FREE_ENABLED=false` hides the free model for everyone.

See [voice models](../features/voice-models.md) (paid Fish models need credit).
