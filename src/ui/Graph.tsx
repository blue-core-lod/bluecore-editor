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
/** The least a hub is tall; it grows with the edges that meet it, so they spread along its side. */
const HUB_HEIGHT = 56
const EDGE_SPACING = 7
const LINE = 15
const NODE_PAD = 7
const ROW_GAP = 6
const HEADING = 22
const GAP = 14
const PAD = 12
/** Characters that fit on a line of a node; a longer label takes two lines, and is cut after that, whole on hover. */
const FITS = 34

interface Placed {
  node: GraphNode
  x: number
  y: number
  lines: string[]
  height: number
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
      const lines = wrap(node.label, node.uri && sourceOf(node.uri) ? FITS - 4 : FITS)
      const height = lines.length * LINE + NODE_PAD
      nodes.push({ node, x, y, lines, height })
      y += height + ROW_GAP
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
  const hubHeight = (edges: number) => Math.max(HUB_HEIGHT, edges * EDGE_SPACING)
  const instanceHeight = hubHeight(left.nodes.length)
  const workHeight = hubHeight(right.nodes.length)
  const height = Math.max(left.height, right.height, Math.max(instanceHeight, workHeight) + 2 * PAD + 40)
  const middle = height / 2
  const instanceHub = { x: WIDTH / 2 - HUB_WIDTH - 40, y: middle - instanceHeight / 2, height: instanceHeight }
  const workHub = { x: WIDTH / 2 + 40, y: middle - workHeight / 2, height: workHeight }
  // Each edge meets its hub at its own point down the hub's side, in the order of the nodes, so they don't cross or bunch.
  const along = (hub: { y: number; height: number }, i: number, count: number) =>
    count === 1 ? middle : hub.y + 8 + ((hub.height - 16) * i) / (count - 1)

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
        {left.nodes.map(({ node, x, y, height }, i) => (
          <Edge
            key={`e${node.id}`}
            from={[instanceHub.x, along(instanceHub, i, left.nodes.length)]}
            to={[x + COLUMN, y + height / 2]}
          />
        ))}
        {right.nodes.map(({ node, x, y, height }, i) => (
          <Edge
            key={`e${node.id}`}
            from={[workHub.x + HUB_WIDTH, along(workHub, i, right.nodes.length)]}
            to={[x, y + height / 2]}
          />
        ))}
        {graph.work && (
          <>
            <line className="graph-edge" x1={instanceHub.x + HUB_WIDTH} y1={middle} x2={workHub.x} y2={middle} />
            <text className="graph-edge-label" x={WIDTH / 2} y={middle - 6} textAnchor="middle">
              instance of
            </text>
          </>
        )}

        <Hub kind="Instance" {...instanceHub} title={graph.title} go={() => goToResource(graph.instance)} />
        {graph.work && <Hub kind="Work" {...workHub} title={graph.title} go={() => goToResource(graph.work as Key)} />}

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

function Hub({
  kind,
  x,
  y,
  height,
  title,
  go,
}: {
  kind: 'Instance' | 'Work'
  x: number
  y: number
  height: number
  title: string
  go: () => void
}) {
  const middle = y + height / 2
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
      <rect x={x} y={y} width={HUB_WIDTH} height={height} rx={8} />
      <text x={x + HUB_WIDTH / 2} y={middle - 4} textAnchor="middle" className="graph-hub-kind">
        {kind}
      </text>
      <text x={x + HUB_WIDTH / 2} y={middle + 14} textAnchor="middle" className="graph-hub-title">
        {cut(title, 20)}
      </text>
    </g>
  )
}

function NodeBox({ node, x, y, lines, height, selected, choose }: Placed & { selected: boolean; choose: () => void }) {
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
      <rect x={x} y={y} width={COLUMN} height={height} rx={11} />
      <text x={x + 10} y={y + 15}>
        {lines.map((line, i) => (
          <tspan key={i} x={x + 10} dy={i === 0 ? 0 : LINE}>
            {line}
          </tspan>
        ))}
      </text>
      {source && (
        <text x={x + COLUMN - 10} y={y + 15} textAnchor="end" className="graph-source">
          {source.length > 10 ? '' : source}
        </text>
      )}
    </g>
  )
}

/** A label in at most two lines, broken between words or headings' parts, the second cut if it's still too long. */
function wrap(text: string, fits: number): string[] {
  if (text.length <= fits) return [text]
  const window = text.slice(0, fits + 1)
  // Before a heading's "--", at a space, or just after a comma.
  const comma = window.lastIndexOf(',')
  const at = Math.max(window.lastIndexOf('--'), window.lastIndexOf(' '), comma === -1 ? -1 : comma + 1)
  const split = at > fits / 2 ? at : fits
  const first = text.slice(0, split).trimEnd()
  const rest = text.slice(split).replace(/^\s+/, '')
  return [first, cut(rest, fits)]
}

function cut(text: string, fits: number): string {
  return text.length > fits ? `${text.slice(0, fits - 1)}…` : text
}
