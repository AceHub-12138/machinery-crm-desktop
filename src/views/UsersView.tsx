import { useEffect, useState } from "react";
import { Edit2, KeyRound, Plus, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { ROLE_LABEL } from "../lib/format";
import { showToast } from "../components/ui";
import { TerritoryPicker, type Territory } from "../components/TerritoryPicker";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "SALES" | "FOREIGN_TRADE" | "PURCHASE" | "WAREHOUSE";
  region?: string;
  territories?: Territory[];
  viewScope?: string;
  isActive: boolean;
  createdAt: string;
}

type UserRole = "SUPER_ADMIN" | "SALES" | "FOREIGN_TRADE" | "PURCHASE" | "WAREHOUSE";

const defaultCreateForm = {
  email: "",
  password: "",
  name: "",
  role: "SALES" as UserRole,
  territories: [] as Territory[],
  viewScope: "TERRITORY",
};

const defaultEditForm = {
  name: "",
  role: "SALES" as UserRole,
  territories: [] as Territory[],
  viewScope: "TERRITORY",
};

export default function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [transferUser, setTransferUser] = useState<UserRow | null>(null);
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferMessage, setTransferMessage] = useState("");
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  const receiverOptions = users.filter(
    (item) => item.isActive && item.id !== transferUser?.id
  );

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api<UserRow[]>(
        "/api/users",
        { query: showInactiveUsers ? { includeInactive: "1" } : undefined }
      );
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "用户列表加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [showInactiveUsers]);

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      showToast("姓名、账号和密码为必填项", "error");
      return;
    }
    if (createForm.password.length < 8) {
      showToast("密码至少需要 8 位", "error");
      return;
    }

    // 验证销售/外贸角色必须选择区域
    if (roleRequiresRegionScope(createForm.role) && createForm.viewScope !== "ALL") {
      if (createForm.territories.length === 0) {
        showToast("销售和外贸角色必须选择负责省市", "error");
        return;
      }
    }

    setSaving(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: createForm,
      });
      setShowCreateForm(false);
      setCreateForm(defaultCreateForm);
      showToast("用户已创建", "success");
      fetchUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "创建失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (target: UserRow) => {
    setEditingUser(target);
    setEditForm({
      name: target.name,
      role: target.role,
      territories: target.territories || [],
      viewScope: target.viewScope || "TERRITORY",
    });
  };

  const handleEdit = async () => {
    if (!editingUser) return;
    if (!editForm.name.trim()) {
      showToast("姓名不能为空", "error");
      return;
    }

    setSaving(true);
    try {
      await api(`/api/users/${editingUser.id}`, {
        method: "PUT",
        body: editForm,
      });
      setEditingUser(null);
      showToast("用户资料已更新", "success");
      fetchUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const openResetPassword = (target: UserRow) => {
    setResetPasswordUser(target);
    setNewPassword("");
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    if (newPassword.length < 8) {
      showToast("新密码至少需要 8 位", "error");
      return;
    }

    setSaving(true);
    try {
      await api(`/api/users/${resetPasswordUser.id}`, {
        method: "PUT",
        body: { password: newPassword },
      });
      setResetPasswordUser(null);
      setNewPassword("");
      showToast("密码已重置", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "重置密码失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (target: UserRow) => {
    setSaving(true);
    try {
      await api(`/api/users/${target.id}`, {
        method: "PUT",
        body: { isActive: !target.isActive },
      });
      showToast(target.isActive ? "用户已禁用" : "用户已启用", "success");
      fetchUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (target: UserRow) => {
    if (
      !confirm(
        `确认清理账号"${target.email}"吗？系统不会物理删除账号，会根据数据情况禁用或转移后禁用。`
      )
    )
      return;

    setSaving(true);
    try {
      // 使用 IPC 通道发起 DELETE 请求
      const result = await api(`/api/users/${target.id}`, { method: "DELETE" });

      // 检查是否需要转移数据
      if (result && (result as any).requiresTransfer) {
        setTransferUser(target);
        setTransferMessage((result as any).error || "该账号已有业务数据，请选择接收账号。");
        setTransferToUserId("");
        setSaving(false);
        return;
      }

      showToast(`${(result as any)?.message || "账号已禁用"}，已从当前用户列表隐藏`, "success");
      fetchUsers();
    } catch (error) {
      // API 错误会抛出 ApiError，其中 status 409 表示需要转移
      if (error instanceof Error && (error as any).status === 409) {
        setTransferUser(target);
        setTransferMessage(error.message || "该账号已有业务数据，请选择接收账号。");
        setTransferToUserId("");
        setSaving(false);
        return;
      }
      showToast(error instanceof Error ? error.message : "账号清理失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const confirmTransferAndDisable = async () => {
    if (!transferUser) return;
    if (!transferToUserId) {
      showToast("请选择接收账号", "error");
      return;
    }

    setSaving(true);
    try {
      // 使用 IPC 通道发起带 body 的 DELETE 请求
      const result = await api(`/api/users/${transferUser.id}`, {
        method: "DELETE",
        body: { transferToUserId },
      });

      setTransferUser(null);
      setTransferToUserId("");
      showToast(
        `${(result as any)?.message || "账号数据已转移，原账号已禁用"}，已从当前用户列表隐藏`,
        "success"
      );
      fetchUsers();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "数据转移失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const roleRequiresRegionScope = (role: string) => {
    return role === "SALES" || role === "FOREIGN_TRADE";
  };

  const compactRegionScope = (user: UserRow) => {
    if (!roleRequiresRegionScope(user.role)) return "—";
    if (user.viewScope === "ALL") return "全区域";
    const areas = (user.territories || []).flatMap((territory) =>
      territory.cities?.length
        ? territory.cities.map((city) => `${territory.province}${city}`)
        : [territory.province]
    );
    if (areas.length === 0) return "未分配";
    return areas.length > 3
      ? `${areas.slice(0, 3).join("、")} 等 ${areas.length} 个地区`
      : areas.join("、");
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-7xl space-y-5">
          {/* 页面标题 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-ink">用户管理</h1>
              <p className="mt-1 text-sm text-dim">用户账号、角色权限、区域范围管理</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowInactiveUsers((value) => !value)}
                className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                  showInactiveUsers
                    ? "border-ink bg-ink text-[var(--bg)]"
                    : "border-line bg-panel text-ink hover:bg-panel2"
                }`}
              >
                {showInactiveUsers ? "隐藏已禁用" : "显示已禁用"}
              </button>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brandhi"
              >
                {showCreateForm ? <X size={16} /> : <Plus size={16} />}
                {showCreateForm ? "收起" : "新增用户"}
              </button>
            </div>
          </div>

          {/* 新增用户表单 */}
          {showCreateForm && (
            <div className="space-y-4 rounded-2xl border border-line bg-panel p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">新增用户</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormInput
                  label="姓名 *"
                  value={createForm.name}
                  onChange={(value) => setCreateForm({ ...createForm, name: value })}
                />
                <FormInput
                  label="账号 *"
                  value={createForm.email}
                  onChange={(value) => setCreateForm({ ...createForm, email: value })}
                />
                <FormInput
                  label="密码 *"
                  type="password"
                  value={createForm.password}
                  onChange={(value) => setCreateForm({ ...createForm, password: value })}
                />
                <RoleSelect
                  value={createForm.role}
                  onChange={(value) =>
                    setCreateForm({
                      ...createForm,
                      role: value,
                      territories: [],
                      viewScope: value === "SUPER_ADMIN" ? "ALL" : "TERRITORY",
                    })
                  }
                />
              </div>

              {/* 区域选择器（销售/外贸角色必填） */}
              {roleRequiresRegionScope(createForm.role) && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ink">
                    负责省市 * {createForm.viewScope === "ALL" ? "（全区域）" : ""}
                  </label>
                  {createForm.viewScope !== "ALL" && (
                    <TerritoryPicker
                      value={createForm.territories}
                      onChange={(territories) =>
                        setCreateForm({ ...createForm, territories })
                      }
                    />
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-[var(--bg)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "创建中..." : "创建用户"}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-ink transition-colors hover:bg-panel2"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 编辑用户表单 */}
          {editingUser && (
            <div className="space-y-4 rounded-2xl border border-line bg-panel p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">
                  编辑账号：{editingUser.email}
                </h2>
                <button
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg p-1.5 text-faint transition-colors hover:text-ink"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormInput
                  label="姓名 *"
                  value={editForm.name}
                  onChange={(value) => setEditForm({ ...editForm, name: value })}
                />
                <RoleSelect
                  value={editForm.role}
                  onChange={(value) =>
                    setEditForm({
                      ...editForm,
                      role: value,
                      territories: [],
                      viewScope: value === "SUPER_ADMIN" ? "ALL" : "TERRITORY",
                    })
                  }
                />
              </div>

              {/* 区域选择器（销售/外贸角色） */}
              {roleRequiresRegionScope(editForm.role) && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-ink">
                    负责省市 {editForm.viewScope === "ALL" ? "（全区域）" : ""}
                  </label>
                  {editForm.viewScope !== "ALL" && (
                    <TerritoryPicker
                      value={editForm.territories}
                      onChange={(territories) =>
                        setEditForm({ ...editForm, territories })
                      }
                    />
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleEdit}
                  disabled={saving}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-[var(--bg)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存修改"}
                </button>
                <button
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-ink transition-colors hover:bg-panel2"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 重置密码表单 */}
          {resetPasswordUser && (
            <div className="space-y-4 rounded-2xl border border-line bg-panel p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">
                  重置密码：{resetPasswordUser.email}
                </h2>
                <button
                  onClick={() => setResetPasswordUser(null)}
                  className="rounded-lg p-1.5 text-faint transition-colors hover:text-ink"
                  title="关闭"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="max-w-sm">
                <FormInput
                  label="新密码，至少 8 位 *"
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleResetPassword}
                  disabled={saving}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-[var(--bg)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "重置中..." : "确认重置"}
                </button>
                <button
                  onClick={() => setResetPasswordUser(null)}
                  className="rounded-xl border border-line bg-panel px-4 py-2 text-sm text-ink transition-colors hover:bg-panel2"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 数据转移表单 */}
          {transferUser && (
            <div className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50/50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">删除账号前转移数据</h2>
                <button
                  onClick={() => setTransferUser(null)}
                  className="rounded-lg p-1.5 text-faint transition-colors hover:text-ink"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {transferMessage ||
                  "该账号名下已有客户、合同、发货或跟进记录。删除该账号前，请选择一个接收账号，系统会将该账号名下数据转移到接收账号。"}
              </p>
              <div className="max-w-md">
                <label className="mb-1 block text-xs font-medium text-dim">接收账号 *</label>
                <select
                  value={transferToUserId}
                  onChange={(e) => setTransferToUserId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="">请选择启用状态账号</option>
                  {receiverOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}（{item.email}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={confirmTransferAndDisable}
                  disabled={saving}
                  className="rounded-xl bg-ink px-4 py-2 text-sm text-[var(--bg)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "处理中..." : "转移并禁用"}
                </button>
                <button
                  onClick={() => setTransferUser(null)}
                  className="rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:bg-panel2"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 用户列表 */}
          <div className="overflow-x-auto rounded-2xl border border-line bg-panel shadow-sm">
            <table className="w-full min-w-[980px] table-fixed">
              <thead className="sticky top-0 border-b border-line/60 bg-panel2">
                <tr>
                  <th className="w-[120px] px-4 py-3 text-left text-xs font-medium text-dim">
                    姓名
                  </th>
                  <th className="w-[220px] px-4 py-3 text-left text-xs font-medium text-dim">
                    账号
                  </th>
                  <th className="w-[110px] px-4 py-3 text-left text-xs font-medium text-dim">
                    角色
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dim">
                    负责范围
                  </th>
                  <th className="w-[80px] whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-dim">
                    状态
                  </th>
                  <th className="w-[220px] whitespace-nowrap px-4 py-3 text-left text-xs font-medium text-dim">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/50">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-dim">
                      加载中...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-dim">
                      暂无用户
                    </td>
                  </tr>
                ) : (
                  users.map((target) => (
                    <tr key={target.id} className="h-12 hover:bg-panel2">
                      <td className="truncate px-4 py-3 text-sm font-medium text-ink">
                        {target.name}
                      </td>
                      <td className="truncate px-4 py-3 text-sm text-dim">
                        {target.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="whitespace-nowrap rounded-full bg-panel2 px-2 py-0.5 text-xs text-ink">
                          {ROLE_LABEL[target.role]}
                        </span>
                      </td>
                      <td className="truncate px-4 py-3 text-sm text-dim">
                        {compactRegionScope(target)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                            target.isActive
                              ? "bg-good/10 text-good"
                              : "bg-bad/10 text-bad"
                          }`}
                        >
                          {target.isActive ? "启用" : "禁用"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap">
                          <button
                            onClick={() => openEdit(target)}
                            className="inline-flex items-center gap-1 text-xs text-dim transition-colors hover:text-ink"
                          >
                            <Edit2 size={14} />
                            编辑
                          </button>
                          <button
                            onClick={() => openResetPassword(target)}
                            className="inline-flex items-center gap-1 text-xs text-dim transition-colors hover:text-ink"
                          >
                            <KeyRound size={14} />
                            重置密码
                          </button>
                          <button
                            onClick={() => toggleActive(target)}
                            disabled={saving}
                            className="text-xs text-dim transition-colors hover:text-ink disabled:opacity-50"
                          >
                            {target.isActive ? "禁用" : "启用"}
                          </button>
                          <button
                            onClick={() => deleteUser(target)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 text-xs text-bad transition-colors hover:text-bad/80 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-dim">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: UserRole) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-dim">角色 *</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as UserRole)}
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
      >
        <option value="SALES">销售</option>
        <option value="FOREIGN_TRADE">外贸业务</option>
        <option value="SUPER_ADMIN">超级管理员</option>
        <option value="PURCHASE">采购</option>
        <option value="WAREHOUSE">仓库管理</option>
      </select>
    </div>
  );
}
