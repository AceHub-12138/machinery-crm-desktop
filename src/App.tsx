import { useCallback, useEffect, useState } from "react";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import { AmbientBackground } from "./components/fx";
import { ToastHost } from "./components/ui";
import { AttachmentPreviewHost } from "./components/attachment-preview";
import UpdateBanner from "./components/update-banner";
import LoginView from "./views/LoginView";
import DashboardView from "./views/DashboardView";
import CustomersView from "./views/CustomersView";
import LeadsView from "./views/LeadsView";
import LeadHunterView from "./views/LeadHunterView";
import ProductsView from "./views/ProductsView";
import ContractsView from "./views/ContractsView";
import ShipmentsView from "./views/ShipmentsView";
import AfterSalesView from "./views/AfterSalesView";
import ChatView from "./views/ChatView";
import TasksView from "./views/TasksView";
import UsersView from "./views/UsersView";
import SettingsView from "./views/SettingsView";
import ContractUnlockRequestsView from "./views/ContractUnlockRequestsView";
import ContractDeleteRequestsView from "./views/ContractDeleteRequestsView";
import OperationLogsView from "./views/OperationLogsView";
import RemindersView from "./views/RemindersView";
import AdminAgentView from "./views/AdminAgentView";
import AdminCockpitView from "./views/AdminCockpitView";
import AdminConfigView from "./views/AdminConfigView";
import AdminHealthView from "./views/AdminHealthView";
import AdminMasterDataView from "./views/AdminMasterDataView";
import ErpView from "./views/ErpView";
import { getServerUrl, getCachedUser, cacheUser, setServerUrl, initPreview, isPreview } from "./lib/api";
import { ThemeProvider } from "./lib/theme";
import logoBadge from "./assets/logo-badge.png";
import type { SessionUser } from "./lib/ipc";
import { canAccessView, defaultViewForRole, type NavigateEvent } from "./lib/navigation";

export type View = "dashboard" | "customers" | "leads" | "lead-hunter" | "products" | "contracts" | "shipments" | "aftersales" | "chat" | "tasks" | "users" | "settings" | "contract-unlock-requests" | "contract-delete-requests" | "operation-logs" | "reminders" | "admin-agent" | "admin-cockpit" | "admin-config" | "admin-health" | "admin-master-data" | "erp-dashboard" | "erp-inventory" | "erp-materials" | "erp-bom" | "erp-warehouse" | "erp-stock-in" | "erp-stock-out" | "erp-stock-transfers" | "erp-stock-check" | "erp-suppliers" | "erp-purchase-demands" | "erp-purchase-orders" | "erp-supplier-deliveries";

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}

