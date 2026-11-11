# bluecore-editor

[![CI](https://github.com/edsu/bluecore-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/edsu/bluecore-editor/actions/workflows/ci.yml)

A BIBFRAME description editor for [Blue Core](https://bluecore.info/), for
catalogers moving from MARC. It runs entirely in the browser; see
[docs/design.md](docs/design.md) for the design and
[docs/mockups/screens.md](docs/mockups/screens.md) for the mockups.

## Which fields it shows

The editor has no templates. It shows every value a record has, and offers
first the fields most of LC's records of the same kind have: a map's scale, a
recording's sound characteristics. A short, reviewed overrides file corrects
the numbers by hand.

- [docs/which-fields.md](docs/which-fields.md): the rules, for new records and
  existing ones.
- [docs/profiles/](docs/profiles/README.md): every field each kind of record
  offers, with its share and tier, and the overrides with their reasons,
  generated from the editor's own code.
- [docs/beyond-profiles.md](docs/beyond-profiles.md): why we work this way
  instead of with Sinopia-style templates, and what's still open.

The editor links to these, pinned to the commit the build was made from: the
kind of a record in Blue Core goes to its profile, and the "fields most maps
have" panel to the rules.

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

Without them the editor looks for Blue Core and Keycloak (`/keycloak/`) on its
own origin, and signs in with the `bluecore_api` client.

## Deploying it

The Docker image is the built app served by Nginx at `/editor/`, on port 80:

```sh
docker build -t bluecore-editor .
docker run -p 8080:80 bluecore-editor   # http://localhost:8080/editor/
```

bluecore-stack runs it as the `editor` service and routes `/editor/` to it, so
Blue Core and Keycloak are on the same origin and the image needs no settings.
Each push to `main` publishes it as `ghcr.io/edsu/bluecore-editor:latest` (and
tagged with the commit).

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

`src/lookup/` finds the entities links point to. Authorities (LC names,
subjects, genre/form terms) are searched in QA through Sinopia's proxy beside
Blue Core. The small LC vocabularies (carriers, languages, relators…) are
vendored into `src/lookup/vocabularies.json` by `npm run
vendor:lc-vocabularies` and searched locally, as picklists.

`src/schema/guidance.json` holds the measurements of LC's records, made by
`scripts/guidance/` ([docs/guidance.md](docs/guidance.md)), and
`src/schema/guidance-overrides.json` the hand corrections. After changing
either, or the sections in `src/ui/presentation.ts`, run `npm run profiles` to
regenerate `docs/profiles/` and review the diff. A test fails until you do.

`src/ui/` is the description view. `src/ui/presentation.ts` is the presentation
sidecar: sections, field order and MARC hints, keyed by property name.
