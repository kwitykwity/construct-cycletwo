# Session Handoff — codebase notes

Team CoNSTRuct, Cycle 2. Findings from the codebase investigation.

Verified against this fork at commit `c0ad61c6` on 2026-09-16 by running the app locally,
not from upstream docs. Re-check anything here after a big rebase on upstream.

## Local setup

```bash
yarn install
yarn start        # app on http://localhost:3001
```

Runs clean on Node 24 / yarn 1.22.

**Live collaboration does not work out of the box.** `.env.development:10` sets
`VITE_APP_WS_SERVER_URL=http://localhost:3002`, which is the separate
[excalidraw-room](https://github.com/excalidraw/excalidraw-room) repo. Nobody can test the
handoff flow (host sets a note, guest sees it) until that server is cloned and running.
Scene persistence points at Excalidraw's shared OSS dev Firebase project, configured in
`.env.development:17`.

## Where elements are created

`packages/element/src/newElement.ts:87` — `_newElementBase()`.

Every element carries: `id`, `seed`, `version`, `versionNonce`, `updated`, `created`,
and `customData`.

**There is no author field.** Nothing on an element records who created or last edited it.
Any "who did what" feature means building attribution from scratch, which is why the
handoff has a human-typed Owner field instead.

`customData?: Record<string, any>` is the place to hang handoff data. It travels with the
element through sync and persistence for free.

## Where elements are stored — three layers

| Layer | What it holds | Code |
| --- | --- | --- |
| Solo / local | localStorage keys `excalidraw` (elements), `excalidraw-state` (appState) | `excalidraw-app/data/LocalData.ts:137` |
| Live collab | broadcasts **elements only** to the room | `excalidraw-app/collab/Portal.tsx:142` |
| Room persistence | encrypted scene document at `scenes/{roomId}` in Firestore | `excalidraw-app/data/firebase.ts:187` |

The third layer is what restores a board when a guest reopens the room link days later.
That is the layer the handoff has to survive in.

Message types on the socket are limited to `SCENE_INIT`, `SCENE_UPDATE`, `MOUSE_LOCATION`,
`IDLE_STATUS`, `USER_VISIBLE_SCENE_BOUNDS` (`excalidraw-app/app_constants.ts`).
**There is no appState sync.** Handoff state kept in appState will never reach a guest.

## Is there a user or session concept? Barely.

- Persistent identity is one username string in localStorage under `excalidraw-collab`
  (`excalidraw-app/data/localStorage.ts:11`).
- `Collaborator` has `socketId` and an optional `id` (`packages/excalidraw/types.ts:74`),
  but only while the socket is open.
- No accounts, no stable user id across sessions.

Implication for the build: Owner has to be free text or a pick from whoever is live in the
room. We cannot resolve who a returning person is.

## Three gotchas that will cost a day each

1. **Local saving is paused during collaboration.** `LocalData.pauseSave("collaboration")`
   at `excalidraw-app/collab/Collab.tsx:516` (resumed at :426). A guest who closes the tab
   keeps nothing locally. The handoff must live in the room, not on the device.
2. **Invisibly small elements are not synced.** `isSyncableElement` at
   `excalidraw-app/data/index.ts:46` filters them out. Do not park handoff data on a 0x0 or
   tiny element — it will silently never sync.
3. **The room link regex is anchored.** `RE_COLLAB_LINK` at
   `excalidraw-app/data/index.ts:131` is `/^#room=([a-zA-Z0-9_-]+),([a-zA-Z0-9_-]+)$/`.
   Appending anything to the `#room=` hash breaks joining. Extra params go in the query
   string before the hash, the way `?element=` already does.

Reconciliation compares `version` / `versionNonce`. Mutate elements with the existing
helpers so those bump — a `customData` write that does not bump the version is dropped
during sync with no error.

## Suggested first spike (before any UI work)

1. Run excalidraw-room on :3002, open two browsers in one room.
2. From browser A, write a dummy value into `customData` on a normal-sized element.
3. Confirm it appears in browser B.
4. Reload B from the room link and confirm the value survived.

If that round-trips, the feature is viable. If it does not, fall back to storing the
handoff as a plain text element locked inside a frame — an ordinary element, so it syncs
and persists with no new plumbing.
