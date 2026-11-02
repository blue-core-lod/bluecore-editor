# How state is managed

The editor uses no state management library. The record being edited lives in a small document model of our own (`src/doc/`), which is plain TypeScript and tested without React. React holds one editing session at a time in `Editor`, and passes the record to the form through one context. Everything else is either outside React (the sign-in, the URL, the browser's storage), or a cache.

| State | Where it lives | Kept across a reload? |
|---|---|---|
| The record and its changes | `Log` in `src/doc/log.ts`, held by `Editor` | Yes, as a draft in IndexedDB |
| What Blue Core holds, and its versions | `saved` and `etags` in the session | Yes, in the draft |
| Which record is open | The URL (`?instance=` or `?new=`) | Yes |
| Who is signed in | oidc-client-ts, read with `useAuth()` | Yes, in session storage |
| Preferences: Hints, tours seen | `useStoredFlag`, in localStorage | Yes |
| Answers from LC, Wikidata, Wikipedia and Blue Core | A per-page cache in `useSource` | No |
| Everything else on screen | `useState` in the component that shows it | No |

## The record: a log of changes

`src/doc/model.ts` turns a bibframe-json record into a flat table of nodes. Every node, and every value in every property, gets a UUID key that exists only in the editor, never in the saved record. bibframe-json's blank nodes have no `@id`, so the keys give the editor something stable to point at.

An edit is a **change**: a label for the history ("Removed Subject: Paranoia") and a list of small operations (`src/doc/patch.ts`):
- `set` a literal;
- `insert` a value after another;
- `remove` a value;
- change a JSON-LD `keyword` such as `@type`.

Each operation names its target by key, and carries what it expects to find there. Applied to a document that has moved on, it throws a `ConflictError` rather than editing the wrong thing.

A `Log` is the record as loaded (`base`) plus the changes since, in order. **The current document is always the base with the changes replayed.** The log, not a mutable document, is the source of truth:
- **Undo** is replaying the base without the undone changes, so any change can be undone, in any order. A later change that no longer applies depended on the undone one, and the cataloger is asked about it (`undo()` in `log.ts`).
- **A draft** is the log, so restoring one is replaying it.
- **The history panel** is the list of changes.

Applying an operation copies only the nodes it touches and shares the rest with the previous document. So each edit makes a new document object without copying the whole record.

## The session: `Editor`

`src/ui/Editor.tsx` is mounted afresh for each record (keyed by URI) and holds that record's editing session in `useState`:

- **`session`:** the `log`, the `current` document, and what Blue Core holds (`saved`, the linked description of each resource as loaded or last saved, and its `etags`). It also records when it was loaded and saved.
- **Around it:**
  - `view` (Record, Graph or JSON);
  - `panel` (history or Hints);
  - `selected` and `previewing` (what the context panel shows);
  - `saving` and `report` (the last save's results);
  - `asking` (an edit to a shared Work, waiting for the cataloger to agree);
  - messages for things that went wrong.

Edits come in through `record(change)`. It checks whether the change would alter a Work other Instances share, and asks if so. Otherwise it applies the change with a functional `setSession` update, so two edits in quick succession can't overwrite each other.

**What a save writes is computed, not tracked.** `unsaved(current, saved)` (`src/doc/resources.ts`) compares each resource's linked description now with what Blue Core holds, and a save writes only those that differ, each with `If-Match: <etag>`. After a save, `afterSave()` (`src/api/save.ts`) records the new `saved` descriptions and ETags. If nothing is left unsaved, the log starts again from the current document. A partial save leaves the failed resource unsaved, so the next save writes only that one.

Derived values (the layout of sections, the graph, which fields are usually present, how many resources are unsaved) are computed from `session` with `useMemo`.

## Passing the record to the form: one context

`Description` (`src/ui/Description.tsx`) provides `DescriptionContext` (`src/ui/context.ts`) around the form. The context carries:
- `doc`, the current document;
- `labels`, names for the entities the record links to;
- `hints`;
- `record(change)`;
- `selected`, `select` and `preview`, for the context panel.

Components anywhere in the form call `useDescription()` and take what they need. A remove button only needs `record`. `AddValue` reads `doc` to find where a new value goes, then records an insert.

Components keep their own in-progress state locally: text typed into a field before it's committed, whether a lookup is open, which result is highlighted. Only a committed edit becomes a change.

## Kept in the browser

**Drafts** (`src/drafts/drafts.ts`) are stored in IndexedDB, keyed by the signed-in user and the record's URI. A draft holds the log, `saved` and the ETags, never the document itself. `Editor` writes the draft whenever the session changes, and deletes it once nothing is unsaved. On opening a record it replays any draft it finds, and compares the draft's ETags with Blue Core's to say whether Blue Core has moved on since. The home page lists drafts as unsaved records. If IndexedDB is unavailable, the editor says so and warns before the page is closed with unsaved changes.

**Preferences** use `useStoredFlag` (`src/ui/storedFlag.ts`), a boolean in localStorage that works without it: whether Hints is on, and whether the editor tour and the Hints explanation have been seen.

## Outside React

Some state belongs to the browser or a library. Components read it with `useSyncExternalStore`, so they re-render when it changes:

- **The open record** is the URL (`src/ui/route.ts`). `useOpenInstance()` reads `?instance=` or `?new=`, and `open()` and `replace()` change it. So records can be bookmarked and the back button works.
- **The sign-in** is oidc-client-ts's (`src/auth/auth.ts`). `useAuth()` reads the user, and `accessToken()` reads the current token where a request needs it.

## Caches

**Answers from outside sources** for the context panel (LC, Wikidata, Wikipedia, Blue Core usage) go through `useSource` (`src/context/useSource.ts`). It caches each request's promise by source and key for the life of the page, so going back and forth between two names doesn't ask again. A failure isn't cached, so the next look tries again. Each source shows its answer as it arrives.

**Static data** (the bibframe-json schemas, the guidance derived from LC's records, the LC vocabularies) is bundled with the app and imported as modules.

## Known weak spots

These are from the architecture review.

- **`Editor` has become the session's state machine:** loading, resuming a draft, saving, reading back, a new record's first save, the shared-Work prompt and adopting a Work, in callbacks that mix values captured at render time with functional updates. The individual steps (`afterSave`, `withBluecoreWork`, `undo`) are pure and tested; the orchestration isn't. The direction is React's `useReducer`, with explicit actions such as loaded, recorded, undone, saved, created and read back.
- **The whole form re-renders on every edit,** because `doc` is in the context value. That's unnoticeable at current record sizes. If it matters, put the stable functions (`record`, `select`) and the changing document in separate contexts.
- **Two tabs on the same record** each write their own draft, and the last one written wins.

Collaborative editing ([collaboration.md](collaboration.md)) builds on the log: changes from other people would be one more action in that reducer.
