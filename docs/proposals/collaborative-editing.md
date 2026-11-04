# Design: Collaborative editing

**Status:** proposed; not started.
**Related:** [docs/collaboration.md](../collaboration.md) (the full mechanics); [design.md, Toward collaborative editing](../design.md).

## Summary

Let catalogers work in the same record at the same time, each in their own browser, with changes appearing for everyone as they're made. Browsers meet in a room, a WebSocket endpoint in Blue Core that relays changes and presence. They share one change log, merged in a single order, and a choice two people make differently is put to them as a decision, not merged silently. Saving to Blue Core stays a single commit, made by one person.

## Background

Cataloging has natural uses for working together live:
- **Supervised cataloging:** a trainee and a reviewer in the same record, the reviewer following along or stepping in on one field. This closes the review gap better than reading diffs afterwards.
- **Calling in a specialist,** such as a music cataloger or a language expert, for one part of a record.
- **Handoffs,** such as acquisitions starting a record from an ISBN and a cataloger finishing it, with no save-and-reopen step.
- **Shared work across institutions,** such as catalogers at several libraries enriching the same Work at once.

The editor was built so this stays possible:
- **Edits are an ordered log of small patches** (`src/doc/patch.ts`, `src/doc/log.ts`). Each names its target by a key, and carries what it expects to find there. A patch applied to a document that has moved on fails, rather than editing the wrong thing.
- **The document is always the base plus the replayed log,** and the log is what the browser's draft keeps.
- **Keys are UUIDs,** so two browsers never mint the same one.
- **Presence would be separate from record data.**

One thing is missing: two browsers that load the same record each mint their own keys (`normalize`, `src/doc/model.ts`), so their patches mean nothing to each other.

## Goals

- Two or more catalogers can edit one record at once and see each other's changes within a second or two.
- A choice made differently by two people is shown to them as a decision ("Ana chose X, you chose Y"), never resolved silently.
- Each person can undo their own changes.
- Nothing is lost if the connection or the room drops.
- Editing alone works exactly as it does now.

## Non-goals

- Character-by-character merging of one field typed by two people at once. Values are short (titles, statements, notes), so that case becomes a choice between the two versions.
- Locking fields.
- Collaborating on a record before it's first saved to Blue Core.
- Storing drafts on the server.

## Design

### A shared base

Whoever opens the room publishes the base: the normalized document, with what was last saved and the ETags. Anyone who joins takes that base, instead of normalizing Blue Core's copy themselves.

### A replicated log

- **Ordering.** Each change carries a Lamport stamp and its author's peer id. Every peer orders all the changes it knows of by (stamp, peer id) and replays them onto the shared base. Replay is pure, so every peer with the same changes reaches the same document.
- **Undo is a retraction.** Today undo removes changes from the log, which can't be done to other people's history. In a room, undo adds the change's id to a replicated set of retracted changes, and replay skips them. Later changes that depended on a retracted one are found as `undo()` finds them now.
- **A change that fails in the merged order is a conflict, not an error.** If two people set the same title, or choose different authorities for one contributor, both changes expect the same old value, and whichever comes second fails its check. The editor keeps it aside and asks. Keeping theirs retracts yours; keeping yours records a new change from theirs to yours.
- **Inserts don't conflict.** Two values added after the same value both land, in (stamp, peer id) order.

### Rooms

A room is a WebSocket endpoint in bluecore_api, `/api/rooms/{instance}`, one per Blue Core Instance.
- **Joining** is authenticated with the cataloger's Keycloak token, like any other Blue Core request.
- **The room relays** messages and keeps the list of who's in it. It doesn't store drafts or read record content.
- **Messages:** `hello` (the shared base), `changes`, `retract`, `presence`, `saved`.
- **When the last person leaves, the room is gone.** Each person's draft keeps the shared log, so a dropped room loses nothing: when it comes back, peers exchange what the others are missing.
- **Nginx** routes `/api/rooms/` with the `Upgrade` and `Connection` headers.

The editor reaches the room through a `Transport` interface. A BroadcastChannel implementation connects tabs in one browser, so merging can be built and tested before the endpoint exists.

### Presence

Presence is never part of the log or the draft:
- who is in the record, by name from Keycloak;
- a light marker on a field someone else is editing (a marker, not a lock);
- later: a follow mode for training, and comments anchored to fields.

### Saving together

One person saves; everyone else rebases. A save names the change ids it included. When it succeeds, the saver sends `saved` with the new ETags and saved snapshots. Each peer moves its base past those changes and keeps any made while the save ran. A save from outside the room is caught by `If-Match`, as it is today.

## What it needs from Blue Core

- The WebSocket room endpoint in bluecore_api (FastAPI and Starlette support WebSockets).
- The Nginx route in bluecore-stack.

Nothing else. The room doesn't touch record storage.

## Alternatives considered

- **Yjs or Automerge.** These merge well, but adopting one means remodelling the document as its types. That would replace the expected-value checks that per-change undo and conflict detection rely on, and they merge where the design wants a decision.
- **WebRTC between browsers.** It still needs a signaling server, plus a TURN relay for the campus and library networks that block peer-to-peer connections. A relaying room is the smaller of the two, and it works on any network that reaches Blue Core.
- **Locking fields** while someone edits them. It's simpler, but it gets in the way of supervision and handoffs, which are the main use cases, and stale locks need clearing.

## Risks

- **Replay cost** grows with the log. Records are small, but a long session in a busy room may need the base advanced more often than at each save.
- **Conflict prompts** could be confusing if they're frequent. Field markers should make most conflicts avoidable.
- **The room is new server code** in bluecore_api, with connection handling the API doesn't have yet.

## Open questions

- **Who may join a room:** anyone signed in to Blue Core, or only people the cataloger who opened it invites?
- **How long a room outlives a quiet session:** does someone who closes the tab and comes back an hour later rejoin the same shared log, or start again from what was saved?
- **Handoffs of new records:** a record has a room only once it's in Blue Core, since the room is named by its Instance URI. Is "save, then share the link" good enough?

## Phasing

1. **Prerequisites,** from the architecture review: move the editor's session logic into a reducer with explicit actions; give drafts a format version; keep edits made while a new record's first save is running; send the token only to Blue Core's own URIs.
2. **Replicated log:** stamps, merged replay, undo by retraction, conflicts kept as data. Pure and unit-tested; editing alone is unchanged.
3. **Two tabs, one record:** the `Transport` interface over BroadcastChannel. This also stops two tabs on one record overwriting each other's drafts, which happens today.
4. **Conflicts and presence in the interface.**
5. **The room endpoint:** bluecore_api, Nginx, and a WebSocket transport. Inviting someone means sharing the record's editor link.
6. **Saving together:** the `saved` message and rebasing.
7. **Later:** follow mode and comments anchored to fields.

Phases 1–3 are useful on their own and need nothing from Blue Core. Phase 5 is the first that does.

## References

- [docs/collaboration.md](../collaboration.md): the merge model, rooms, presence, saving and phases in detail.
- [design.md, Toward collaborative editing](../design.md).
