import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("dachuan", {
  request: (payload: unknown) => ipcRenderer.invoke("api:request", payload),
  login: (payload: unknown) => ipcRenderer.invoke("auth:login", payload),
  session: (baseUrl: string) => ipcRenderer.invoke("auth:session", baseUrl),
  logout: (baseUrl: string) => ipcRenderer.invoke("auth:logout", baseUrl),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  setTheme: (mode: string) => ipcRenderer.invoke("app:set-theme", mode),
  flags: () => ipcRenderer.invoke("app:flags"),
  windowControl: (action: "minimize" | "toggle-maximize" | "close") => ipcRenderer.invoke(`window:${action}`),
  chatStart: (payload: unknown) => ipcRenderer.invoke("chat:start", payload),
  chatAbort: (reqId: string) => ipcRenderer.invoke("chat:abort", reqId),
  uploadFile: (payload: unknown) => ipcRenderer.invoke("upload:file", payload),
  fetchBinary: (payload: unknown) => ipcRenderer.invoke("fetch:binary", payload),
  saveAttachment: (payload: unknown) => ipcRenderer.invoke("attachment:save", payload),
  saveFile: (payload: { name: string; base64: string; mime?: string }) => ipcRenderer.invoke("file:save", payload),
  appVersion: () => ipcRenderer.invoke("app:version") as Promise<string>,
  updateState: () => ipcRenderer.invoke("app:update-state") as Promise<unknown>,
  updateCheck: (baseUrl?: string) => ipcRenderer.invoke("app:update-check", baseUrl) as Promise<{ ok: boolean; error?: string }>,
  updateDownload: () => ipcRenderer.invoke("app:update-download") as Promise<{ ok: boolean; error?: string }>,
  updateInstall: () => ipcRenderer.invoke("app:update-install") as Promise<{ ok: boolean; error?: string }>,
  onUpdateEvent: (cb: (event: unknown) => void) => {
    const listener = (_e: unknown, event: unknown) => cb(event);
    ipcRenderer.on("app:update-event", listener);
    return () => ipcRenderer.removeListener("app:update-event", listener);
  },
  onChatEvent: (cb: (payload: { reqId: string; data: any }) => void) => {
    const listener = (_e: unknown, payload: { reqId: string; data: any }) => cb(payload);
    ipcRenderer.on("chat:event", listener);
    return () => ipcRenderer.removeListener("chat:event", listener);
  },
});
