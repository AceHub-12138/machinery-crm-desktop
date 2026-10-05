import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { CONTRACT_STATUS, PAYMENT_STATUS, SHIPMENT_STATUS, label, pillTone, money, date } from "../lib/format";
import { Pill, Spinner, Dash } from "./ui";
import { navigate } from "../lib/navigation";
import { composeEquipmentName, openShipmentAttachment, type ShipmentLike } from "./shipment-forms";
import { shipmentProgress, type ShipmentItemLike } from "../lib/shipments";

/** /api/contracts/[id] 返回的该合同发货记录（发货管理需要看到合同下全部批次，而不只是当前这条） */
interface ContractShipment {
  id: string;
  shipmentDate?: string | null;
  quantity?: number | null;
  shipmentStatus?: string | null;
  equipmentName?: string | null;
  receivingAddress?: string | null;
  driverPhone?: string | null;
  deliveryNoteUrl?: string | null;
  shipmentPhotoUrl?: string | null;
  remark?: string | null;
}

interface ContractDetail {
  id: string;
  contractNo?: string | null;
  equipmentName?: string | null;
  equipmentModel?: string | null;
  amount?: string | number | null;
  paidAmount?: string | number | null;
  unpaidAmount?: string | number | null;
  currency?: string | null;
  contractStatus?: string | null;
  paymentStatus?: string | null;
  signedDate?: string | null;
  estimatedShipmentDate?: string | null;
  salesUser?: { id: string; name: string } | null;
  customer?: {
    id: string;
    companyName?: string | null;
    contactName?: string | null;
    phone?: string | null;
    region?: string | null;
    province?: string | null;
    city?: string | null;
  } | null;
  items?: ShipmentItemLike[] | null;
  shipments?: ContractShipment[] | null;
}

function Stat({ label: text, value, unit = "台", tone = "" }: { label: string; value: number | null; unit?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface/70 px-3 py-2">
      <div className="label">{text}</div>
      <div className={`mono mt-0.5 text-base font-semibold ${tone || "text-ink"}`}>
        {value == null ? <Dash /> : `${value} ${unit}`}
      </div>
    </div>
  );
}

/**
 * 发货详情的展开面板：合同与客户信息 + 发货进度（合同台数 / 已发货 / 部分发货 / 未发货 / 待发）
 * + 该合同下全部发货记录。合同明细经 /api/contracts/[id] 现取，保证不受当前列表筛选影响。
 */
