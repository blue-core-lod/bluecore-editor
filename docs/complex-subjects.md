# Complex subjects

How the editor handles LCSH headings with subdivisions, such as *United States--History--Civil War, 1861-1865--Maps*. Started 2026-10-31 for bead `bce-v7h.10`, after a Sinopia user said they prefer Marva's handling: there a complex subject is one ordered row, not separate subjects, and (unconfirmed) they can compose it while editing. The research comes first, then how it works now, then what's left.

## What we found

**Blue Core's data already has the shape.** Of the 124 Works in the local stack, 39 have a complex subject. Each is a blank node typed `Topic` and `mads:ComplexSubject`, with the full heading as `mads:authoritativeLabel` and `rdfs:label`, `mads:isMemberOfMADSScheme` and `source` LCSH, and an ordered `mads:componentList`. Components are LC URIs where LC has one (`sh85050757`, the geographic subdivision `rwo/agents/n80125931-781`) and small inline nodes where it doesn't (`mads:GenreForm` "Biography"). The bounded description the editor loads gives every component its label, MADS type and `bflc:marcKey` (`181  $zCalifornia`), so the subfield codes are there too.

**The editor treated the list as opaque.** The document model keeps `@list` as a raw keyword rather than as nodes, so a complex subject showed as a subform with "Component list: 1. sh85000899, 2. n79041717-781", its parts unreadable and uneditable.

**bibframe-json v0.1 doesn't model it.** Its context defines `mads:componentList` and its example has a complex subject, but its schema and ontology have neither `componentList` nor `ComplexSubject`.

**Marva** (marva-quartz):

- *Display:* one row with the full heading, one link that reopens the Subject Editor, one remove. No per-component links in the form; one icon says whether it's linked, partly linked, or not.
- *Composing:* a modal with one text input. Typing `--` starts a new component, and the component under the cursor is searched in id.loc.gov's suggest2: LCSH and names for the first, subdivision collections for the rest. Coloured boxes show each component as linked (green) or literal (yellow). A literal needs a type picked: Topic, Geographic, Chronological or Family. Genre/form ($v) is disabled in both the searches and the literal types.
- *Whole headings:* if the joined components equal an established complex heading in the results, it uses that heading's URI instead of a componentList.
- *Editing:* reopening rebuilds the components; there's no reorder or remove, only editing the text.
- *Its data:* a built heading is a blank node `bf:Topic` whose `ComplexSubject` type was moved, in May 2026, to a property keyed `rdfs:type` rather than `rdf:type`. That looks like a bug worth reporting to LC; we shouldn't copy it.

