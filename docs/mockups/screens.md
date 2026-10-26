# Blue Core Editor: Mockup Screens

*Companion to `design.md`. Describes the mockups in `mockups/`, how they connect, and the decisions made while reviewing them. October 24, 2026.*

The mockups follow one cataloging session for a sample print monograph: a fictional 2026 edition of *Adventures of Huckleberry Finn*, with an introduction by Dana Okafor. The publisher, introducer, and ISBN (9780000000002) are made up. Mark Twain is the contributor found in LC and Wikidata; Dana Okafor is the one found nowhere. Usage figures such as "412 descriptions" and "used in 31%" illustrate the idea and are not real counts. Bracketed text such as `[670 source citation]` marks facts that need real data.

The files are in the design canvas's own format (custom tags such as `<x-dc>` and `<sc-if>`), so they don't open in a browser on their own. Treat them as a reference for layout, labels, wording, and behavior. `canvas.json` holds the layout and the guide notes for each step.

## The session

1. **Starting from an ISBN** (`IsbnStart`): enter the ISBN, choose LC's CIP description to start from.
2. **Agent lookup** (`Lookup`): link Mark Twain, who came from the CIP description as text only.
3. **Description view** (`Main`): the hub. From here, steps 4 to 7.
4. **Context panel** (`Context`): Blue Core already has this Work; attach to it. From here, step 8.
5. **Editing a shared Work** (`ScopePrompt`): adding a genre/form to a Work with 37 other Instances.
6. **Create an authority** (`CreateAuthority`): a new person for the introducer.
7. **Add field** (`AddField`): finding a property by MARC tag, with guidance from LC's data.
8. **Promoting an LC name** (`Promote`): editing Twain's LC name in Blue Core, then the batch suggestion.

Three more screens show other states of the description view: the hints explainer open (`MainHintsInfo`), the edit history open (`MainHistory`), and hints off (`MainHintsOff`). They reuse `Main` with a different starting state.

## Visual language

- **Type:** Atkinson Hyperlegible Next for the interface; Atkinson Hyperlegible Mono for MARC tags and the MARC preview.
- **Work and Instance:** Work is blue (`#1F4E8C`), Instance is burnt orange (`#9A4A06`), both with white text. They also differ in lightness, so they're distinguishable without color.
- **Linked values:** chips with a pale blue fill (`#EAF0F8`), source badges (Blue Core, LC, Wikidata, FAST), and a remove button.
- **Unlinked values:** a dashed outline, the word "unlinked," and a "Find authority" action beside it.
- **Warnings and teaching notes:** a pale amber box (`#FFF4DC`) with dark brown text. Never blocking.
- **Ground and text:** near-white ground (`#FAFBFA`), dark text (`#17202B`), muted text (`#4A5560`), rules (`#D9DDDC`).
- **Primary action:** dark filled button. Secondary actions: outlined. "Add another" actions: dashed outline.

## Screens

### Description view (`Main`)

The central screen: the whole description as one document.

**Header, one row on wide screens:** Blue Core, then the title with its source line ("Print monograph from ISBN …"), then four controls spaced evenly across the remaining width: **3 unsaved changes**, **Validate**, **Save to Blue Core**, and **Hints** with a **?** beside it, flush right. On narrow screens the controls move below the title.

- **3 unsaved changes** opens the edit history: changes since the last save, newest first, each with its own Undo, and at the bottom where the description started ("Started from LC's CIP description").
- **Validate** runs the completeness checks for a finished description. It's named after the familiar Connexion action. The results screen is still to be designed.
- **Hints** is a compact switch. It shows or hides MARC tags under each field label, the Work/Instance badge on each row, and the MARC preview. With hints off, the badge column disappears so the fields widen, and the side panel shrinks to the context box.
- **?** opens a short explainer of what hints show, with a "Got it" button. In the real app it also opens by itself the first time someone uses the editor.

**Sections,** named in cataloging terms in ISBD and RDA order:

