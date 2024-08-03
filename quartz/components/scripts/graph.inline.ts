import type { ContentDetails } from "../../plugins/emitters/contentIndex"
import * as d3 from "d3"
import * as PIXI from "pixi.js"
import { registerEscapeHandler, removeAllChildren } from "./util"
import { FullSlug, SimpleSlug, getFullSlug, resolveRelative, simplifySlug } from "../../util/path"

type NodeData = {
  id: SimpleSlug
  text: string
  tags: string[]

  gfx?: {
    container: PIXI.Text
    alpha: number
  }
} & d3.SimulationNodeDatum

type LinkData = {
  source: SimpleSlug
  target: SimpleSlug
  gfx?: PIXI.Graphics
}

type LinkNodes = Omit<LinkData, "source" | "target"> & {
  source: NodeData
  target: NodeData
}

const localStorageKey = "graph-visited"
function getVisited(): Set<SimpleSlug> {
  return new Set(JSON.parse(localStorage.getItem(localStorageKey) ?? "[]"))
}

function addToVisited(slug: SimpleSlug) {
  const visited = getVisited()
  visited.add(slug)
  localStorage.setItem(localStorageKey, JSON.stringify([...visited]))
}

async function renderGraph(container: string, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  const graph = document.getElementById(container)
  if (!graph) return
  removeAllChildren(graph)

  let {
    drag: enableDrag,
    zoom: enableZoom,
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    removeTags,
    showTags,
    focusOnHover,
  } = JSON.parse(graph.dataset["cfg"]!)

  const data: Map<SimpleSlug, ContentDetails> = new Map(
    Object.entries<ContentDetails>(await fetchData).map(([k, v]) => [
      simplifySlug(k as FullSlug),
      v,
    ]),
  )
  const links: LinkData[] = []
  const tags: SimpleSlug[] = []
  const validLinks = new Set(data.keys())
  const height = Math.max(graph.offsetHeight, 250)
  const width = graph.offsetWidth

  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []

    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
      }
    }

    if (showTags) {
      const localTags = details.tags
        .filter((tag) => !removeTags.includes(tag))
        .map((tag) => simplifySlug(("tags/" + tag) as FullSlug))

      tags.push(...localTags.filter((tag) => !tags.includes(tag)))

      for (const tag of localTags) {
        links.push({ source: source, target: tag })
      }
    }
  }

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  if (depth >= 0) {
    while (depth >= 0 && wl.length > 0) {
      // compute neighbours
      const cur = wl.shift()!
      if (cur === "__SENTINEL") {
        depth--
        wl.push("__SENTINEL")
      } else {
        neighbourhood.add(cur)
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id))
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
  }

  // XXX: How does links got morphed into LinkNodes here?
  // links => LinkData[], where as links.filter(l => neighbourhood.has(l.source) && neighbourhood.has(l.target)) => LinkNodes[]
  const graphData: { nodes: NodeData[]; links: LinkNodes[] } = {
    nodes: [...neighbourhood].map((url) => {
      const text = url.startsWith("tags/") ? "#" + url.substring(5) : (data.get(url)?.title ?? url)
      return {
        id: url,
        text: text,
        tags: data.get(url)?.tags ?? [],
      }
    }),
    links: links.filter(
      (l) => neighbourhood.has(l.source) && neighbourhood.has(l.target),
    ) as unknown as LinkNodes[],
  }

  const computedStyleMap = new Map<string, string>()
  for (let i of [
    "--secondary",
    "--tertiary",
    "--gray",
    "--light",
    "--lightgray",
    "--dark",
    "--darkgray",
    "--bodyFont",
  ]) {
    computedStyleMap.set(i, getComputedStyle(graph).getPropertyValue(i))
  }

  // calculate color
  const color = (d: NodeData) => {
    const isCurrent = d.id === slug
    if (isCurrent) {
      return computedStyleMap.get("--secondary")
    } else if (visited.has(d.id) || d.id.startsWith("tags/")) {
      return computedStyleMap.get("--tertiary")
    } else {
      return computedStyleMap.get("--gray")
    }
  }

  function nodeRadius(d: NodeData) {
    const numLinks = links.filter((l: any) => l.source.id === d.id || l.target.id === d.id).length
    return 2 + Math.sqrt(numLinks)
  }

  let connectedNodes: NodeData[] = []

  const app = new PIXI.Application()
  await app.init({
    width,
    height,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgpu",
    resolution: window.devicePixelRatio || 1,
    eventMode: "dynamic",
  })
  graph.appendChild(app.canvas)

  const stage = app.stage
  stage.interactive = true

  // styling setup
  const linkStyle: PIXI.StrokeStyle = {
    width: 1,
    color: computedStyleMap.get("--lightgray"),
    alpha: 1,
  }

  const linksContainer = new PIXI.Container<PIXI.Graphics>()
  const nodesContainer = new PIXI.Container<PIXI.Graphics>()
  const labelsContainer = new PIXI.Container<PIXI.Text>()

  stage.addChild(linksContainer, nodesContainer, labelsContainer)

  const simulation: d3.Simulation<NodeData, LinkNodes> = d3
    .forceSimulation(graphData.nodes)
    .force("charge", d3.forceManyBody().strength(-100 * repelForce))
    .force("center", d3.forceCenter(width / 2, height / 2).strength(centerForce / 2))
    .force(
      "link",
      d3
        .forceLink(graphData.links)
        .id((d: any) => d.id)
        .distance(linkDistance),
    )
    .force(
      "collide",
      d3.forceCollide((n) => (nodeRadius(n) + 20) / 3.75),
    )
    .on("tick", () => {
      //progress the simulation
      nodesContainer.children.forEach((node) => {
        const d = graphData.nodes.find((n) => n.id === node.label)
        if (d) {
          node.updateTransform({ x: d.x!, y: d.y! })
          if (d.gfx === undefined) {
            const alpha = (opacityScale - 1) / 3.75
            const container = new PIXI.Text({
              text: d.text,
              alpha,
              zIndex: 100,
              anchor: { x: 0.5, y: -0.5 },
              style: {
                fontSize: fontSize,
                fill: computedStyleMap.get("--dark"),
                fontFamily: computedStyleMap.get("--bodyFont"),
              },
              resolution: window.devicePixelRatio || 1,
              interactive: false,
            })
            d.gfx = { alpha, container }
            labelsContainer.addChild(container)
          }
          d.gfx.container.updateTransform({ x: d.x!, y: d.y! })
        }
      })

      graphData.links.forEach((link) => {
        if (link.gfx === undefined) {
          link.gfx = new PIXI.Graphics({ zIndex: 1 }).setStrokeStyle(linkStyle)
          linksContainer.addChild(link.gfx)
        }
        link.gfx
          ?.clear()
          .moveTo(link!.source.x!, link!.source.y!)
          .lineTo(link!.target.x!, link!.target.y!)
          .stroke()
      })
    })

  graphData.nodes.forEach((n) => {
    const nodeId = n.id
    const bigFont = fontSize * 2

    // TODO: transition, fade
    const node = new PIXI.Graphics({
      interactive: true,
      label: nodeId,
      x: n.x,
      y: n.y,
      eventMode: "dynamic",
      zIndex: 50,
    })
      .circle(0, 0, nodeRadius(n))
      .on("click", () => {
        const targ = resolveRelative(fullSlug, n.id)
        window.spaNavigate(new URL(targ, window.location.toString()))
      })
      .on("mouseover", () => {
        const linksFromNode = graphData.links.filter(
          (d) => d.source.id === nodeId || d.target.id === nodeId,
        )
        linksFromNode.forEach((link) => {
          link.gfx
            ?.clear()
            .moveTo(link.source.x!, link.source.y!)
            .lineTo(link.target.x!, link.target.y!)
            .stroke({ color: computedStyleMap.get("--darkgray") })
        })

        if (n.gfx) {
          n.gfx.container.style.fontSize = bigFont
          n.gfx.container.alpha = 1
        }

        if (focusOnHover) {
          // Fade out non-neighbour nodes
          connectedNodes = linksFromNode.flatMap((d) => [d.source, d.target])

          nodesContainer.children.forEach((node) => {
            if (![...connectedNodes].map((i) => i.id).includes(node.label as SimpleSlug)) {
              node.alpha = 0.2
            }
          })
          connectedNodes.forEach((nd) => {
            nd.gfx!.container.alpha = 1
          })
          graphData.links.forEach((link) => {
            if (!linksFromNode.includes(link)) {
              link.gfx!.alpha = 0.2
            }
          })
        }
      })
      .on("mouseleave", () => {
        const linksFromNode = graphData.links.filter(
          (d) => d.source.id === nodeId || d.target.id === nodeId,
        )
        linksFromNode.forEach((link) => {
          link.gfx
            ?.clear()
            .moveTo(link.source.x!, link.source.y!)
            .lineTo(link.target.x!, link.target.y!)
            .stroke({ color: computedStyleMap.get("--lightgray") })
        })

        if (n.gfx) {
          n.gfx.container.style.fontSize = fontSize
          n.gfx.container.alpha = n.gfx.alpha
        }

        if (focusOnHover) {
          nodesContainer.children.forEach((node) => {
            if (![...connectedNodes].map((i) => i.id).includes(node.label as SimpleSlug)) {
              node.alpha = 1
            }
          })
          connectedNodes.forEach((nd) => {
            nd.gfx!.container.alpha = nd.gfx!.alpha
          })
          graphData.links.forEach((link) => {
            if (!linksFromNode.includes(link)) {
              link.gfx!.alpha = 1
            }
          })
        }
      })

    if (n.id.startsWith("tags/")) {
      node.fill({ color: computedStyleMap.get("--light") }).stroke({ width: 0.5, color: color(n) })
    } else {
      node.fill(color(n)).stroke({ color: color(n) })
    }

    nodesContainer.addChild(node)
  })

  const d3Canvas = d3.select<HTMLCanvasElement, NodeData>(app.canvas)

  // Set up zoom and pan
  if (enableZoom) {
    d3Canvas.call(
      d3
        .zoom<HTMLCanvasElement, NodeData>()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }) => {
          stage.scale.set(transform.k)
          stage.position.set(transform.x, transform.y)

          const scale = transform.k * opacityScale
          const scaledOpacity = Math.max((scale - 1) / 3.75, 0)
          graphData.nodes.forEach((el) => {
            el.gfx!.container.alpha = scaledOpacity
            el.gfx!.alpha = scaledOpacity
          })
        }),
    )
  }

  // FIXME: implement scaling for HiDPI screens, and weird font scaling

  // FIXME: implement dragging logics per node to and simulate with links and labels
}

