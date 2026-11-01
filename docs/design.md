# Blue Core Description Editor: Proposed Design

*Draft for discussion, October 24, 2026*

## Summary

This is a proposal for a BIBFRAME editor for Blue Core, designed for catalogers trained in MARC who are moving to BIBFRAME. These catalogers are fast, keyboard-oriented, and fluent in MARC bibliographic and authority records. Their difficulties with BIBFRAME are mostly conceptual: the Work/Instance split, the move from authorized strings to linked entities, and fixed fields becoming explicit properties.

The central idea: **show catalogers what linked data does well, and hide the mechanics of how it's stored.** Linked data gives catalogers context about every entity, one shared copy of each instead of duplicates, and the ability to fix something once for every description that uses it. Its cost, that a description is spread across separate resources, is the editor's problem to manage, not the cataloger's. The cataloger should only need to think about resource boundaries when a decision really depends on them, such as whether a change to a Work should apply to all its Instances. Anywhere else a mockup makes the cataloger think about separate resources is a design problem to fix.

The design makes five bets:

1. **Edit the description, not the resource.** A MARC record is a description, and catalogers think "I'm cataloging this book." The editor shows the Work, Instance, and Items as one document and marks where each value lands.
2. **Build on the shared database.** Reconciliation, clustering entities across sources, and creating authorities from the item in hand are central, because sharing Works, Agents, and subjects is Blue Core's purpose.
3. **Let the schema define the form and existing data guide it.** The bibframe-json schemas define what's valid. LC's BIBFRAME corpus shows what's typical for each kind of resource. Hand-maintained profiles shrink to a few curated overrides.
4. **Make authority data editable.** Catalogers can create authorities in Blue Core and Wikidata, and promote id.loc.gov names and subjects to Blue Core resources to correct or enrich them.
5. **Put context next to the work.** Authority records, Wikidata, Wikipedia, and Blue Core's own usage data appear beside the description, so research happens in the editor.

Throughout, the editor follows a few principles: guide without constraining (the full BIBFRAME vocabulary is always one search away), search before creating, suggest rather than fill in, be honest about uncertainty, work fully from the keyboard, and never drop data it doesn't model.

Underneath all of these is a goal: **the editor should not deskill catalogers, but make their work more interesting, fun, and effective.** It leaves the judgment with them and explains the model as they work, rather than reducing cataloging to filling in a form. Where the editor does something on the cataloger's behalf, such as suggesting a value, placing a field on the Work, or following a link to its source, it says so. That transparency is there to look at, not forced on anyone: hints, the history, and the reasons behind a suggestion are a click away, so experienced catalogers aren't buried in explanations they no longer need.

## Gaps in current editors

Marva and Sinopia are the current BIBFRAME editors. This design targets gaps in both rather than replacing either:

- **No view of the whole description.** Sinopia edits each resource separately; Marva shows Work and Instance in separate columns.
- **Little help with the MARC transition.** Neither explains where MARC went, such as why a 245 is split across Work and Instance or why a 700 became a Contribution with a role.
- **Reconciliation isn't the starting point.** Both start from a template, so reusing an existing Work is secondary.
- **No way to edit authority data.** Catalogers can't correct or enrich id.loc.gov names and subjects. Linked data removes most MARC-style global editing, but what remains (authorities, unlinked strings, duplicates) has no support.
- **Thin review workflows** for supervising catalogers while staff move to BIBFRAME.

The profile editing gap is narrower than it first appeared: LC's DCTAP Dancer now maintains Marva's production profiles (see Appendix B).

## The description view

**One document, in a familiar order.** The editor shows a single scrolling document with sections named in cataloging terms, following the ISBD and RDA order catalogers already know: title and statement of responsibility, creators and contributors, subjects and genre/form, publication and identifiers, and physical description and carrier. Each field carries a small Work or Instance badge, so catalogers learn the split by seeing where values land. The badges are part of the hints described below and can be turned off once a cataloger no longer needs them; the split still surfaces where it changes the outcome, in scope prompts and teaching warnings.

**Editing in place, with history.** Every value is edited where it's shown, and repeatable fields (contributors, subjects, genre/form) have their own "add" action. Each change is recorded as a small patch, so the header shows how many changes haven't been saved to Blue Core yet, and opens a history of them, newest first, each with its own undo.

