import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Search, RefreshCw, Plus, Pencil, ChevronDown } from "lucide-react";
import { api, getCachedUser } from "../lib/api";
import { SHIPMENT_STATUS, PROVINCE_OPTIONS, label, pillTone, date } from "../lib/format";
import { Spinner, Empty, ErrorTip, Pill, PageHeader, Dash } from "../components/ui";
import { ShipmentFormSheet, openShipmentAttachment, type ShipmentLike } from "../components/shipment-forms";
import { ShipmentDetailPanel } from "../components/shipment-detail";
import { navigate } from "../lib/navigation";

const STATUS_OPTIONS = ["NOT_SHIPPED", "PARTIAL_SHIPPED", "SHIPPED", "OVERDUE"];

/** 与平台发货页 CONTRACT_STATUS_OPTIONS 一致（含 PRODUCTION，值与平台 contractStatus 查询参数相同） */
const CONTRACT_STATUS_OPTIONS = [
  { value: "", label: "全部合同状态" },
  { value: "DRAFT", label: "草稿" },
  { value: "SIGNED", label: "已确认" },
  { value: "PRODUCTION", label: "生产中" },
  { value: "SHIPPED", label: "已发货" },
  { value: "COMPLETED", label: "已完成" },
  { value: "ARCHIVED", label: "已归档" },
  { value: "CANCELLED", label: "已取消" },
];

