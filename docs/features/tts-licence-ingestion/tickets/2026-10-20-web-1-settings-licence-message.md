# Licence message in audio settings

> **Status: DRAFT** — not yet filed. Board: Fluent (#4) → `In Progress (Product)`.
> Suggested labels: `enhancement`, `web-app`, `ready-for-agent` · QA path: `Full QA` · Priority: P1

**Parent feature:** `tts-licence-ingestion` — design and plan live in
[fluent-api `docs/features/tts-licence-ingestion/`](../../../../../fluent-api/docs/features/tts-licence-ingestion/design.md). Ticket WEB-1.
**Repo:** `fluent-web`.
**Working branch:** `feat/tts-licence-ingestion` (in `fluent-web`). Work on that branch directly, or branch from it (`git switch -c <your-branch> origin/feat/tts-licence-ingestion`) and target your PR at it, so the plan, design and ADR context travel with the ticket. The feature branch merges to `main` once the phase's tickets are done.
**Related:** fluent-api API-1 (until it runs, nearly every DBL Bible is `unknown`, so this message would show almost everywhere).

## Problem

When a source Bible's licence bars text-to-speech, the licence fence already
refuses synthesis and gives a per-verse reason when the user presses play.
Nothing tells the user up front. The Settings modal's "Hide audio controls"
card is where they look for audio behaviour.

## Behaviour

- **Synthesis only.** No change to the fence or to recorded playback: a
  blocked Bible with recorded audio still plays it.
- **The toggle stays enabled.** "Hide audio controls" is a viewing preference
  and still matters for recordings.
- **Message:** when the current source Bible's TTS licence status is not
  `allowed`, show under the card (muted text, `role='note'`, linked to the
  switch via `aria-describedby`):
  - `forbidden` / `unknown`: _"Text-to-speech isn't available for {Bible} because of its licensing terms."_ (i18n key `ttsLicenceSettingsNotice`; product owns final wording)
  - `allowed`, or no current source Bible: no message.
  - A status the client couldn't read (fence `unconfirmed`): no message. That isn't a fact about the Bible.
- **Where the status comes from:** `SettingsModal` is global (rendered in
  `AuthenticatedLayout`) and has no project context. Add a small external store
  alongside `hideAudioStore.ts` (same `useSyncExternalStore` pattern), e.g.
  `activeSourceLicenceStore`, that holds `{ bibleName, status } | null`.
  `DraftingUI` publishes into it, using the same resolved status it passes to
  the fence (provider facts first, falling back to `projectItem.ttsLicenseStatus`),
  and clears it on unmount. `HideAudioSettings` reads it.
- Still hidden entirely when the `sourceAudio` flag is off (existing behaviour).

## Acceptance criteria

- [ ] On a drafting page whose source Bible is `forbidden` or `unknown`, Settings shows the message naming the Bible; the toggle still works.
- [ ] On an `allowed` source Bible, or outside a drafting page, no message.
- [ ] Leaving the drafting page clears the message.
- [ ] Recorded audio on a blocked Bible still plays.
- [ ] Screen reader announces the note with the switch.

## Tests

- `HideAudioSettings.test.tsx`: message per status (allowed / forbidden / unknown / no active Bible); toggle enabled in every case.
- Store test: publish, clear on unmount, subscribers notified.

## QA notes

On QA (after API-1 runs): pick a DBL Bible, set its resource row to `forbidden`
in the DB, reload, and check the drafting page plus Settings.