**Scope prompts.** When a cataloger edits a Work that has other Instances, the editor asks whether to change it for all of them or split off a new Work. This is the one moment the boundary between resources matters to the cataloger, so it's the one moment the editor makes it explicit.

**Entry points.** The default view is anchored on the Instance, since most catalogers start from the item in hand. A Work-anchored view lists a Work's Instances for authority-minded work. When the cataloger enters an ISBN or other identifier, the editor shows existing descriptions of that Instance in Blue Core, OCLC, and Share-VDE and offers to start from one, since most cataloging is copy cataloging. The editor can also infer the resource type from the first few values entered and offer to switch views, instead of requiring a template choice up front.

**Linked and unlinked values.** Linked entities appear as chips with their label and source badges; the label is stored in the description, so it displays when a source is down. Plain text that should probably be linked gets a muted "unlinked" style and a one-click "find authority" action, because catalogers trained on authorized strings will keep typing them.

**The MARC bridge.**

- **Hints:** a single compact toggle in the header shows each field's MARC tag (245 $a, 100, 700) and its Work or Instance badge. It also shows the MARC preview. A small explainer opens from a "?" beside it, and by itself the first time someone uses the editor. One toggle with an explainer is simpler than separate switches, and catalogers new to MARC may find tags as confusing as experienced ones find them helpful. Each tag links to its page in the MARC 21 bibliographic format (loc.gov/marc/bibliographic). The BIBFRAME side gets the same: each field shows its property (`bf:extent`) linked to its entry in LC's BIBFRAME ontology, with the definition on hover; each section links to the BIBFRAME Primer's page on what it holds (titles, contributions, subjects, provision activity); and each badge to the Primer's page on Works or Instances.
- **Tag search:** typing `650` jumps to subjects, and typing `490` in "add field" offers `seriesStatement`.
- **Read-only MARC preview:** a side panel, shown with hints, renders the description through bibframe2marc. One description corresponds roughly to one MARC record, so the preview stays aligned. It's read-only because MARC round trips are lossy and editing MARC would reinforce old habits.
- **Teaching warnings:** bibframe-json's ontology checks run as quiet notes, such as when `mainTitle` is added to the Work. They catch Work/Instance mistakes without blocking anyone.
- **Fixed fields as named controls:** information from 008, 006, and 007 becomes labeled pickers for language, content type, carrier type, and so on.

**The linked data view.** The MARC preview shows the description as the old format sees it; the visualization shows what BIBFRAME gives that MARC can't, and it matters at least as much.

- **Visualize:** a read-only panel draws the description as resources and their relationships: the Instance, its Work, and the agents, subjects, places, and vocabulary terms they link to, each with its label and source badge, and each relationship labelled in cataloging terms ("instance of," "author," "subject"). It updates as the cataloger edits, and selecting a resource scrolls to its field.
- **Highlighting the value of the data:** the drawing emphasizes what a MARC record can't express. The Work is one resource shared by its Instances, and the other Instances in Blue Core appear beside it. Linked entities lead out to id.loc.gov, Wikidata, and other sources. Blue Core can show how many other descriptions use the same agent or subject, so fixing one is visibly fixing it everywhere. Plain text that could be linked appears as a dead end, which makes the case for linking better than a warning would.
- **Built from what the editor holds:** the drawing comes from the bibframe-json tree and its `@id` links, not from parsing RDF in the client, so it shows exactly what will be saved. Like the MARC preview, it comes near the end of the work, once core editing is in place.

## Guidance: what catalogers see first

The schema decides what's valid (Appendix A). What's shown first comes from how resources are actually described.

**Derived from LC's corpus.** For each resource type (print monographs, music albums, journals, maps, films), identified by Work and Instance types, carrier, issuance, and genre, an analysis of LC's BIBFRAME data gives how often each property is used, on each resource and each nested node type, which subtypes are chosen, the most common values, and which properties appear together.

**Three tiers.** Each resource type's properties are **shown** by default, **suggested** in a short list the cataloger can add with one action, or **available** through "add field." Common values become suggestions, not prefilled defaults. Adding a field can suggest its usual companions, and the "add field" menu can show usage ("used in 87% of monograph descriptions"), telling catalogers what's typical without telling them what's allowed.