function Shell() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [connected, setConnected] = useState(false);
  const [navigationParams, setNavigationParams] = useState<NavigateEvent["params"]>();

  const selectView = useCallback((nextView: View, params?: NavigateEvent["params"]) => {
    const role = (user || getCachedUser())?.role;
    if (!canAccessView(nextView, role)) return false;
    setNavigationParams(params);
    setView(nextView);
    return true;
  }, [user]);

  // 页面跳转/权限守卫：校验通过才切换视图；越权目标一票否决
  useEffect(() => {
    const onNavigate = (e: Event) => {
      // TSX 中 as CustomEvent<{...}> 的尖括号会被当 JSX，因此事件类型走中间别名
      type NavDetail = NavigateEvent;
      const detail: NavDetail | undefined = (e as CustomEvent<NavDetail>).detail;
      if (!detail) return;
      if (!selectView(detail.view, detail.params)) e.preventDefault();
    };
    window.addEventListener("dc:navigate", onNavigate);
    return () => window.removeEventListener("dc:navigate", onNavigate);
  }, [selectView]);

  // 启动时用本地缓存的会话向服务器校验（Cookie 保存在桌面端安全存储中）
  useEffect(() => {
    (async () => {
      if (await initPreview()) {
        setServerUrl(getServerUrl());
        // 预览身份也要落缓存：各视图内置的 getCachedUser() 守卫读 localStorage，与 App 状态保持一致
        const previewUser: SessionUser = { id: "preview", name: "预览模式", role: "SUPER_ADMIN" };
        setUser(previewUser);
        cacheUser(previewUser);
        setView(defaultViewForRole(previewUser.role));
        setNavigationParams(undefined);
        setConnected(true);
        setBooting(false);
        return;
      }
      const server = getServerUrl();
      const cached = getCachedUser();
      if (!server || !cached) {
        setBooting(false);
        return;
      }
      setUser(cached); // 先展示界面，后台校验
      setView(defaultViewForRole(cached.role));
      setNavigationParams(undefined);
      const res = await window.dachuan.session(server);
      if (res.user) {
        setUser(res.user);
        cacheUser(res.user);
        setView(defaultViewForRole(res.user.role));
        setNavigationParams(undefined);
        setConnected(true);
      } else {
        setUser(null);
        cacheUser(null);
      }
      setBooting(false);
    })();
  }, []);

  // 任意接口 401 → 回登录页
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      cacheUser(null);
      setConnected(false);
    };
    window.addEventListener("dc:unauthorized", onUnauthorized);
    return () => window.removeEventListener("dc:unauthorized", onUnauthorized);
  }, []);

  // 连接状态：登录成功后周期性轻量校验
  useEffect(() => {
    if (!user) return;
    setConnected(true);
    const t = setInterval(async () => {
      const res = await window.dachuan.session(getServerUrl());
      setConnected(!!res.user);
    }, 120_000);
    return () => clearInterval(t);
  }, [user]);

  const handleLogin = useCallback((u: SessionUser) => {
    setUser(u);
    setView(defaultViewForRole(u.role));
    setNavigationParams(undefined);
    setConnected(true);
  }, []);

  const handleLogout = useCallback(async () => {
    await window.dachuan.logout(getServerUrl());
    cacheUser(null);
    setUser(null);
    setConnected(false);
  }, []);

  if (booting) {
    return (
      <div className="flex h-full items-center justify-center">
        <img src={logoBadge} alt="大川机床" className="logo-breath h-12 w-12 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <LoginView onLogin={handleLogin} />
      </ThemeProvider>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar serverUrl={getServerUrl()} connected={connected} />
      <div className="relative flex flex-1 overflow-hidden">
        {/* 全局氛围背景：aurora 光斑 + 粒子 + 网格 */}
        <AmbientBackground />
        <div className="relative z-10 flex flex-1 overflow-hidden">
          <Sidebar view={view} onNavigate={(nextView) => { selectView(nextView); }} user={user} onLogout={handleLogout} />
          {/* key 随视图变化：重放 CSS 入场转场（合成器动画，主线程卡顿时也不会停在半途） */}
          <div key={`${view}:${JSON.stringify(navigationParams || {})}`} className="page-enter flex flex-1 overflow-hidden">
            {view === "dashboard" && <DashboardView />}
            {view === "customers" && <CustomersView focusId={navigationParams?.customerId} initialFilters={navigationParams} />}
            {view === "leads" && <LeadsView />}
            {view === "lead-hunter" && <LeadHunterView />}
            {view === "products" && <ProductsView />}
            {view === "contracts" && <ContractsView initialFilters={navigationParams} focusId={navigationParams?.contractId} />}
            {view === "shipments" && <ShipmentsView initialFilters={navigationParams} />}
            {view === "aftersales" && <AfterSalesView initialFilters={navigationParams} focusId={navigationParams?.afterSalesId} />}
            {view === "chat" && <ChatView />}
            {view === "tasks" && <TasksView initialMode={navigationParams?.mode === "monthly" ? "monthly" : "list"} initialMonth={navigationParams?.month} />}
            {view === "users" && <UsersView />}
            {view === "settings" && <SettingsView />}
            {view === "contract-unlock-requests" && <ContractUnlockRequestsView />}
            {view === "contract-delete-requests" && <ContractDeleteRequestsView />}
            {view === "operation-logs" && <OperationLogsView />}
            {view === "reminders" && <RemindersView initialGroup={navigationParams?.group} />}
            {view === "admin-agent" && <AdminAgentView />}
            {view === "admin-cockpit" && <AdminCockpitView />}
            {view === "admin-config" && <AdminConfigView />}
            {view === "admin-health" && <AdminHealthView />}
            {view === "admin-master-data" && <AdminMasterDataView />}
            {view.startsWith("erp-") && <ErpView sub={view.slice(4)} initialFilters={navigationParams} />}
          </div>
        </div>
        <ToastHost />
        {/* 全局附件预览宿主：各视图点附件即在应用内弹出（不再跳系统浏览器） */}
        <AttachmentPreviewHost />
        {/* 应用内更新横幅：发现新版本 → 端内下载 → 端内重启安装 */}
        <UpdateBanner />
      </div>
    </div>
  );
}
