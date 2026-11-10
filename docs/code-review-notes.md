# bluecore-editor: notes for developers

How the editor's implementation compares with a typical React SPA and with
the Sinopia Editor. Written 2026-11-09 against `main` at `486e68b`.

Short version: it's a conventional React SPA built on React 19's own
primitives. Its use of context is the textbook kind, not "context as a store",
and Redux wouldn't add much. What stands out isn't the React: it's the
framework-independent document model with an event-sourced edit log
underneath, and how few dependencies it has.

## Is it standard?

The foundations are standard: Vite, React 19, strict TypeScript, function
components and hooks, ESLint with `eslint-plugin-react-hooks`, and Vitest.

What's unusual is how little is pulled in. There are 8 runtime dependencies:
React, ajv, idb, oidc-client-ts, driver.js and fonts. Several things that are
usually libraries are written by hand:

| Usually a library | Here |
|---|---|
| React Router | `src/ui/route.ts`: one `?instance=` parameter read through `useSyncExternalStore` |
| TanStack Query / SWR | `src/context/useSource.ts`: a module-level promise cache, about 40 lines |
| Redux / Zustand | `useState` in `Editor`, plus a pure document model in `src/doc/` |
| A graph/diagram library | `src/ui/Graph.tsx` and `src/ui/recordGraph.ts`, plain SVG |
| Bootstrap / Tailwind | One `src/ui/styles.css` (about 1,500 lines) |

Each of these is reasonable at the current scope. The router is the one to
revisit if the app gets more than one kind of page.

## Context

There is a single context, `DescriptionContext` (`src/ui/context.ts`).
`Description` provides it, and the field components (`TextField`, `Chip`,
`Lookup` and so on) read it. It carries the current `doc`, its labels, and
callbacks such as `record` and `select`.

That's the use the React docs recommend: it avoids passing props through deep
trees. The state itself isn't in context. It lives in `Editor`'s `useState`,
and context only hands down a read-only snapshot and the functions for
changing it.

The caveat is re-rendering:

- The context value changes on every edit, because `doc` changes, and also
  whenever `selected` changes. Every consumer re-renders each time.
- Nothing is memoized. There's no `React.memo` and no React Compiler, so
  every state change in `Editor` re-renders the whole form. That includes
  hovering over a lookup result, which calls `preview` → `setPreviewing`.
- `src/doc/patch.ts` deliberately shares untouched nodes "so a view that
  renders one node can tell cheaply whether that node changed". Nothing uses
  that yet.

This hasn't been profiled. For records with a few hundred fields it's
probably fine, but it's the first thing a React developer will ask about.
Options, cheapest first:

1. Turn on the React Compiler. `eslint-plugin-react-hooks` v7 already
   enforces the compiler's rules, so the code should mostly be ready for it.
2. Split the fast-changing values (`doc`, `selected`) from the stable
   callbacks. `record` also gets a new identity on every edit because it
   closes over `session`, which would defeat memoization until that changes.
3. Move the session into a small external store read through
   `useSyncExternalStore`, so a field can subscribe to its own node.
   `src/auth/auth.ts` and `src/ui/route.ts` already use that pattern.

## Would Redux help?

Mostly no.

Sinopia keeps a global Redux store (`sinopia_editor/src/store.js`) with
normalized `subjects`/`properties`/`values` plus search, templates, modals
and errors, all changed by reducers. Bluecore-editor already has the useful
core of that pattern without the library:

- `Doc` is a normalized table of nodes (`src/doc/model.ts`).
- `apply(doc, op)` (`src/doc/patch.ts`) is effectively a reducer, and a
  `Change` (`src/doc/log.ts`) is effectively an action.
- The `Log` (base plus changes, replayed) is event sourcing. That gives it
  out-of-order undo with dependency detection, IndexedDB drafts, and keys
  that could later map onto a CRDT. Sinopia's store can't do these as
  easily.

The state is also scoped to one record. `Editor` is keyed by URI and remounts
for each one, so there's little global state to share. Redux would mainly add
devtools and a selector convention.

What is worth changing is `src/ui/Editor.tsx`. It's 730 lines with 18
`useState`s, and the save/reload/draft flow is written inline in the
component. Pulling that into a `useSession` hook or a `useReducer` would make
it easier to read and to test. Two minor impurities are worth a look while
doing so:

- `queueMicrotask(() => setProblem(...))` runs inside `setSession` updaters,
  so it's a side effect in a function React may call twice under StrictMode.
- `undoChanges` reads `session` from its closure rather than using a
  functional update.

## Other things developers will notice, compared with Sinopia

- **TypeScript vs JavaScript.** Ops, values and save outcomes are typed as
  discriminated unions, so a whole class of Sinopia-style shape bugs can't
  happen.
- **No RDF in the browser.** Sinopia ships n3, rdf-ext, jsonld parsers and
  Node polyfills (crypto-browserify, stream-browserify, and even express in
  its dependency list). This editor works on bibframe-json only and
  validates it with ajv against vendored schemas.
- **Driven by a schema and data, not templates.** Field guidance,
  vocabularies and the ontology are vendored JSON. Those files
  (`src/schema/guidance.json` and `src/schema/bibframe-json/ontology.json`
  are about 8k lines each) go into the bundle, so bundle size is worth
  watching.
- **Domain logic is separate from React.** `doc/`, `schema/`, `lookup/`,
  `drafts/`, `api/` and `romanize/` are plain TypeScript, and that's where
  the roughly 230 tests point. Even `test/ui.test.ts` tests `layout()`
  rather than rendered components. There's no Testing Library or browser
  test, so interaction code like save, the scope prompt and lookups is only
  checked by hand. That's the main gap in the tests.
- **Concurrency is designed in.** Saves are conditional on ETags. Restored
  drafts are checked against the current copy in Blue Core. Ops carry what
  they expect to find (`from`) and fail with a `ConflictError` rather than
  editing the wrong thing.
- **Auth is handled outside React.** It uses oidc-client-ts with PKCE,
  finishes before the first render, and exposes the user through
  `useSyncExternalStore`. Sinopia uses keycloak-js through a context
  provider.
- **Comment style.** The doc comments explain why, in plain prose. That's
  unusual, and newcomers will find it helpful.
- **Accessibility.** ARIA roles, tablists, switches and focus management
  after scrolling show up throughout, which is more care than most internal
  tools get.