export default function ShipmentsView({ initialFilters }: { initialFilters?: Record<string, string | undefined> }) {
  const [search, setSearch] = useState(initialFilters?.search || "");
  const [status, setStatus] = useState(initialFilters?.status || "");
  const [contractStatus, setContractStatus] = useState(initialFilters?.contractStatus || "");
  const [province, setProvince] = useState(initialFilters?.province || "");
  const [salesUserId, setSalesUserId] = useState(initialFilters?.salesUserId || "");
  const [dateStart, setDateStart] = useState(initialFilters?.dateStart || "");
  const [dateEnd, setDateEnd] = useState(initialFilters?.dateEnd || "");
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<ShipmentLike[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState<null | { mode: "create" } | { mode: "edit"; shipment: ShipmentLike }>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await api<ShipmentLike[]>("/api/shipments", {
        query: {
          search,
          status,
          contractStatus: contractStatus || undefined,
          province: province || undefined,
          salesUserId: salesUserId || undefined,
          dateStart: dateStart || undefined,
          dateEnd: dateEnd || undefined,
          contractId: initialFilters?.contractId,
          customerId: initialFilters?.customerId,
          region: initialFilters?.region,
          businessLine: initialFilters?.businessLine,
          createdById: initialFilters?.createdById,
          kpiSalesUserId: initialFilters?.kpiSalesUserId,
        },
      });
      if (requestId !== loadRequestRef.current) return;
      setRows(res);
    } catch (err) {
      if (requestId === loadRequestRef.current) setError((err as Error).message);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [search, status, contractStatus, province, salesUserId, dateStart, dateEnd, initialFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    loadRequestRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // 业务员下拉（服务端按权限裁剪）
  useEffect(() => {
    api<{ id: string; name: string }[]>("/api/users/active")
      .then((list) => setSalesUsers(Array.isArray(list) ? list : []))
      .catch(() => setSalesUsers([]));
  }, []);

  const onSearchChange = (v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(v), 400);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-5 pb-4">
        <PageHeader title="发货管理" sub={`共 ${rows?.length ?? "…"} 条发货记录 · 单击任意行查看客户/合同详情与发货进度 · 只显示您权限范围内的数据`}>
          <button className="btn-brand" onClick={() => setForm({ mode: "create" })}>
            <Plus size={16} />
            登记发货
          </button>
          <button className="btn-ghost !px-2.5" title="刷新" onClick={load}>
            {loading ? <Spinner className="!w-4 !h-4" /> : <RefreshCw size={15} />}
          </button>
        </PageHeader>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input !pl-9"
              placeholder="搜索客户 / 合同号 / 设备"
              defaultValue={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <select className="input !w-auto min-w-[100px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部状态</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s === "OVERDUE" ? "已逾期" : label(SHIPMENT_STATUS, s)}</option>
            ))}
          </select>
          <select className="input !w-auto min-w-[120px]" value={contractStatus} onChange={(e) => setContractStatus(e.target.value)} aria-label="合同状态筛选">
            {CONTRACT_STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <select className="input !w-auto min-w-[100px]" value={province} onChange={(e) => setProvince(e.target.value)} aria-label="省份筛选">
            <option value="">全部省份</option>
            {PROVINCE_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select className="input !w-auto min-w-[100px]" value={salesUserId} onChange={(e) => setSalesUserId(e.target.value)} aria-label="业务员筛选">
            <option value="">全部业务员</option>
            {salesUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input className="input !w-36" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} placeholder="起始日期" />
          <input className="input !w-36" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} placeholder="截止日期" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-4">
        <div className="panel overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: "1120px" }}>
            <thead className="sticky top-0 bg-panel z-10">
              <tr>
                <th className="th">发货日期</th>
                <th className="th">客户</th>
                <th className="th">设备</th>
                <th className="th">合同号</th>
                <th className="th">数量</th>
                <th className="th">状态</th>
                <th className="th">销售负责人</th>
                <th className="th w-28">附件</th>
                <th className="th w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((s, i) => (
                <Fragment key={s.id}>
                  <tr
                    className="row-hover fade-up"
                    style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    title="点击查看发货详情：客户 / 合同信息与发货进度"
                  >
                    <td className="td mono text-xs">{date(s.shipmentDate)}</td>
                    <td className="td font-medium">
                      {/* 客户名可点：跳到客户档案；与平台发货页的客户链接一致 */}
                      {s.contract?.customer?.id ? (
                        <button
                          type="button"
                          className="text-left hover:text-brandhi hover:underline"
                          title="打开客户档案"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/customers/${s.contract!.customer!.id}`);
                          }}
                        >
                          {s.contract.customer.companyName || "—"}
                        </button>
                      ) : (
                        s.contract?.customer?.companyName || "—"
                      )}
                    </td>
                    <td className="td text-dim">
                      <div className="max-w-[220px] truncate">
                        {s.equipmentName || s.contract?.equipmentName || "—"}
                        {s.contract?.equipmentModel ? (
                          <span className="text-faint mono"> · {s.contract.equipmentModel}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="td mono text-xs text-dim">
                      {s.contract?.id ? (
                        <button
                          type="button"
                          className="hover:text-brandhi hover:underline"
                          title="打开合同详情"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/contracts/${s.contract!.id}`);
                          }}
                        >
                          {s.contract.contractNo || "—"}
                        </button>
                      ) : (
                        s.contract?.contractNo || "—"
                      )}
                    </td>
                    <td className="td mono">× {s.quantity}</td>
                    <td className="td">
                      <Pill tone={pillTone(SHIPMENT_STATUS, s.shipmentStatus)}>
                        {label(SHIPMENT_STATUS, s.shipmentStatus)}
                      </Pill>
                    </td>
                    <td className="td text-dim">{s.contract?.salesUser?.name || <Dash />}</td>
                    <td className="td whitespace-nowrap">
                      {s.deliveryNoteUrl || s.shipmentPhotoUrl ? (
                        <div className="flex gap-2">
                          {s.deliveryNoteUrl ? (
                            <button
                              type="button"
                              className="text-xs text-brandhi hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShipmentAttachment(s.deliveryNoteUrl, "发货单");
                              }}
                            >
                              发货单
                            </button>
                          ) : null}
                          {s.shipmentPhotoUrl ? (
                            <button
                              type="button"
                              className="text-xs text-brandhi hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShipmentAttachment(s.shipmentPhotoUrl, "发货照片");
                              }}
                            >
                              照片
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-faint">无</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1">
                        <button
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setForm({ mode: "edit", shipment: s });
                          }}
                          title="编辑发货记录"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn-ghost !px-2 !py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(expanded === s.id ? null : s.id);
                          }}
                          title={expanded === s.id ? "收起详情" : "查看详情"}
                          aria-expanded={expanded === s.id}
                        >
                          <ChevronDown size={13} className={expanded === s.id ? "rotate-180 transition-transform" : "transition-transform"} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {/* 详情就近展开在所点行下方：原先挂在整张表之后，行数一多就落到屏幕外，看起来像没反应 */}
                  {expanded === s.id && (
                    <tr>
                      <td colSpan={9} className="px-4 pb-4 pt-1">
                        <ShipmentDetailPanel shipment={s} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {loading && !rows && (
            <div className="py-16 flex justify-center">
              <Spinner />
            </div>
          )}
          {!loading && error && <ErrorTip message={error} onRetry={load} />}
          {!loading && !error && rows && rows.length === 0 && <Empty text="没有符合条件的发货记录" />}
        </div>
      </div>
      {form && (
        <ShipmentFormSheet
          shipment={form.mode === "edit" ? form.shipment : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
    </div>
  );
}
