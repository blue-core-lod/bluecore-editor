# bluecore-editor

A BIBFRAME description editor for [Blue Core](https://bluecore.info/), for
catalogers moving from MARC. It runs entirely in the browser; see
[docs/design.md](docs/design.md) for the design and
[docs/mockups/screens.md](docs/mockups/screens.md) for the mockups.

## Running it

In bluecore-stack, with this repository checked out beside it:

```sh
./scripts/dev/run --editor   # then open http://localhost/editor/
```

That serves the Vite dev server through the stack's Nginx, on the same origin
as the API and Keycloak, and signs in with the `bluecore_api` client, as Sinopia does.

On its own, against a stack that is already running:

```sh
npm install
npm run dev
```

The VITE_* variables in `.env` say where Blue Core and Keycloak are. Copy
`.env.example` to `.env` for the local bluecore-stack, or change it to point at
another environment. (Run through bluecore-stack, the compose file sets them.)

## Working on it

```sh
npm test            # vitest
npm run typecheck   # tsc -b
npm run lint        # eslint
```

`src/schema/bibframe-json/` holds the bibframe-json v0.1 schemas, ontology,
vocabulary and context, and `test/bibframe-json/` its examples and conformance
cases, all vendored from one commit by `npm run vendor:bibframe-json`. Change
the commit in `scripts/vendor-bibframe-json.mjs` to move to another.

`src/doc/` is the document model: a description normalized into nodes with
client-side UUID keys, edited by patches against those keys, with a change log
that undoes any change by replaying the others.

`src/api/` talks to Blue Core. A description is read as one bounded document
(`<instance uri>.cbd.jsonld`, with an ETag per resource in its headers) and
saved as separate writes, one PUT per changed resource to the resource's own
URI with `If-Match`, so a save never replaces someone else's newer version
without asking. `src/api/endpoints.ts` is the one place that maps a resource
URI to a request URL.

`src/ui/` is the description view. `src/ui/presentation.ts` is the presentation
sidecar: sections, field order and MARC hints, keyed by property name.