document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const slug = e.detail.url
  addToVisited(simplifySlug(slug))
  await renderGraph("graph-container", slug)

  const container = document.getElementById("global-graph-outer")
  const sidebar = container?.closest(".sidebar") as HTMLElement

  function renderGlobalGraph() {
    const slug = getFullSlug(window)
    container?.classList.add("active")
    if (sidebar) {
      sidebar.style.zIndex = "1"
    }

    renderGraph("global-graph-container", slug)

    registerEscapeHandler(container, hideGlobalGraph)
  }

  function hideGlobalGraph() {
    container?.classList.remove("active")
    const graph = document.getElementById("global-graph-container")
    if (sidebar) {
      sidebar.style.zIndex = "unset"
    }
    if (!graph) return
    removeAllChildren(graph)
  }

  async function shortcutHandler(e: HTMLElementEventMap["keydown"]) {
    if (e.key === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault()
      const globalGraphOpen = container?.classList.contains("active")
      globalGraphOpen ? hideGlobalGraph() : renderGlobalGraph()
    }
  }

  const containerIcon = document.getElementById("global-graph-icon")
  containerIcon?.addEventListener("click", renderGlobalGraph)
  window.addCleanup(() => containerIcon?.removeEventListener("click", renderGlobalGraph))

  document.addEventListener("keydown", shortcutHandler)
  window.addCleanup(() => document.removeEventListener("keydown", shortcutHandler))
})
