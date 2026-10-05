// 应用内自动更新的渲染端状态中枢：更新横幅与设置页共用同一份主进程事件流。
// 主进程事件可能在横幅挂载前到达（启动 15 秒检查），所以模块级保存最新事件，挂载时先对齐一次。
import { useEffect, useState } from "react";
import type { UpdateEvent } from "./ipc";
import { getServerUrl } from "./api";

type Listener = (event: UpdateEvent) => void;

const listeners = new Set<Listener>();
let current: UpdateEvent = { type: "idle" };
let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  window.dachuan.onUpdateEvent((event) => {
    current = event;
    listeners.forEach((listener) => listener(event));
  });
  // 对齐主进程已有状态（例如横幅挂载前已检测到新版本）
  void window.dachuan
    .updateState()
    .then((event) => {
      current = event;
      listeners.forEach((listener) => listener(event));
    })
    .catch(() => undefined);
}

export function useUpdater() {
  wire();
  const [event, setEvent] = useState<UpdateEvent>(current);

  useEffect(() => {
    const listener: Listener = (e) => setEvent(e);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    event,
    /** 手动检查：feed 跟随当前登录的服务器（测试/内网镜像也能用） */
    check: () => window.dachuan.updateCheck(getServerUrl()),
    download: () => window.dachuan.updateDownload(),
    install: () => window.dachuan.updateInstall(),
  };
}
