// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../src/lib/tauri-shim", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "../../src/lib/tauri-shim";
import {
  useRemoteHosts,
  listSshKeys,
  getToolAvailability,
  type HostMeta,
  type HostGroup,
} from "../../src/hooks/useRemoteHosts";
import { GROUP_ACCENTS } from "../../src/hooks/useWorkspace";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

function makeHost(over: Partial<HostMeta> = {}): HostMeta {
  return {
    id: "h1",
    name: "host1",
    host: "1.2.3.4",
    port: 22,
    user: "u",
    auth: "key",
    savePassword: false,
    ...over,
  };
}

function makeGroup(over: Partial<HostGroup> = {}): HostGroup {
  return {
    id: "g1",
    name: "g1",
    collapsed: false,
    accent: "orange",
    ...over,
  };
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  mockInvoke.mockReset();
});

describe("useRemoteHosts - enabled flag gating", () => {
  it("1. enabled=false → empty hosts/groups, no host_list invoke", async () => {
    const { result } = renderHook(() => useRemoteHosts(false, false));
    
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.hosts).toEqual([]);
    expect(result.current.groups).toEqual([]);
    const calls = mockInvoke.mock.calls.filter((c) => c[0] === "host_list");
    expect(calls).toHaveLength(0);
  });

  it("2. enabled=true → calls host_list and populates hosts/groups", async () => {
    mockInvoke.mockResolvedValueOnce({
      hosts: [makeHost()],
      groups: [makeGroup()],
    });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => {
      expect(result.current.hosts).toHaveLength(1);
    });
    expect(result.current.hosts[0].id).toBe("h1");
    expect(result.current.groups[0].id).toBe("g1");
    expect(mockInvoke).toHaveBeenCalledWith("host_list");
  });

  it("3. vaultUnlocked change triggers re-fetch", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    mockInvoke.mockResolvedValueOnce({
      hosts: [makeHost({ id: "h2" })],
      groups: [],
    });
    const { result, rerender } = renderHook(
      ({ vu }: { vu: boolean }) => useRemoteHosts(true, vu),
      { initialProps: { vu: false } },
    );
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
    rerender({ vu: true });
    await waitFor(() => {
      expect(result.current.hosts.some((h) => h.id === "h2")).toBe(true);
    });
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});

describe("useRemoteHosts - accent normalization", () => {
  it("4. unknown accent string is coerced to 'blue'", async () => {
    mockInvoke.mockResolvedValueOnce({
      hosts: [],
      groups: [makeGroup({ accent: "neon-pink" as never })],
    });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => {
      expect(result.current.groups).toHaveLength(1);
    });
    expect(result.current.groups[0].accent).toBe("blue");
  });

  it("5. valid accent passes through", async () => {
    mockInvoke.mockResolvedValueOnce({
      hosts: [],
      groups: [makeGroup({ accent: "violet" })],
    });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => {
      expect(result.current.groups).toHaveLength(1);
    });
    expect(result.current.groups[0].accent).toBe("violet");
  });
});

describe("useRemoteHosts - save", () => {
  it("6. save(host) without password → host_save with groupId null & password null, returns id", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] }); // mount fetch
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockResolvedValueOnce("new-id"); // host_save
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] }); // refresh
    let returned = "";
    await act(async () => {
      returned = await result.current.save(makeHost());
    });
    expect(returned).toBe("new-id");
    expect(mockInvoke).toHaveBeenCalledWith("host_save", {
      host: { ...makeHost(), groupId: null },
      password: null,
    });
    
    expect(mockInvoke).toHaveBeenLastCalledWith("host_list");
  });

  it("7. save(host, password) passes the password through", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockResolvedValueOnce("id-2");
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.save(
        makeHost({ groupId: "gA" }),
        "secret",
      );
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_save", {
      host: { ...makeHost({ groupId: "gA" }) },
      password: "secret",
    });
  });
});

