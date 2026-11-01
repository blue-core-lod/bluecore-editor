# Guidance: what catalogers see first

How the editor learns which fields matter for each kind of resource, from how resources are actually described. The design is in [design.md, Guidance](design.md#guidance-what-catalogers-see-first); this is how it's built. Started 2026-10-31 for bead `bce-v7h.1`.

## The idea

Every property a bibframe-json record could have is valid; few are worth showing a cataloger first. Which few depends on the resource: a map has a scale and a base material, a sound recording a duration and a playing speed, a book an ISBN and dimensions. So for each kind of resource the editor gets three tiers, drawn from how often each property is used:

- **shown**, as an empty field where the record doesn't have it yet;
- **suggested**, one click away, with how often it's used ("used in 85% of maps");
- **available**, through Add field.

Common values (a map's carrier is usually "sheet") become suggestions, never prefilled defaults.

## Where the measurements come from

To start, a sample of the CBD snapshot LC gave Blue Core to load (`bluecore-models/uploads/`): 35 batches of LC's concise bounded descriptions, 346,991 Instances each with its Work, in RDF/XML. What LC chose to include isn't documented, so the guidance reflects that selection. Once Blue Core's own records are the bigger body of practice, the same steps can run on them, and guidance follows practice as it changes.

LC's BIBFRAME is converted from MARC, so some frequencies mirror the conversion rather than cataloging choices. Those are corrected by hand (see Overrides).

## The pipeline

All offline, in `scripts/guidance/`. RDF is read here, never in the editor (no RDF in the client). The corpus it writes, `corpus/`, is local and ignored by git.

1. **Index** (`index.py`, standard library only, about two minutes). Reads every CBD straight from the tarballs and records the record's Work types, Instance types, issuance and carriers, from the top-level Instance and the Work it's an instance of (related Works deeper in a CBD are ignored). One file in the snapshot isn't well-formed XML (`batch_00035`, `20580166.cbd.rdf`) and is skipped.

   ```
   python3 -I scripts/guidance/index.py ../bluecore-models/uploads > corpus/index.tsv
   ```

2. **Sample** (`sample.py`). Sorts each record into a resource type, then takes 500 of each at random with a fixed seed, so a re-run samples the same records, and frames each as a bibframe-json bounded description with bluecore_api's `frame_bounded`, the framing Blue Core's `.cbd.jsonld` uses. So it runs in the bluecore_api worktree's environment. 29 of the 5,500 records wouldn't frame (27 of them collections), and are reported and left out.

   ```
   uv run --project ../bluecore_api-editor python scripts/guidance/sample.py \
       ../bluecore-models/uploads corpus/index.tsv corpus/framed
   ```

3. **Measure** (`measure.py`, standard library only). For each type, the share of records using each property on the Instance and on the Work; for properties whose values are typed nodes, the share using each kind ("identifiedBy: Lccn 99%, Isbn 76%"); for nodes described in place (a Title, a Publication), how their own fields are used; and the commonest linked values. Writes `src/schema/guidance.json`, which the editor reads, and a report to read.

   ```
   python3 -I scripts/guidance/measure.py corpus/framed src/schema/guidance.json --report corpus/report.md
   ```

## Resource types

`src/schema/resource-types.json` says what the types are and how to tell them. It's data rather than code because the sampler and the editor both read it, so the record the editor recognizes as a map is the kind of record the map guidance was measured on. The first rule that matches wins:

| Type | Rule | In the snapshot |
|---|---|---|
| Serial (online) | Work type Serial or issuance `serl`, and the only carrier is online | 2,225 |
| Serial | Work type Serial or issuance `serl` | 14,653 |
| Map | Cartography | 6,746 |
| Score | NotatedMusic | 5,897 |
| Music recording | MusicAudio | 10,377 |
| Spoken audio | NonMusicAudio or Audio | 1,423 |
| Video | MovingImage | 6,381 |
| Still image | StillImage | 20,004 |
| Collection | Collection or MixedMaterial, or issuance `mulm` | 792 |
| Book (online) | Text, and the only carrier is online | 87,129 |
| Book | Text | 191,076 |

LC doesn't give these Instances a subclass (Print, Electronic): 99% have none. Whether a book is print or online is told by its carrier (`nc` volume, `cr` online resource, `nb` sheet). "Manuscript" appears as a Work type across scores, maps and texts; for now it isn't a type of its own.

## Overrides

`src/schema/guidance-overrides.json` holds what the numbers get wrong, kept apart from the measurements so a re-run doesn't lose it:

- `thresholds`: a field used in 50% or more of a kind's records is shown, 10–50% suggested, under 10% available only through Add field;
- `never`: properties no form offers, because they're record-keeping or structure rather than cataloging: `adminMetadata`, `instanceOf`, `hasInstance`, `bflc:aap`, `bflc:aap-normalized`, and `dcterms:isPartOf` (LC's dataset membership, on every record);
- `types`: per kind, fields to put in a tier whatever their share. Empty for now.

Likely next entries, visible in the measurements, to decide in use: conversion habits such as an LCCN on 99% of LC's records and `bflc:governmentPubType` (a MARC fixed field), LC internals such as `hasItem` and `acquisitionSource`, and fields to promote such as a recording's duration (22%).

## In the editor

`src/schema/guidance.ts` reads the three files.

- **The kind of record** (`resourceTypeOf`) comes from the same rules the sample was drawn with, and shows in the header ("Map").
- **Each section offers by tier** (`src/ui/layout.ts`): a shown field the record lacks is an "Add …" button as before; a suggested one sits on a quieter line, "Also used for maps: Supplementary material 39%". Available fields aren't offered in the sections. A section with nothing in it and nothing to offer is left out.
- **The header gathers what's missing:** "6 fields most maps have" opens a list of the fields most of LC's records of the kind have (the shown tier) and this one doesn't, most common first with their shares, each a click from its "Add …" button (`usuallyMissing` in `layout.ts`). It's advice from LC's practice, never a requirement, and doesn't block a save. It stands in for completeness checks against PCC requirements (`bce-v7h.8`, deferred).
- **A section of the kind's own fields**, such as "Map details" with scale, geographic coverage and base material, holds the shown and suggested fields no other section names, after the physical description. Before, a record's values for these fell into "Other fields".
- **Add field** says how often each match is used for the kind ("used in 6% of maps") and puts the most used first among equally good matches.
- **A new record can change kind** from the header, where the kind is a menu while the Instance and its Work are both new. It starts as a book. Choosing another writes what the kind is defined by, from each type's `start` in `resource-types.json`: the Work's type (Cartography), the Instance's (Print, Electronic), and for serials and online kinds the issuance (`serl`) and carrier (`cr`) as ordinary values the cataloger can see and remove. It's one change in the history, undone like any other. Switching again takes away only what the previous kind wrote, never a value the cataloger entered. A record whose Work is already in Blue Core keeps its kind, since changing it would change the Work for every Instance.
- **A new record suggests its kind** from its values, under the menu: "This looks like a map: its content type is 'cartographic image'", with "Make it a map" and "Keep it a book". The signals come from the measurements (`inferredKind`): content types nearly all of a kind's records have (90% or more) and other kinds almost never do, such as cartographic image or notated music, and fields most of a kind's records have (30% or more) and unrelated kinds almost never do (under 5%), such as a map's scale, a serial's frequency or a score's format of notated music. A kind and its online counterpart count as one family, and an online record is offered the online kind. It's only ever a suggestion. It stops once the cataloger has chosen a kind from the menu or the suggestion, and doesn't come back for a kind they turned down. Issuance and carrier need no suggestion: the rules already go by them, so entering "serial" as the issuance makes the record a serial.
- **A record of no kind the rules know** (no Work type they name) offers every field of every section, as before.
- Values a record already has are always shown, whatever their tier.
