// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { HostMeta, HostGroup } from "../../src/hooks/useRemoteHosts";



import { RemoteWorkspace } from "../../src/components/RemoteWorkspace";

function installLocalStoragePolyfill(): void {
  const store: Record<string, string> = {};
  const polyfill = {
    getItem: (k: string) =>
      Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: polyfill,
  });
}

beforeEach(() => {
  installLocalStoragePolyfill();
});

afterEach(() => {
  cleanup();
  try {
    window.localStorage.clear();
  } catch {}
});

const mkHost = (over: Partial<HostMeta> = {}): HostMeta => ({
  id: "h1",
  name: "host one",
  host: "h1.example.com",
  port: 22,
  user: "alice",
  auth: "key",
  identityPath: "/k",
  savePassword: false,
  ...over,
});

const mkGroup = (over: Partial<HostGroup> = {}): HostGroup => ({
  id: "g1",
  name: "group one",
  collapsed: false,
  accent: "blue",
  ...over,
});

function renderWorkspace(
  props: Partial<React.ComponentProps<typeof RemoteWorkspace>> = {},
) {
  const onAddHost = props.onAddHost ?? vi.fn();
  const onConnect = props.onConnect ?? vi.fn();
  const onLockClick = props.onLockClick ?? vi.fn();
  const onHostContextMenu = props.onHostContextMenu ?? vi.fn();
  const onGroupContextMenu = props.onGroupContextMenu ?? vi.fn();
  const onAddGroup = props.onAddGroup ?? vi.fn();
  const onToggleGroup = props.onToggleGroup ?? vi.fn();
  const onRenameGroup = props.onRenameGroup ?? vi.fn();
  const onSetHostGroup = props.onSetHostGroup ?? vi.fn();
  const setEditingGroupId = props.setEditingGroupId ?? vi.fn();

  const utils = render(
    <RemoteWorkspace
      hosts={props.hosts ?? []}
      groups={props.groups ?? []}
      vault={props.vault ?? { exists: true, unlocked: true }}
      onAddHost={onAddHost}
      onConnect={onConnect}
      onLockClick={onLockClick}
      onHostContextMenu={onHostContextMenu}
      onGroupContextMenu={onGroupContextMenu}
      onAddGroup={onAddGroup}
      onToggleGroup={onToggleGroup}
      onRenameGroup={onRenameGroup}
      onSetHostGroup={onSetHostGroup}
      editingGroupId={props.editingGroupId ?? null}
      setEditingGroupId={setEditingGroupId}
    />,
  );
  return {
    ...utils,
    onAddHost,
    onConnect,
    onLockClick,
    onHostContextMenu,
    onGroupContextMenu,
    onAddGroup,
    onToggleGroup,
    onRenameGroup,
    onSetHostGroup,
    setEditingGroupId,
  };
}

describe("RemoteWorkspace - rendering", () => {
  it("1. empty state shows 'no hosts — click + host to add'", () => {
    renderWorkspace();
    expect(screen.getByText("no hosts — click + host to add")).toBeTruthy();
  });

  it("2. renders ungrouped hosts with their name and sub label", () => {
    renderWorkspace({
      hosts: [
        mkHost({ id: "h1", name: "alpha", host: "alpha.example.com", port: 22 }),
        mkHost({ id: "h2", name: "beta", host: "beta.example.com", port: 2222 }),
      ],
    });
    expect(screen.getByText("alpha")).toBeTruthy();
    expect(screen.getByText("beta")).toBeTruthy();
    
    expect(screen.getByText("alice@beta.example.com:2222")).toBeTruthy();
    expect(screen.getByText("alice@alpha.example.com")).toBeTruthy();
  });

  it("3. shows 'no ungrouped hosts' hint when groups exist but no ungrouped hosts", () => {
    renderWorkspace({
      hosts: [mkHost({ id: "h1", groupId: "g1" })],
      groups: [mkGroup()],
    });
    expect(screen.getByText("no ungrouped hosts")).toBeTruthy();
  });
});

describe("RemoteWorkspace - groups", () => {
  it("4. renders group with name, count, and chevron; collapse toggles", () => {
    const onToggleGroup = vi.fn();
    renderWorkspace({
      hosts: [
        mkHost({ id: "h1", groupId: "g1" }),
        mkHost({ id: "h2", groupId: "g1" }),
      ],
      groups: [mkGroup({ name: "prod", collapsed: false })],
      onToggleGroup,
    });
    expect(screen.getByText("prod")).toBeTruthy();
    
    expect(screen.getByLabelText("2 hosts").textContent).toBe("2");
    
    const chevron = screen.getByLabelText("collapse group");
    fireEvent.click(chevron);
    expect(onToggleGroup).toHaveBeenCalledWith("g1");
  });

  it("5. collapsed group hides member hosts", () => {
    renderWorkspace({
      hosts: [mkHost({ id: "h1", name: "secret", groupId: "g1" })],
      groups: [mkGroup({ collapsed: true })],
    });
    expect(screen.queryByText("secret")).toBeNull();
    
    expect(screen.getByLabelText("expand group")).toBeTruthy();
  });

  it("6. group accent CSS var is applied", () => {
    renderWorkspace({
      hosts: [],
      groups: [mkGroup({ accent: "#d4b3f7" })],
    });
    const gEl = document.querySelector(".term-group") as HTMLElement;
    expect(gEl.getAttribute("style")).toContain("--group-accent");
    expect(gEl.getAttribute("style")).toContain("#d4b3f7");
  });
});

