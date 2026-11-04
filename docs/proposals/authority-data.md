# Design: Authority data in the editor

**Status:** proposed; not started.
**Related:** [#6](https://github.com/edsu/bluecore-editor/issues/6) (saying when a pasted URI isn't on id.loc.gov yet), [#11](https://github.com/edsu/bluecore-editor/issues/11) (storing `sameAs` links); [design.md, Authority data](../design.md#authority-data).

## Summary

Let catalogers create and improve authority data from the editor, rather than stopping when a name or subject isn't in LC's files, or when an LC heading needs correcting. The proposal has four parts, which can be built in this order:

1. creating a Blue Core authority from the item in hand;
2. promoting an LC name or subject to a Blue Core resource when it's first edited;
3. publishing a new authority to Wikidata;
4. producing a NACO/SACO MARC authority record.

## Background

The editor can only link to authorities that already exist. When a lookup finds nothing, a cataloger can leave the value as unlinked text, or paste a URI they expect to exist.

This has already come up in testing. A cataloger had established a name that morning. It wasn't on id.loc.gov yet, so he pasted the URI it would have, and the editor had no way to say the URI didn't resolve.

Blue Core already stores the LC authorities that records use as *other resources*, under their LC URIs. Works and Instances it holds get Blue Core URIs, with their origin recorded in `adminMetadata` and `derivedFrom`. Authorities have no equivalent yet.

## Goals

- A cataloger can finish a record whose author or subject isn't in LC's files, without leaving the editor.
- A cataloger can correct or enrich an LC heading, with the change kept in Blue Core and traceable to the LC original.
- New and promoted authorities are found by colleagues in later searches, so the same entity isn't created twice.
- The work can flow on to Wikidata and to NACO/SACO, rather than staying in Blue Core alone.

## Non-goals

- Replacing NACO or LC's authority files. The editor complements the existing authority infrastructure rather than competing with it.
- Promoting every LC authority. Most are never edited, and stay as references.
- Editing shared vocabularies and code lists (relators, languages, carrier types).
- Repointing other records automatically.

## Design

### Creating from the item in hand

When a lookup finds nothing, "create new" opens a partly filled authority form:
- the name, from the statement of responsibility;
- the source citation (the 670 equivalent), from the Instance being described;
- the search itself, kept as provenance: "Searched LC and Wikidata on 2026-11-04; no match."

Before creating, the editor checks id.loc.gov directly, in case the heading was added after the lookup's source last updated.

The new entity gets a Blue Core URI at once, so the record can be finished and saved. A badge shows its status: provisional, reviewed, linked to Wikidata, and later perhaps in NACO. Lookups search Blue Core's authorities too, so colleagues find it.

### Promoting an LC heading on first edit

The rule Blue Core already applies to Works and Instances extends to authorities: anything Blue Core edits gets a Blue Core URI, and a `derivedFrom` link to where it came from.

- **Promotion happens on first edit,** such as adding a variant form, a biographical note, a Wikidata link or a missing date.
- **The promoted resource** records the LC version it was copied from, and keeps a `sameAs` link to the LC real-world-object URI.
- **Created and promoted authorities are one kind of resource,** maintained alongside Works and Instances.
- **Repointing is offered, never automatic.** The record being edited points at the promoted URI at once. Other records using the LC URI are listed for review ("214 other records use the LC version"). The usage endpoint the context panel already calls can supply that list.
- **Upstream changes are tracked.** When LC revises or deprecates the original, the promoted resource is marked as diverged, and a reviewer sees a field-by-field diff with three choices: take LC's change, keep the local version, or combine them.
- **Splitting isn't promotion.** Separating one person from an undifferentiated name makes a new entity, and the affected records go to review.

### Publishing to Wikidata

Publishing is a deliberate second step, never a side effect of creating. The editor:
1. previews the item to be created: label, short description, instance of human, dates, occupation, and references to the published work;
2. checks Wikidata for duplicates again;
3. creates the item under the cataloger's own Wikimedia account via OAuth, not a shared bot.

Using the cataloger's own account follows Wikidata's community norms and gives catalogers credit for the work. A Wikidata property for Blue Core identifiers would let the links work in both directions.

### Into NACO

For catalogers with NACO credentials, the same form can produce a MARC authority record, either for a new entity or from a promoted resource's changes. That diff is the content of a NACO or SACO proposal.

## What it needs from Blue Core

- **A promotion endpoint and policy.** The API owns the policy and enforces it for every client, Marva and scripts included. When it returns an other resource, it includes a `promote` link only if this user may promote it. Promotion is a `POST` to that link: the API mints the URI, copies the resource, records `derivedFrom` and the LC version, adds provenance, and returns the new URI. Disallowed promotions are refused with `problem+json`. The policy is configuration: rules by kind of resource, and the roles allowed to apply them. See [design.md, Appendix C](../design.md#appendix-c-reading-saving-and-the-api).
- **Storage for created and promoted authorities,** as a kind of resource alongside Works and Instances, with the status the badge shows.
- **Search over them,** so lookups can include Blue Core's own authorities.
- **`sameAs` storage** ([#11](https://github.com/edsu/bluecore-editor/issues/11)).

## Alternatives considered

- **Wait for LC.** Leave the value unlinked until the heading appears on id.loc.gov, then link it. This is what happens today. It leaves records incomplete for days or weeks, and nothing reminds anyone to come back.
- **Edit the LC copies in place.** Blue Core already stores LC authorities as other resources, so it could change them under their LC URIs. But the data would then silently differ from LC's while still claiming to be LC's. Promotion makes the divergence explicit, with its own URI and a record of where it came from.
- **Create in Wikidata first, and link to that.** This puts the entity somewhere public at once. But it depends on OAuth, community acceptance and a cataloger's Wikidata experience, all before the record can be finished. Creating in Blue Core first keeps the record moving, and publishing stays a deliberate step.

## Risks

- **Duplicates.** Provisional authorities that nobody reviews could multiply. The status badge, the search before creating, and showing Blue Core results in lookups all work against it, but review needs an owner.
- **Divergence from LC.** Promoted authorities need someone to look at upstream changes, or they drift.
- **Community reception in Wikidata** of items created through a new tool.

## Open questions

- **The promotion policy** is a team decision: which resources are promotable, who may promote, who reviews upstream changes, how promoted authorities appear in exports, and whether records still using LC URIs should eventually be repointed.
- **Wikimedia OAuth 2.0 for a browser-only client.** The editor has no server of its own. If OAuth needs a confidential client, Blue Core would have to mediate.
- **The Wikidata community.** WikiProject Libraries should be consulted early. Proposing a Wikidata property for Blue Core identifiers takes time, and contributions are CC0, which needs a licensing policy.
- **NACO.** What a NACO/SACO proposal generated from Blue Core data should look like, and who submits it.

## Phasing

1. **Creating from the item in hand,** as provisional Blue Core authorities. This is the most useful part on its own: it answers the "name established this morning" case, and it needs the least policy.
2. **Promotion,** once the policy is agreed.
3. **Publishing to Wikidata,** once OAuth for a browser client is settled.
4. **NACO/SACO records.**

## References

- [design.md](../design.md): Authority data; Appendix C (promotion); Open questions and risks.
