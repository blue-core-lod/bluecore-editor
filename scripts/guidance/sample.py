"""Sample LC's CBD snapshot per resource type, framed as bibframe-json.

    uv run --project ../bluecore_api-editor python scripts/guidance/sample.py \\
        ../bluecore-models/uploads corpus/index.tsv corpus/framed [--per-type 500] [--seed 1]

Reads the index (index.py), sorts each record into a resource type by the
rules in src/schema/resource-types.json, the same rules the editor uses, and
takes a random sample of each type: a fixed seed, so a re-run samples the
same records. Each is framed with bluecore_api's frame_bounded, the framing
Blue Core's .cbd.jsonld uses, so the measurements are of the shape the editor
reads. It runs in bluecore_api's environment for that reason; RDF is read
here, offline, never in the editor.

Writes corpus/framed/<type>/<id>.json, and a line per record to stderr for
any it couldn't frame.
"""

import argparse
import csv
import json
import random
import sys
import tarfile
from collections import defaultdict
from pathlib import Path

from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import RDF

from bluecore_api.app.utils.serialize.cbd import frame_bounded

BF = Namespace("http://id.loc.gov/ontologies/bibframe/")
RULES = Path(__file__).resolve().parents[2] / "src" / "schema" / "resource-types.json"


def resource_type(row: dict[str, str], rules: list[dict]) -> str | None:
    work = set(filter(None, row["work"].split("+")))
    issuance = set(filter(None, row["issuance"].split("+")))
    carriers = set(filter(None, row["carriers"].split("+")))
    for rule in rules:
        if not (work & set(rule.get("work", [])) or issuance & set(rule.get("issuance", []))):
            continue
        if rule.get("online") and carriers != {"cr"}:
            continue
        return rule["id"]
    return None


def frame(data: bytes, instance: str) -> dict:
    graph = Graph().parse(data=data, format="xml")
    # LC's CBD names a Work's Instances with hasInstance; framing follows
    # instanceOf from the root, so the inverse is added, as the /frame route
    # and Blue Core's loader do.
    for work, has_instance in graph.subject_objects(BF.hasInstance):
        graph.add((has_instance, BF.instanceOf, work))
    if (URIRef(instance), RDF.type, BF.Instance) not in graph:
        raise ValueError(f"no Instance {instance}")
    return frame_bounded(graph, instance)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("uploads", type=Path)
    parser.add_argument("index", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--per-type", type=int, default=500)
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()

    rules = json.loads(RULES.read_text())["types"]
    by_type: dict[str, list[dict[str, str]]] = defaultdict(list)
    with args.index.open() as handle:
        for row in csv.DictReader(handle, delimiter="\t"):
            kind = resource_type(row, rules)
            if kind:
                by_type[kind].append(row)

    rng = random.Random(args.seed)
    wanted: dict[tuple[str, str], tuple[str, str]] = {}
    for kind in sorted(by_type):
        rows = by_type[kind]
        chosen = rng.sample(rows, min(args.per_type, len(rows)))
        print(f"{kind}: {len(chosen)} of {len(rows)}", file=sys.stderr)
        for row in chosen:
            wanted[(row["batch"], row["file"])] = (kind, row["uri"])

    # One pass over each batch, framing the sampled records in it.
    done = 0
    for batch in sorted({batch for batch, _ in wanted}):
        with tarfile.open(args.uploads / batch) as tar:
            for member in tar:
                key = (batch, member.name)
                if key not in wanted:
                    continue
                kind, instance = wanted[key]
                handle = tar.extractfile(member)
                if handle is None:
                    continue
                try:
                    document = frame(handle.read(), instance)
                except Exception as error:  # a record that won't frame is reported, not fatal
                    print(f"unframed {batch} {member.name}: {error}", file=sys.stderr)
                    continue
                path = args.out / kind / f"{instance.rsplit('/', 1)[-1]}.json"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(document, ensure_ascii=False))
                done += 1
        print(f"framed through {batch}: {done}", file=sys.stderr)


if __name__ == "__main__":
    main()
