"""Index LC's CBD snapshot by resource type.

    python3 -I scripts/guidance/index.py ../bluecore-models/uploads > corpus/index.tsv

LC gave Blue Core a snapshot to load: batches of concise bounded descriptions
(.cbd.rdf), each an Instance with its Work. Guidance is measured per resource
type, so the first step is knowing each record's type. That doesn't need an
RDF parser, only the XML: the Instance and its Work are top-level elements,
typed by their element name and rdf:type, and the issuance and carrier are LC
vocabulary URIs on the Instance. Related Works nested deeper in the CBD are
left alone, since their types aren't the record's.

One line per record: batch, file, Instance URI, Work types, Instance types,
issuance, carriers. Types are local names, joined with "+".
"""

import sys
import tarfile
import xml.etree.ElementTree as ET
from pathlib import Path

RDF = "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
BF = "{http://id.loc.gov/ontologies/bibframe/}"
BF_URI = "http://id.loc.gov/ontologies/bibframe/"


def local(uri: str) -> str:
    return uri.rstrip("/").rsplit("/", 1)[-1].rsplit("#", 1)[-1]


def types(element: ET.Element) -> set[str]:
    """A node's BIBFRAME classes: its element name and its rdf:types."""
    found = {element.tag.removeprefix(BF)} if element.tag.startswith(BF) else set()
    for child in element.findall(f"{RDF}type"):
        uri = child.get(f"{RDF}resource", "")
        if uri.startswith(BF_URI):
            found.add(local(uri))
    return found


def refs(element: ET.Element, prop: str) -> set[str]:
    """The URIs a property links to, written either as rdf:resource or as a nested node's rdf:about."""
    found = set()
    for child in element.findall(f"{BF}{prop}"):
        uri = child.get(f"{RDF}resource") or next((n.get(f"{RDF}about") for n in child if n.get(f"{RDF}about")), None)
        if uri:
            found.add(local(uri))
    return found


def classify(data: bytes) -> tuple[str, str, str, str, str]:
    root = ET.fromstring(data)
    instance = root.find(f"{BF}Instance")
    if instance is None:
        return ("", "", "", "", "")
    work_uri = next(iter(refs(instance, "instanceOf")), None)
    works = [w for w in root.findall(f"{BF}Work") if local(w.get(f"{RDF}about", "")) == work_uri]
    work = works[0] if works else root.find(f"{BF}Work")
    work_types = types(work) - {"Work"} if work is not None else set()
    return (
        instance.get(f"{RDF}about", ""),
        "+".join(sorted(work_types)),
        "+".join(sorted(types(instance) - {"Instance"})),
        "+".join(sorted(refs(instance, "issuance"))),
        "+".join(sorted(refs(instance, "carrier"))),
    )


def main(uploads: Path) -> None:
    out = sys.stdout
    out.write("batch\tfile\turi\twork\tinstance\tissuance\tcarriers\n")
    for batch in sorted(uploads.glob("batch_*.tar.gz")):
        with tarfile.open(batch) as tar:
            for member in tar:
                if not member.isfile() or not member.name.endswith(".cbd.rdf"):
                    continue
                handle = tar.extractfile(member)
                if handle is None:
                    continue
                try:
                    fields = classify(handle.read())
                except ET.ParseError as error:
                    # Not well-formed: worth knowing about the snapshot, and nothing to measure.
                    print(f"unparsed {batch.name} {member.name}: {error}", file=sys.stderr)
                    continue
                out.write("\t".join((batch.name, member.name, *fields)) + "\n")
        print(f"indexed {batch.name}", file=sys.stderr)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
