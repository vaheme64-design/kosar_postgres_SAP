import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  Play,
  GitBranch,
  BookOpen,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Part, Routing } from '../../types/inventory';
import { ManufacturingOrder, ManufacturingOperation } from '../../types/productionWip';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';
import { CreateMoModal } from '../wip/CreateMoModal';
import { OperationProductionModal } from '../wip/OperationProductionModal';
import { MoRelationalGuideModal } from './MoRelationalGuideModal';

interface MoQuickTrackerWidgetProps {
  parts: Part[];
  routings: Routing[];
  onRefreshData?: () => void;
  defaultCollapsed?: boolean;
  onOpenFullMoList?: () => void;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: 'برنامه‌ریزی', cls: 'bg-[#f4f5f7] text-[#555555] border-[#d9d9d9]' },
  RELEASED: { label: 'آماده تولید', cls: 'bg-[#e5f3fa] text-[#007cc0] border-[#b3ddf2]' },
  IN_PROGRESS: { label: 'در حال ساخت', cls: 'bg-[#fff4e5] text-[#b45309] border-[#f5cba7]' },
  COMPLETED: { label: 'تکمیل‌شده', cls: 'bg-[#eef8f2] text-[#107e3e] border-[#b7dfc5]' },
  CLOSED: { label: 'بسته‌شده', cls: 'bg-[#ebeef2] text-[#333333] border-[#c5ccd6]' },
  ON_HOLD: { label: 'متوقف', cls: 'bg-[#fde8e8] text-[#bb0000] border-[#f5b8b8]' },
};