- **Title and statement of responsibility:** Title (245 $a), Statement of responsibility (245 $c), Preferred title (240 $a, on the Work).
- **Creators and contributors:** Author (100) as a linked chip for Twain; Writer of introduction (700), unlinked, with Find authority; then "Add creator or contributor."
- **Subjects and genre/form:** Subjects (650) and Genre/form (655) as linked chips, each with an add button.
- **Publication and identifiers:** Publication (264 _1) with place, publisher, and date; ISBN (020 $a) with its qualifier.
- **Physical description and carrier:** Content, media, carrier (336/337/338) as chips; Extent (300 $a), deliberately placed on the Work to show a teaching warning: "Extent usually describes this publication, not the Work," with **Move to Instance** and **Keep on Work**. Teaching warnings show whether hints are on or off.

Every value is an editable field. Below the sections, **Add field** with a hint about searching by name or MARC tag.

**Links:** MARC tags link to their pages in the MARC 21 bibliographic format (for example `https://www.loc.gov/marc/bibliographic/bd245.html`). Work and Instance badges link to the BIBFRAME Primer (`https://bibframe.org/docs/view/documentation-bf-primer/index.md`), currently its front page; deeper section links are still to find.

**Side panel:** a collapsed **Context** box showing one signal ("This Work may already be in Blue Core, with 37 Instances") with **Open**; below it, with hints on, the read-only **MARC preview**, with fields wrapping under a hanging indent. With hints on, the side panel takes close to half the page; in the real app the boundary should be draggable and the preview collapsible.

**Navigation in the mockup:** Open → Context panel; Add genre/form → Scope prompt; Find authority → Create an authority; Add field → Add field. The Hints switch, the ?, and the changes button work within the screen.

**Decisions from review:**

- Section headings use cataloging terms rather than plain-language questions ("What it is" read as condescending to catalogers).
- One Hints toggle with an explainer, rather than separate toggles or a permanent explanation bar, to save space. A settings page for choosing individual hints could come later.
- The MARC preview is part of hints. If experienced catalogers with hints off still want to check MARC, it could also open from a menu.
- Draft status became an edit history with undo, since the patch log makes per-change undo natural.

**Still to design:** the role picker for contributors (LC relator terms, as a local picklist), more than one role per contributor, marking the primary contributor (which decides 100 versus 700), and reordering contributors.

### Starting from an ISBN (`IsbnStart`)

"What are you cataloging?" with one field for an ISBN, LCCN, or OCLC number, and a note that Blue Core and id.loc.gov were searched, as ISBN-13 and ISBN-10.

- **This publication:** LC's prepublication (CIP) description, with **Start from this description** (→ Agent lookup) and **Compare with item**. A note explains that starting copies the description into Blue Core with a record that it came from LC, and that CIP data was written before publication, so the title page and extent need checking.
- **The Work it belongs to:** the existing Blue Core Work, "37 Instances in Blue Core," with **Use this Work**.
- A note that 2 other id.loc.gov results mentioned the number but don't carry it as an ISBN, so they aren't shown. This reflects the design's check: id.loc.gov's search is by keyword, so each result is confirmed against its actual ISBN identifiers.
- **Start a blank description.**

A future option here: photograph the title page (see "Future: assistance" in `design.md`).

### Agent lookup (`Lookup`)

The Author field with `Twain, Mark, 1835-1910` typed, and a note that a heading browse is used because the entry is in heading form, with **Search by keyword instead**.

- **Source status row:** Blue Core 2, LC 3, Wikidata 1, FAST 1, and "Getty ULAN didn't respond" with **Retry**.
- **Clustered result:** one row with Blue Core, LC, and Wikidata badges; a short description from Wikidata; "Used in 412 Blue Core descriptions. Saves the LC name." **Choose** (→ Description view).
- **Likely the same, not linked:** the FAST entry with the same name and dates, and **Confirm they're the same**.
- **Different entities:** a name/title heading ("this identifies the Work, not the person") and a subject heading about the person.
- **Footer:** keyboard hints (up and down, Enter, Space for details) and **None of these: create new**.

### Context panel (`Context`)

The description on the left, with the author chip selected; the expanded panel on the right for Twain.