export function ShipmentDetailPanel({ shipment }: { shipment: ShipmentLike }) {
  const contractId = shipment.contract?.id || "";
  const customerId = shipment.contract?.customer?.id || "";
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!contractId) {
      setLoading(false);
      setError("这条发货记录没有关联合同");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api<ContractDetail>(`/api/contracts/${contractId}`);
      setDetail(res?.id ? res : null);
    } catch (err) {
      setDetail(null);
      setError((err as Error).message || "合同详情加载失败");
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = shipmentProgress(detail);
  const shipments = detail?.shipments || [];
  const customer = detail?.customer;
  const equipment = detail ? composeEquipmentName(detail) || shipment.equipmentName : shipment.equipmentName;
  // 合同台数未知（老合同没有主产品明细）时，进度条与「待发」只能退回未发货记录合计
  const machinesKnown = progress.machines != null;

  return (
    <div className="rounded-xl border border-line bg-panel2/40 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">
            发货详情
            <span className="ml-2 mono text-xs text-dim">{date(shipment.shipmentDate)}</span>
            <span className="ml-2 text-xs text-dim">
              本单 <span className="mono">{shipment.quantity}</span> 台 ·
            </span>
            <span className="ml-1">
              <Pill tone={pillTone(SHIPMENT_STATUS, shipment.shipmentStatus)}>{label(SHIPMENT_STATUS, shipment.shipmentStatus)}</Pill>
            </span>
          </div>
          <div className="mt-1 text-xs text-faint">
            {loading ? "合同 / 客户信息加载中…" : `${customer?.companyName || shipment.contract?.customer?.companyName || "—"} · ${detail?.contractNo || shipment.contract?.contractNo || "—"}`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost !px-2.5 !py-1 text-xs"
            disabled={!contractId}
            onClick={() => navigate(`/contracts/${contractId}`)}
          >
            <ExternalLink size={12} /> 打开合同详情
          </button>
          <button
            type="button"
            className="btn-ghost !px-2.5 !py-1 text-xs"
            disabled={!customerId}
            onClick={() => navigate(`/customers/${customerId}`)}
          >
            <UserRound size={12} /> 打开客户档案
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">
          <span>{error}</span>
          <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={load}>
            <RefreshCw size={11} /> 重试
          </button>
        </div>
      )}

      {/* 发货进度：这是「还剩几台没发」的答案所在。
          口径与平台一致——「部分发货」的记录算已发出，不再单列成分数量池（详见 lib/shipments.ts）。 */}
      <div>
        <div className="label mb-2">发货进度</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label="合同台数（主产品）" value={progress.machines} />
          <Stat label="已发货" value={progress.shipped} tone="text-ok" />
          <Stat label="待发（未发货）" value={progress.remaining} tone="text-brandhi" />
        </div>
        {loading ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-faint">
            <Spinner className="!h-3.5 !w-3.5" /> 正在读取该合同的全部发货记录…
          </div>
        ) : (
          <div className="mt-2">
            <div className="h-1.5 rounded-full bg-steel/25 overflow-hidden">
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress.percent ?? 0}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-faint">
              <span className="flex items-center gap-2">
                {progress.status ? (
                  <Pill tone={pillTone(SHIPMENT_STATUS, progress.status)}>合同发货状态：{label(SHIPMENT_STATUS, progress.status)}</Pill>
                ) : null}
                <span>
                  已发货 {progress.shipped} / {machinesKnown ? `${progress.machines} 台` : "合同台数未知"}（{progress.percent ?? 0}%）
                </span>
              </span>
              <span>共 {shipments.length} 条发货记录</span>
            </div>
            {progress.over ? (
              <div className="mt-1.5 text-[11px] text-warn">
                已发货 {progress.shipped} 台超过合同台数 {progress.machines} 台，请核对发货记录与合同明细。
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 md:grid-cols-2">
        <div>
          <div className="label mb-1.5">客户信息</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <div className="col-span-2">
              <span className="label block mb-0.5">客户名称</span>
              <button
                type="button"
                className="text-left font-medium text-brandhi hover:underline disabled:text-ink disabled:no-underline"
                disabled={!customerId}
                onClick={() => navigate(`/customers/${customerId}`)}
              >
                {customer?.companyName || shipment.contract?.customer?.companyName || "—"}
              </button>
            </div>
            <div>
              <span className="label block mb-0.5">联系人</span>
              <span className="text-dim">{customer?.contactName || shipment.contract?.customer?.contactName || "—"}</span>
            </div>
            <div>
              <span className="label block mb-0.5">联系电话</span>
              <span className="mono text-dim">{loading ? "…" : customer?.phone || "—"}</span>
            </div>
            <div className="col-span-2">
              <span className="label block mb-0.5">所在地区</span>
              <span className="text-dim">
                {[customer?.province, customer?.city].filter(Boolean).join(" ") || customer?.region || shipment.contract?.customer?.region || "—"}
              </span>
            </div>
          </div>
        </div>
        <div>
          <div className="label mb-1.5">合同信息</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            <div>
              <span className="label block mb-0.5">合同号</span>
              <button
                type="button"
                className="mono text-xs text-brandhi hover:underline disabled:text-dim disabled:no-underline"
                disabled={!contractId}
                onClick={() => navigate(`/contracts/${contractId}`)}
              >
                {detail?.contractNo || shipment.contract?.contractNo || "—"}
              </button>
            </div>
            <div>
              <span className="label block mb-0.5">合同状态</span>
              {detail?.contractStatus ? (
                <Pill tone={pillTone(CONTRACT_STATUS, detail.contractStatus)}>{label(CONTRACT_STATUS, detail.contractStatus)}</Pill>
              ) : (
                <span className="text-dim">{loading ? "…" : "—"}</span>
              )}
            </div>
            <div className="col-span-2">
              <span className="label block mb-0.5">设备</span>
              <span className="text-dim">{equipment || "—"}</span>
            </div>
            <div>
              <span className="label block mb-0.5">合同金额</span>
              <span className="mono text-dim">{detail ? money(detail.amount, detail.currency || "CNY") : loading ? "…" : "—"}</span>
            </div>
            <div>
              <span className="label block mb-0.5">回款状态</span>
              {detail?.paymentStatus ? (
                <Pill tone={pillTone(PAYMENT_STATUS, detail.paymentStatus)}>{label(PAYMENT_STATUS, detail.paymentStatus)}</Pill>
              ) : (
                <span className="text-dim">{loading ? "…" : "—"}</span>
              )}
            </div>
            <div>
              <span className="label block mb-0.5">已收 / 未收</span>
              <span className="mono text-xs text-dim">
                {detail ? `${money(detail.paidAmount, detail.currency || "CNY")} / ${money(detail.unpaidAmount ?? Number(detail.amount || 0) - Number(detail.paidAmount || 0), detail.currency || "CNY")}` : loading ? "…" : "—"}
              </span>
            </div>
            <div>
              <span className="label block mb-0.5">预计发货</span>
              <span className="mono text-xs text-dim">{detail?.estimatedShipmentDate ? date(detail.estimatedShipmentDate) : loading ? "…" : "—"}</span>
            </div>
            <div>
              <span className="label block mb-0.5">签订日期</span>
              <span className="mono text-xs text-dim">{detail?.signedDate ? date(detail.signedDate) : loading ? "…" : "—"}</span>
            </div>
            <div>
              <span className="label block mb-0.5">销售负责人</span>
              <span className="text-dim">{detail?.salesUser?.name || shipment.contract?.salesUser?.name || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 md:grid-cols-2">
        <div>
          <span className="label block mb-0.5">本单收货地址</span>
          <span className="text-dim">{shipment.receivingAddress || "—"}</span>
        </div>
        <div>
          <span className="label block mb-0.5">本单司机电话</span>
          <span className="mono text-dim">{shipment.driverPhone || "—"}</span>
        </div>
        <div>
          <span className="label block mb-0.5">本单备注</span>
          <span className="text-dim">{shipment.remark || "—"}</span>
        </div>
        <div>
          <span className="label block mb-0.5">本单单据</span>
          <span className="flex gap-3">
            {shipment.deliveryNoteUrl ? (
              <button type="button" className="text-brandhi hover:underline" onClick={() => openShipmentAttachment(shipment.deliveryNoteUrl, "发货单")}>
                发货单
              </button>
            ) : null}
            {shipment.shipmentPhotoUrl ? (
              <button type="button" className="text-brandhi hover:underline" onClick={() => openShipmentAttachment(shipment.shipmentPhotoUrl, "发货照片")}>
                发货照片
              </button>
            ) : null}
            {!shipment.deliveryNoteUrl && !shipment.shipmentPhotoUrl ? <span className="text-dim">—</span> : null}
          </span>
        </div>
      </div>

      <div>
        <div className="label mb-2">该合同全部发货记录（{shipments.length}）</div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-faint">
            <Spinner className="!h-3.5 !w-3.5" /> 加载中…
          </div>
        ) : shipments.length === 0 ? (
          <div className="text-xs text-faint">该合同暂无其他发货记录</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface/70">
            <table className="w-full border-collapse" style={{ minWidth: "720px" }}>
              <thead>
                <tr>
                  <th className="th">发货日期</th>
                  <th className="th">设备</th>
                  <th className="th">数量</th>
                  <th className="th">状态</th>
                  <th className="th">收货地址</th>
                  <th className="th">司机电话</th>
                  <th className="th w-24">单据</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((item) => (
                  <tr key={item.id} className={item.id === shipment.id ? "bg-brand/5" : undefined}>
                    <td className="td mono text-xs">
                      {date(item.shipmentDate)}
                      {item.id === shipment.id ? <span className="ml-1.5 text-[10px] text-brandhi">当前</span> : null}
                    </td>
                    <td className="td text-xs text-dim">{item.equipmentName || "—"}</td>
                    <td className="td mono text-xs">× {item.quantity ?? "—"}</td>
                    <td className="td">
                      <Pill tone={pillTone(SHIPMENT_STATUS, item.shipmentStatus)}>{label(SHIPMENT_STATUS, item.shipmentStatus)}</Pill>
                    </td>
                    <td className="td text-xs text-dim">
                      <div className="max-w-[260px] truncate" title={item.receivingAddress || undefined}>
                        {item.receivingAddress || "—"}
                      </div>
                    </td>
                    <td className="td mono text-xs text-dim">{item.driverPhone || "—"}</td>
                    <td className="td whitespace-nowrap">
                      {item.deliveryNoteUrl || item.shipmentPhotoUrl ? (
                        <div className="flex gap-2">
                          {item.deliveryNoteUrl ? (
                            <button type="button" className="text-xs text-brandhi hover:underline" onClick={() => openShipmentAttachment(item.deliveryNoteUrl, "发货单")}>
                              发货单
                            </button>
                          ) : null}
                          {item.shipmentPhotoUrl ? (
                            <button type="button" className="text-xs text-brandhi hover:underline" onClick={() => openShipmentAttachment(item.shipmentPhotoUrl, "发货照片")}>
                              照片
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-faint">无</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
