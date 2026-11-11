# Which fields the editor shows

*November 11, 2026*

Where Sinopia builds its form from a template you choose, bluecore-editor decides what to show from two things: the **kind** of record and the values the record **already has**. This card sets out the rules. Why we work this way is in [beyond-profiles.md](beyond-profiles.md), and how it's built is in [guidance.md](guidance.md).

## 1. The kind comes from vocabulary terms

The kind is read from the record's own terms, using the rules in [`src/schema/resource-types.json`](../src/schema/resource-types.json). The rules are checked in order, and the first that matches wins:

| Kind | Work type (`@type`) | or Instance issuance (`bf:issuance`) | and carrier (`bf:carrier`) |
|---|---|---|---|
| Serial (online) | `Serial` | `serl` | only `cr` (online resource) |
| Serial | `Serial` | `serl` | |
| Map | `Cartography` | | |
| Score | `NotatedMusic` | | |
| Music recording | `MusicAudio` | | |
| Spoken audio | `NonMusicAudio`, `Audio` | | |
| Video | `MovingImage` | | |
| Still image | `StillImage` | | |
| Collection | `Collection`, `MixedMaterial` | `mulm` | |
| Book (online) | `Text` | | only `cr` |
| Book | `Text` | | |

A record whose Work has none of these types has no kind. It's offered every field of every section.

**New records.** A new record starts as a book: Work `Text`, Instance `Print`. When you pick a kind from the header menu, the editor writes that kind's defining terms as ordinary values you can see and remove. A map gets Work type `Cartography` and Instance type `Print`. An online serial gets Work `Text`, Instance `Electronic`, issuance `serl` and carrier `cr`. Switching again removes only what the previous kind wrote.

**Kind suggestions.** As you enter values, the editor may suggest a kind. It does this when the record has terms that nearly all records of that kind have and other kinds almost never do. That can be a content type (`bf:content`), such as `cri` (cartographic image) or `ntm` (notated music). It can also be a field, such as a map's `bf:scale` or a serial's `bf:frequency`. You can accept the suggestion or ignore it.

**Existing records.** Once the Work is in Blue Core, its kind is fixed. Changing the kind would change the Work for every Instance that points at it.

## 2. The kind sets each field's tier

For each kind, the editor measured how often LC's records use each BIBFRAME property, using up to 500 records per kind from the snapshot (each profile gives its count) loaded into Blue Core ([`src/schema/guidance.json`](../src/schema/guidance.json)). Each property falls into a tier:

| Tier | Share of records of that kind | What you see |
|---|---|---|
| Shown | 50% or more | an empty field, or an "Add …" button |
| Suggested | 10–50% | a quieter line with the share, e.g. "Also used for maps: Supplementary material 39%" |
| Available | under 10% | only through Add field, which gives the share |

Every field of every kind is listed, with its property, MARC field, share and tier, on the editor's Fields page (`/editor/?fields=map` for maps). For a map, for example, `bf:scale` and `bf:baseMaterial` are shown, and `bf:cartographicAttributes` is suggested. The page is worked out by the same layout code the record view uses, so it always describes the running build. To see what an earlier version offered, run that version.

Overrides in [`src/schema/guidance-overrides.json`](../src/schema/guidance-overrides.json) can move a property into a tier whatever its share. They also exclude record-keeping that no form offers: `bf:adminMetadata`, `bf:instanceOf`, `bf:hasInstance`, `bflc:aap`, `bflc:aap-normalized` and `dcterms:isPartOf`. Each override gives its reason, and the Fields page lists a kind's overrides first. No kind has an override of its own yet.

## 3. New and existing records follow the same rules

| | New record | Existing record |
|---|---|---|
| Kind | starts as a book; you can change it, and the editor may suggest one | fixed once the Work is in Blue Core |
| Values the record has | none | **every value gets an editable row**, whatever its tier |
| Shown fields | empty, ready to fill | an "Add …" button for each one missing |
| Suggested fields | one click away, with the share | the same |
| Available fields | through Add field | the same |
| Header | | "6 fields most maps have": advice that never blocks a save |

An existing record shows a superset of what a new one shows. Values a record already has are never hidden or made read-only, whether or not their property is in a tier.

## What's not decided here

Required fields aren't enforced yet. Completeness rules from PCC, LC or an institution are planned to apply when you mark a record ready, never when you save a draft ([beyond-profiles.md](beyond-profiles.md), point 4).
