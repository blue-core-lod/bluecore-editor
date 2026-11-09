# Editing Blue Core records without profiles

*November, 2026*

Sinopia Editor, like other BIBFRAME editors, builds its forms from **profiles**: hand-written resource templates that list the fields a cataloger sees for each kind of resource. The new Blue Core editor, bluecore-editor, takes a different approach. This note compares the two: what made us look for another way, how it works, and what is still open.

## What's been hard about profiles

**Someone has to write and maintain them, and there are several sets.** Blue Core has its own Sinopia templates. LC maintains the profiles for its editor, Marva, and publishes them through its DCTAP Dancer tool, where other institutions can use them. The BIBFRAME Interoperability Group (BIG) keeps a third set, of DCTAP validation profiles. The sets overlap heavily: 8 of the 10 properties in BIG's print Instance shape also appear in Marva's profiles. Each still needs its own upkeep, and they drift apart. Sharing them isn't easy either: Dancer drops any DCTAP column it doesn't recognize, so extensions another group relies on are lost on import.

**One profile does three jobs.** It decides what the data may contain, what the form shows first, and what a finished record must have. Those questions have different owners and change at different speeds. Folding them into one file means a change to one ripples into the others.

**Profiles say what people think catalogers do, and they never learn from the records.** A template can ask for a field almost nobody fills in, or bury one most records have. Nothing feeds actual practice back into the template.

**You choose the template before you start, and it stays.** Sinopia records each resource's template with it, so a record opened later comes back in the same template. A book cataloged under the wrong template stays there.

**Data the template didn't anticipate is read-only.** The snapshot of LC records loaded into Blue Core holds nearly 350,000 records converted from MARC. They carry properties no single template lists. Sinopia keeps those through a save, but shows them as raw RDF triples you can't edit. We measured how often that happens, using Sinopia's own loading code, stage's 96 templates, and 500 LC records of each of 11 kinds:

- **Every record has some cataloging data you can't edit.** For most it's the LCCN and the publication statement. Stage's Instance template has no identifier type for an LCCN, and no publication statement at all.
- **Leave those two out, and it's still 51% of books,** and 95–100% of maps, scores, recordings, videos, still images and serials.
- **Stage has templates only for monographs,** so every other kind opens as a monograph. What makes a map a map (scale, base material) or a recording a recording (sound characteristics) is read-only. So are subjects that aren't LCSH topics, which a fifth of books have.

This describes stage's templates as they are today, not a flaw in Sinopia's design. An LCCN template and a publication statement property would clear most of the book figure. It does show how much upkeep templates need to keep up with the data. The method and the full table are in [sinopia-coverage.md](sinopia-coverage.md).

## Our approach

We split the three jobs apart and gave each one its own source.

**1. What the record holds decides what you see; the schema decides what you can add.** Every property a record has gets an editable row, whether or not any guidance anticipated it, where Sinopia would show it as read-only triples. The bibframe-json schemas, which Blue Core already uses, define what BIBFRAME allows, and "Add field" offers any BIBFRAME property.

**2. LC's records decide what you see first.** We took the snapshot of LC records Blue Core loaded (346,991 Instances with their Works), sorted them into 11 kinds (book, online book, map, score, music recording, serial, video and others), and measured how often each kind uses each field. Each field then lands in one of three tiers:

- **Shown** (50% or more of records of that kind): it appears as an empty field ready to fill.
- **Suggested** (10–50%): it sits one click away, with its share, such as "Also used for maps: Supplementary material 39%".
- **Available** (under 10%): you can find it through Add field, which also reports how often each field appears.

For maps, that puts scale (99%), base material (85%) and colour content (86%) up front without anyone writing a map template. For books it shows dimensions (89%) and suggests edition statement (33%). The editor offers common values as suggestions and never fills them in for you.

**3. A small overrides file corrects the numbers.** LC's data came out of a MARC converter, so some figures reflect the conversion more than cataloging choices. An LCCN shows up on 99% of LC's records, for example. Some rare fields deserve a promotion, such as a recording's duration (22%). A short reviewed file handles these. It sits apart from the measurements, so re-running the analysis keeps the corrections.

**4. Completeness waits until you mark a record ready.** Requirements from PCC, LC or an institution will apply at that point and never block saving a draft. BIG's DCTAP, compiled to SHACL validation rules, is the natural starting point. Institutional differences become small overlays on top. This part is planned and not built yet. For now the header lists the fields most records of this kind have and yours lacks ("6 fields most maps have"), as advice.

**5. You don't pick the kind up front.** Where Sinopia asks for a template first, a new record here starts as a book. As you enter values, the editor offers a kind: "This looks like a map: its content type is 'cartographic image'." You can accept, switch from the header menu, or ignore it. The kind only changes what's offered first, so a wrong guess never hides a field. Once the record's Work is in Blue Core, its kind is fixed, since changing it would change the Work for every Instance.

**6. Nothing gets lost, and almost everything is editable.** We ran the editor's own layout code over the same LC sample measured against Sinopia's templates. Every value on every Instance and Work, in all 5,471 records, gets an editable row:

- **The fields Sinopia leaves read-only land in their sections:** the LCCN and the publication statement in "Publication and identifiers", scale in "Map details", sound characteristics in "Music recording details".
- **Rarer properties land under "Other fields",** still editable. Each kind has some, in 5–32% of its records: acquisition source, a projected publication date, an LC item.
- **What you can't edit in the record** is a few details nested inside values, such as the codes carried with a linked authority or the source vocabulary of an unlinked heading. They show in the read-only JSON view.

Saving keeps everything. We audited the 148 records in the local Blue Core stack: saving each unchanged kept every value Blue Core stores, for every Instance and every Work.

## What stakeholders get

- **Less to maintain.** The measurements regenerate from data. People curate a short overrides file and the completeness rules, not a full set of templates for every kind of resource.
- **Guidance that follows practice.** Once Blue Core's own records outnumber the LC snapshot, the same analysis runs on them. When catalogers start using a field more often, the editor starts offering it sooner.
- **Visible reasoning.** "Used in 85% of maps" tells a cataloger what's typical. It doesn't tell them what's allowed, so the judgment stays with them.
- **Room for local practice.** An institution can add overrides and completeness overlays without forking a template.
- **Coexistence.** Sinopia keeps its templates and Marva its profiles. Both, with BIG's DCTAP, feed our overrides and completeness rules.

## Open questions

- **Bias in the source data.** LC's records reflect LC's selection and the MARC converter. Who reviews the overrides, and how often?
- **Ownership.** Someone needs to own the overrides and completeness rules, and needs a tool to edit them in.
- **Kinds of resource.** Eleven kinds cover most of the snapshot. Manuscripts, for one, show up as a Work type across scores, maps and texts, and don't have a kind of their own yet.
- **Completeness.** PCC and institutional requirements still need writing up as rules, and testing with catalogers.

The full design is in [design.md](design.md) (see "Guidance" and Appendix B), and the build notes are in [guidance.md](guidance.md).
