# Design: Romanization with ScriptShifter

**Status:** phases 1–3 built ([#18](https://github.com/edsu/bluecore-editor/issues/18)).
**Related:** [design.md, Future: assistance](../design.md#future-assistance); [assistance.md](assistance.md), which leaves romanization to this deterministic tool.

## Summary

Let catalogers romanize a value in a non-Latin script, or add the original script to a romanized one, from the field itself, using LC's [ScriptShifter](https://github.com/lcnetdev/scriptshifter). The editor shows the two values as a pair, proposes the conversion for the cataloger to accept or correct, and tags both values so that the MARC preview produces the right 880 fields.

## Background

LC catalogs non-Latin material with parallel values: one in the original script, one romanized according to the ALA-LC tables. In the sample of LC's data the guidance corpus is built from, 339 of 5,500 records (about 6%) carry original-script values. They appear on titles, statements of responsibility, publication statements, notes and the agent labels inside them:

```json
"mainTitle": [
  "Akh, Sochi, Sochi, Sochi...",
  { "@language": "ru-cyrl", "@value": "Ах, Сочи, Сочи, Сочи..." }
]
```

The convention in LC's data is that the original-script value has a language and script tag (`ru-cyrl`, `ja-jpan`, `ar-arab`), and the romanized value has none.

Romanizing by hand is slow, and it's where mistakes in diacritics come from. ScriptShifter is LC's service for it: rule tables for about 165 languages, from script to Roman and, for most, back. Other editors already use it.

- **Marva** offers each language a cataloger chooses in a settings dialog as "Russian S2R" and "Russian R2S" entries in a field's menu. The result is added as a new value. Both values are tagged from a hand-kept mapping of about 170 ScriptShifter tables to BCP 47 tags (`abazin_cyrillic` → `abq-Cyrl`), with the romanized one tagged `-Latn`. Errors appear as browser alerts. Highlighting part of a value romanizes only that part, and tries to find and replace the matching part of the other value.
- **Sinopia** opens a dialog listing every language with buttons for each direction, and adds the result as a new value tagged with the table's MARC language code (`rus`), which doesn't say which script the value is in.

The editor today shows the two values of a pair as unrelated text fields, each with its tag, and has no way to produce one from the other.

### The service

ScriptShifter is a small HTTP service. The parts the editor needs:

- `GET /languages` lists the tables: an id (`russian`), a label, whether each direction exists, and a MARC language code.
- `POST /trans` takes `{ lang, text, t_dir, capitalize, options }` and returns `{ output, warnings }`.
- `GET /options/<lang>` lists a table's options, such as Chinese romanizing for a particular MARC field.

LC's instance at `https://bibframe.org/scriptshifter/` allows requests from any origin, so the browser can call it directly, as the editor already calls id.loc.gov and Wikidata. It's text in and text out, with no RDF involved.

Two things about its output matter here:

- **It doesn't give tags.** `/languages` returns only a MARC language code, which is sometimes a group code (Abazin is `cau`, Caucasian languages), and never a script.
- **Its output is decomposed Unicode.** `Война и мир` comes back as `Voĭna i mir`, with the breve as a separate combining character. LC's data is precomposed (NFC). Unnormalized values look identical but don't match in comparisons or searches.

### How tags become 880s

bibframe2marc (`rules/04-1XX.xml`, `rules/065-490.xml` and others) puts the value with no tag, or a tag containing the cataloging script (`Latn`), in the regular field. A value whose tag has a different script goes in an 880, with the script subtag mapped to a MARC script code (`cyrl` → `(N`) by the `df880script` map in `rules/99-maps.xml`. So the romanized value can be untagged or tagged `-Latn`. The original-script value must have a script subtag that the map knows.

## Goals

- Save catalogers from romanizing by hand, and from typing original script with a romanization in front of them.
- Show a value and its romanization as one thing.
- Tag both values so they're correct BIBFRAME and produce the right MARC.
- Keep the cataloger in charge: a conversion is a proposal until accepted, because ALA-LC romanization needs judgment the tables don't have (word division, proper names, capitalization).

## Non-goals

- Original-script labels of linked agents and subjects. Those belong to the authority (see [authority-data.md](authority-data.md)); the editor shows what the authority has.
- Romanizing a whole record at once. One value at a time keeps each one checked.
- Running ScriptShifter in the browser, or maintaining romanization rules in the editor.
- Script input: a keyboard for typing Cyrillic or Arabic is the operating system's job.

## Design

### Pairs

The editor groups a property's values into pairs: a value whose tag has a non-Latin script, with the untagged or `-Latn` value of the same property. Where a property has several of each, as `bflc:simpleAgent` sometimes does, they pair in order. A pair is shown as one field with two lines, each marked with its script ("Cyrillic", "Latin"), not a raw tag. A value in a non-Latin script with no partner shows an "Add romanization" action, and a romanized value with no partner, in a record whose Work is in a language with a ScriptShifter table, offers "Add original script".

This changes only how values are shown. The stored data stays as LC has it: two values of one property.

### Converting

1. The cataloger chooses "Add romanization" (or "Add original script", or "Redo romanization" on a pair).
2. The editor chooses the table. Its first guess comes from the Work's language (`bf:language`, mapped to a MARC code and matched against `/languages`) and, from script to Roman, the script of the text itself. Where that leaves several tables, or none, the cataloger picks from a short list, with the ones they've used before first. The choice is remembered for the record, so the next value doesn't ask again.
3. The editor calls `/trans`, normalizes the output to NFC, and shows it as a proposal beside the source value, with any warnings ScriptShifter returned. Nothing is in the record yet.
4. The cataloger accepts, edits then accepts, or dismisses it. Accepting is one change in the history ("Added romanization of Title: …"), so it can be undone like any other edit.
5. On accepting, the editor tags both values: the original script with the table's language and script (`ru-cyrl`), the romanization untagged, following LC's convention. If the source value already had a tag, it's kept.

### Tags

The editor keeps its own mapping from ScriptShifter table to language and script subtags, starting from Marva's. It's checked in a test against `/languages`, so a new table that the mapping lacks is noticed, and against bibframe2marc's `df880script` map, so every script the editor writes has a MARC script code.

### Configuration

The service URL is configurable like `qaUrl` in `src/config.ts`, defaulting to LC's instance, so Blue Core can proxy it or run its own copy without a new build.

## What it needs from Blue Core

Nothing to start. Later, perhaps a proxy or a local instance of ScriptShifter in bluecore-stack, if LC's instance proves unreliable or institutions don't want catalogers' text sent to it.

## Alternatives considered

- **Marva's design:** languages chosen in settings and listed in each field's menu. It suits a cataloger who works in a few languages every day, but puts setup in front of a cataloger who meets one occasionally, and it can't use what the record already says about its language.
- **Sinopia's design:** every language in a dialog. Simple, but finding one of 165 entries each time is slow, and tagging with the MARC language code loses the script.
- **Inserting the result directly.** Faster, and what both editors do. But a table's output often needs correcting, and a value that's already in the record is easy to leave uncorrected.
- **Romanizing part of a value,** as Marva does when text is highlighted. Useful for a value that mixes scripts or languages, but Marva's way of finding the matching part of the other value is guesswork. Worth revisiting once pairs exist, if catalogers ask for it.

## Risks

- **Dependence on LC's instance,** which has no stated service level. A failure should say so in the field and leave the record alone.
- **Pairing by order** goes wrong if values are added or removed out of step. Showing pairs makes such a mismatch visible, where today it's hidden in two separate fields.
- **The tag mapping drifts** from ScriptShifter's tables. The test above is the guard.
- **Text leaves the browser** for an outside service. It's published bibliographic data, usually, but institutions may want to know.

## Decisions

Made in the first version, and open to revisiting:

- **The romanization is left untagged,** as in LC's data. A romanization tagged `-Latn`, as Marva writes them, still pairs.
- **Tags are lowercase** (`ru-cyrl`), as in LC's data.
- **Romanizing is offered on any text in a non-Latin script.** Adding the original script is offered only on transcribed fields (titles and their parts, statements, and the publisher and place as given), in a record whose language ScriptShifter has a table for. Dates are left out, though LC's data sometimes pairs them.
- **No options or capitalization settings yet.** Capitals are left to the cataloger, who can correct the proposal before accepting it.

## Open questions

- **Scripts bibframe2marc can't put in an 880.** Its `df880script` map has no MARC script code for 14 scripts ScriptShifter covers (Cherokee, Coptic, Tifinagh, N'Ko and others), and for some fields it writes no 880 without one. The tags the editor writes are right; the map needs extending. The tests list these scripts, so a change on either side is noticed.
- **Japanese.** ScriptShifter has no table for kanji, the most common original script in LC's data, so Japanese pairs show as pairs but can't be converted.

## Phasing

1. **Show pairs** with their scripts, with no conversion yet. This helps on the 6% of records that already have them.
2. **Romanize,** script to Roman, with tags and NFC normalization, against LC's instance.
3. **Original script from romanization,** Roman to script.
4. **A proxy or local instance** in bluecore-stack, if needed.

## References

- [ScriptShifter](https://github.com/lcnetdev/scriptshifter), and LC's instance at [bibframe.org/scriptshifter](https://bibframe.org/scriptshifter/).
- [ALA-LC Romanization Tables](https://www.loc.gov/catdir/cpso/roman.html).
- bibframe2marc: `rules/99-maps.xml` (`df880script`) and the 880 rules in `rules/04-1XX.xml`.
- Marva: `src/lib/utils_network.js` (`scriptShifterRequestTrans`), `src/components/panels/edit/fields/Literal.vue` (the `trans` command), `src/lib/scriptShifterLangCodes.json`.
- Sinopia: `src/utilities/ScriptShifter.js`, `src/components/editor/diacritics/ScriptShifterSelection.jsx`.