export const MoQuickTrackerWidget: React.FC<MoQuickTrackerWidgetProps> = ({
  parts,
  routings,
  onRefreshData,
  defaultCollapsed = false,
  onOpenFullMoList,
}) => {
  const router = useErpRouter();
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeProdOp, setActiveProdOp] = useState<ManufacturingOperation | null>(null);

  // Dedicated Delete & Rollback state
  const [deleteTarget, setDeleteTarget] = useState<ManufacturingOrder | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteReason, setDeleteReason] = useState('حذف سریع دستور ساخت از پایش WIP و بازگشت موجودی به انبار');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wip/manufacturing-orders');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setOrders(json.data);
      }
    } catch (err) {
      console.error('MoQuickTrackerWidget fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const onUpdated = () => fetchOrders();
    window.addEventListener('kpims-master-data-updated', onUpdated);
    return () => window.removeEventListener('kpims-master-data-updated', onUpdated);
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(mo => {
      if (statusFilter !== 'ALL' && mo.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (
          !mo.moNumber.toLowerCase().includes(q) &&
          !mo.partCode.toLowerCase().includes(q) &&
          !mo.partName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const handleCreateMo = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/manufacturing-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'خطا در صدور دستور ساخت' };
      }
      setFeedback({ ok: true, text: `دستور ساخت «${json.data?.moNumber || ''}» در دیتابیس ثبت و آماده OP10 شد.` });
      await fetchOrders();
      onRefreshData?.();
      window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'خطا در ارتباط با سرور' };
    }
  };

  const handleSubmitProduction = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/operations/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'خطا در ثبت خروجی عملیات' };
      }
      setFeedback({ ok: true, text: json.message || 'خروجی تولید و QC ثبت و پیشرفت دستور ساخت به‌روزرسانی شد.' });
      await fetchOrders();
      onRefreshData?.();
      window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'خطای شبکه' };
    }
  };

  const openDeleteModal = async (mo: ManufacturingOrder) => {
    setDeleteTarget(mo);
    setPreviewLoading(true);
    setRollbackPreview(null);
    try {
      const res = await fetch(
        `/api/wip/manufacturing-orders/${encodeURIComponent(mo.id)}/rollback-preview?cascadeSubMos=true`
      );
      const json = await res.json();
      if (json.success) setRollbackPreview(json.data);
    } catch {
      // ignore preview error
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmDeleteMo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || deleteReason.trim().length < 5) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/wip/manufacturing-orders/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cascadeSubMos: true,
          reason: deleteReason.trim(),
          userId: 'USR-PROD-MGR',
          userName: 'مدیر تولید و برنامه‌ریزی',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setFeedback({ ok: false, text: json.error || 'خطا در حذف دستور ساخت' });
      } else {
        setFeedback({
          ok: true,
          text: `دستور ساخت «${deleteTarget.moNumber}» حذف و موجودی مصرفی به انبار بازگردانده شد.`,
        });
        setDeleteTarget(null);
        await fetchOrders();
        onRefreshData?.();
        window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'خطای شبکه در حذف دستور ساخت' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-white border border-[#d9d9d9] rounded-md overflow-hidden" dir="rtl">
      {/* Compact Widget Toolbar */}
      <div className="px-3.5 py-2.5 bg-[#f7f9fb] border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setCollapsed(prev => !prev)}
            className="p-1 rounded hover:bg-[#e8edf2] text-[#333333] cursor-pointer"
            title={collapsed ? 'باز کردن پایش سریع MO' : 'جمع کردن ویجت'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <Layers className="w-4 h-4 text-[#007cc0] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#1d2d3e]">
                پایش سریع دستورات ساخت (MO) و کار در جریان (WIP)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-[#d9d9d9] text-[10px] font-mono font-bold text-[#007cc0] tabular-nums">
                {toPersianDigits(orders.length)} دستور
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="px-2.5 py-1 rounded text-[11px] font-semibold border border-[#b3ddf2] bg-[#e5f3fa] hover:bg-[#d2eaf7] text-[#0057b8] inline-flex items-center gap-1 cursor-pointer"
            title="راهنمای تصویری گام‌به‌گام ثبت MO، صدور سرکلاف و رفع خطای متناظر پیدا نشد"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>راهنمای تصویری ثبت MO / رفع خطای OP10</span>
          </button>

          {onOpenFullMoList && (
            <button
              type="button"
              onClick={onOpenFullMoList}
              className="sap-btn-standard px-2.5 py-1 text-[11px] font-semibold cursor-pointer"
            >
              مدیریت کامل دستورات
            </button>
          )}

          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="p-1.5 rounded border border-[#d9d9d9] bg-white hover:bg-[#f2f2f2] text-[#555555] cursor-pointer"
            title="به‌روزرسانی لیست دستورات ساخت"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="sap-btn-emphasized px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>صدور MO جدید</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-[#eeeeee]">
          {feedback && (
            <div
              className={`px-3.5 py-2 text-xs flex items-center justify-between gap-2 ${
                feedback.ok ? 'bg-[#eef8f2] text-[#107e3e]' : 'bg-[#fde8e8] text-[#bb0000]'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {feedback.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-[11px] opacity-75 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Inline Filters */}
          <div className="px-3.5 py-2 bg-[#fafafa] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'ALL', label: 'همه' },
                { id: 'IN_PROGRESS', label: 'در جریان' },
                { id: 'RELEASED', label: 'آماده تولید' },
                { id: 'COMPLETED', label: 'تکمیل‌شده' },
              ].map(tab => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-2.5 py-1 rounded border font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#007cc0] text-white border-[#0066a1]'
                        : 'bg-white text-[#333333] border-[#d9d9d9] hover:bg-[#f0f4f8]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-[#777777] absolute right-2.5 top-1.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="جستجوی MO یا کد قطعه..."
                className="w-full bg-white border border-[#d0d7de] rounded pr-8 pl-2.5 py-1 text-[11px] text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>
          </div>

          {/* High-Density SAP Table with Status, Progress Bar & Dedicated Delete */}
          {filteredOrders.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-[#666666]">
              دستور ساختی با این فیلتر یافت نشد. می‌توانید با دکمه «+ صدور MO جدید» یک دستور کار ثبت کنید.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead className="bg-white border-b border-[#d9d9d9] text-[#555555]">
                  <tr>
                    <th className="w-36">شماره دستور (MO)</th>
                    <th>قطعه و کد فنی</th>
                    <th className="w-28">وضعیت</th>
                    <th className="w-52">پیشرفت (Progress Bar)</th>
                    <th className="w-40">ایستگاه فعال WIP</th>
                    <th className="w-56 text-left">عملیات سریع و حذف اختصاصی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eeeeee] tabular-nums">
                  {filteredOrders.map(mo => {
                    const sortedOps = [...(mo.operations || [])].sort((a, b) => a.stepNumber - b.stepNumber);
                    const activeOp =
                      sortedOps.find(o => o.status === 'IN_PROGRESS' || o.inProgressQty > 0) ||
                      sortedOps.find(o => o.waitingInputQty > 0 || o.status === 'READY') ||
                      sortedOps[0];

                    const finalPct =
                      mo.targetQuantity > 0
                        ? Math.min(100, Math.round(((mo.completedQuantity || 0) / mo.targetQuantity) * 100))
                        : 0;
                    const weightedPct =
                      sortedOps.length > 0 && mo.targetQuantity > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (sortedOps.reduce(
                                (sum, o) => sum + Math.min(1, (o.goodOutputQty || 0) / mo.targetQuantity),
                                0
                              ) /
                                sortedOps.length) *
                                100
                            )
                          )
                        : finalPct;
                    const progressPct = Math.max(finalPct, weightedPct);
                    const st = STATUS_META[mo.status] || {
                      label: mo.status,
                      cls: 'bg-[#f4f5f7] text-[#333333] border-[#d9d9d9]',
                    };

                    return (
                      <tr key={mo.id} className="hover:bg-[#f5faff] transition-colors">
                        <td className="font-mono font-bold text-[#007cc0] whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              router.navigate({ tab: 'wip', wipSubTab: 'ORDERS', docQuery: mo.moNumber })
                            }
                            className="hover:underline cursor-pointer"
                            title="باز کردن پرونده این دستور در کارتابل WIP"
                          >
                            {mo.moNumber}
                          </button>
                          {mo.parentMoNumber && (
                            <div className="text-[10px] font-normal text-[#b45309]">
                              زیرمجموعه {mo.parentMoNumber}
                            </div>
                          )}
                        </td>

                        <td className="min-w-[180px]">
                          <div className="font-semibold text-[#333333] truncate max-w-[240px]" title={mo.partName}>
                            {mo.partName}
                          </div>
                          <div className="text-[10px] font-mono text-[#666666]">کد: {mo.partCode}</div>
                        </td>

                        <td className="whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${st.cls}`}>
                            {st.label}
                          </span>
                        </td>

                        <td className="min-w-[190px]">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="text-[#555555]">
                                <strong className="text-[#107e3e]">{formatNumber(mo.completedQuantity)}</strong> /{' '}
                                {formatNumber(mo.targetQuantity)}
                              </span>
                              <span className="font-bold text-[#007cc0]">{toPersianDigits(progressPct)}٪</span>
                            </div>
                            <div className="w-full h-2 bg-[#e8ecf0] rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  progressPct >= 100 ? 'bg-[#107e3e]' : 'bg-[#007cc0]'
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="whitespace-nowrap">
                          {activeOp ? (
                            <div className="text-[11px]">
                              <span className="font-mono font-bold text-[#333333]">{activeOp.stepCode}</span>
                              <div className="text-[10px] text-[#666666]">
                                صف: {formatNumber(activeOp.waitingInputQty || 0)} · پای کار:{' '}
                                {formatNumber(activeOp.inProgressQty || 0)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#888888]">—</span>
                          )}
                        </td>

                        <td className="text-left whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {activeOp && mo.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => setActiveProdOp(activeOp)}
                                className="px-2 py-1 rounded bg-[#e5f3fa] hover:bg-[#d2eaf7] border border-[#b3ddf2] text-[#0057b8] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                title={`ثبت خروجی تولید و QC برای ${activeOp.stepCode}`}
                              >
                                <Play className="w-3 h-3" />
                                <span>خروجی {activeOp.stepCode.split('_')[0]}</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                router.navigate({ tab: 'wip', wipSubTab: 'ORDERS', docQuery: mo.moNumber })
                              }
                              className="p-1.5 rounded border border-[#d9d9d9] bg-white hover:bg-[#f0f4f8] text-[#333333] cursor-pointer"
                              title="رهگیری کامل در کارتابل WIP"
                            >
                              <GitBranch className="w-3.5 h-3.5 text-[#007cc0]" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openDeleteModal(mo)}
                              className="px-2 py-1 rounded bg-[#fde8e8] hover:bg-[#fbd0d0] border border-[#f5b8b8] text-[#bb0000] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              title="حذف اختصاصی دستور ساخت و بازگشت مواد مصرفی به انبار"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create MO Modal */}
      <CreateMoModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        parts={parts}
        routings={routings}
        onSubmit={handleCreateMo}
      />

      {/* Production Output Modal */}
      <OperationProductionModal
        isOpen={!!activeProdOp}
        onClose={() => setActiveProdOp(null)}
        operation={activeProdOp}
        onSubmit={handleSubmitProduction}
      />

      {/* Interactive Visual Step-by-Step Guide Modal */}
      <MoRelationalGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onOpenCreateMo={() => setIsCreateOpen(true)}
      />

      {/* Dedicated Delete & Rollback Confirmation Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="bg-white border border-[#f5b8b8] rounded-md shadow-xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-[#fde8e8] border-b border-[#f5b8b8] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#bb0000]">
                <ShieldAlert className="w-4 h-4" />
                <span>تأیید حذف دستور ساخت «{deleteTarget.moNumber}»</span>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setDeleteTarget(null)}
                className="text-[#bb0000] hover:opacity-75 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={confirmDeleteMo} className="p-4 space-y-3 text-xs">
              <div className="p-2.5 rounded bg-[#f8fafc] border border-[#e2e8f0] space-y-1">
                <div className="font-bold text-[#333333]">{deleteTarget.partName}</div>
                <div className="text-[11px] text-[#666666] font-mono">
                  کد قطعه: {deleteTarget.partCode} · تیراژ هدف: {formatNumber(deleteTarget.targetQuantity)}
                </div>
              </div>

              {previewLoading ? (
                <div className="text-[11px] text-[#666666]">در حال محاسبه بازگشت موجودی و اسناد وابسته...</div>
              ) : rollbackPreview ? (
                <div className="p-2.5 rounded bg-[#fff8ec] border border-[#f5cba7] text-[11px] text-[#6d4506] space-y-1">
                  <div className="font-bold">پیش‌نمایش بازگشت خودکار انبار (Rollback):</div>
                  <div>
                    تعداد دستورات قابل حذف (با زیرمجموعه):{' '}
                    <strong className="font-mono">
                      {toPersianDigits(rollbackPreview.targetOrders?.length || 1)}
                    </strong>
                  </div>
                  <div>
                    اسناد حواله/رسید قابل معکوس‌سازی:{' '}
                    <strong className="font-mono">
                      {toPersianDigits(rollbackPreview.affectedTransactionsCount || 0)}
                    </strong>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block font-bold text-[#333333] mb-1">دلیل حذف دستور ساخت (الزامی):</label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="w-full border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#bb0000]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eeeeee]">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isDeleting}
                  className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || deleteReason.trim().length < 5}
                  className="px-3.5 py-1.5 rounded bg-[#bb0000] hover:bg-[#990000] text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'در حال حذف و بازگشت...' : 'تأیید حذف و بازگشت موجودی'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
