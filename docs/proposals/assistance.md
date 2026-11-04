# Design: Assistance

**Status:** proposed; not started.
**Related:** [design.md, Future: assistance](../design.md).

## Summary

Use a model for narrow, checkable tasks where it adds to catalogers' expertise rather than replacing it. The editor suggests and the cataloger decides, in the way the context panel offers information today, with the model named as the source. The first pilot is transcribing from photos of the item: the title page, verso and CIP block become proposed values for the title, statement of responsibility, publication details and ISBN, each shown beside the image.

## Background

Much of describing an item in hand is typing what's printed on it. It's tedious and error-prone, and it's the part of the work that least needs a cataloger's judgment. Other parts depend on that judgment, and are what the editor aims to support rather than automate: choosing authorities, analysing subjects, deciding what's a Work and what's an Instance.

The editor's design goal is to augment catalogers, not deskill them. Assistance has to fit that: it should take away drudgery, and make judgment easier to exercise, never quietly exercise it instead.

## Goals

- Save catalogers from transcribing what's printed on the item.
- Make every suggestion easy to check against its evidence.
- Keep the cataloger in charge: nothing a model proposes enters the record without being accepted.
- Make it clear later which values a model proposed.

## Non-goals

- Writing whole records.
- Choosing authorities, creating authorities, or deciding Work/Instance questions.
- Inventing headings: a proposed name or subject must be an existing entry, confirmed through the normal lookup.
- Replacing deterministic tools where they exist, such as rule-based checks and LC's romanization tool for non-Latin scripts.

## Principles

- **It suggests; the cataloger decides.** It never fills in a field, picks an authority, or answers a scope prompt on its own.
- **Its suggestions rest on evidence the cataloger can check:** the item, the authority record, Blue Core's data. It adds no claims of its own.
- **Deterministic tools come first** where they exist, since they're predictable in a way a model isn't.
- **Institutions decide whether it's on.**
- **Accepted suggestions are recorded as such,** in the record's history and provenance.

## Design

### The first pilot: transcribing from the item

1. The cataloger photographs or uploads images of the title page, verso and CIP block.
2. A Blue Core endpoint sends them to a model and returns proposed values, each with the region of the image it was read from.
3. The editor shows each proposal next to its image region, as a suggestion on the field it belongs to. Nothing is entered yet.
4. The cataloger accepts, corrects or rejects each one. Accepted values become ordinary changes in the log, labelled as accepted from the transcription, so they can be undone like any other edit.

This task suits a first pilot: it saves real typing, it's easy to verify against the image, and it leaves the judgment with the cataloger.

### Later uses

Roughly from safest to most sensitive:

1. **Noticing what may be missing or wrong.** For example: "the statement of responsibility names an illustrator, but there's no illustrator contribution"; "the publication date differs from the copyright date on the verso"; "the table of contents shows an index, but there's no index note." Simple consistency checks are rule-based; a model helps where the evidence is in the item or in free text. Each appears as a quiet note on the field, like the teaching notes, and never blocks saving.
2. **Explaining BIBFRAME in context.** A cataloger asks why extent belongs on the Instance, or what the BIBFRAME equivalent of a 490 with an 830 is, and gets an answer linked to the BIBFRAME Primer, MARC 21 or RDA guidance. This supports the move from MARC rather than doing the work.
3. **Laying out the evidence for hard choices.** For results that are probably the same entity but aren't linked, a summary of the evidence for and against (670s, dates, Wikidata), with the decision left to the cataloger.
4. **Drafting source citations** for new authorities, from what the item says, such as an author note.
5. **Proposing subject candidates** from a summary or table of contents. This is the most sensitive, since subject analysis is core professional expertise and a confident suggestion is easy to defer to. It should be opt-in, and offer only existing headings to consider.

## What it needs from Blue Core

- **An endpoint that calls the model.** The editor runs entirely in the browser and can't hold an API key, so model calls go through Blue Core, which also enforces the institution's setting.
- **Somewhere to record** that a value was accepted from a suggestion, in provenance.

## Alternatives considered

- **OCR without a model,** such as Tesseract, possibly in the browser. It's predictable and needs no API key, but it returns lines of text, not fields: it can't tell a title from a series statement. It's a useful baseline to compare against, and a fallback.
- **A model running in the browser.** Small vision models can run client-side, which avoids sending images anywhere. Today they're much weaker at reading title pages, and heavy to download.
- **Filling in the fields directly** and letting the cataloger correct them. It's faster, but corrections are easy to skip, and it breaks the principle that nothing enters the record without being accepted.

## Risks

- **Deference.** A confident suggestion is easy to accept without checking. Showing each value beside its source region, and requiring acceptance field by field, works against it.
- **Errors that look right,** such as a misread diacritic or a dropped subtitle. Showing the image beside the value is the main defence.
- **Cost, and dependence on an outside service.**

## Open questions

- **Which model, and who pays for it?**
- **Images:** photos of items may show material under copyright, or personal information. Are they kept, and for how long? Are they sent outside the institution?
- **Provenance:** how accepted suggestions are recorded, so it's clear later which values a model proposed.
- **Evaluation:** for transcription, how often proposals are accepted unchanged, corrected or rejected, measured against catalogers' own transcriptions.

## Phasing

1. **Transcription pilot,** behind an institutional setting, with acceptance rates measured.
2. **Notes on what may be missing or wrong.**
3. **Explanations in context.**
4. **The more sensitive uses** (evidence summaries, citations, subject candidates), each opt-in, and only if the earlier ones hold up.

## References

- [design.md, Future: assistance](../design.md).
