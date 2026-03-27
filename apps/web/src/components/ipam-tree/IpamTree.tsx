import { formatUtilization, type FlattenedIpamTreeRow } from "../../../../../packages/ui/dist/index.js";

export interface IpamTreeProps {
  readonly rows: readonly FlattenedIpamTreeRow[];
  readonly selectedNodeId: string | null;
  readonly syncedAt: string;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onToggleNode: (nodeId: string) => void;
}

function getUtilizationWidth(percent: number | null): string {
  if (percent === null) {
    return "18%";
  }

  return `${Math.max(6, Math.min(100, percent))}%`;
}

export function IpamTree({ rows, selectedNodeId, syncedAt, onSelectNode, onToggleNode }: IpamTreeProps) {
  const selectedPrefixRow = rows.find((row) => row.id === selectedNodeId && row.type === "prefix") ?? null;
  const selectedPrefix = selectedPrefixRow?.prefixNode ?? null;

  return (
    <section className="ipam-tree-stage" aria-label="IPAM hierarchy">
      <div className="ipam-tree-stage__frame">
        <header className="ipam-tree-stage__header">
          <div>
            <p className="shell__eyebrow">IPAM hierarchy</p>
            <h3>VRF and prefix tree</h3>
          </div>
          <div className="ipam-tree-stage__header-meta">
            <span>{rows.filter((row) => row.type === "prefix").length} visible prefixes</span>
            <strong>{new Date(syncedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</strong>
          </div>
        </header>

        <div className="ipam-tree-stage__tree" role="tree">
          {rows.map((row) => {
            if (row.type === "vrf") {
              return (
                <div key={row.id} className="ipam-tree-stage__vrf" role="treeitem" aria-expanded={row.expanded}>
                  <button
                    type="button"
                    className="ipam-tree-stage__vrf-toggle"
                    onClick={() => onToggleNode(row.id)}
                  >
                    <span className="ipam-tree-stage__caret">{row.expanded ? "−" : "+"}</span>
                    <span>{row.label}</span>
                    <small>{row.vrfGroup?.rd ?? "no rd"}</small>
                  </button>
                </div>
              );
            }

            const prefix = row.prefixNode;
            const selected = row.id === selectedNodeId;

            if (!prefix) {
              return null;
            }

            return (
              <div
                key={row.id}
                className={`ipam-tree-stage__row${selected ? " ipam-tree-stage__row--selected" : ""}`}
                style={{ "--tree-depth": row.depth } as React.CSSProperties}
                role="treeitem"
                aria-expanded={row.hasChildren ? row.expanded : undefined}
              >
                <button
                  type="button"
                  className="ipam-tree-stage__row-main"
                  onClick={() => onSelectNode(row.id)}
                >
                  <span className="ipam-tree-stage__depth-rail" aria-hidden="true" />
                  {row.hasChildren ? (
                    <span
                      className="ipam-tree-stage__caret ipam-tree-stage__caret--inline"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleNode(row.id);
                      }}
                    >
                      {row.expanded ? "−" : "+"}
                    </span>
                  ) : (
                    <span className="ipam-tree-stage__leaf-dot" aria-hidden="true" />
                  )}
                  <span className="ipam-tree-stage__prefix-copy">
                    <strong>{prefix.cidr}</strong>
                    <small>
                      {prefix.allocationMode} / {prefix.status}
                    </small>
                  </span>
                  <span className="ipam-tree-stage__prefix-meta">
                    <span>{prefix.addressCount} IPs</span>
                    <span>{formatUtilization(prefix.utilization)}</span>
                  </span>
                </button>
                <div className="ipam-tree-stage__utilization">
                  <span
                    className="ipam-tree-stage__utilization-fill"
                    style={{ width: getUtilizationWidth(prefix.utilization?.utilizationPercent ?? null) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ipam-tree-stage__detail">
        <section className="ipam-tree-stage__detail-block">
          <p className="shell__eyebrow">Selected prefix</p>
          <h3>{selectedPrefix?.cidr ?? "No prefix selected"}</h3>
          <p>
            {selectedPrefix
              ? `${selectedPrefix.allocationMode} allocation mode with ${selectedPrefix.childIds.length} child prefixes.`
              : "Select a prefix to inspect hierarchy depth, utilization, and address allocation context."}
          </p>
          {selectedPrefix ? (
            <div className="ipam-tree-stage__summary">
              <div className="shell__metric">
                <span>Utilization</span>
                <strong>{formatUtilization(selectedPrefix.utilization)}</strong>
              </div>
              <div className="shell__metric">
                <span>Available</span>
                <strong>{selectedPrefix.utilization?.availableAddresses ?? "n/a"}</strong>
              </div>
              <div className="shell__metric">
                <span>Children</span>
                <strong>{selectedPrefix.childIds.length}</strong>
              </div>
            </div>
          ) : null}
        </section>

        <section className="ipam-tree-stage__detail-block">
          <p className="shell__eyebrow">Hierarchy rules</p>
          <ul className="shell__notes">
            <li>Parent-child prefixes stay in a single VRF boundary.</li>
            <li>Child prefixes must always be more specific than their parent.</li>
            <li>Utilization is precomputed before the tree reaches the UI.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