**Curated overrides.** LC's data is largely converted from MARC, so frequencies partly reflect the converter and could reproduce MARC-shaped BIBFRAME. Rare but important properties need promoting by hand, and institutions differ from LC. A small, reviewed overrides file handles all three. Later, the same analysis can run on Blue Core's own data, so guidance follows practice as it changes.

**Completeness is separate.** Requirements for a finished description (PCC, LC, or an institution) apply when a cataloger marks a description ready, never when saving a draft. BIG's DCTAP, compiled to SHACL, is the natural starting point, with institutional variation as small overlays.

## Finding entities

**The field decides the lookup.** Small controlled vocabularies (carrier type, content type) are local picklists, instant and available offline. Authorities (agents, subjects, genres) are remote lookups across sources. Works and Instances use reconciliation that searches Blue Core first.

**Sources.** Lookups search Blue Core, id.loc.gov, OCLC's linked data, and Share-VDE, with Wikidata connecting them. Most external authorities, including LC names and subjects, FAST, Getty, and Wikidata, come through bcl-up_server, the lookup service Blue Core's forks of Marva and Sinopia already use, so catalogers see the same lookup behavior in every Blue Core editor. Blue Core results rank first, since reusing what's in the shared database prevents duplicates. Catalogers can toggle sources per lookup, and the editor shows when a source is degraded before the cataloger searches, using bcl-up_server's per-authority health checks.

**Clustering.** When an entity exists in several sources, it appears as one row with several source badges, using `sameAs` links in Blue Core and Wikidata's external identifier properties (LC authorities ID, VIAF, WorldCat Entities, and others). Coverage is uneven, so results have three states:

- **Same:** the rows share an identifier, directly or through Wikidata. Shown as one row.
- **Probably the same:** names and dates match but nothing links them. Shown grouped and marked "likely the same, not linked."
- **Different:** separate rows.

Selecting a clustered row stores the preferred URI for that entity type (for example, LC NAF for agents). For "probably the same" results, the cataloger can confirm with one action that they're the same. The editor records a `sameAs` link in Blue Core with who asserted it and when, so catalogers build cross-provider links as part of normal work, much as NACO does today.

**Typing and results.** Comma-structured input like `Twain, Mark, 1835-1910` is a left-anchored heading browse, as in Connexion; anything else is a keyword search. Results appear as each source responds, with a per-source loading indicator. A source that times out is reported ("Share-VDE didn't respond"), since a missing result looks the same as "no such entity."

**No match.** The cataloger can keep an unlinked string or create a new entity. "Create new" appears below a search across all sources, so creating follows searching rather than replacing it. Just before creating, the editor also checks id.loc.gov directly, in case a very recent NACO change hasn't reached the lookup cache yet.

## The context panel

A panel follows whatever the cataloger is working on. It collapses to a slim strip showing only signals (a mismatch, a likely Work match) for fast copy cataloging, and becomes a bottom sheet on narrow screens.

**What it shows** for a linked entity:

- **The authority record,** readable, with the MARC view a tap away. The 4XX variants, 670 citations, and 678 notes are evidence catalogers already know. bcl-up_server's "extended context" already provides much of this: variant labels, citation notes and sources, and earlier and later established forms for names; broader and narrower terms for subjects.
- **Wikidata facts:** short description, dates, occupation, nationality, sometimes an image.
- **The Wikipedia lead paragraph,** with attribution (CC BY-SA).
- **Blue Core usage:** which Works the entity appears on, with which roles and subjects. Usage counts ("used in 412 descriptions") are often the fastest way to choose between similar names.

**Suggestions.** Once an entity is chosen, the panel offers suggestions it supports, such as "This author has 3 Works in Blue Core; is this one of them?", "Other Instances of this Work use these subjects," or "The 670 cites a title close to the one you entered." Each shows its source and needs one action to accept, and accepted suggestions are recorded as provenance.

**Disagreements and comparison.** When sources disagree, such as different dates in Wikidata and the authority record, the panel shows it quietly; these are also leads for NACO maintenance. Catalogers can pin two entity cards side by side when a choice is hard.

## Authority data

**Creating from the item in hand.** When nothing matches, "create new" opens a partly filled authority form. The name comes from the statement of responsibility, the source citation (the 670 equivalent) is the current Instance, and the search itself is saved as provenance: "Searched LC, OCLC, Share-VDE, Wikidata on this date; no match." The entity gets a Blue Core URI immediately, so the description can be finished, and a badge shows its status: provisional, reviewed, linked to Wikidata, and possibly later to NACO. Colleagues see it first in later searches, which prevents parallel duplicates.

