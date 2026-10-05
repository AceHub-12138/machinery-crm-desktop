import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { showToast } from "../components/ui";

interface OperationLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  beforeData?: any;
  afterData?: any;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

const ACTION_LABELS: Record<string, string> = {
  CREATE_PAYMENT: "新增回款",
  UPDATE_PAYMENT: "修改回款",
  DELETE_PAYMENT: "删除回款",
  UPDATE_CONTRACT: "修改合同",
  DELETE_CONTRACT: "删除合同",
  QUOTE_TO_CONTRACT: "一键转合同",
  QUOTE_UPDATE_CONTRACT: "报价更新合同",
  REQUEST_CONTRACT_UNLOCK: "申请合同解锁",
  APPROVE_CONTRACT_UNLOCK: "同意合同解锁",
  REJECT_CONTRACT_UNLOCK: "拒绝合同解锁",
  CREATE_USER: "新增用户",
  UPDATE_USER: "修改用户",
  DISABLE_USER: "禁用用户",
  TRANSFER_AND_DISABLE_USER: "转移并禁用用户",
  CREATE_CUSTOMER: "新增客户",
  UPDATE_CUSTOMER: "编辑客户",
  DELETE_CUSTOMER: "删除客户",
  CREATE_CUSTOMER_QUOTE: "新增客户报价",
  CREATE_SHIPMENT: "新增发货",
  UPDATE_SHIPMENT: "修改发货",
  CREATE_AFTER_SALES_ORDER: "新建售后工单",
  UPDATE_AFTER_SALES_ORDER: "编辑售后工单",
  SUBMIT_AFTER_SALES_RECEIPT: "提交售后回执",
  UPDATE_AFTER_SALES_STATUS: "流转售后工单状态",
  DELETE_AFTER_SALES_ORDER: "删除售后工单",
  CREATE_AFTER_SALES_SUPPLEMENT_PART: "新增售后补充配件",
};

const ENTITY_LABELS: Record<string, string> = {
  User: "用户",
  Customer: "客户",
  Contract: "合同",
  ContractPayment: "回款",
  ContractUnlockRequest: "审批",
  CustomerQuote: "客户报价",
  Shipment: "发货记录",
  AfterSalesOrder: "售后工单",
  AfterSalesSupplementPart: "售后补充配件",
};

export default function OperationLogsView() {
  const user = getCachedUser();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const isAdmin = user?.role === "SUPER_ADMIN";

  const fetchLogs = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (action) params.action = action;
      if (entityType) params.entityType = entityType;

      const data = await api<{ items: OperationLog[] }>(
        "/api/system/audit/search",
        { query: params }
      );
      if (Array.isArray(data.items)) {
        setLogs(data.items);
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "读取日志失败",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [action, entityType, isAdmin]);

  const formatDateTime = (dateString: string) => {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(dateString));
  };

  const formatData = (data: any) => {
    if (!data) return "无数据";
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权查看操作日志</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-ink">操作日志</h1>
              <p className="mt-1 text-sm text-dim">
                审计追踪，记录所有关键业务操作的修改前后数据
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">全部操作</option>
                {Object.entries(ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">全部对象</option>
                {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 日志列表 */}
          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">加载中...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">暂无日志记录</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-sm">
              <div className="hidden border-b border-line/60 bg-panel2 px-4 py-3 md:grid md:grid-cols-[140px_110px_1fr_160px] md:gap-3">
                <span className="text-xs font-medium text-dim">操作</span>
                <span className="text-xs font-medium text-dim">对象</span>
                <span className="text-xs font-medium text-dim">对象ID</span>
                <span className="text-xs font-medium text-dim">操作人 / 时间</span>
              </div>
              <div className="divide-y divide-line/50">
                {logs.map((log) => {
                  const expanded = expandedLog === log.id;
                  return (
                    <div key={log.id}>
                      <button
                        onClick={() => setExpandedLog(expanded ? null : log.id)}
                        className="grid w-full gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-panel2 md:grid-cols-[140px_110px_1fr_160px]"
                      >
                        <div className="flex items-center gap-2">
                          {expanded ? (
                            <ChevronDown size={16} className="shrink-0 text-brand" />
                          ) : (
                            <ChevronRight size={16} className="shrink-0 text-faint" />
                          )}
                          <span className="font-medium text-ink">
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </div>
                        <span className="text-dim md:ml-6">
                          {ENTITY_LABELS[log.entityType] || log.entityType}
                        </span>
                        <span className="truncate text-faint md:ml-6" title={log.entityId}>
                          {log.entityId}
                        </span>
                        <div className="text-xs text-dim md:ml-6">
                          <div>{log.user?.name || `ID: ${log.userId}`}</div>
                          <div className="text-faint">{formatDateTime(log.createdAt)}</div>
                        </div>
                      </button>

                      {/* 展开的数据对比 */}
                      {expanded && (
                        <div className="border-t border-line/30 bg-surface px-4 py-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* 修改前 */}
                            <div>
                              <p className="mb-2 text-xs font-medium text-dim">修改前</p>
                              <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-panel p-3 text-xs text-ink">
                                {formatData(log.beforeData)}
                              </pre>
                            </div>
                            {/* 修改后 */}
                            <div>
                              <p className="mb-2 text-xs font-medium text-dim">修改后</p>
                              <pre className="max-h-64 overflow-auto rounded-xl border border-line bg-panel p-3 text-xs text-ink">
                                {formatData(log.afterData)}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