describe("useRemoteHosts - simple mutations", () => {
  it("8. remove(id) calls host_delete then refreshes", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockResolvedValueOnce(undefined);
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.remove("h1");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_delete", { id: "h1" });
    expect(mockInvoke).toHaveBeenLastCalledWith("host_list");
  });

  it("9. setHostGroup calls host_set_group then refreshes", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockResolvedValueOnce(undefined);
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.setHostGroup("h1", "gX");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_set_group", {
      hostId: "h1",
      groupId: "gX",
    });
    expect(mockInvoke).toHaveBeenLastCalledWith("host_list");
  });

  it("11. deleteGroup calls host_group_delete and refreshes", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockResolvedValueOnce(undefined);
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.deleteGroup("gZ");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_group_delete", { id: "gZ" });
    expect(mockInvoke).toHaveBeenLastCalledWith("host_list");
  });
});

describe("useRemoteHosts - addGroup / renameGroup / toggle / accent", () => {
  it("12. addGroup() picks accent by groups.length % len, defaults name 'group N'", async () => {
    mockInvoke.mockResolvedValueOnce({
      hosts: [],
      groups: [makeGroup({ id: "g1" }), makeGroup({ id: "g2" })],
    });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(result.current.groups).toHaveLength(2));
    mockInvoke.mockResolvedValueOnce("new-gid");
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.addGroup();
    });
    const expectedAccent = GROUP_ACCENTS[2 % GROUP_ACCENTS.length];
    expect(mockInvoke).toHaveBeenCalledWith("host_group_save", {
      group: {
        id: "",
        name: "group 3",
        collapsed: false,
        accent: expectedAccent,
      },
    });
  });

  it("13. addGroup('custom') uses provided name", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockResolvedValueOnce("new-gid");
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.addGroup("custom");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_group_save", {
      group: {
        id: "",
        name: "custom",
        collapsed: false,
        accent: GROUP_ACCENTS[0],
      },
    });
  });

  it("14. renameGroup is no-op when group missing", async () => {
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1));
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.renameGroup("ghost", "newname");
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("15. renameGroup with existing group calls host_group_save with merged name", async () => {
    const g = makeGroup({ id: "gX", name: "old", accent: "violet" });
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [g] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    mockInvoke.mockResolvedValueOnce("gX");
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.renameGroup("gX", "fresh");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_group_save", {
      group: { ...g, name: "fresh" },
    });
  });

  it("16. toggleGroup flips collapsed; no-op when missing", async () => {
    const g = makeGroup({ id: "gX", collapsed: false });
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [g] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    mockInvoke.mockResolvedValueOnce("gX");
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.toggleGroup("gX");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_group_save", {
      group: { ...g, collapsed: true },
    });
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.toggleGroup("ghost");
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("17. setGroupAccent updates accent; no-op when missing", async () => {
    const g = makeGroup({ id: "gX", accent: "blue" });
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [g] });
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    mockInvoke.mockResolvedValueOnce("gX");
    mockInvoke.mockResolvedValueOnce({ hosts: [], groups: [] });
    await act(async () => {
      await result.current.setGroupAccent("gX", "pink");
    });
    expect(mockInvoke).toHaveBeenCalledWith("host_group_save", {
      group: { ...g, accent: "pink" },
    });
    mockInvoke.mockClear();
    await act(async () => {
      await result.current.setGroupAccent("ghost", "red");
    });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe("useRemoteHosts - module helpers", () => {
  it("18. listSshKeys returns invoke result", async () => {
    const data = [{ path: "/k", name: "id_rsa", keyType: "rsa" }];
    mockInvoke.mockResolvedValueOnce(data);
    await expect(listSshKeys()).resolves.toEqual(data);
    expect(mockInvoke).toHaveBeenCalledWith("list_ssh_keys");
  });

  it("19. listSshKeys returns [] on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("nope"));
    await expect(listSshKeys()).resolves.toEqual([]);
  });

  it("20. getToolAvailability returns invoke result", async () => {
    mockInvoke.mockResolvedValueOnce({ sshpass: true });
    await expect(getToolAvailability()).resolves.toEqual({ sshpass: true });
    expect(mockInvoke).toHaveBeenCalledWith("tool_availability");
  });

  it("21. getToolAvailability returns {sshpass: false} on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("boom"));
    await expect(getToolAvailability()).resolves.toEqual({ sshpass: false });
  });
});

describe("useRemoteHosts - error handling on host_list", () => {
  it("22. host_list rejection clears hosts/groups", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useRemoteHosts(true, true));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.hosts).toEqual([]);
    expect(result.current.groups).toEqual([]);
  });
});