**Promoting id.loc.gov names and subjects.** Blue Core already gives Works and Instances Blue Core URIs while recording their origin in `adminMetadata` and `derivedFrom`, and keeps authorities and codes in a catch-all of OtherResources with their LC URIs. The editor extends the same rule to authorities: anything Blue Core edits gets a Blue Core URI and a `derivedFrom` link to where it came from.

- **Promotion happens on first edit,** such as adding a variant form, a biographical note, a Wikidata link, or a missing date. Most LC authorities are never promoted.
- **Created and promoted authorities are one kind of resource,** locally maintained alongside Works and Instances. A promoted one also records the LC version it was copied from. Identity links such as `sameAs` to the LC `/rwo/agents/` URI still hold.
- **Policy decides what's promotable.** Names and subjects are; shared vocabularies and code lists (relators, languages, carrier types) are excluded by default. The API owns this policy (Appendix C).
- **Repointing.** The description being edited points at the promoted URI immediately. Other descriptions using the LC URI are offered as a batch suggestion ("214 other descriptions use the LC version"), never repointed automatically. Meanwhile, lookups show the LC and Blue Core versions as one result with a "Blue Core edit" badge.
- **Upstream changes are tracked.** When LC revises or deprecates the original, the promoted resource is marked as diverged, and a reviewer sees a field-by-field diff with options to take LC's change, keep the local version, or combine them.
- **Splitting is not promotion.** If an edit changes which entity it is, such as separating one person from an undifferentiated name, the result is a new entity, and the affected descriptions go to review.

**Publishing to Wikidata** is a deliberate second step. The editor shows a preview of the item to be created (label, short description, instance of human, dates, occupation, references to the published work) and checks Wikidata for duplicates again. Edits are made under each cataloger's own account via OAuth, not a shared bot, which follows community norms and gives catalogers credit. Proposing a Wikidata property for Blue Core identifiers makes the links work in both directions.

**Into NACO, not around it.** For catalogers with NACO credentials, the same form can produce a MARC authority record, whether for a new entity or from a promoted resource's changes; that diff is the content of a NACO or SACO proposal. The editor complements the existing authority infrastructure rather than competing with it.

## Batch suggestions

In MARC, fixing a heading means changing every record that contains it. In Blue Core, editing a shared Agent is one edit, and promotion extends that to LC authorities. What's left for batch editing is mostly unlinked data: strings copied into many descriptions and duplicate entities. Each item-level reconciliation shrinks that over time.

Batch editing is a separate tool. The description editor's role is to notice when an item-level change suggests a batch operation:

- **Linking an unlinked string** that appears in 37 other descriptions. This will be the most common case in data converted from MARC.
- **Confirming a duplicate** Work or Agent, which means redirecting every description that points at it.
- **Fixing a recurring error,** such as a wrong relator also found in descriptions from the same vendor load.
- **Promoting an authority** that other descriptions use.
- **Splitting an entity,** where each affected description needs its own judgment.
- **Finding an outdated heading** that LC has since changed.

The cataloger saves first. A non-blocking notice then opens a preview of the affected descriptions with the change shown on each, and offers to apply to all, review one at a time, send to the batch queue, or dismiss. Where each description needs judgment, only review or queue are offered. Sending to the queue matters because a cataloger may not have permission, or time, to change others' work.

The batch workspace itself defines selections (by query, by origin, or from a suggestion), runs dry runs with diffs, applies changes asynchronously, tags every change with a batch ID in its provenance, and undoes a batch as one unit.

## Future: assistance

Assistance from a model could have a narrow, useful place, as long as it adds to catalogers' expertise rather than replacing it. It isn't part of the first slice, but the design leaves room for it: it would use the same suggestion pattern as the context panel, with the model named as the source.

**Principles:**

- **It suggests; the cataloger decides.** It never fills in a field, picks an authority, or answers a scope prompt on its own.
- **Suggestions rest on evidence the cataloger can check:** the item itself, the authority record, Blue Core's data. It doesn't add claims of its own.
- **It never invents headings.** A proposed name or subject has to be an existing entry, confirmed through the normal lookup.
- **Deterministic tools come first where they exist.** Rule-based checks, and LC's romanization tool for non-Latin scripts, are predictable in a way a model isn't.
- **Institutions decide whether it's on,** and accepted suggestions are recorded as such in the description's history and provenance.