describe("RemoteWorkspace - host interactions", () => {
  it("7. clicking a host fires onConnect with that host", () => {
    const onConnect = vi.fn();
    const host = mkHost({ id: "h1", name: "alpha" });
    renderWorkspace({ hosts: [host], onConnect });
    fireEvent.click(screen.getByText("alpha"));
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith(host);
  });

  it("8. Enter key on a host fires onConnect", () => {
    const onConnect = vi.fn();
    const host = mkHost({ id: "h1", name: "alpha" });
    renderWorkspace({ hosts: [host], onConnect });
    const node = screen.getByText("alpha").closest(".remote-host") as HTMLElement;
    fireEvent.keyDown(node, { key: "Enter" });
    expect(onConnect).toHaveBeenCalledWith(host);
  });

  it("9. right-click on host fires onHostContextMenu with coords", () => {
    const onHostContextMenu = vi.fn();
    const host = mkHost({ id: "h1", name: "alpha" });
    renderWorkspace({ hosts: [host], onHostContextMenu });
    const node = screen.getByText("alpha").closest(".remote-host") as HTMLElement;
    fireEvent.contextMenu(node, { clientX: 12, clientY: 34 });
    expect(onHostContextMenu).toHaveBeenCalledWith(host, 12, 34);
  });
});

describe("RemoteWorkspace - top actions", () => {
  it("10. '+ host' button calls onAddHost with no group", () => {
    const onAddHost = vi.fn();
    renderWorkspace({ onAddHost });
    fireEvent.click(screen.getByText("+ host"));
    expect(onAddHost).toHaveBeenCalledTimes(1);
    
    expect(onAddHost.mock.calls[0][0]).toBeUndefined();
  });

  it("11. '+ group' button calls onAddGroup", () => {
    const onAddGroup = vi.fn();
    renderWorkspace({ onAddGroup });
    fireEvent.click(screen.getByText("+ group"));
    expect(onAddGroup).toHaveBeenCalled();
  });

  it("12. lock button uses correct aria-label per vault state, and fires onLockClick", () => {
    const onLockClick = vi.fn();
    const { rerender } = renderWorkspace({
      vault: { exists: true, unlocked: false },
      onLockClick,
    });
    expect(screen.getByLabelText("unlock vault")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("unlock vault"));
    expect(onLockClick).toHaveBeenCalled();

    rerender(
      <RemoteWorkspace
        hosts={[]}
        groups={[]}
        vault={{ exists: true, unlocked: true }}
        onAddHost={vi.fn()}
        onConnect={vi.fn()}
        onLockClick={onLockClick}
        onHostContextMenu={vi.fn()}
        onGroupContextMenu={vi.fn()}
        onAddGroup={vi.fn()}
        onToggleGroup={vi.fn()}
        onRenameGroup={vi.fn()}
        onSetHostGroup={vi.fn()}
        editingGroupId={null}
        setEditingGroupId={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("lock vault")).toBeTruthy();
  });

  it("13. group's '+' button opens host modal scoped to that group", () => {
    const onAddHost = vi.fn();
    renderWorkspace({
      groups: [mkGroup()],
      onAddHost,
    });
    fireEvent.click(screen.getByLabelText("new host in group"));
    expect(onAddHost).toHaveBeenCalledWith("g1");
  });
});

describe("RemoteWorkspace - drag and drop", () => {
  it("14. dragging a host into a group fires onSetHostGroup(hostId, groupId)", () => {
    const onSetHostGroup = vi.fn();
    renderWorkspace({
      hosts: [mkHost({ id: "h1", name: "alpha", groupId: null })],
      groups: [mkGroup({ id: "g1" })],
      onSetHostGroup,
    });
    const hostEl = screen.getByText("alpha").closest(".remote-host") as HTMLElement;
    fireEvent.dragStart(hostEl, {
      dataTransfer: { setData: () => {}, effectAllowed: "move" },
    });
    const groupHeader = document.querySelector(".term-group-h") as HTMLElement;
    fireEvent.dragOver(groupHeader, {
      dataTransfer: { dropEffect: "move", setData: () => {} },
    });
    fireEvent.drop(groupHeader, {
      dataTransfer: { setData: () => {} },
    });
    expect(onSetHostGroup).toHaveBeenCalledWith("h1", "g1");
  });

  it("15. dropping a host already in target group is a no-op", () => {
    const onSetHostGroup = vi.fn();
    renderWorkspace({
      hosts: [mkHost({ id: "h1", name: "alpha", groupId: "g1" })],
      groups: [mkGroup({ id: "g1" })],
      onSetHostGroup,
    });
    const hostEl = screen.getByText("alpha").closest(".remote-host") as HTMLElement;
    fireEvent.dragStart(hostEl, {
      dataTransfer: { setData: () => {}, effectAllowed: "move" },
    });
    const groupHeader = document.querySelector(".term-group-h") as HTMLElement;
    fireEvent.dragOver(groupHeader, {
      dataTransfer: { dropEffect: "move", setData: () => {} },
    });
    fireEvent.drop(groupHeader, {
      dataTransfer: { setData: () => {} },
    });
    expect(onSetHostGroup).not.toHaveBeenCalled();
  });
});

describe("RemoteWorkspace - group context menu", () => {
  it("16. right-click on group header fires onGroupContextMenu", () => {
    const onGroupContextMenu = vi.fn();
    const group = mkGroup();
    renderWorkspace({ groups: [group], onGroupContextMenu });
    const header = document.querySelector(".term-group-h") as HTMLElement;
    fireEvent.contextMenu(header, { clientX: 5, clientY: 6 });
    expect(onGroupContextMenu).toHaveBeenCalledWith(group, 5, 6);
  });
});
