import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type Viewport
} from "reactflow";
import "reactflow/dist/style.css";

import {
  findConnectedEdges,
  findTopologyNode,
  type TopologyFilterModel,
  type TopologyGraphModel
} from "../../../../../packages/ui/dist/index.js";
import type { TopologyViewport } from "../../state/topology-graph-state.js";

export interface TopologyGraphProps {
  readonly graph: TopologyGraphModel;
  readonly selectedNodeId: string | null;
  readonly filter: TopologyFilterModel;
  readonly filterOptions: {
    readonly sites: readonly { readonly id: string; readonly label: string }[];
    readonly roles: readonly string[];
    readonly vlans: readonly string[];
  };
  readonly viewport: TopologyViewport;
  readonly syncedAt: string;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onFilterChange: (filter: TopologyFilterModel) => void;
  readonly onViewportChange: (viewport: TopologyViewport) => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onResetViewport: () => void;
}

function formatEdgeKind(kind: string) {
  return kind.replace(/-/g, " ");
}

function toReactFlowNodes(graph: TopologyGraphModel, selectedNodeId: string | null): Node[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    position: {
      x: node.position.x,
      y: node.position.y
    },
    data: {
      label: `${node.label}\n${node.role}`
    },
    className: `topology-flow__node topology-flow__node--${node.tone}${node.id === selectedNodeId ? " topology-flow__node--selected" : ""}`,
    style: {
      width: 170,
      borderRadius: 18,
      border: "1px solid rgba(230, 225, 217, 0.16)",
      padding: 0,
      background: "linear-gradient(180deg, rgba(58, 74, 95, 0.96), rgba(30, 42, 56, 0.96))",
      color: "#ffffff",
      boxShadow: node.id === selectedNodeId ? "0 0 0 1px rgba(230,225,217,0.55)" : "0 20px 40px rgba(0, 0, 0, 0.28)",
      whiteSpace: "pre-line",
      fontSize: 13,
      fontWeight: 600
    }
  }));
}

function toReactFlowEdges(graph: TopologyGraphModel, selectedNodeId: string | null): Edge[] {
  return graph.edges.map((edge) => {
    const selected = edge.fromNodeId === selectedNodeId || edge.toNodeId === selectedNodeId;

    return {
      id: edge.id,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      label: edge.label,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: selected ? "#E6E1D9" : "#7F90A3"
      },
      animated: edge.kind === "vlan-propagation",
      className: selected ? "topology-flow__edge topology-flow__edge--selected" : "topology-flow__edge",
      style: {
        stroke: selected ? "#E6E1D9" : "#7F90A3",
        strokeWidth: selected ? 2.4 : 1.6
      },
      labelStyle: {
        fill: "#C7CED6",
        fontSize: 11
      }
    };
  });
}

export function TopologyGraph({
  graph,
  selectedNodeId,
  filter,
  filterOptions,
  viewport,
  syncedAt,
  onSelectNode,
  onFilterChange,
  onViewportChange,
  onZoomIn,
  onZoomOut,
  onResetViewport
}: TopologyGraphProps) {
  const selectedNode = findTopologyNode(graph, selectedNodeId);
  const connectedEdges = findConnectedEdges(graph, selectedNodeId);
  const flowViewport: Viewport = {
    x: viewport.offsetX,
    y: viewport.offsetY,
    zoom: viewport.scale
  };

  return (
    <section className="topology-stage" aria-label="Topology graph">
      <div className="topology-stage__frame">
        <header className="topology-stage__header">
          <div>
            <p className="shell__eyebrow">Topology graph</p>
            <h3>Operational network view</h3>
          </div>
          <div className="topology-stage__header-meta">
            <span>{graph.nodes.length} visible devices</span>
            <strong>
              {graph.edges.length} links / {new Date(syncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </strong>
          </div>
        </header>

        <div className="topology-stage__toolbar">
          <label className="topology-stage__filter">
            <span>Site</span>
            <select
              value={filter.siteId ?? ""}
              onChange={(event) =>
                onFilterChange({
                  ...filter,
                  siteId: event.target.value || null
                })
              }
            >
              <option value="">All sites</option>
              {filterOptions.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
          </label>

          <label className="topology-stage__filter">
            <span>Role</span>
            <select
              value={filter.role ?? ""}
              onChange={(event) =>
                onFilterChange({
                  ...filter,
                  role: event.target.value || null
                })
              }
            >
              <option value="">All roles</option>
              {filterOptions.roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label className="topology-stage__filter">
            <span>VLAN</span>
            <select
              value={filter.vlanId ?? ""}
              onChange={(event) =>
                onFilterChange({
                  ...filter,
                  vlanId: event.target.value || null
                })
              }
            >
              <option value="">Any VLAN</option>
              {filterOptions.vlans.map((vlanId) => (
                <option key={vlanId} value={vlanId}>
                  {vlanId}
                </option>
              ))}
            </select>
          </label>

          <div className="topology-stage__toolbar-actions">
            <button type="button" className="shell__button" onClick={onZoomOut}>
              Zoom out
            </button>
            <button type="button" className="shell__button" onClick={onZoomIn}>
              Zoom in
            </button>
            <button type="button" className="shell__button" onClick={onResetViewport}>
              Reset view
            </button>
          </div>
        </div>

        <div className="topology-stage__viewport topology-flow">
          <ReactFlow
            key={`${viewport.scale}:${viewport.offsetX}:${viewport.offsetY}:${graph.nodes.length}:${graph.edges.length}`}
            nodes={toReactFlowNodes(graph, selectedNodeId)}
            edges={toReactFlowEdges(graph, selectedNodeId)}
            fitView={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            zoomOnDoubleClick={false}
            minZoom={0.5}
            maxZoom={1.9}
            defaultViewport={flowViewport}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            onMoveEnd={(_, nextViewport) =>
              onViewportChange({
                offsetX: nextViewport.x,
                offsetY: nextViewport.y,
                scale: nextViewport.zoom
              })
            }
          >
            <Background color="#324252" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <div className="topology-stage__detail">
        <section className="topology-stage__detail-block">
          <p className="shell__eyebrow">Selected node</p>
          <h3>{selectedNode?.label ?? "No device selected"}</h3>
          <p>{selectedNode?.role ?? "Choose a device to inspect its topology relationships and link metadata."}</p>
          {selectedNode ? (
            <div className="topology-stage__node-summary">
              <div className="shell__metric">
                <span>Site</span>
                <strong>{selectedNode.siteName}</strong>
              </div>
              <div className="shell__metric">
                <span>Interfaces</span>
                <strong>{selectedNode.interfaceCount}</strong>
              </div>
              <div className="shell__metric">
                <span>VLANs</span>
                <strong>{selectedNode.vlanIds.join(", ") || "none"}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="topology-stage__detail-block">
          <p className="shell__eyebrow">Link relationships</p>
          <h3>{connectedEdges.length} connected paths</h3>
          <ul className="shell__notes">
            {connectedEdges.length > 0 ? (
              connectedEdges.map((edge) => (
                <li key={edge.id}>
                  {edge.label} / {formatEdgeKind(edge.kind)}
                </li>
              ))
            ) : (
              <li>No visible links match the current filter.</li>
            )}
          </ul>
        </section>
      </div>
    </section>
  );
}
