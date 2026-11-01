import type { Key } from '../doc/model'
import type { GraphGroup, GraphNode, RecordGraph } from './recordGraph'
import { sourceOf } from './labels'

/**
 * The record drawn as resources and relationships (design.md, The linked data
 * view): the Instance and its Work in the middle, joined by "instance of",
 * what the Instance links to on its left and what the Work links to on its
 * right, each relationship a labelled group. A fixed layout rather than a
 * force-directed one, so the same record always draws the same way and a
 * cataloger can find things again. It reads, and never changes the record.
 */

const WIDTH = 1000
const COLUMN = 260
const HUB_WIDTH = 140
const HUB_HEIGHT = 56
const ROW = 28
const NODE_HEIGHT = 22
const HEADING = 22
const GAP = 14
const PAD = 12
/** Characters that fit in a node; longer labels are cut, with the whole one on hover. */
const FITS = 34

interface Placed {
  node: GraphNode
  x: number
  y: number
}

interface Column {
  headings: { label: string; x: number; y: number }[]
  nodes: Placed[]
  height: number
}

/** One side's groups stacked down a column, starting at x. */
function stack(groups: GraphGroup[], x: number): Column {
  const headings: Column['headings'] = []
  const nodes: Placed[] = []
  let y = PAD
  for (const group of groups) {
    headings.push({ label: group.label, x, y: y + 14 })
    y += HEADING
    for (const node of group.nodes) {
      nodes.push({ node, x, y })
      y += ROW
    }
    y += GAP
  }
  return { headings, nodes, height: y }
}

export function Graph({
  graph,
  selected,
  choose,
  goToResource,
}: {
  graph: RecordGraph
  /** The URI shown in the context panel, to mark its node. */
  selected: string | null
  choose: (node: GraphNode) => void
  goToResource: (key: Key) => void
}) {
  const left = stack(
    graph.groups.filter((group) => group.resource === 'Instance'),
    PAD,
  )
  const right = stack(
    graph.groups.filter((group) => group.resource === 'Work'),
    WIDTH - PAD - COLUMN,
  )
  const height = Math.max(left.height, right.height, HUB_HEIGHT + 2 * PAD + 40)
  const middle = height / 2
  const instanceHub = { x: WIDTH / 2 - HUB_WIDTH - 40, y: middle - HUB_HEIGHT / 2 }
  const workHub = { x: WIDTH / 2 + 40, y: middle - HUB_HEIGHT / 2 }

  return (
    <div className="graph-view">
      <p className="muted graph-note">
        What this record links to, as it will be saved. Choose an entity for its context, or anything else to go to its
        field.
      </p>
      <svg
        className="graph"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`${graph.title}: the Instance, its Work, and what they link to`}
      >
        {left.nodes.map(({ node, x, y }) => (
          <Edge key={`e${node.id}`} from={[instanceHub.x, middle]} to={[x + COLUMN, y + NODE_HEIGHT / 2]} />
        ))}
        {right.nodes.map(({ node, x, y }) => (
          <Edge key={`e${node.id}`} from={[workHub.x + HUB_WIDTH, middle]} to={[x, y + NODE_HEIGHT / 2]} />
        ))}
        {graph.work && (
          <>
            <line className="graph-edge" x1={instanceHub.x + HUB_WIDTH} y1={middle} x2={workHub.x} y2={middle} />
            <text className="graph-edge-label" x={WIDTH / 2} y={middle - 6} textAnchor="middle">
              instance of
            </text>
          </>
        )}

        <Hub kind="Instance" x={instanceHub.x} y={instanceHub.y} title={graph.title} go={() => goToResource(graph.instance)} />
        {graph.work && (
          <Hub kind="Work" x={workHub.x} y={workHub.y} title={graph.title} go={() => goToResource(graph.work as Key)} />
        )}

        {[...left.headings, ...right.headings].map((heading) => (
          <text key={`${heading.x} ${heading.label}`} className="graph-heading" x={heading.x} y={heading.y}>
            {heading.label}
          </text>
        ))}
        {[...left.nodes, ...right.nodes].map((placed) => (
          <NodeBox
            key={placed.node.id}
            {...placed}
            selected={selected !== null && placed.node.uri === selected}
            choose={() => choose(placed.node)}
          />
        ))}
      </svg>
      {graph.groups.length === 0 && <p className="muted">Nothing is linked yet.</p>}
    </div>
  )
}

function Edge({ from, to }: { from: [number, number]; to: [number, number] }) {
  const [x1, y1] = from
  const [x2, y2] = to
  const bend = (x2 - x1) / 2
  return <path className="graph-edge" d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} />
}

function Hub({ kind, x, y, title, go }: { kind: 'Instance' | 'Work'; x: number; y: number; title: string; go: () => void }) {
  return (
    <g
      className={`graph-hub graph-hub-${kind.toLowerCase()}`}
      role="button"
      tabIndex={0}
      aria-label={`Go to the ${kind}`}
      onClick={go}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') go()
      }}
    >
      <title>{`${kind}: ${title}`}</title>
      <rect x={x} y={y} width={HUB_WIDTH} height={HUB_HEIGHT} rx={8} />
      <text x={x + HUB_WIDTH / 2} y={y + 22} textAnchor="middle" className="graph-hub-kind">
        {kind}
      </text>
      <text x={x + HUB_WIDTH / 2} y={y + 42} textAnchor="middle" className="graph-hub-title">
        {cut(title, 20)}
      </text>
    </g>
  )
}

function NodeBox({ node, x, y, selected, choose }: Placed & { selected: boolean; choose: () => void }) {
  const source = node.uri ? sourceOf(node.uri) : undefined
  const classes = ['graph-node', `graph-node-${node.kind}`, selected ? 'selected' : ''].filter(Boolean).join(' ')
  return (
    <g
      className={classes}
      role="button"
      tabIndex={0}
      aria-label={node.label}
      onClick={choose}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') choose()
      }}
    >
      <title>{node.kind === 'unlinked' ? `${node.label} (not linked)` : node.label}</title>
      <rect x={x} y={y} width={COLUMN} height={NODE_HEIGHT} rx={11} />
      <text x={x + 10} y={y + 15}>
        {cut(node.label, source ? FITS - 4 : FITS)}
      </text>
      {source && (
        <text x={x + COLUMN - 10} y={y + 15} textAnchor="end" className="graph-source">
          {source.length > 10 ? '' : source}
        </text>
      )}
    </g>
  )
}

function cut(text: string, fits: number): string {
  return text.length > fits ? `${text.slice(0, fits - 1)}…` : text
}
