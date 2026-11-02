# Collaborative editing

How catalogers could work in the same record at the same time, building on what the editor already does. The use cases and the principle behind the UX are in [design.md](design.md#toward-collaborative-editing). This note covers the mechanics and the order to build them in. None of it is built yet.

## What exists, and the gap

The editor was built so this stays possible:

- **Edits are small keyed patches** (`src/doc/patch.ts`). Each one names its target by a client-side key, not an array position, and carries what it expects to find there. A patch applied to a document that has moved on fails with a `ConflictError` rather than editing the wrong thing.
- **The document is always the base plus the replayed changes** (`src/doc/log.ts`). The log, not a mutable document, is the source of truth, and it's what the IndexedDB draft keeps (`src/drafts/drafts.ts`).
- **Keys are UUIDs,** so two browsers never mint the same one.

The gap is the base. `normalize` (`src/doc/model.ts`) mints fresh keys every time a record is loaded, so two browsers that each load the same record from Blue Core end up with different keys, and their patches mean nothing to each other. **People in a record have to share one base.** Whoever opens the room first publishes the base, with what was last saved and the ETags, and anyone who joins takes that base instead of normalizing Blue Core's copy.

## Merging: a replicated log

The editor keeps its own operations rather than remodelling the document as Yjs or Automerge types. Those libraries merge well, but they would replace the expected-value checks that per-change undo and conflict detection rely on, and they would merge where the design wants a decision.

- **Ordering.** Each change carries a Lamport stamp and its author's peer id. Every peer orders all the changes it knows of by (stamp, peer id) and replays them onto the shared base. Replay is pure, so every peer that has the same changes reaches the same document.
- **Undo is a retraction.** Undo today removes changes from the log. That can't be done to other people's history, so in a room undo adds the change's id to a replicated set of retracted changes, and replay skips them. Later changes that depended on a retracted one are found the way `undo()` finds them now.
- **A change that fails in the merged order is a conflict, not an error.** If two people set the same title, or choose different authorities for the same contributor, both changes expect the same old value. Whichever comes second in the order fails its check. The editor keeps it aside and asks: "Ana chose X, you chose Y." Keeping theirs retracts yours. Keeping yours records a new change from theirs to yours. The design's "meaning more than merging" falls out of the checks the patches already make.
- **Inserts don't conflict.** Two values added after the same value both land, in (stamp, peer id) order.
- **Text conflicts are whole values.** Values are short: titles, statements, notes. Character-by-character merging of one field typed by two people at once is out of scope. That case becomes a choice between the two versions.

## Rooms

A room is a WebSocket endpoint in bluecore_api, at `/api/rooms/{instance}`, one per Blue Core Instance. We chose this over WebRTC because WebRTC needs a signaling room on a server anyway, and a TURN relay for the campus and library networks that block peer-to-peer connections. A relaying room is the smaller of the two, and it works on any network that reaches Blue Core. bluecore_api runs on FastAPI and Starlette, which support WebSockets.

- **Joining** is authenticated with the cataloger's Keycloak token, like any other Blue Core request.
- **The room relays messages** and keeps the list of who is in it. It doesn't store drafts or read record content.
- **The messages:**
  - `hello`: the shared base, sent by whoever opens the room;
  - `changes`;
  - `retract`;
  - `presence`;
  - `saved`.
- **When the last person leaves, the room is gone.** Each person's IndexedDB draft keeps the shared log, so a dropped room or connection loses nothing: when it comes back, peers exchange what the others are missing.
- **Nginx** needs a `location /api/rooms/` that passes the `Upgrade` and `Connection` headers (`bluecore-stack/nginx/site-body.conf`).

The editor reaches the room through a `Transport` interface: send a message, and receive what others send. A BroadcastChannel implementation of it connects tabs in one browser, so merging can be built and tested before the endpoint exists.

## Presence

Presence stays separate from record data. It is never part of the log or the draft.

- Who is in the record, by name from Keycloak.
- A light marker on a field someone else is editing. It's a marker, not a lock.
- Later: a follow mode for training, where one person's view tracks another's, and comments anchored to fields.

## Saving

Saving to Blue Core stays the single authoritative commit. One person saves, and everyone else rebases.

- A save names the change ids it included. When it succeeds, the saver sends `saved` with the new ETags and saved snapshots. Each peer moves its base forward past those changes and keeps any changes that weren't in the save, made by anyone while it ran.
- A record has a room only once it's in Blue Core, since the room is named by the Instance URI. A new record gets one after its first save mints its URIs (`afterSave` and `withId`, `src/api/save.ts`). For a handoff, the first person saves and then shares the link.
- The same rule fixes a bug single-user editing already has: today, edits made while a new record's first save is running are lost when the editor switches to the new URI.
- A save from outside the room, by someone not in it, is caught by `If-Match` as it is today. The saver gets a 412 and decides what to do.

## Before starting

The architecture review found a few problems that should be fixed first:

- **Move the Editor's session logic into a reducer** with explicit actions: loaded, recorded, retracted, saved, created, read back. A change arriving from the room is then just another action, testable like the rest. Today `src/ui/Editor.tsx` handles these in callbacks that mix values captured at render time with functional updates.
- **Give drafts a format version,** so a change to the log's shape is migrated rather than discarded. A shared log makes the shape change.
- **Keep edits made during a save** (see Saving).
- **Send the token only to Blue Core's own URIs.** Today a save sends it to whatever `@id` the record has, and a room is one more place the token goes.

## Phases

1. **Prerequisites:** the reducer, draft versions, keeping edits made during a save, and the token fix.
2. **Replicated log:** stamps, merged replay, undo by retraction, and conflicts kept as data. Pure and unit-tested. Editing alone works as it does now.
3. **Two tabs, one record:** the `Transport` interface and its BroadcastChannel implementation. Two tabs share a base and their changes. This also fixes two tabs on one record overwriting each other's drafts.
4. **Conflicts and presence in the interface:** "Ana chose X, you chose Y", who's here, and field markers.
5. **The room endpoint:** the bluecore_api WebSocket room, the Nginx route, and a WebSocket `Transport`. Inviting someone means sharing the record's editor link.
6. **Saving together:** the `saved` message and rebasing.
7. **Later:** follow mode and comments anchored to fields.

## Open questions

- **Who may join a room:** anyone signed in to Blue Core, or only people the cataloger who opened it invites?
- **How long a room outlives a quiet session:** whether someone who closes the tab and comes back an hour later rejoins the same shared log, or starts again from what was saved.