**Where it could help, roughly from safest to most sensitive:**

1. **Transcribing from the item.** The cataloger photographs the title page, verso, and CIP block, and the editor proposes the title, statement of responsibility, publication details, and ISBN, each shown next to the image for checking. This saves tedious typing, leaves judgment with the cataloger, and is easy to verify. It's the natural first pilot.
2. **Noticing what may be missing or wrong.** Suggestions such as "the statement of responsibility names an illustrator, but there's no illustrator contribution," "the publication date differs from the copyright date on the verso," or "the table of contents shows an index, but there's no index note." Simple consistency checks are rule-based; a model helps where the evidence is in the item or in free text. Each appears as a quiet note on the field, like the teaching warnings, and never blocks saving.
3. **Explaining BIBFRAME in context.** A cataloger asks why extent belongs on the Instance, or what the BIBFRAME equivalent of a 490 with an 830 is, and gets an answer linked to the BIBFRAME Primer, MARC 21, or relevant RDA guidance. This supports the move from MARC rather than doing the work.
4. **Laying out the evidence for hard choices.** For "likely the same, not linked" results, a summary of the evidence for and against (670s, dates, Wikidata), with the decision left to the cataloger.
5. **Drafting source citations** for new authorities from what the item says, such as an author note.
6. **Proposing subject candidates** from a summary or table of contents. This is the most sensitive, since subject analysis is core professional expertise and a confident suggestion is easy to defer to. It should be opt-in and only offer existing headings to consider.

**Where it doesn't belong:** writing whole descriptions, choosing authorities silently, creating authorities on its own, or making Work/Instance decisions.

## Open questions and risks

- **bibframe-json versioning.** v0.1 is frozen and every version before v1 breaks compatibility. The editor pins v0.1, and records the form handles badly should become `conformance/` cases.
- **Lookup configuration.** Which bcl-up_server authorities are enabled in Blue Core's production deployment, and whether its normalized results carry the identifiers clustering needs.
- **Client-side feasibility.** Whether Share-VDE allows cross-origin requests, whether bibframe2marc performs well enough in the browser for a live preview, and whether Wikimedia's OAuth 2.0 supports a browser-only client. Each "no" becomes a Blue Core endpoint.
- **`sameAs` storage.** Blue Core doesn't store cross-provider links yet; clustering depends on it.
- **`hasInstance`.** Whether Blue Core stores or derives it affects how simple separate writes are.
- **Promotion policy.** Which OtherResources are promotable, who can promote, who reviews upstream changes, how promoted authorities appear in exports, and whether descriptions still using LC URIs should eventually be repointed.
- **Corpus access and bias.** Getting LC's BIBFRAME data in bulk, classifying resource types reliably, and keeping converter artifacts out of the guidance.
- **Wikidata.** Community reception of authorities created by a new tool (WikiProject Libraries should be consulted early), the time needed to propose a Blue Core identifier property, and a licensing policy for contributing to CC0 Wikidata.
- **Positioning with LC.** The design should be presented as complementary to Marva. Some ideas, such as a live form preview and extension columns in Dancer, are better contributed upstream.
- **Who maintains** the guidance overrides and completeness rules, and with what tool.

## Next steps

1. **Share this writeup** with the Blue Core team and the Marva and Dancer developers at LC.
2. **Mock up one realistic print monograph** with static data, one author in LC NAF and Wikidata and one in neither. The screens and states to cover:
   - the description view with Work/Instance badges, MARC hints, and the MARC preview;
   - the visualization of the description's resources and relationships, including a Work shared by several Instances;
   - starting from an ISBN, with existing descriptions offered;
   - the three guidance tiers and "add field" with tag search and usage numbers;
   - an agent lookup with clustered, "probably the same," and timed-out results;
   - the context panel, expanded and collapsed, with a suggestion and a disagreement;
   - the scope prompt when editing a shared Work;
   - "no match, create authority," and promoting an LC name with the batch suggestion that follows;
   - a teaching warning for a property on the wrong resource.
