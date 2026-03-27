import { useState } from "react";

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

function getNodeRadius(interfaceCount: number): number {
  return Math.min(34, 18 + interfaceCount * 1.4);
}

function formatEdgeKind(kind: string): string {
  return kind.replace(/-/g, " ");
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
  const [dragOrigin, setDragOrigin] = useState<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

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

        <div
          className="topology-stage__viewport"
          onPointerDown={(event) =>
            setDragOrigin({
              pointerX: event.clientX,
              pointerY: event.clientY,
              offsetX: viewport.offsetX,
              offsetY: viewport.offsetY
            })
          }
          onPointerMove={(event) => {
            if (!dragOrigin) {
              return;
            }

            onViewportChange({
              ...viewport,
              offsetX: dragOrigin.offsetX + event.clientX - dragOrigin.pointerX,
              offsetY: dragOrigin.offsetY + event.clientY - dragOrigin.pointerY
            });
          }}
          onPointerUp={() => setDragOrigin(null)}
          onPointerLeave={() => setDragOrigin(null)}
        >
          <svg className="topology-stage__canvas" viewBox="0 0 1200 720" role="img" aria-label="Network topology graph">
            <g transform={`translate(${viewport.offsetX} ${viewport.offsetY}) scale(${viewport.scale})`}>
              {graph.edges.map((edge) => {
                const fromNode = graph.nodes.find((node) => node.id === edge.fromNodeId);
                const toNode = graph.nodes.find((node) => node.id === edge.toNodeId);

                if (!fromNode || !toNode) {
                  return null;
                }

                const edgeSelected = edge.fromNodeId === selectedNodeId || edge.toNodeId === selectedNodeId;

                return (
                  <g key={edge.id}>
                    <line
                      className={edgeSelected ? "topology-stage__edge topology-stage__edge--selected" : "topology-stage__edge"}
                      x1={fromNode.position.x}
                      y1={fromNode.position.y}
                      x2={toNode.position.x}
                      y2={toNode.position.y}
                    />
                    <text
                      className="topology-stage__edge-label"
                      x={(fromNode.position.x + toNode.position.x) / 2}
                      y={(fromNode.position.y + toNode.position.y) / 2 - 8}
                      textAnchor="middle"
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}

              {graph.nodes.map((node) => {
                const selected = node.id === selectedNodeId;

                return (
                  <g
                    key={node.id}
                    className="topology-stage__node-group"
                    transform={`translate(${node.position.x} ${node.position.y})`}
                    onClick={() => onSelectNode(node.id)}
                  >
                    <circle
                      className={`topology-stage__node topology-stage__node--${node.tone}${selected ? " topology-stage__node--selected" : ""}`}
                      r={getNodeRadius(node.interfaceCount)}
                    />
                    <text className="topology-stage__node-title" textAnchor="middle" y={4}>
                      {node.label}
                    </text>
                    <text className="topology-stage__node-meta" textAnchor="middle" y={getNodeRadius(node.interfaceCount) + 18}>
                      {node.role}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
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
