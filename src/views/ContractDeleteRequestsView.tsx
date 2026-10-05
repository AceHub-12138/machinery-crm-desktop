import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { showToast } from "../components/ui";
import { date } from "../lib/format";

interface ContractDeleteRequest {
  id: string;
  contractId: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requesterId: string;
  approverId?: string;
  approvalRemark?: string;
  createdAt: string;
  updatedAt: string;
  requester?: { id: string; name: string };
  approver?: { id: string; name: string };
  contract?: {
    id: string;
    contractNo: string;
    equipmentName: string;
    amount?: number | string;
    customer?: {
      id: string;
      companyName: string;
      province?: string;
      businessLine?: string;
    };
  };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过（已删除）",
  REJECTED: "已拒绝",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  APPROVED: "bg-bad/10 text-bad",
  REJECTED: "bg-panel2 text-dim",
};

export default function ContractDeleteRequestsView() {
  const user = getCachedUser();
  const [requests, setRequests] = useState<ContractDeleteRequest[]>([]);
  const [status, setStatus] = useState("");
  const [remark, setRemark] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const isAdmin = user?.role === "SUPER_ADMIN";

  const fetchRequests = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const data = await api<ContractDeleteRequest[]>(
        "/api/contract-delete-requests",
        { query: status ? { status } : undefined }
      );
      if (Array.isArray(data)) {
        setRequests(data);
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "读取审批记录失败",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [status, isAdmin]);

  const handleApprove = async (id: string) => {
    const item = requests.find((r) => r.id === id);
    const contractNo = item?.contract?.contractNo || "该合同";

    if (
      !confirm(
        `⚠️ 确认同意删除 ${contractNo} 吗？\n\n同意后合同将被标记删除（数据仍保留，可后续恢复）。此操作不可撤销。`
      )
    ) {
      return;
    }

    setProcessing(id);
    try {
      await api(`/api/contract-delete-requests/${id}/approve`, {
        method: "POST",
        body: { approvalRemark: remark[id] || "" },
      });
      showToast("已同意删除申请，合同已标记删除", "success");
      setRemark((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchRequests();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "审批失败",
        "error"
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!remark[id]?.trim()) {
      showToast("拒绝时必须填写审批备注说明原因", "error");
      return;
    }

    setProcessing(id);
    try {
      await api(`/api/contract-delete-requests/${id}/reject`, {
        method: "POST",
        body: { approvalRemark: remark[id] },
      });
      showToast("已拒绝删除申请", "success");
      setRemark((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchRequests();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "拒绝失败",
        "error"
      );
    } finally {
      setProcessing(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="rounded-2xl border border-line bg-panel p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-12 text-amber-500" />
          <p className="text-sm text-bad">无权查看合同删除审批</p>
          <p className="mt-2 text-xs text-faint">仅超级管理员可访问此功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">合同删除审批</h1>
              <p className="mt-1 text-sm text-dim">
                审批合同删除申请，同意后合同将被标记删除（数据保留可恢复）
              </p>
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">全部状态</option>
              <option value="PENDING">待审批</option>
              <option value="APPROVED">已通过</option>
              <option value="REJECTED">已拒绝</option>
            </select>
          </div>

          {/* 审批列表 */}
          {loading ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">加载中...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-8">
              <p className="text-center text-sm text-dim">暂无审批记录</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((item) => (
                <div
                  key={item.id}
                  className={`space-y-4 rounded-2xl border p-5 shadow-sm ${
                    item.status === "PENDING"
                      ? "border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20"
                      : "border-line bg-panel"
                  }`}
                >
                  {/* 合同信息 */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {item.status === "APPROVED" ? (
                        <div className="inline-flex items-center gap-2">
                          <span className="text-base font-semibold text-ink line-through opacity-60">
                            {item.contract?.contractNo || item.contractId}
                          </span>
                          <span className="rounded-full bg-bad/10 px-2 py-0.5 text-xs font-medium text-bad">
                            已删除
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => showToast("请在合同管理模块中查看合同详情", "info")}
                          className="inline-flex items-center gap-1.5 text-base font-semibold text-ink transition-colors hover:text-brand"
                          title="查看合同详情"
                        >
                          {item.contract?.contractNo || item.contractId}
                          <ExternalLink size={14} />
                        </button>
                      )}
                      <p className="mt-1 text-sm text-dim">
                        {item.contract?.customer?.companyName} ·{" "}
                        {item.contract?.customer?.province ||
                          item.contract?.customer?.businessLine ||
                          "未知区域"}
                      </p>
                      {item.contract?.equipmentName && (
                        <p className="mt-0.5 text-xs text-faint">
                          设备：{item.contract.equipmentName}
                          {item.contract.amount && ` · 金额：¥${Number(item.contract.amount).toLocaleString()}`}
                        </p>
                      )}
                    </div>
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[item.status]}`}
                    >
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>

                  {/* 删除原因 - 高亮显示 */}
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
                    <div className="flex items-start gap-2">
                      <Trash2 size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                          删除原因
                        </p>
                        <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
                          {item.reason}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 申请信息 */}
                  <div className="grid grid-cols-1 gap-3 text-xs text-dim sm:grid-cols-3">
                    <div>
                      <span className="text-faint">申请人：</span>
                      {item.requester?.name || `ID: ${item.requesterId}`}
                    </div>
                    <div>
                      <span className="text-faint">审批人：</span>
                      {item.approver?.name || (item.approverId ? `ID: ${item.approverId}` : "-")}
                    </div>
                    <div>
                      <span className="text-faint">创建时间：</span>
                      {date(item.createdAt)}
                    </div>
                  </div>

                  {/* 审批备注 */}
                  {item.approvalRemark && (
                    <div className="rounded-xl border border-line/50 bg-surface p-3">
                      <p className="text-xs font-medium text-faint">审批备注</p>
                      <p className="mt-1 text-sm text-dim">{item.approvalRemark}</p>
                    </div>
                  )}

                  {/* 待审批操作 */}
                  {item.status === "PENDING" && (
                    <div className="space-y-3 border-t border-amber-200 pt-4 dark:border-amber-900">
                      <div className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 dark:bg-amber-950/30">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <p className="text-xs text-amber-800 dark:text-amber-200">
                          同意后合同将被标记删除。数据仍保留在系统中，技术人员可以恢复。
                        </p>
                      </div>
                      <textarea
                        value={remark[item.id] || ""}
                        onChange={(e) =>
                          setRemark({ ...remark, [item.id]: e.target.value })
                        }
                        placeholder="审批备注（拒绝时必填，说明拒绝原因）"
                        rows={2}
                        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => handleApprove(item.id)}
                          disabled={processing === item.id}
                          className="inline-flex items-center gap-2 rounded-xl bg-bad px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bad/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2 size={16} />
                          同意删除
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          disabled={processing === item.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <XCircle size={16} />
                          拒绝
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
