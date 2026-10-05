import { useEffect, useState } from "react";
import { Plus, Paperclip, Trash2, X } from "lucide-react";
import { ApiError, api, uploadFile } from "../lib/api";
import {
  CUSTOMER_STATUS,
  CUSTOMER_LEVEL,
  CUSTOMER_TYPE,
  CUSTOMER_SOURCES,
  CONTRACT_STATUS,
  FOLLOW_TYPE,
  PAYMENT_METHODS,
  CURRENCIES,
  label,
  money,
  moneyFull,
} from "../lib/format";
import { Sheet, Spinner, notify, SearchSelect } from "./ui";
import { AttachmentLink } from "./attachment-preview";
import { attachmentName } from "../lib/attachments";
import { buildQuoteContractPayload, duplicateQuoteContractId, quoteToContractItems, type ContractCreateResult } from "../lib/quotes";
import { navigate } from "../lib/navigation";
import { PROVINCE_CITY_MAP, PROVINCE_OPTIONS } from "../lib/region-data";
import type { CustomerRow, ContractRow, ContractPaymentRow, ProductRow, QuoteContractSource } from "../types";

interface SalesUserOption {
  id: string;
  name: string;
  role?: string;
  region?: string;
}

/** 今天 yyyy-mm-dd（本地时区），date 输入框默认值用 */
function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 表单底部按钮行：取消 + 提交（保存中带转圈） */
function FormActions({ onCancel, saving, text = "保存" }: { onCancel: () => void; saving: boolean; text?: string }) {
  return (
    <div className="mt-1 flex items-center justify-end gap-2 border-t border-line/60 pt-3.5">
      <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
        取消
      </button>
      <button type="submit" className="btn-brand" disabled={saving}>
        {saving ? <Spinner className="!h-4 !w-4" /> : text}
      </button>
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-bad/25 bg-bad/10 px-3 py-2 text-xs text-bad">{message}</div>
  );
}

/* ================= 客户新增 / 编辑 ================= */

