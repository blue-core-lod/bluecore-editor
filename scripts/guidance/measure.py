"""Measure how each resource type is described, from the framed sample.

    python3 -I scripts/guidance/measure.py corpus/framed src/schema/guidance.json [--report corpus/report.md]

For each resource type (a directory of sample.py's output), and for the
Instance and the Work, the share of records that use each property; for a
property whose values are typed nodes, the share using each type of node
too ("identifiedBy Isbn"); for the nodes described in place (a Title, a
Publication), the share of those nodes using each of their properties; and
the commonest linked values (carriers, content types). These are the
measurements guidance is made from (docs/guidance.md); the tiers themselves
are drawn from them in the editor, so the thresholds stay easy to change.

Shares are rounded to three places, and properties used by fewer than 1% of
records are left out, which keeps the file small enough to ship.
"""

import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

FLOOR = 0.01
TOP_VALUES = 8
GENERIC = {"Instance", "Work", "Contribution", "Resource"}
# Linked values worth suggesting: small vocabularies where the common choice is a good first guess.
VALUE_PROPS = {"carrier", "media", "content", "issuance", "language", "genreForm", "role"}


def types_of(node: dict) -> list[str]:
    value = node.get("@type", [])
    return [value] if isinstance(value, str) else [t for t in value if isinstance(t, str)]


def node_class(node: dict) -> str | None:
    """The type that says what a node is: Isbn rather than Identifier, Publication rather than ProvisionActivity."""
    specific = [t for t in types_of(node) if t not in GENERIC and ":" not in t and not t.startswith("http")]
    return specific[-1] if specific else None


def label_of(node: dict) -> str | None:
    for prop in ("rdfs:label", "mads:authoritativeLabel"):
        for value in node.get(prop, []):
            if isinstance(value, str):
                return value
            if isinstance(value, dict) and "@value" in value:
                return str(value["@value"])
    return None


def share(count: int, of: int) -> float:
    return round(count / of, 3)


class Tally:
    """Counts for one resource type."""

    def __init__(self) -> None:
        self.records = 0
        # (resource, prop) -> records using it; (resource, prop, class) -> records using that kind of node.
        self.props: Counter = Counter()
        self.kinds: Counter = Counter()
        # class -> nodes seen; (class, prop) -> nodes using prop.
        self.nodes: Counter = Counter()
        self.node_props: Counter = Counter()
        # (resource, prop) -> Counter of linked values (uri -> count) and their labels.
        self.values: dict = defaultdict(Counter)
        self.labels: dict[str, str] = {}

    def add(self, instance: dict) -> None:
        self.records += 1
        works = [w for w in instance.get("instanceOf", []) if isinstance(w, dict)]
        for resource, node in [("Instance", instance), *(("Work", w) for w in works[:1])]:
            self.resource(resource, node)

    def resource(self, resource: str, node: dict) -> None:
        for prop, values in node.items():
            if prop.startswith("@") or not isinstance(values, list):
                continue
            self.props[(resource, prop)] += 1
            classes = set()
            for value in values:
                if not isinstance(value, dict):
                    continue
                cls = node_class(value)
                if cls:
                    classes.add(cls)
                if "@id" in value and prop in VALUE_PROPS:
                    self.values[(resource, prop)][value["@id"]] += 1
                    if label := label_of(value):
                        self.labels.setdefault(value["@id"], label)
                elif "@id" not in value and cls:
                    self.described(cls, value)
            for cls in classes:
                self.kinds[(resource, prop, cls)] += 1

    def described(self, cls: str, node: dict) -> None:
        """A node described in place, such as a Title: how its own fields are used."""
        self.nodes[cls] += 1
        for prop, values in node.items():
            if not prop.startswith("@") and isinstance(values, list):
                self.node_props[(cls, prop)] += 1

    def summary(self) -> dict:
        n = self.records
        resources: dict = {"Instance": {}, "Work": {}}
        for (resource, prop), count in sorted(self.props.items()):
            if count / n < FLOOR:
                continue
            entry: dict = {"share": share(count, n)}
            kinds = {cls: share(c, n) for (r, p, cls), c in self.kinds.items() if r == resource and p == prop and c / n >= FLOOR}
            if kinds:
                entry["kinds"] = dict(sorted(kinds.items(), key=lambda kv: -kv[1]))
            values = self.values.get((resource, prop))
            if values:
                entry["values"] = [
                    {"uri": uri, "label": self.labels.get(uri, uri.rsplit("/", 1)[-1]), "share": share(c, n)}
                    for uri, c in values.most_common(TOP_VALUES)
                ]
            resources[resource][prop] = entry
        nodes = {}
        for cls, seen in sorted(self.nodes.items()):
            if seen / n < FLOOR:
                continue
            fields = {p: share(c, seen) for (k, p), c in self.node_props.items() if k == cls and c / seen >= FLOOR}
            nodes[cls] = {"count": seen, "props": dict(sorted(fields.items(), key=lambda kv: -kv[1]))}
        return {"records": n, **resources, "nodes": nodes}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("framed", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    types = {}
    for directory in sorted(p for p in args.framed.iterdir() if p.is_dir()):
        tally = Tally()
        for path in sorted(directory.glob("*.json")):
            tally.add(json.loads(path.read_text()))
        types[directory.name] = tally.summary()
        print(f"{directory.name}: {tally.records} records", file=sys.stderr)

    guidance = {
        "x-about": (
            "How often each property is used, per resource type, measured by scripts/guidance from a sample of "
            "LC's CBD snapshot. The editor draws its shown/suggested/available tiers from these shares. "
            "Regenerate rather than edit; corrections go in guidance-overrides.json. See docs/guidance.md."
        ),
        "x-measured": {"date": date.today().isoformat(), "source": "LC CBD snapshot given to Blue Core to load"},
        "types": types,
    }
    args.out.write_text(json.dumps(guidance, indent=1, ensure_ascii=False) + "\n")
    if args.report:
        args.report.write_text(report(types))


def report(types: dict) -> str:
    """The measurements as Markdown, to read and argue with."""
    lines = ["# How LC describes each resource type", ""]
    for kind, summary in types.items():
        lines += [f"## {kind} ({summary['records']} records)", ""]
        for resource in ("Instance", "Work"):
            lines += [f"**{resource}**", ""]
            for prop, entry in sorted(summary[resource].items(), key=lambda kv: -kv[1]["share"]):
                extra = ""
                if "kinds" in entry:
                    extra = " — " + ", ".join(f"{cls} {s:.0%}" for cls, s in list(entry["kinds"].items())[:5])
                if "values" in entry:
                    extra += " — " + ", ".join(f"{v['label']} {v['share']:.0%}" for v in entry["values"][:4])
                lines.append(f"- {prop}: {entry['share']:.0%}{extra}")
            lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