- **Header:** name, short description, **Pin to compare**, and a collapse button.
- **Suggestion:** "This author has 61 Works in Blue Core," noting that one matches the title and that using it adds this publication as the 38th Instance. **Use this Work** (→ Description view) and **Dismiss**. Labeled "From Blue Core usage."
- **Disagreement note:** Wikidata lists a pen name the LC record doesn't include as a variant.
- **LC name authority:** n 79021164, with **Edit in Blue Core** (→ Promoting an LC name) and **MARC view**; variant forms; "Found in" citations.
- **Wikidata:** a portrait placeholder, birth and death, occupation.
- **Wikipedia:** the lead paragraph, credited CC BY-SA.
- **In Blue Core:** descriptions and Works using this entity, and roles.

### Editing a shared Work (`ScopePrompt`)

A dialog: "37 other Instances share this Work," explaining that the change describes the Work itself. It shows the change (Genre/form 655: Bildungsromans, added) and two choices, both → Description view:

- **Change the Work for all 38 Instances:** right when the change is true of the work in every edition.
- **Make a new Work for this Instance:** right when this publication is a different version, such as an abridgement; the new Work keeps a link to the original.

Also **See the 37 other Instances** and **Cancel change**. This is the one place the design deliberately makes the resource boundary explicit.

### Create an authority (`CreateAuthority`)

"New person in Blue Core," filled in from the description.

- **No match found:** which sources were searched and when, that id.loc.gov was checked again just now, and that the search is saved with the new authority.
- **Fields:** Name (100), from the statement of responsibility; Dates (046 / 100 $d); Field of activity (372); Found in (670), prefilled from this publication.
- **Add more details:** Fuller form of name (378), Associated place (370), Affiliation (373), Occupation (374), Language (377), Variant name (400), Related name (500).
- **Status steps:** Provisional (usable now), Reviewed, Published to Wikidata, Sent to NACO.
- **Keep as unlinked text** and **Create and link** (both → Description view).

Creating new subject authorities is out of scope for the first slice; promoting existing LC subjects stays in.

### Add field (`AddField`)

A dialog with a search field showing `490`.

- **Matches:** Series statement (490 $a, Instance), "Used in 31% of print monograph descriptions," often added with Series enumeration (490 $v); **Add** (→ Description view). Also Series (linked) on the Work.
- **Suggested for print monographs:** Bibliography note (504), Dimensions (300 $c), Illustrative content (300 $b), Classification (050), each with its usage.
- **Footer:** usage comes from LC's BIBFRAME descriptions of print monographs, and any of BIBFRAME's 456 terms can be found by searching.

This shows the guidance tiers: shown by default (in the description), suggested (here), and available (by searching).

### Promoting an LC name (`Promote`)

Two parts side by side.

- **Edit this LC name in Blue Core:** id.loc.gov can't be edited from here, so Blue Core keeps its own linked version and uses it from now on. Shows the change (a variant form added), that the Blue Core version records it came from LC name n 79021164 as of today's version, and that a reviewer will see both versions if LC changes its record. **Cancel** (→ Description view) and **Save Blue Core version**.
- **Afterward:** the chip with a "Blue Core edit of an LC name" badge and **Compare with LC's version**; then the notice "214 other descriptions use LC's version," explaining that nothing changes in them unless someone moves them, with examples and **Review and move them**, **Send to batch queue**, and **Not now**.

### Other states of the description view

- **`MainHintsInfo`:** the explainer under Hints: MARC tags linked to MARC 21, the Work and Instance badges as a legend, a link to the BIBFRAME Primer, and **Got it**.
- **`MainHistory`:** the edit history under the changes button: "Moved Extent to the Instance," "Added genre/form Picaresque fiction," "Linked author to LC name Twain, Mark, 1835-1910," each with **Undo**.
- **`MainHintsOff`:** no tags, badges, or MARC preview; wider fields and a narrow side panel.

## Not yet designed

- **Validate results:** errors and warnings (using BIG's severity levels) linked to the fields they concern.
- **Save outcomes:** conflicts with someone else's changes shown as a diff, and partial saves ("Work saved, Instance not saved; retry").
- **Contributor roles and ordering,** as above.
- **Undo with dependencies:** undoing a change that later changes depend on (for example, a link that was then promoted) should explain the dependency and offer to undo both.
- **A hints settings page,** for choosing individual hints.