**Sinopia** (Blue Core's fork): a pre-coordinated heading can be picked whole from an "LCSH complex" suggest2 lookup. Building one by hand uses nested "Subject Part" panels with up and down buttons, so it is a stacked form, not one row.

**id.loc.gov has what composing needs,** all with CORS open:

- left-anchored suggest2 limited to subdivision collections: `collection_TopicSubdivisions` ($x), `collection_GeographicSubdivisions` ($z), `collection_GenreFormSubdivisions` ($v), `collection_TemporalSubdivisions` ($y). Each hit's marcKey gives its subfield, and its `rdftypes` its MADS class. Countries, states and cities are name authorities, so their subdivision forms ("Germany", `n80125931-781`, `181  $zGermany`) come from the names directory browsed with the same geographic collection.
- `/authorities/subjects/label/<heading>`, which redirects to an established heading's URI (`X-URI`, `X-PrefLabel` headers) or answers 404.
- the heading browse the editor already has, which finds established complex headings such as "United States--History--Civil War, 1861-1865" (sh85140205).

## How it works

**One row, in order.** A complex subject displays as a single chip: its parts in order, separated by `--`. Each part found in LC opens in the context panel when clicked, as any linked value does, including a place used as a geographic subdivision (the panel reads `n79041717-781` as `n79041717`). A part with no URI is muted italic text. With hints on, each part shows its subfield: from its MARC key where it has one, otherwise from its kind (`$a` first, then `$x`, `$y`, `$z` or `$v`). Blue Core embeds a resource once, so a part a second subject shares ("California") is a bare `@id` there; the editor takes its kind and MARC key from where the record describes it. An established heading with its own `@id` stays an ordinary chip. **Edit** reopens the subject in the lookup; the × removes it whole.

**Composing in the lookup.** The subject lookup's input takes the whole heading as one line. Once it holds a `--`, it composes:

- The part the cursor is in is the one searched. The first part is browsed in LC Subjects and LC Names, leaving out LCSH's subdivision records (18X), which can't start a heading. Later parts are browsed in LC's subdivision collections: Topical, Geographic (NAF), Geographic (LCSH), Form and Chronological.
- The established headings that begin with the whole line are listed too, as "Whole headings", so picking "Jews--Germany--History" links LC's heading.
- Picking a result fills the part and moves the cursor to the next part still to find. Under the input, the parts so far show in a row like the chip, linked parts in blue and text parts in yellow, as Marva's coloured boxes do.
- A part LC doesn't have stays text. Once the cursor has moved on from it, it offers a choice of kind: Topical, Geographic, Chronological or Form, Form included (Marva leaves it out).
- A geographic subdivision with levels of its own, such as "Germany--Aachen", is one part: in the line its dashes are non-breaking hyphens (U+2011), as in Marva. A `--` followed by another hyphen ends an open date ("Twain, David, 1929---Interviews"), not a part.
- Enter, or **Add**, adds the subject. If the joined parts are a heading in the "Whole headings" results, the editor links that heading rather than building parts. (The plan was to ask id.loc.gov's label service; the whole-heading browse already has the answer whenever the heading is established, so no extra request is needed.)
- Without a `--`, the lookup behaves as before: picking a result adds it at once.

**The shape Blue Core holds.** A composed subject is a blank node with `@type` `["Topic", "mads:ComplexSubject"]`, `mads:authoritativeLabel` and `rdfs:label` joined with `--`, `mads:isMemberOfMADSScheme` and `source` LCSH, and `mads:componentList` as an `@list`. Linked parts carry `@id`, `@type` (`mads:Topic`, `mads:Geographic`, `mads:Temporal`, `mads:GenreForm`, `mads:PersonalName`…), `mads:authoritativeLabel` and `bflc:marcKey`; text parts carry `@type` and `mads:authoritativeLabel`, like the "Biography" Blue Core already has. Editing keeps the subject's other properties, except the access points derived from the old heading (`bflc:aap`, `bflc:aap-normalized`), which would no longer match.

**One change.** Adding or editing a subject is one change that replaces the whole node where it was, so the history reads "Changed Subjects: Pynchon, Thomas--Criticism and interpretation--Sources", and one undo reverses it. The document model still keeps `@list` verbatim.

The code: `src/doc/complex.ts` reads and writes complex subjects, `src/lookup/compose.ts` holds the composing rules, and `src/ui/Lookup.tsx` and `ComplexSubject` in `src/ui/Description.tsx` are the interface.

## Not done yet

- **Children's subjects** (`childrensSubjects`), and LC's hierarchical geographic headings.
- **Reordering parts** is done by editing the line; there's no drag or move control.
- **Saving a composed subject** hasn't been tried against Blue Core. The shape is the one Blue Core already returns for its own complex subjects.

## Open questions

- **Check with the cataloger** that composing in the lookup suits them, rather than Marva's modal, and whether they ever reorder parts.
- **bibframe-json** should model `componentList` and `ComplexSubject`, or the editor's validation can't check them. Raised as [bibframe-json#35](https://github.com/blue-core-lod/bibframe-json/issues/35).
- **Form subdivisions:** Marva removed genre/form results from its subdivision search (commit 9b2cc4bb) without saying why in the code. Worth asking LC before relying on `collection_GenreFormSubdivisions`.
