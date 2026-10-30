# Saving a record, and copying one from LC

What happens when a cataloger clicks **Save to Blue Core** today, and the open question about saving a record copied from the Library of Congress. Written 2026-10-30, against bluecore_api's `frame` branch (stacked on `bounded-description`) and bluecore_models `main`.

## What the editor holds

A record is an Instance and its Work, read from Blue Core as one bibframe-json bounded description (`<instance>.cbd.jsonld`). That response carries an ETag for each resource, in `Bluecore-Instance-ETag` and `Bluecore-Work-ETag`.

The editor doesn't change that document directly. It keeps the document as loaded, plus a log of changes, and the current record is the log replayed. The session is kept as a draft in IndexedDB. The editor also remembers what Blue Core holds of each resource, which is the linked description of each as loaded or as last saved.

## Saving a record that is already in Blue Core

1. **Work out what changed.** The editor splits the record into the two linked descriptions Blue Core stores, Work and Instance, and compares each with what Blue Core holds. Only resources that differ are written. Empty nodes are left out.
2. **Check the shape.** Each description is validated against bibframe-json's `linked.json`. One that doesn't fit isn't sent.
3. **Write each resource separately, Work first.** Each is a `PUT` to its own URI, with `If-Match` set to the ETag it was read at. The Work goes first because the Instance names it. Blue Core has no transaction spanning two resources, so each write succeeds or fails on its own, and the editor reports each result.
4. **Handle the results.**
   - **412 Precondition Failed:** someone saved the resource since it was read. The cataloger chooses between saving theirs over it and reloading.
   - **Partial save:** the resource that succeeded is recorded as saved, so a retry writes only the one that failed.
5. **Read it back.** Once everything is saved, the editor reads the record from Blue Core again. Blue Core adds to what it stores, such as its own admin metadata, and the next save needs the new ETags.

On the server, a `PUT /works/{uuid}` checks `If-Match` and parses the JSON-LD. It then calls bluecore_models' `save_graph(..., primary_class=BF.Work)`, and `PUT /instances/{uuid}` does the same with `BF.Instance`. `primary_class` matters below: **only the kind being written is upserted.** Any other Work or Instance in the payload is a reference, created if Blue Core doesn't have it and never overwritten.

## Saving a new record

A new record ("Start a new record") has no Blue Core URIs yet. Until it's saved, its Instance and Work carry placeholders (`urn:bluecore-editor:new:…`), which key its draft and link the two. Its first save:

1. `POST /api/works/` with the Work and an empty `@id`. Blue Core mints a URI and returns it.
2. `POST /api/instances/` with the Instance and an empty `@id`, its `instanceOf` now the Work's new URI. Blue Core links the two from `instanceOf`.
3. The editor replaces the placeholders with the minted URIs. If the Instance failed, a retry creates only the Instance. Once both exist, the editor opens the record at its new URI, which reads it back with ETags. A create's reply carries no ETag.

## Copying a record from LC

**Deferred (2026-10-30)** until there is more agreement around how the editor will be used. This section records where things stood, for when it comes back. bluecore_api's `frame` branch has the `/frame` route; the editor has none of this.

This was the planned ISBN start:

1. The cataloger types an ISBN.
2. The editor searches Blue Core (`/api/search/?scope=identifier&type=instances`) and LC (`id.loc.gov/resources/instances/suggest2/?searchtype=keyword`).
3. To copy an LC Instance, the editor fetches LC's `<instance>.cbd.rdf` (the Instance with its Work) and posts it unchanged to `POST /api/frame`. That returns it as bibframe-json without the editor reading RDF.
4. The result opens as a new record.

We decided the copy should **keep LC's URIs** rather than start with empty ids, so Blue Core records where it came from.

### What Blue Core does with an LC URI in a create

When a save carries a URI that isn't Blue Core's, bluecore_models' `_mint_all_uris` looks for a Blue Core resource whose admin metadata says it was `derivedFrom` that URI:

- **None found:** it mints a Blue Core URI and adds `adminMetadata.derivedFrom <LC URI>`.
- **One found:** it saves onto that resource's URI instead of minting a new one. This is how reloading LC data updates what Blue Core already has.

### The issue

Put together with "only the primary kind is upserted", a create with LC's URIs can turn into an update. Whether it does depends on which request carries which resource:

| Already in Blue Core | Sent in a `POST /instances/` (Instance is primary) | Sent in a `POST /works/` (Work is primary) |
|---|---|---|
| Nothing | Instance created. The Work is created as a reference; **unknown whether with LC's full description or as a stub.** | Work created. |
| LC's Work, from a bulk load or an earlier copy | New Instance linked to the existing Work, which is left alone. **Any Work edits made in the copy are silently dropped.** | **The shared Work is overwritten**, with no `If-Match`. |
| LC's Instance, from an earlier copy | **The earlier copy is overwritten**, with no `If-Match`. | (n/a) |

Two things make this hard to see from the editor. A `POST` meant to create can update an existing record, skipping the `If-Match` check that protects every other save. And whether a resource is overwritten or quietly left alone depends on which request it travels in, not on anything the cataloger chose.

The editor's current two-POST flow (Work, then Instance) would hit the worst cell: copying an LC record whose Work Blue Core already has overwrites that shared Work.

### Ways forward

1. **One Instance POST for a copy.** The editor sends the Instance with LC's Work in it, and doesn't POST the Work. Blue Core links an existing Work or creates a new one, and never overwrites one. The start page offers to open an existing copy instead of copying again, using `derivedFrom` in Blue Core's search results. This needs no API change. It does need a test of what Blue Core creates for an embedded Work it doesn't have (the open cell in the table), and the editor would have to say that Work edits in a copy aren't saved when the Work already exists.
2. **Creates that refuse to update.** Blue Core's create routes answer 409, with the existing resource's URI, when the payload names something already derived into Blue Core. The editor then opens or links that resource. This is the most predictable for every client, but it changes create behavior that the batch loaders or other clients may rely on.
3. **Start clean after all.** Copies use empty ids and always make new resources. This is the simplest, but it loses the link to LC and duplicates LC Works Blue Core already has.

## Open questions

- What does an Instance POST create for an embedded Work Blue Core doesn't have: LC's full description, or a stub?
- Should a create ever update an existing resource? If so, should it honor `If-Match`?
- Underneath both: should "which kind is primary" decide whether a resource is overwritten, or should that come from what the client asked for? bluecore_models' save is complicated enough that reasoning about outcomes like these takes reading the code; that's a separate issue.
