import { useEffect, useState } from "react";
import { invoke } from "../lib/ipc";

type Platform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd";

interface SystemInfo {
  user: string;
  host: string;
  home: string;
  platform: Platform;
}

const DEFAULT_INFO: SystemInfo = {
  user: "user",
  host: "host",
  home: "",
  platform: "linux",
};

export function useSystemInfo(): SystemInfo {
  const [info, setInfo] = useState<SystemInfo>(DEFAULT_INFO);
  useEffect(() => {
    invoke<Partial<SystemInfo>>("system_info")
      .then((next) => {
        setInfo({
          ...DEFAULT_INFO,
          ...next,
        });
      })
      .catch(() => {});
  }, []);
  return info;
}
