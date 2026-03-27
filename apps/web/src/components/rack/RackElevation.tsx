import {
  countConnectedPorts,
  createRackUnitSlots,
  findDevicePort,
  getDeviceCoverageLabel,
  type RackCableModel,
  type RackModel
} from "../../../../../packages/ui/dist/index.js";

export interface RackElevationProps {
  readonly rack: RackModel;
  readonly selectedDeviceId: string | null;
  readonly selectedPortId: string | null;
  readonly onDeviceSelect: (deviceId: string) => void;
  readonly onPortSelect: (deviceId: string, portId: string) => void;
}

function getCableForPort(cables: readonly RackCableModel[], deviceId: string, portId: string) {
  return (
    cables.find(
      (cable) =>
        (cable.fromDeviceId === deviceId && cable.fromPortId === portId) ||
        (cable.toDeviceId === deviceId && cable.toPortId === portId)
    ) ?? null
  );
}

export function RackElevation({
  rack,
  selectedDeviceId,
  selectedPortId,
  onDeviceSelect,
  onPortSelect
}: RackElevationProps) {
  const slots = createRackUnitSlots(rack);
  const selectedDevice =
    rack.devices.find((device) => device.id === selectedDeviceId) ?? rack.devices[0] ?? null;
  const selectedPort =
    selectedDevice && selectedPortId
      ? findDevicePort(rack, selectedDevice.id, selectedPortId)
      : selectedDevice?.ports[0] ?? null;
  const selectedCable =
    selectedDevice && selectedPort
      ? getCableForPort(rack.cables, selectedDevice.id, selectedPort.id)
      : null;

  return (
    <section className="rack-stage" aria-label="Rack elevation">
      <div className="rack-stage__frame">
        <header className="rack-stage__header">
          <div>
            <p className="shell__eyebrow">Rack elevation</p>
            <h3>
              {rack.siteName} / {rack.name}
            </h3>
          </div>
          <div className="rack-stage__header-meta">
            <span>{rack.totalUnits}U cabinet</span>
            <strong>{rack.devices.length} devices placed</strong>
          </div>
        </header>

        <div className="rack-stage__grid" role="grid" aria-label={`${rack.name} unit map`}>
          {slots.map((slot) => {
            const device = slot.occupant;
            const selected = device?.id === selectedDevice?.id;

            return (
              <div key={slot.unit} className="rack-stage__slot" role="row">
                <div className="rack-stage__u-marker" role="rowheader">
                  U{slot.unit}
                </div>
                <div className="rack-stage__bay">
                  {device ? (
                    <button
                      type="button"
                      className={`rack-stage__device rack-stage__device--${device.tone}${selected ? " rack-stage__device--selected" : ""}${slot.occupantStart ? " rack-stage__device--start" : " rack-stage__device--continuation"}`}
                      onClick={() => onDeviceSelect(device.id)}
                    >
                      {slot.occupantStart ? (
                        <>
                          <div className="rack-stage__device-head">
                            <span>{device.name}</span>
                            <small>{getDeviceCoverageLabel(device)}</small>
                          </div>
                          <div className="rack-stage__device-meta">
                            <span>{device.role}</span>
                            <strong>{countConnectedPorts(device)} active links</strong>
                          </div>
                        </>
                      ) : (
                        <span className="rack-stage__device-stub" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    <div className="rack-stage__blank" aria-hidden="true" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rack-stage__detail">
        <section className="rack-stage__detail-block">
          <p className="shell__eyebrow">Selected device</p>
          <h3>{selectedDevice?.name ?? "No device selected"}</h3>
          <p>{selectedDevice?.role ?? "Choose a placed device to inspect its ports and cable mapping."}</p>

          {selectedDevice ? (
            <div className="rack-stage__port-map">
              {selectedDevice.ports.map((port) => (
                <button
                  key={port.id}
                  type="button"
                  className={`rack-stage__port rack-stage__port--${port.status}${selectedPort?.id === port.id ? " rack-stage__port--selected" : ""}`}
                  onClick={() => onPortSelect(selectedDevice.id, port.id)}
                >
                  <span>{port.label}</span>
                  <small>{port.peerPortLabel ?? "unmapped"}</small>
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rack-stage__detail-block">
          <p className="shell__eyebrow">Cable view</p>
          <h3>{selectedPort?.label ?? "Select a port"}</h3>
          <p>
            {selectedCable
              ? `${selectedCable.fromPortLabel} to ${selectedCable.toPortLabel}`
              : "Basic cable visualization shows the linked peer for the selected port."}
          </p>
          <div className="rack-stage__cable-trace">
            <span className="rack-stage__cable-end">{selectedDevice?.name ?? "device"}</span>
            <span className="rack-stage__cable-line" aria-hidden="true" />
            <span className="rack-stage__cable-end">
              {selectedCable
                ? selectedCable.fromDeviceId === selectedDevice?.id
                  ? selectedCable.toDeviceId
                  : selectedCable.fromDeviceId
                : "no-peer"}
            </span>
          </div>
          <ul className="shell__notes">
            {rack.cables.slice(0, 3).map((cable) => (
              <li key={cable.id}>
                {cable.fromPortLabel} {"->"} {cable.toPortLabel}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
