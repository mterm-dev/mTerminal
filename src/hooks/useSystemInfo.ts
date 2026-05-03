import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface SystemInfo {
  user: string;
  host: string;
}

export function useSystemInfo(): SystemInfo {
  const [info, setInfo] = useState<SystemInfo>({ user: "user", host: "host" });
  useEffect(() => {
    invoke<SystemInfo>("system_info")
      .then(setInfo)
      .catch(() => {});
  }, []);
  return info;
}