3. **Test with five or six catalogers** at different stages of BIBFRAME experience, after watching each catalog in Marva or Sinopia. Test whether the single description view reduces Work/Instance confusion, whether clustered results and context cards speed up choosing entities, and whether creating and promoting authorities feels natural or risky.
4. **Analyze the LC corpus** for print monographs, music albums, and journals, and compare the results with Marva's templates and BIG's DCTAP. This tests data-derived guidance cheaply and feeds the mockup's tiers.
5. **Start the slow groundwork:** propose the Wikidata property for Blue Core IDs, agree on storing `sameAs` links and promoted authorities in Blue Core, and open the Dancer PR for dropped-column warnings.
6. **Build a thin vertical slice** using only Blue Core, through the user's Keycloak sign-in, and sources that need no API key: id.loc.gov, bcl-up_server and the authorities it covers, Wikidata, and Wikipedia. It covers print monographs, Instance-anchored, starting from an ISBN matched against Blue Core and id.loc.gov; corpus-derived tiers; agent lookup with clustering and Wikidata context; authority creation and promotion in Blue Core; and separate writes on save. Sources that need keys (WorldCat Entities, and OCLC records for the ISBN start) wait, along with the batch workspace, Wikidata publishing, and NACO export. Share-VDE joins the slice if it turns out to need no key and allows cross-origin requests.

---

## Appendix A: bibframe-json as the form's foundation

The form is driven by the hand-written JSON Schemas in `blue-core-lod/bibframe-json`. Because they're language-neutral, the JavaScript editor (with Ajv) and Python services (with `jsonschema`) apply the same rules, so the editor and the API can't disagree.

What v0.1 provides:

- **One definition per class** (Work, Instance, Item, Hub, Title, Contribution, Identifier, ProvisionActivity, AdminMetadata, Classification, Relation, and others), with stable names that map to form components.
- **`Ref`:** a bare URI or a node with `@id`, `rdfs:label`, and `source`. This signals a lookup rather than a subform, and the label is where display text is cached.
- **`Text`:** a plain literal or `@value` with `@language`, giving one place for a language and script control.
- **Every property is an array,** so every field is structurally repeatable.
- **No `required` properties** except `@context`, so drafts always validate.
- **Plain-language descriptions** ("One published edition of a Work") usable as help text.
- **`vocabulary.json`:** labels and definitions for all 456 BIBFRAME 3.0.1 terms, covering properties the hand-written definitions don't model and powering "add field."
- **`ontology.json`:** domain and range checks as warnings, which drive the teaching notes. Its ranges also tell the editor whether an unmodeled property needs a text field or a lookup.

bibframe-json deliberately leaves `@type` open and accepts any array-valued property, so no data is lost. The editor doesn't need that to change: type pickers come from the ontology's subclass tree (Identifier offers Isbn, Lccn, and so on; ProvisionActivity offers Publication, Manufacture, and others).

Presentation lives in a separate sidecar so the schema stays clean for other consumers. Keyed by definition name and property, which are stable, it holds the generated guidance tiers and their overrides, grouping and order for the description view, MARC hints, and lookup configuration (sources and the preferred URI per entity type).

## Appendix B: the profile landscape

The editor depends on none of these, but they inform the guidance overrides and completeness rules.

- **Marva** (`lcnetdev/marva-quartz`) loads production profiles from DCTAP Dancer at `editor.id.loc.gov/marva/dancer/api/serve/marva-prod/profile` and `/starting-points`. The older `/marva/util/profiles/` endpoints were frozen in February 2026. Users can select their own Dancer workspace, and some configurations load static JSON from `lcnetdev/marva-profiles`.
- **DCTAP Dancer** (`lcnetdev/dctap-dancer`) stores DCTAP in SQLite workspaces, converts it to Marva's Sinopia-style JSON on request, and also serves raw CSV and TSV. It accepts core DCTAP columns plus `resourceURI` and four LC extensions (`lcDefaultLiteral`, `lcDefaultURI`, `lcDataTypeURI`, `lcRemark`), and silently drops any other column on import. A PR that warns about dropped columns, then one that preserves extension columns, would help anyone extending DCTAP. A live preview of the cataloger form may be Dancer's remaining gap.
- **BIG DCTAP** (`bf-interop/DCTap`) is a small set of validation profiles built for conversion to SHACL, with `severity` and `target` columns (both of which Dancer would drop). Its monograph shapes overlap closely with Marva's: 8 of 10 properties in the print Instance shape and 9 of 10 in the Work shape appear in Marva's templates. The exceptions are `adminMetadata`, which Marva adds in code, and `seriesStatement`. This comparison used the GitHub copy of Marva's profiles, not the live Dancer workspace.
- **Blue Core's Sinopia-based templates** and the others above become secondary input: compared against the corpus-derived tiers to find properties policy requires but the data rarely shows, and compiled into overrides and overlays.