export function CustomerFormSheet({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!customer;
  const [salesUsers, setSalesUsers] = useState<SalesUserOption[]>([]);
  const [f, setF] = useState({
    companyName: customer?.companyName || "",
    contactName: customer?.contactName || "",
    phone: customer?.phone || "",
    wechat: customer?.wechat || "",
    whatsapp: customer?.whatsapp || "",
    email: customer?.email || "",
    province: customer?.province || "",
    city: customer?.city || "",
    address: customer?.address || "",
    customerSource: customer?.customerSource || (customer ? "" : "展会"),
    customerType: customer?.customerType || (customer ? "" : "NEW"),
    customerLevel: customer?.customerLevel || "B",
    status: customer?.status || "NEW_LEAD",
    assignedUserId: customer?.assignedUser?.id || "",
    remark: customer?.remark || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [usersErr, setUsersErr] = useState("");
  const [duplicateTip, setDuplicateTip] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  // 归属业务员下拉（服务端按权限裁剪：普通销售只返回自己）。
  // 失败必须显性化：否则下拉只剩"无匹配项"，用户会以为"改不了负责人"。
  useEffect(() => {
    api<SalesUserOption[]>("/api/users/active")
      .then((rows) => {
        setSalesUsers(Array.isArray(rows) ? rows : []);
        setUsersErr(Array.isArray(rows) ? "" : "业务员列表格式异常");
      })
      .catch((error) => {
        setSalesUsers([]);
        setUsersErr(`业务员列表加载失败：${(error as Error).message}`);
      });
  }, []);

  /** forceCreate=true 时带 _forceCreate 跳过平台重复客户拦截（与网页端二次确认一致） */
  const submit = async (e: React.FormEvent | null, forceCreate = false) => {
    e?.preventDefault();
    if (saving) return;
    setErr("");
    setDuplicateTip("");
    // 必填项与平台对齐：新建走 createCustomer 的六项校验；编辑走 PUT，平台只强制公司/联系人
    const missing: string[] = [];
    if (!f.companyName.trim()) missing.push("公司名称");
    if (!f.contactName.trim()) missing.push("联系人");
    if (!editing) {
      if (!f.province.trim()) missing.push("省份");
      if (!f.customerSource) missing.push("客户来源");
      if (!f.customerType) missing.push("客户类型");
      if (!f.customerLevel) missing.push("客户等级");
    }
    if (missing.length) {
      setErr(`${missing.join("、")}为必填项`);
      return;
    }
    setSaving(true);
    try {
      const body = forceCreate ? { ...f, _forceCreate: true } : f;
      if (editing) await api(`/api/customers/${customer!.id}`, { method: "PUT", body });
      else await api("/api/customers", { method: "POST", body });
      notify(editing ? "客户已更新" : "客户已创建");
      onSaved();
      onClose();
    } catch (error) {
      const apiError = error as ApiError;
      // 平台 409 会返回 {duplicate}：给出"仍然保存"，与网页端 _forceCreate 流程一致
      if (!editing && apiError.status === 409 && apiError.data?.duplicate) {
        setDuplicateTip(apiError.message || "系统发现可能重复客户，请确认是否继续保存");
      } else {
        setErr(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={editing ? "编辑客户" : "新建客户"} subtitle={editing ? customer!.companyName : "保存后进入客户列表"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <FormError message={err} />}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">公司名称 *</span>
            <input className="input" value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="客户公司全称" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">联系人 *</span>
            <input className="input" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="主要联系人" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">联系电话</span>
            <input className="input mono" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="手机 / 座机" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">微信</span>
            <input className="input" value={f.wechat} onChange={(e) => set("wechat", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">WhatsApp</span>
            <input className="input mono" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">邮箱</span>
            <input className="input mono" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">省 *</span>
            <SearchSelect
              value={f.province}
              onChange={(v) => setF((prev) => ({ ...prev, province: v, city: PROVINCE_CITY_MAP[v]?.length ? prev.city : "" }))}
              placeholder="选择省份"
              options={PROVINCE_OPTIONS.map((p) => ({ value: p, label: p }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">市</span>
            <SearchSelect
              value={f.city}
              onChange={(v) => set("city", v)}
              placeholder={f.province && !(PROVINCE_CITY_MAP[f.province] || []).length ? "该省不细分到市" : "选择城市"}
              emptyText={f.province ? "该省不细分到市，可直接保存" : "请先选择省份"}
              options={(PROVINCE_CITY_MAP[f.province] || []).map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">客户来源</span>
            <select className="input" value={f.customerSource} onChange={(e) => set("customerSource", e.target.value)}>
              <option value="">未选择</option>
              {CUSTOMER_SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">客户类型 *</span>
            <select className="input" value={f.customerType} onChange={(e) => set("customerType", e.target.value)}>
              <option value="">未选择</option>
              {Object.entries(CUSTOMER_TYPE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">客户等级 *</span>
            <select className="input" value={f.customerLevel} onChange={(e) => set("customerLevel", e.target.value)}>
              {Object.keys(CUSTOMER_LEVEL).map((l) => (
                <option key={l} value={l}>{label(CUSTOMER_LEVEL, l)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">客户状态</span>
            <select className="input" value={f.status} onChange={(e) => set("status", e.target.value)}>
              {Object.keys(CUSTOMER_STATUS).map((s) => (
                <option key={s} value={s}>{label(CUSTOMER_STATUS, s)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">归属业务员 / 负责人</span>
            <SearchSelect
              value={f.assignedUserId}
              onChange={(v) => set("assignedUserId", v)}
              placeholder="未指定（可在列表再分配）"
              searchPlaceholder="搜索业务员姓名…"
              options={salesUsers.map((u) => ({
                value: u.id,
                label: u.name || u.id,
                sub: [u.role === "SUPER_ADMIN" ? "超管" : u.region, u.role === "SALES" ? "销售" : ""].filter(Boolean).join(" · ") || undefined,
              }))}
            />
            {usersErr && <span className="text-xs text-bad">{usersErr}</span>}
            {!usersErr && salesUsers.length <= 1 && (
              <span className="text-xs text-faint">
                当前账号只能看到自己的归属（平台按数据权限裁剪）；如需分配给他人请用管理员账号。
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">地址</span>
            <input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">备注</span>
            <textarea className="input resize-none" rows={2} value={f.remark} onChange={(e) => set("remark", e.target.value)} />
          </div>
        </div>
        {duplicateTip && (
          <div className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2.5 text-xs text-warn">
            <p>{duplicateTip}</p>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" className="btn-brand !py-1.5 text-xs" disabled={saving} onClick={() => void submit(null, true)}>
                确认继续保存
              </button>
              <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => setDuplicateTip("")}>
                取消
              </button>
            </div>
          </div>
        )}
        <FormActions onCancel={onClose} saving={saving} />
      </form>
    </Sheet>
  );
}

/* ================= 跟进记录 ================= */

export function FollowFormSheet({
  customer,
  onClose,
  onSaved,
}: {
  customer: CustomerRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({ followType: "PHONE", content: "", result: "", nextFollowDate: "", newStatus: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    if (!f.content.trim()) {
      setErr("请填写跟进内容");
      return;
    }
    setSaving(true);
    try {
      await api("/api/follows", {
        method: "POST",
        body: {
          customerId: customer.id,
          followType: f.followType,
          content: f.content.trim(),
          result: f.result.trim() || null,
          nextFollowDate: f.nextFollowDate || null,
          newStatus: f.newStatus || null,
        },
      });
      notify("跟进记录已保存");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title="写跟进" subtitle={customer.companyName} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <FormError message={err} />}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="label">跟进方式</span>
            <select className="input" value={f.followType} onChange={(e) => set("followType", e.target.value)}>
              {Object.entries(FOLLOW_TYPE).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">更新客户状态（可选）</span>
            <select className="input" value={f.newStatus} onChange={(e) => set("newStatus", e.target.value)}>
              <option value="">不修改</option>
              {Object.keys(CUSTOMER_STATUS).map((s) => (
                <option key={s} value={s}>{label(CUSTOMER_STATUS, s)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">跟进内容 *</span>
            <textarea
              className="input resize-none"
              rows={4}
              value={f.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="沟通要点、客户反馈、报价情况……"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">跟进结果（可选）</span>
            <input className="input" value={f.result} onChange={(e) => set("result", e.target.value)} placeholder="如：已试机，满意" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">下次跟进日期（可选）</span>
            <input className="input" type="date" value={f.nextFollowDate} onChange={(e) => set("nextFollowDate", e.target.value)} />
          </div>
        </div>
        <FormActions onCancel={onClose} saving={saving} text="保存跟进" />
      </form>
    </Sheet>
  );
}

/* ================= 合同新增 / 编辑 ================= */

interface ItemLine {
  productId: string;
  quantity: string;
  contractPrice: string;
  estimatedShipmentDate?: string;
}

export function ContractFormSheet({
  contract,
  quote = null,
  onClose,
  onSaved,
}: {
  contract: ContractRow | null;
  /** 由报价一键转合同时传入：明细只读展示，提交走 sourceQuoteId 由平台重建明细 */
  quote?: QuoteContractSource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!contract;
  const fromQuote = !editing && !!quote;
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState({
    customerId: contract?.customer?.id || quote?.customerId || "",
    contractNo: contract?.contractNo || "",
    signedDate: contract?.signedDate ? String(contract.signedDate).slice(0, 10) : today(),
    estimatedShipmentDate: contract?.estimatedShipmentDate ? String(contract.estimatedShipmentDate).slice(0, 10) : "",
    currency: contract?.currency || quote?.currency || "CNY",
    contractStatus: contract?.contractStatus || "SIGNED",
    attachmentUrl: contract?.attachmentUrl || "",
    remark: contract?.remark || quote?.remark || "",
  });
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  // 明细行从已有合同回填；金额一律按明细自动汇总（与网页端口径一致）
  // 支持多个主产品（后端允许多个 MAIN 类型明细）
  const [mainLines, setMainLines] = useState<ItemLine[]>(() => {
    if (fromQuote) {
      return quoteToContractItems(quote!.items)
        .filter((item) => item.itemType === "MAIN")
        .map((item) => ({ productId: item.productId, quantity: String(item.quantity), contractPrice: String(item.contractPrice) }));
    }
    const mains = (contract?.items || []).filter((i) => i.itemType === "MAIN");
    return mains.length > 0
      ? mains.map((m) => ({
          productId: m.productId || "",
          quantity: String(m.quantity ?? 1),
          contractPrice: String(Number(m.contractPrice ?? 0)),
          estimatedShipmentDate: m.estimatedShipmentDate ? String(m.estimatedShipmentDate).slice(0, 10) : ""
        }))
      : [{ productId: "", quantity: "1", contractPrice: "", estimatedShipmentDate: "" }];
  });
  const [optionals, setOptionals] = useState<ItemLine[]>(() => {
    if (fromQuote) {
      return quoteToContractItems(quote!.items)
        .filter((item) => item.itemType !== "MAIN")
        .map((item) => ({ productId: item.productId, quantity: String(item.quantity), contractPrice: String(item.contractPrice) }));
    }
    return (contract?.items || [])
      .filter((i) => i.itemType !== "MAIN")
      .map((i) => ({
        productId: i.productId || "",
        quantity: String(i.quantity ?? 1),
        contractPrice: String(Number(i.contractPrice ?? 0)),
        estimatedShipmentDate: i.estimatedShipmentDate ? String(i.estimatedShipmentDate).slice(0, 10) : ""
      }));
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      // 注意：后端限制每页最多100条，如果客户总数超过100，部分客户可能不在下拉列表中
      // TODO: 实现服务端关键词搜索和分页加载
      api<{ customers: CustomerRow[] }>("/api/customers", { query: { page: "1", pageSize: "100" } }),
      api<ProductRow[]>("/api/products"),
    ])
      .then(([c, p]) => {
        if (!alive) return;
        // 如果正在编辑且当前客户不在列表中，手动添加
        if (editing && contract?.customer && !c.customers.find((customer) => customer.id === contract.customer?.id)) {
          // 补充客户完整字段以匹配 CustomerRow 类型
          setCustomers([{
            ...contract.customer,
            contactName: contract.customer.contactName || "",
            customerLevel: "C",
            status: "WON",
            createdAt: new Date().toISOString(),
          }, ...c.customers]);
        } else {
          setCustomers(c.customers || []);
        }
        setProducts(p || []);
      })
      .catch((e) => alive && setLoadErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [editing, contract]);

  const mains = (products || []).filter((p) => p.productType === "MAIN");
  const optionalProducts = (products || []).filter((p) => p.productType === "OPTIONAL");

  const pickMain = (index: number, productId: string) => {
    setMainLines((prev) =>
      prev.map((line, i) => {
        if (i !== index || line.productId === productId) return line;
        const product = mains.find((m) => m.id === productId);
        return {
          productId,
          quantity: line.quantity || "1",
          contractPrice: String(Number(product?.factoryPrice ?? 0)),
          estimatedShipmentDate: line.estimatedShipmentDate || ""
        };
      }),
    );
  };
  const addMainLine = () => {
    setMainLines((prev) => [...prev, { productId: "", quantity: "1", contractPrice: "", estimatedShipmentDate: "" }]);
  };
  const removeMainLine = (index: number) => {
    setMainLines((prev) => prev.filter((_, i) => i !== index));
  };
  const updateMainLine = (index: number, field: keyof ItemLine, value: string) => {
    setMainLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };
  const pickOptional = (index: number, productId: string) => {
    setOptionals((prev) =>
      prev.map((line, i) => {
        if (i !== index || line.productId === productId) return line;
        const product = optionalProducts.find((m) => m.id === productId);
        return {
          productId,
          quantity: line.quantity || "1",
          contractPrice: String(Number(product?.factoryPrice ?? 0)),
          estimatedShipmentDate: line.estimatedShipmentDate || ""
        };
      }),
    );
  };
  const addOptional = () => {
    setOptionals((prev) => [...prev, { productId: "", quantity: "1", contractPrice: "", estimatedShipmentDate: "" }]);
  };
  const removeOptional = (index: number) => {
    setOptionals((prev) => prev.filter((_, i) => i !== index));
  };
  const updateOptional = (index: number, field: keyof ItemLine, value: string) => {
    setOptionals((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const linesAmount = (lines: ItemLine[]) =>
    lines.reduce((sum, l) => sum + (Number(l.contractPrice) || 0) * (Number(l.quantity) || 0), 0);
  const totalAmount = linesAmount([...mainLines, ...optionals]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    if (!f.customerId) {
      setErr("请选择客户");
      return;
    }
    if (!editing && !f.contractNo.trim()) {
      setErr("请填写合同编号");
      return;
    }
    if (fromQuote) {
      // 报价转合同：平台按报价明细重建合同明细，这里只提交合同要素（客户必须与报价一致）
      setSaving(true);
      try {
        const body = buildQuoteContractPayload({
          customerId: f.customerId,
          quoteId: quote!.id,
          contractNo: f.contractNo,
          currency: f.currency,
          remark: f.remark,
          signedDate: f.signedDate,
          contractStatus: f.contractStatus,
          estimatedShipmentDate: f.estimatedShipmentDate,
          attachmentUrl: f.attachmentUrl,
        });
        const created = await api<ContractCreateResult>("/api/contracts", { method: "POST", body });
        notify("已按报价生成合同");
        onSaved();
        onClose();
        // 与网页端一致：转完合同直接进新合同详情，用户能立刻核对明细与附件
        if (created?.id) navigate(`/contracts/${created.id}`);
      } catch (error) {
        // 该报价已生成过合同：平台 409 带既有 contractId，跳过去而不是让用户停在报错上
        const existingId = duplicateQuoteContractId(error);
        if (existingId) {
          notify("该报价已生成合同，已为你打开");
          onSaved();
          onClose();
          navigate(`/contracts/${existingId}`);
          return;
        }
        setErr((error as Error).message);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (mainLines.length === 0 || mainLines.every((l) => !l.productId)) {
      setErr("请至少选择一个主产品");
      return;
    }
    if (mainLines.some((l) => !l.productId)) {
      setErr("主产品有未选择的行，请补全或删除");
      return;
    }
    if (optionals.some((l) => !l.productId)) {
      setErr("选配件有未选择产品的行，请补全或删除");
      return;
    }
    const items = [
      ...mainLines.map((l, i) => ({
        productId: l.productId,
        itemType: "MAIN" as const,
        contractPrice: Number(l.contractPrice || 0),
        quantity: Number(l.quantity || 1),
        estimatedShipmentDate: l.estimatedShipmentDate || null,
        sortOrder: i,
      })),
      ...optionals.map((l, i) => ({
        productId: l.productId,
        itemType: "OPTIONAL" as const,
        contractPrice: Number(l.contractPrice || 0),
        quantity: Number(l.quantity || 1),
        estimatedShipmentDate: l.estimatedShipmentDate || null,
        sortOrder: mainLines.length + i,
      })),
    ];
    setSaving(true);
    try {
      const body = {
        customerId: f.customerId,
        signedDate: f.signedDate || undefined,
        estimatedShipmentDate: f.estimatedShipmentDate || null,
        currency: f.currency,
        contractStatus: f.contractStatus,
        attachmentUrl: f.attachmentUrl || null,
        remark: f.remark.trim() || null,
        items,
        contractNo: f.contractNo.trim(),
      };
      if (editing) await api(`/api/contracts/${contract!.id}`, { method: "PUT", body });
      else await api("/api/contracts", { method: "POST", body });
      notify(editing ? "合同已更新" : "合同已创建");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? "编辑合同" : fromQuote ? "由报价生成合同" : "新建合同"}
      subtitle={
        editing
          ? `${contract!.contractNo} · 金额按明细自动汇总`
          : fromQuote
            ? "报价明细将由平台自动写入合同，填写合同编号后即可创建"
            : "金额按明细自动汇总，与网页端口径一致"
      }
      onClose={onClose}
    >
      {loadErr && <FormError message={`基础数据加载失败：${loadErr}`} />}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <FormError message={err} />}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">客户 *</span>
            <SearchSelect
              value={f.customerId}
              onChange={(v) => set("customerId", v)}
              placeholder={customers === null ? "客户列表加载中……" : "点击选择客户，支持按名称搜索"}
              searchPlaceholder="输入公司名称筛选…"
              disabled={customers === null || fromQuote}
              options={(customers || []).map((c) => ({
                value: c.id,
                label: c.companyName,
                sub: [c.contactName, [c.province, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || undefined,
              }))}
            />
            {fromQuote && <span className="text-xs text-faint">报价转合同的客户不可更改（平台会校验来源报价与合同客户是否一致）</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">合同编号 *</span>
            <input
              className="input mono"
              value={f.contractNo}
              onChange={(e) => set("contractNo", e.target.value)}
              placeholder="如：S260824157"
              disabled={editing && contract?.isLocked === true}
              title={editing && contract?.isLocked ? "合同已锁定，编号需先申请解锁" : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">币种</span>
            <select className="input" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              {Object.entries(CURRENCIES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">签订日期</span>
            <input className="input" type="date" value={f.signedDate} onChange={(e) => set("signedDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">预计发货日期</span>
            <input className="input" type="date" value={f.estimatedShipmentDate} onChange={(e) => set("estimatedShipmentDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">合同状态</span>
            <select className="input" value={f.contractStatus} onChange={(e) => set("contractStatus", e.target.value)}>
              {Object.keys(CONTRACT_STATUS).map((s) => (
                <option key={s} value={s}>{label(CONTRACT_STATUS, s)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <span className="label">合同附件（PDF / Word / JPG / PNG，≤20MB）</span>
            <div className="flex items-center gap-2">
              <input
                className="input"
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setErr("");
                  try {
                    const result = await uploadFile<{ url: string }>("/api/upload/contracts", file);
                    set("attachmentUrl", result.url || "");
                    notify("附件已上传");
                  } catch (error) {
                    setErr((error as Error).message);
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
              {uploading && <Spinner className="!h-4 !w-4" />}
              {f.attachmentUrl && (
                <button type="button" className="btn-ghost !py-1.5 text-xs shrink-0" onClick={() => set("attachmentUrl", "")}>
                  <Trash2 size={13} /> 移除
                </button>
              )}
            </div>
            {f.attachmentUrl && (
              <AttachmentLink
                path={f.attachmentUrl}
                className="inline-flex max-w-full items-center gap-1.5 text-xs text-brandhi hover:underline"
              >
                <Paperclip size={12} />
                <span className="truncate">已上传：{attachmentName(f.attachmentUrl)}</span>
              </AttachmentLink>
            )}
          </div>
        </div>

        {fromQuote ? (
          <div className="panel px-3.5 py-3">
            <div className="label mb-2">合同明细（由报价自动生成，不可在此修改）</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="th">类型</th>
                    <th className="th">产品</th>
                    <th className="th">合同价 × 数量</th>
                    <th className="th">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteToContractItems(quote!.items).map((item, index) => (
                    <tr key={`${item.productId}-${index}`}>
                      <td className="td">{item.itemType === "MAIN" ? "产品" : "选配"}</td>
                      <td className="td">{item.label || "—"}</td>
                      <td className="td mono whitespace-nowrap">{money(item.contractPrice, f.currency)} × {item.quantity}</td>
                      <td className="td mono whitespace-nowrap text-brandhi">{money(item.contractPrice * item.quantity, f.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-faint">
              平台会用报价明细重建合同明细（含数量与报价单价）；本表单另提交合同编号、客户、币种、状态、签订日期、预计发货日期、备注与附件，其余明细请先修改报价。
            </p>
          </div>
        ) : (
          <>
        {/* 主产品明细 */}
        <div className="panel px-3.5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="label">主产品 *（可添加多个）</span>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              disabled={mains.length === 0}
              onClick={addMainLine}
            >
              <Plus size={13} /> 添加主产品
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {mainLines.map((line, index) => (
              <div key={index} className="space-y-2">
                <div className="grid grid-cols-[1fr_72px_110px_28px] gap-2 items-center">
                  <SearchSelect
                    value={line.productId}
                    onChange={(v) => pickMain(index, v)}
                    placeholder={products === null ? "产品库加载中……" : "选择主产品，支持搜索型号"}
                    searchPlaceholder="输入型号/品类筛选…"
                    disabled={products === null}
                    options={mains.map((p) => ({
                      value: p.id,
                      label: p.model,
                      sub: [p.category, p.factoryPrice != null ? `出厂价 ¥${Number(p.factoryPrice).toLocaleString("zh-CN")}` : ""].filter(Boolean).join(" · ") || undefined,
                    }))}
                  />
                  <input
                    className="input !py-2 mono text-center"
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) => updateMainLine(index, "quantity", e.target.value)}
                    title="数量"
                  />
                  <input
                    className="input !py-2 mono text-right"
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.contractPrice}
                    onChange={(e) => updateMainLine(index, "contractPrice", e.target.value)}
                    placeholder="合同价"
                    title="合同价"
                  />
                  <button
                    type="button"
                    className="btn-ghost !px-0 !py-2 hover:!border-bad/60 hover:text-bad"
                    title="删除该行"
                    onClick={() => removeMainLine(index)}
                    disabled={mainLines.length === 1}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="pl-1">
                  <input
                    className="input !py-1.5 text-xs w-44"
                    type="date"
                    value={line.estimatedShipmentDate || ""}
                    onChange={(e) => updateMainLine(index, "estimatedShipmentDate", e.target.value)}
                    placeholder="预计发货日期"
                    title="此明细的预计发货日期"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 选配件明细 */}
        <div className="panel px-3.5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="label">选配件（可选）</span>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              disabled={optionalProducts.length === 0}
              onClick={addOptional}
            >
              <Plus size={13} /> 添加选配件
            </button>
          </div>
          {optionals.length === 0 ? (
            <div className="text-xs text-faint py-1">暂无选配件</div>
          ) : (
            <div className="flex flex-col gap-2">
              {optionals.map((line, index) => (
                <div key={index} className="space-y-2">
                  <div className="grid grid-cols-[1fr_72px_110px_28px] gap-2 items-center">
                    <SearchSelect
                      value={line.productId}
                      onChange={(v) => pickOptional(index, v)}
                      placeholder="选择选配件，支持搜索"
                      searchPlaceholder="输入型号筛选…"
                      options={optionalProducts.map((p) => ({
                        value: p.id,
                        label: p.model,
                        sub: p.factoryPrice != null ? `出厂价 ¥${Number(p.factoryPrice).toLocaleString("zh-CN")}` : undefined,
                      }))}
                    />
                    <input
                      className="input !py-2 mono text-center"
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateOptional(index, "quantity", e.target.value)}
                      title="数量"
                    />
                    <input
                      className="input !py-2 mono text-right"
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.contractPrice}
                      onChange={(e) => updateOptional(index, "contractPrice", e.target.value)}
                      placeholder="合同价"
                      title="合同价"
                    />
                    <button
                      type="button"
                      className="btn-ghost !px-0 !py-2 hover:!border-bad/60 hover:text-bad"
                      title="删除该行"
                      onClick={() => removeOptional(index)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="pl-1">
                    <input
                      className="input !py-1.5 text-xs w-44"
                      type="date"
                      value={line.estimatedShipmentDate || ""}
                      onChange={(e) => updateOptional(index, "estimatedShipmentDate", e.target.value)}
                      placeholder="预计发货日期"
                      title="此明细的预计发货日期"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          </>
        )}

        <div className="flex items-center justify-between px-1">
          <span className="label">合同金额（按明细自动汇总）</span>
          <span className="mono text-lg font-semibold text-brandhi">{moneyFull(totalAmount, f.currency)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="label">备注</span>
          <textarea className="input resize-none" rows={2} value={f.remark} onChange={(e) => set("remark", e.target.value)} />
        </div>

        <FormActions onCancel={onClose} saving={saving} text={editing ? "保存修改" : "创建合同"} />
      </form>
    </Sheet>
  );
}

/* ================= 回款登记 ================= */

export function PaymentFormSheet({
  contract,
  payment,
  onClose,
  onSaved,
}: {
  contract: ContractRow;
  /** 传入表示编辑既有回款（平台 PUT /api/contracts/{id}/payments/{paymentId}） */
  payment?: ContractPaymentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!payment;
  const amount = Number(contract.amount || 0);
  const paid = Number(contract.paidAmount || 0);
  const unpaid = contract.unpaidAmount != null ? Number(contract.unpaidAmount) : Math.max(0, amount - paid);
  const [f, setF] = useState({
    amount: payment ? String(payment.amount ?? "") : unpaid > 0 ? String(Math.round(unpaid * 100) / 100) : "",
    paymentDate: payment?.paymentDate ? String(payment.paymentDate).slice(0, 10) : today(),
    paymentMethod: payment?.paymentMethod || "银行转账",
    remark: payment?.remark || "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    const value = Number(f.amount);
    // 平台只拒绝 < 0，0 元回款是允许的（与网页端保持一致）
    if (!Number.isFinite(value) || value < 0) {
      setErr("请填写不小于 0 的回款金额");
      return;
    }
    if (!f.paymentDate) {
      setErr("请选择回款日期");
      return;
    }
    setSaving(true);
    try {
      const body = { amount: value, paymentDate: f.paymentDate, paymentMethod: f.paymentMethod, remark: f.remark.trim() || null };
      if (editing) await api(`/api/contracts/${contract.id}/payments/${payment!.id}`, { method: "PUT", body });
      else await api(`/api/contracts/${contract.id}/payments`, { method: "POST", body });
      notify(editing ? "回款已更新" : "回款已登记");
      onSaved();
      onClose();
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={editing ? "编辑回款" : "登记回款"}
      subtitle={`${contract.contractNo} · ${contract.customer?.companyName || ""}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {err && <FormError message={err} />}
        <div className="panel panel-glow flex items-center justify-between px-4 py-3 text-xs">
          <span className="text-faint">
            合同金额 <span className="mono text-ink">{moneyFull(amount, contract.currency)}</span>
          </span>
          <span className="text-faint">
            已收 <span className="mono text-ok">{moneyFull(paid, contract.currency)}</span>
          </span>
          <span className="text-faint">
            未收 <span className="mono text-warn">{moneyFull(unpaid, contract.currency)}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="label">回款金额 *</span>
            <input
              className="input mono"
              type="number"
              min={0.01}
              step="0.01"
              value={f.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="本次回款金额"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">回款日期 *</span>
            <input className="input" type="date" value={f.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">回款方式</span>
            <select className="input" value={f.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="label">备注</span>
            <input className="input" value={f.remark} onChange={(e) => set("remark", e.target.value)} placeholder="如：尾款" />
          </div>
        </div>
        <FormActions onCancel={onClose} saving={saving} text={editing ? "保存修改" : "登记回款"} />
      </form>
    </Sheet>
  );
}
