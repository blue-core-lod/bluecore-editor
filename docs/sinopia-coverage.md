# How much of LC's data Sinopia's stage templates leave read-only

*November 9, 2026*

When Sinopia opens a record, its template decides which values you can edit. Anything the template doesn't cover is kept when you save, but it's shown as raw RDF triples you can't edit. We measured how much of LC's data that affects, using stage's templates and Sinopia's own loading code.

## Results

Every sampled record has some cataloging data Sinopia's stage templates can't edit. That's 5,462 records across 11 kinds of resource. Two fields cause most of it:

- **Identifiers.** The Instance template offers ISBN, EAN, DOI, national bibliography number and "Other", but none of the identifier types LC's records actually carry: LCCN (on 99% of them), LC's local numbers and OCLC numbers.
- **The publication statement** (`bf:publicationStatement`, the transcribed statement from MARC 260/264), which the Instance template doesn't have at all.

Leave those two out and 90% of records still have at least one read-only value:

| Kind | Records | A value read-only | Without the LCCN and publication statement | Fields most often read-only, besides those two |
|---|---|---|---|---|
| Book | 499 | 100% | 51% | subject (Work) 20%, genre/form (Work) 12%, acquisition source 7% |
| Online book | 500 | 100% | 81% | genre/form (Work) 48%, item 47%, classification 46%, colour content 45% |
| Map | 500 | 100% | 100% | scale 98%, colour content 86%, genre/form 86%, base material 85% |
| Score | 498 | 100% | 95% | music format 78%, notation 64%, ensemble 52% |
| Music recording | 500 | 100% | 100% | sound characteristic 100%, base material 93%, capture 45% |
| Spoken audio | 500 | 100% | 98% | sound characteristic 93%, capture 57%, production statement 38% |
| Video | 499 | 100% | 99% | moving image technique 90%, sound content 81%, duration 48% |
| Still image | 494 | 100% | 100% | usage and access policy 98%, genre/form 95%, acquisition source 76% |
| Serial | 500 | 100% | 99% | frequency 84%, subject (Work) 65%, notation 62% |
| Online serial | 499 | 100% | 99% | frequency 95%, Work identifiers 92%, serial publication type 91% |
| Collection | 473 | 100% | 69% | usage and access policy 53%, subject (Work) 47%, item 45% |

A "value" here is a whole value of the Instance or the Work, such as one subject or one identifier. Details inside an editable value don't count, such as the codes inside a linked authority.

Some patterns:

- **Stage has one template pair for a whole record,** `bluecore:bf2:Monograph:Instance` and `bluecore:bf2:Monograph:Work`. The other Work templates are lookups, components, or personal and test copies. So every kind has to be opened as a monograph, and the fields that make a map a map, or a recording a recording, are read-only.
- **Subjects that aren't LCSH topics.** The Work template's subject is "Subject--LCSH only", a nested template, and LC's records also use names and places as subjects. A fifth of books and two thirds of serials have one.
- **Values on the other resource.** LC puts colour content and genre/form on the Instance for maps and images. The templates offer them on the Work only.

## The same records in bluecore-editor

We ran the editor's own layout code (`layout` in [src/ui/layout.ts](../src/ui/layout.ts)) over the same sample of 5,471 records, with the same record-keeping left out:

- **No value is left without a row,** on any Instance or Work.
- **No whole value is read-only.** The only read-only text box in the editor is for a literal that isn't a string, such as a number, and no record had one.
- **Fields Sinopia's stage templates miss land in sections:**
  - the LCCN and the publication statement in "Publication and identifiers";
  - scale in "Map details";
  - sound characteristics in "Music recording details".
- **Rarer properties land under "Other fields",** still editable. That happens in 5% (still images) to 32% (books) of records, most often acquisition source, `bflc:projectedProvisionDate`, `hasItem` and `expressionOf`.

As with Sinopia, details nested inside a value aren't counted. In bluecore-editor those include the codes carried with a linked authority and the source vocabulary of an unlinked heading, which show only in the read-only JSON view. This measures layout, not a cataloger clicking through the form. An editable row means the value can be changed or removed and, where repeatable, added to.

## Method

1. **Templates:** all 96 from `https://stage.bcld.info/api/profiles/`, fetched November 9, 2026, with no sign-in needed. For a record with no template recorded, which is every record ingested from LC, Sinopia asks the cataloger to choose one. On stage the only full-record choices are the two Monograph templates, so we used those.
2. **Records:** the guidance sample as it was then ([guidance.md](guidance.md)), 500 records of each kind drawn from the LC snapshot (since raised to 2,000) loaded into Blue Core, framed as bibframe-json. Each record was split into the two resources Sinopia edits separately:
   - the Instance, linking to its Work;
   - the Work, linking to its Instance.

   Each carries its own statements and its blank nodes, plus the labels, codes and types of the URIs it links to, as Blue Core's expanded responses do.
3. **Loading:** Sinopia's own `addResourceFromDataset` (`blue-core-lod/sinopia_editor` at `74996e8b`, November 3, 2026), run under Sinopia's Jest setup, with stage's templates served from the saved copy. What it doesn't mark as used is what Sinopia shows as read-only triples.
4. **Counting:** only the record's own statements count, not the linked authorities' labels. Record-keeping that no form offers is left out, as our guidance leaves it out: `adminMetadata`, `bflc:aap`, `bflc:aap-normalized`, `dcterms:isPartOf`, and the Instance–Work links.

## Caveats

- **Kinds are weighted equally,** 500 records each, not by their share of the snapshot. Books are 55% of the snapshot (191,076 of 346,991), so the book row is closest to what most catalogers would see.
- **Stage's templates as they are today.** Production, or another institution's templates, may differ. Adding an LCCN identifier template and a publication statement property to the Instance template would remove most of the read-only data in books.
- **How Blue Core serves linked data is approximated.** The linked URIs' data is one level of labels, codes and types. If Blue Core sends more, Sinopia might match a few more subjects.
- **Skipped records:**
  - 9 records had a URI that rdflib or Sinopia's N3 parser wouldn't read: one online serial, one book, one video and six still images.
  - 27 collections and 2 scores didn't frame in the original sample ([guidance.md](guidance.md)).

The scripts aren't committed: `split.py` (rdflib), `measure.test.js` (run with Sinopia's Jest setup) and `summarize.py` for Sinopia, and a vitest file for bluecore-editor. The bluecore-editor run reads the framed records directly, so it includes the 9 records skipped on the Sinopia side, which is why it counts 5,471 records to Sinopia's 5,462.