## Appendix C: reading, saving, and the API

**Bounded in, linked out.** A bounded description is an Instance with its Work embedded; a linked description is one resource with bare URIs for the rest. The editor reads bounded, edits it as one document, and saves linked descriptions per resource.

**Node identity.** The schema forbids `@id` on blank nodes, so the editor tracks nodes with client-side keys kept outside the document. Edits are recorded as small patches against those keys, giving undo and redo, readable history, and small payloads. Keys are removed on save.

**Separate writes by default.** Most saves touch one resource: a PUT for a changed Instance or Work, or a POST with `instanceOf` for a new Instance of an existing Work. Only a new Work with a new Instance needs two dependent writes (POST the Work, then the Instance with the returned URI), which is the case for a synchronous batch endpoint if one is kept. Drafts live in IndexedDB with per-resource save state, so a partial save shows "Work saved, Instance not saved; retry." The server cleans up Works whose Instance was never saved.

**API expectations:**

- `If-Match` per resource; a conflict returns 412 naming the resource, and the editor shows a diff.
- Idempotency keys on writes, so a retry after a timeout can't create duplicate Works.
- Validation errors as `application/problem+json` with paths the editor maps to fields.
- Reads after a write come from the primary store, not a lagging search index.
- `hasInstance` derived on the server from `instanceOf`, which keeps separate writes simple.
- If the synchronous batch endpoint is kept, it commits in one transaction, defers indexing, MARC generation, and export to an outbox, returns new URIs for temporary IDs along with new versions, and honors `Prefer: respond-async` for bulk work.

**Promotion.** The API owns the promotion policy and enforces it for every client, including Marva and scripts. When it returns an OtherResource, it includes a `promote` action link only if this user may promote it, and the editor shows "Edit in Blue Core" only then. Promotion is an explicit `POST` to that link: the API mints the Blue Core URI, copies the resource, records `derivedFrom` and the LC version in `adminMetadata`, adds a provenance entry, and returns the new URI. Disallowed promotions are rejected with `problem+json`. The policy itself is data in Blue Core's configuration: rules by kind of resource (using OtherResources' types where reliable, URI patterns such as `id.loc.gov/authorities/names/` versus `id.loc.gov/vocabulary/` as a fallback) and the roles allowed to apply them.

**Architecture.** The editor runs entirely in the browser, with no server of its own. Anything that needs mediating on a server becomes a Blue Core endpoint, since that's where the data goes.

- **The client** renders forms from bibframe-json, the vocabulary, and the sidecar, validates with Ajv, and keeps drafts in IndexedDB. Drafts stay on that device until saved to Blue Core; server-side drafts could be added later if catalogers want to move between computers.
- **Sign-in** uses a public Keycloak client with authorization code and PKCE, so no secrets ship to the browser. The editor sends the user's token straight to Blue Core, and keeps tokens in memory rather than in browser storage.
- **Lookups** are called directly and in parallel from the browser, so results appear source by source. bcl-up_server (`cul-it/bcl-up_server`, Blue Core's fork of LD4P's qa_server, built on Samvera's Questioning Authority) covers most external authorities, as it already does for Blue Core's forks of Marva and Sinopia. It answers one authority per request, so the client fans out and merges. The client goes to id.loc.gov directly for left-anchored heading browse, since bcl-up_server's search is keyword-based, and for the duplicate check before creating an authority. For the ISBN start, the client searches Blue Core's ISBN lookup and id.loc.gov's Instance keyword search (`/resources/instances/suggest2?q=<isbn>&searchtype=keyword`). Because the latter is a keyword search, the client confirms each result by fetching the Instance and checking that one of its `Isbn` identifiers matches, after normalizing hyphens and trying both ISBN-10 and ISBN-13 forms. id.loc.gov's exact identifier lookup (`/resources/instances/identifier/<value>`) supports `field=lccn` and `field=oclcnum`. The context panel reads an LC authority from id.loc.gov's suggest2 service, searched by the authority's LCCN: it returns variants, 670 citations, dates, and broader terms as plain JSON, with CORS open to any origin, so the panel needs no RDF. (bcl-up_server's extended context covers the same ground, but the QA relay in Blue Core's local stack doesn't serve its linked-data authorities.) The panel finds the Wikidata item through the query service, by the LC authorities ID (P244). Wikidata's API can be called from the browser. Share-VDE can be too if it allows cross-origin requests, which needs checking. Merging and clustering run in the client.
- **MARC preview** runs in the browser: LC's bibframe2marc is XSLT 1.0, which browsers support natively, applied after converting the description to RDF/XML. If it's too slow for live previews, it becomes a Blue Core endpoint, which Blue Core may want anyway for ILS export.
- **New Blue Core endpoints:**
  - **Equivalents:** given a set of URIs, return what Blue Core knows is the same entity (stored `sameAs` links and collected Wikidata identifiers), which lets clustering run in the client.
  - **Usage:** how many descriptions use an entity, and where else a string or entity appears, for the context panel and batch suggestions.
  - **WorldCat Entities proxy,** since OCLC's API key can't be in the browser. Not needed for the first slice, which uses only sources that need no key.
  - **Promote,** described above.
  - **Possibly MARC rendering and Wikidata publishing,** if bibframe2marc is too slow in the browser or Wikimedia's OAuth 2.0 doesn't allow a browser-only client.
- **Background jobs in Blue Core** collect Wikidata external identifiers for entities it holds, watch id.loc.gov for changes to promoted authorities, and index literal values and descriptions' origins for batch detection.
- **An offline pipeline** derives guidance tiers from LC's corpus, and later Blue Core's, and publishes them to the sidecar.

**Toward collaborative editing.** Sharing a description live between catalogers' browsers, over WebRTC, is a goal to engineer toward, not part of the first version.

Cataloging has natural use cases for it:

- **Supervised cataloging:** a trainee and a reviewer in the same description, with the reviewer following along or stepping in on one field. This addresses the review gap better than reviewing diffs afterward.
- **Calling in a specialist,** such as a music cataloger or a language expert, for one part of a description.
- **Handoffs,** such as acquisitions starting a description from an ISBN and a cataloger finishing it, with no save-and-reopen step.
- **Shared work across institutions,** such as Ivy Plus catalogers enriching the same Work at the same time.

The UX challenge is about meaning more than merging. A CRDT merges two people typing in a note without trouble, but if two catalogers choose different authorities for the same contributor, keeping whichever came last would be wrong. Entity choices are treated as single decisions: the editor shows "Ana chose X, you chose Y" and asks them to resolve it. Around that: showing who's in the description, a light indicator on fields someone else is editing (not a hard lock), comments anchored to fields, and a follow mode for training.

Decisions in the first version that keep this possible:

- **Edits are an ordered log of small patches,** not whole-document overwrites. This maps cleanly onto a CRDT such as Yjs or Automerge later, both of which have WebRTC sync.
- **Node keys are globally unique** (UUIDs, not counters), so two browsers never generate the same key.
- **Presence stays separate from description data.**
- **Saving to Blue Core is the single authoritative commit.** Collaboration happens on the draft, and one person saves, so the IndexedDB draft can later become the shared document.

WebRTC also needs a small signaling service to connect peers, which could become a Blue Core endpoint when the time comes.

## References

- bibframe-json: <https://github.com/blue-core-lod/bibframe-json>, documentation at <https://bibframe-json.org/>
- Marva Quartz: <https://github.com/lcnetdev/marva-quartz>
- DCTAP Dancer: <https://github.com/lcnetdev/dctap-dancer>
- Marva profiles (static JSON): <https://github.com/lcnetdev/marva-profiles>
- BIG DCTAP: <https://github.com/bf-interop/DCTap>
- DCTAP specification: <https://www.dublincore.org/specifications/dctap/>
- bcl-up_server: <https://github.com/cul-it/bcl-up_server>
- BIBFRAME Primer: <https://bibframe.org/docs/view/documentation-bf-primer/index.md>
- MARC 21 Format for Bibliographic Data: <https://www.loc.gov/marc/bibliographic/>
