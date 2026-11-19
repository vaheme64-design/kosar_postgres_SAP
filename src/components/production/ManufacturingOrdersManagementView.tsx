import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Plus,
  Search,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Play,
  ArrowUpRight,
  Boxes,
  Disc,
  Cpu,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileCheck,
  GitBranch,
  Clock,
  ShieldAlert,
  X,
  PackagePlus,
} from 'lucide-react';
import { Part, Routing } from '../../types/inventory';
import { ManufacturingOrder, ManufacturingOperation, ManufacturingOrderStatus } from '../../types/productionWip';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';
import { CreateMoModal } from '../wip/CreateMoModal';
import { OperationProductionModal } from '../wip/OperationProductionModal';
import { MoRelationalGuideModal } from './MoRelationalGuideModal';

interface ManufacturingOrdersManagementViewProps {
  parts: Part[];
  routings: Routing[];
  onRefreshData?: () => void;
}

const STATUS_LABELS: Record<string, { label: string; badgeClass: string }> = {
  PLANNED: {
    label: 'برنامه‌ریزی‌شده (PLANNED)',
    badgeClass: 'bg-[#f2f2f2] text-[#555555] border-[#d9d9d9]',
  },
  RELEASED: {
    label: 'آزادشده / آماده تولید (RELEASED)',
    badgeClass: 'bg-[#e5f3fa] text-[#007cc0] border-[#b3d7ff]',
  },
  IN_PROGRESS: {
    label: 'در حال تولید (IN_PROGRESS)',
    badgeClass: 'bg-[#fff4e5] text-[#e9730c] border-[#f5cba7]',
  },
  COMPLETED: {
    label: 'تکمیل‌شده (COMPLETED)',
    badgeClass: 'bg-[#eef8f2] text-[#107e3e] border-[#b7dfc5]',
  },
  CLOSED: {
    label: 'بسته‌شده (CLOSED)',
    badgeClass: 'bg-[#ebeef2] text-[#333333] border-[#c5ccd6]',
  },
  ON_HOLD: {
    label: 'متوقف / هولد (ON_HOLD)',
    badgeClass: 'bg-[#fde8e8] text-[#bb0000] border-[#f5b8b8]',
  },
};

export const ManufacturingOrdersManagementView: React.FC<ManufacturingOrdersManagementViewProps> = ({
  parts,
  routings,
  onRefreshData,
}) => {
  const router = useErpRouter();
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ManufacturingOrderStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [isVisualGuideOpen, setIsVisualGuideOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'warning' | 'error'; title: string; detail: string } | null>(null);

  // Modals state
  const [isCreateMoOpen, setIsCreateMoOpen] = useState(false);
  const [activeProdOp, setActiveProdOp] = useState<ManufacturingOperation | null>(null);

  // Load Material (سرکلاف / ورق) Modal state
  const [loadMaterialOrder, setLoadMaterialOrder] = useState<ManufacturingOrder | null>(null);
  const [loadMaterialQty, setLoadMaterialQty] = useState('500');
  const [loadMaterialNotes, setLoadMaterialNotes] = useState('');
  const [isLoadingMaterial, setIsLoadingMaterial] = useState(false);

  // Delete & Rollback Modal state
  const [deleteTargetOrder, setDeleteTargetOrder] = useState<ManufacturingOrder | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteReason, setDeleteReason] = useState('حذف دستور ساخت غیرضروری و بازگشت مواد مصرفی به انبار');
  const [cascadeSubMos, setCascadeSubMos] = useState(true);
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
      console.error('Failed to fetch manufacturing orders:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const handler = () => {
      fetchOrders();
    };
    window.addEventListener('kpims-master-data-updated', handler);
    return () => window.removeEventListener('kpims-master-data-updated', handler);
  }, [fetchOrders]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: orders.length,
      RELEASED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      PLANNED: 0,
    };
    orders.forEach(o => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchMo = order.moNumber.toLowerCase().includes(q) || order.id.toLowerCase().includes(q);
        const matchPart =
          order.partCode.toLowerCase().includes(q) || order.partName.toLowerCase().includes(q);
        const matchParent = (order.parentMoNumber || '').toLowerCase().includes(q);
        if (!matchMo && !matchPart && !matchParent) return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  const kpis = useMemo(() => {
    const totalOrders = orders.length;
    const activeOrders = orders.filter(o => o.status === 'IN_PROGRESS' || o.status === 'RELEASED').length;
    const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
    const totalTarget = orders.reduce((acc, o) => acc + (o.targetQuantity || 0), 0);
    const totalCompleted = orders.reduce((acc, o) => acc + (o.completedQuantity || 0), 0);
    const overallProgressPct = totalTarget > 0 ? Math.min(100, Math.round((totalCompleted / totalTarget) * 100)) : 0;
    return { totalOrders, activeOrders, completedOrders, totalTarget, totalCompleted, overallProgressPct };
  }, [orders]);

  // Create MO handler
  const handleCreateMo = async (payload: any): Promise<{ success: boolean; error?: string }> => {
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
      await fetchOrders();
      onRefreshData?.();
      window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      setNotice({
        type: 'success',
        title: `دستور ساخت جدید «${json.data?.moNumber || ''}» با موفقیت در دیتابیس ایجاد شد`,
        detail: `مراحل عملیاتی از روی مسیر فرآیند مصوب ساخته شد و آماده ثبت خروجی (OP10) است.`,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'خطا در ارتباط با سرور' };
    }
  };

  // Register OP Production handler
  const handleRegisterOpProduction = async (payload: any): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/wip/operations/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'خطا در ثبت خروجی عملیات تولید' };
      }
      await fetchOrders();
      onRefreshData?.();
      window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      setNotice({
        type: 'success',
        title: `ثبت خروجی تولید و کنترل کیفیت با موفقیت انجام شد`,
        detail: json.message || 'آمار تولید سالم، کسر خودکار مواد (Backflush) و انتقال به مرحله بعد ثبت شد.',
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'خطا در ارتباط با سرور' };
    }
  };

  // Load Material (سرکلاف / شیت) into OP10 handler
  const handleLoadMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadMaterialOrder) return;
    const qty = Number(loadMaterialQty);
    if (!Number.isFinite(qty) || qty <= 0) return;

    setIsLoadingMaterial(true);
    try {
      const firstOp = [...loadMaterialOrder.operations].sort((a, b) => a.stepNumber - b.stepNumber)[0];
      const res = await fetch(`/api/wip/manufacturing-orders/${encodeURIComponent(loadMaterialOrder.id)}/load-material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: firstOp?.id,
          quantity: qty,
          operatorName: 'سرپرست خط برش و پرس',
          notes: loadMaterialNotes.trim() || `تغذیه سرکلاف / شیت ورودی به ${firstOp?.stepCode || 'OP10'}`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice({
          type: 'error',
          title: 'خطا در بارگذاری مواد اولیه',
          detail: json.error || 'امکان ثبت ورودی مواد وجود ندارد.',
        });
      } else {
        setNotice({
          type: 'success',
          title: `بارگذاری سرکلاف / مواد اولیه برای دستور «${loadMaterialOrder.moNumber}» ثبت شد`,
          detail: `تعداد ${formatNumber(qty)} قطعه در صف ورودی ایستگاه ${firstOp?.stepCode || 'OP10'} قرار گرفت و آماده ثبت خروجی است.`,
        });
        setLoadMaterialOrder(null);
        await fetchOrders();
        onRefreshData?.();
        window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        title: 'خطا در ارتباط با سرور',
        detail: err.message || 'خطای شبکه',
      });
    } finally {
      setIsLoadingMaterial(false);
    }
  };

  // Open Delete / Rollback Preview modal
  const handleOpenDeleteModal = async (order: ManufacturingOrder) => {
    setDeleteTargetOrder(order);
    setPreviewLoading(true);
    setRollbackPreview(null);
    try {
      const res = await fetch(
        `/api/wip/manufacturing-orders/${encodeURIComponent(order.id)}/rollback-preview?cascadeSubMos=true`
      );
      const json = await res.json();
      if (json.success) {
        setRollbackPreview(json.data);
      }
    } catch (err) {
      console.error('Failed to load rollback preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Confirm Delete MO & Rollback Inventory
  const handleConfirmDeleteMo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTargetOrder) return;
    if (deleteReason.trim().length < 5) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/wip/manufacturing-orders/${encodeURIComponent(deleteTargetOrder.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cascadeSubMos,
          reason: deleteReason.trim(),
          userId: 'USR-PROD-MGR',
          userName: 'مدیر تولید و برنامه‌ریزی',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice({
          type: 'error',
          title: `خطا در حذف دستور ساخت «${deleteTargetOrder.moNumber}»`,
          detail: json.error || 'عملیات حذف و بازگشت موجودی انجام نشد.',
        });
      } else {
        setNotice({
          type: 'success',
          title: `دستور ساخت «${deleteTargetOrder.moNumber}» با موفقیت حذف و موجودی به انبار بازگردانده شد`,
          detail: json.message || 'کلیه حواله‌های مصرف مرتبط ابطال و موجودی رول/قطعات به انبار بازگشت.',
        });
        setDeleteTargetOrder(null);
        await fetchOrders();
        onRefreshData?.();
        window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        title: 'خطا در ارتباط با سرور هنگام حذف دستور ساخت',
        detail: err.message || 'خطای شبکه',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 text-right font-sans" dir="rtl">
      {/* ==================================================================== */}
      {/* STEP-BY-STEP INTERACTIVE USER GUIDE FOR COIL ISSUE, MO & OP10 FIX    */}
      {/* ==================================================================== */}
      <div className="sap-card border border-[#b3ddf2] bg-white overflow-hidden">
        <div className="px-3.5 py-2 bg-[#f4f9fd] border-b border-[#d9e9f5] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen className="w-4 h-4 text-[#007cc0] shrink-0" />
            <span className="text-xs font-bold text-[#004e7a] truncate">
              راهنمای گام‌به‌گام صدور سرکلاف، تعریف دستور ساخت (MO) معتبر و رفع خطای OP10
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsVisualGuideOpen(true)}
              className="px-2.5 py-1 rounded text-[11px] font-bold bg-[#007cc0] hover:bg-[#0066a1] text-white inline-flex items-center gap-1 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>راهنمای تصویری گام‌به‌گام</span>
            </button>
            <button
              type="button"
              onClick={() => setShowGuide(prev => !prev)}
              className="text-[11px] font-semibold text-[#007cc0] flex items-center gap-1 bg-white px-2.5 py-1 rounded border border-[#b3ddf2] hover:bg-[#e5f3fa] cursor-pointer"
            >
              <span>{showGuide ? 'بستن خلاصه متنی' : 'خلاصه ۴ گام'}</span>
              {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {showGuide && (
          <div className="p-3.5 space-y-3 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {/* STEP 1: WHERE COIL HEAD IS ISSUED FROM */}
              <div className="p-3 bg-white border border-[#d9d9d9] rounded space-y-2 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-[#e5f3fa] text-[#007cc0] font-bold rounded text-[11px]">
                      گام ۱: صدور سرکلاف تولید (رول ورق)
                    </span>
                    <Disc className="w-4 h-4 text-[#007cc0]" />
                  </div>
                  <h4 className="font-bold text-[#333333]">سر کلاف تولید از کجا صادر می‌شود؟</h4>
                  <p className="text-[11px] text-[#555555] leading-5">
                    ۱. از <strong>«کاتالوگ ماژول‌های SAP HANA ← انبار و کیفیت (MM/QM) ← رول‌های ورق و کویل‌پک»</strong>، رول ورق با شماره ذوب (Heat Number) ثبت و آزاد می‌شود.
                    <br />
                    ۲. برای ارسال سرکلاف پای دستگاه برش (<code>OP10_SLIT</code>)، در جدول رول‌ها دکمه <strong>«ثبت مصرف/برش کلاف (حواله به تولید)»</strong> را بزنید <strong>یا</strong> در همین صفحه روی کارت دستور ساخت، دکمه <strong>«بارگذاری سرکلاف / مواد به OP10»</strong> را کلیک کنید.
                    <br />
                    ۳. همچنین هنگام ثبت خروجی سالم در <code>OP10_SLIT</code>، سیستم به صورت خودکار وزن ورق مصرفی را از سرکلاف فعال کسر می‌کند (سند <code>ISS-WIP-*</code>).
                  </p>
                </div>
                <div className="pt-2 border-t border-[#f0f0f0] flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => router.navigate({ tab: 'inventory', inventorySubTab: 'COILS' })}
                    className="sap-btn-standard px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer text-[#007cc0]"
                  >
                    <Disc className="w-3.5 h-3.5" />
                    <span>مدیریت رول‌های ورق و صدور سرکلاف</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* STEP 2: HOW TO DEFINE VALID MO VIA MRP OR WORKBENCH */}
              <div className="p-3 bg-white border border-[#d9d9d9] rounded space-y-2 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-[#eef8f2] text-[#107e3e] font-bold rounded text-[11px]">
                      گام ۲: تعریف دستور ساخت (MO) معتبر
                    </span>
                    <Cpu className="w-4 h-4 text-[#107e3e]" />
                  </div>
                  <h4 className="font-bold text-[#333333]">چگونه از MRP یا میز کار دستور ساخت بسازیم؟</h4>
                  <p className="text-[11px] text-[#555555] leading-5">
                    <strong>مسیر اول (اتوماتیک از MRP):</strong> به <strong>«برنامه‌ریزی و MRP ← پیشنهاد برنامه و پرس‌ها»</strong> بروید، پیشنهاد تولید قطعه را انتخاب کرده و روی <strong>«تأیید پیشنهاد و صدور فوری دستور کار (MO)»</strong> کلیک کنید.
                    <br />
                    <strong>مسیر دوم (مستقیم از میز کار تولید):</strong> در همین صفحه روی دکمه آبی <strong>«+ صدور دستور ساخت جدید (MO)»</strong> کلیک کنید، قطعه (مثلاً <code>700014</code> یا <code>611408</code>) و تیراژ هدف را انتخاب و ثبت نمایید.
                  </p>
                </div>
                <div className="pt-2 border-t border-[#f0f0f0] flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => router.navigate({ tab: 'planning', planningSubTab: 'recommendations' })}
                    className="sap-btn-standard px-2 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#107e3e]" />
                    <span>صدور MO از پیشنهاد MRP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreateMoOpen(true)}
                    className="sap-btn-emphasized px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>صدور فوری MO جدید</span>
                  </button>
                </div>
              </div>

              {/* STEP 3: FIXING OP10_SLIT OUTPUT ERROR */}
              <div className="p-3 bg-white border border-[#d9d9d9] rounded space-y-2 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-[#fff4e5] text-[#e9730c] font-bold rounded text-[11px]">
                      گام ۳: ثبت خروجی تولید و QC (OP10_SLIT)
                    </span>
                    <FileCheck className="w-4 h-4 text-[#e9730c]" />
                  </div>
                  <h4 className="font-bold text-[#333333]">چرا خطای دستور ساخت در OP10 رخ می‌داد و چگونه رفع شد؟</h4>
                  <p className="text-[11px] text-[#555555] leading-5">
                    خطای <em>«برای این کد قطعه دستور ساخت relational متناظر پیدا نشد»</em> زمانی رخ می‌داد که جدول ارتباطی دیتابیس با دستور ساخت جاری همگام نبود.
                    <br />
                    اکنون پل ارتباطی هوشمند فعال شده است: با کلیک روی <strong>«ثبت خروجی و QC»</strong> در هر مرحله (<code>OP10_SLIT</code> تا مرحله نهایی)، دستور ساخت متناظر، شیفت و اپراتور به صورت <strong>خودکار</strong> انتخاب می‌شوند و حتی اگر قطعات در «صف ورودی ایستگاه» باشند، به طور خودکار وارد چرخه تولید دستگاه می‌گردند.
                  </p>
                </div>
                <div className="pt-2 border-t border-[#f0f0f0] text-[11px] text-[#107e3e] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>همگام‌سازی خودکار دستور ساخت، شیفت و کسر کلاف فعال است</span>
                </div>
              </div>

              {/* STEP 4: WHERE TO TRACK, FILTER & DELETE MOS */}
              <div className="p-3 bg-white border border-[#d9d9d9] rounded space-y-2 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-[#fde8e8] text-[#bb0000] font-bold rounded text-[11px]">
                      گام ۴: رهگیری پیشرفت و حذف دستورات ساخت
                    </span>
                    <Trash2 className="w-4 h-4 text-[#bb0000]" />
                  </div>
                  <h4 className="font-bold text-[#333333]">کجا دستورات تولید را ببینم، رهگیری و حذف کنم؟</h4>
                  <p className="text-[11px] text-[#555555] leading-5">
                    در جدول زیر تمام دستورات ساخت (<code>MO</code>) به همراه <strong>فیلتر وضعیت</strong>، <strong>درصد پیشرفت</strong> و وضعیت لحظه‌ای هر ایستگاه (<code>OP10</code> تا آخر) نمایش داده می‌شوند.
                    <br />
                    برای حذف هر دستور ساخت غیرضروری، روی دکمه قرمز <strong>«حذف کامل و بازگشت موجودی»</strong> کلیک کنید؛ سیستم تمام حواله‌های مصرف ورق و دستورات فرعی (<code>Sub-MO</code>) را معکوس کرده و موجودی را به انبار برمی‌گرداند.
                  </p>
                </div>
                <div className="pt-2 border-t border-[#f0f0f0] flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => router.navigate({ tab: 'wip', wipSubTab: 'UNIFIED_DIRECTORY' })}
                    className="sap-btn-standard px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <GitBranch className="w-3.5 h-3.5 text-[#007cc0]" />
                    <span>مشاهده نمای درختی کارتابل WIP</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* FEEDBACK BANNER                                                      */}
      {/* ==================================================================== */}
      {notice && (
        <div
          className={`p-3 rounded border text-xs flex items-center justify-between gap-3 ${
            notice.type === 'error'
              ? 'bg-[#fde8e8] border-[#f5b8b8] text-[#bb0000]'
              : notice.type === 'warning'
              ? 'bg-[#fff4e5] border-[#f5cba7] text-[#333333]'
              : 'bg-[#eef8f2] border-[#b7dfc5] text-[#107e3e]'
          }`}
        >
          <div className="flex items-start gap-2">
            {notice.type === 'error' || notice.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="font-bold">{notice.title}</div>
              <div className="text-[#555555] mt-0.5">{notice.detail}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="sap-btn-standard px-2.5 py-1 text-xs cursor-pointer shrink-0"
          >
            بستن
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* KPI SUMMARY STRIP                                                    */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="sap-card p-3">
          <span className="text-[11px] text-[#666666] block">کل دستورات ساخت (MO)</span>
          <span className="text-lg font-bold font-mono text-[#333333] mt-0.5 block">
            {toPersianDigits(kpis.totalOrders)} <span className="text-xs font-normal text-[#666666]">دستور</span>
          </span>
        </div>
        <div className="sap-card p-3">
          <span className="text-[11px] text-[#666666] block">دستورات فعال و در جریان</span>
          <span className="text-lg font-bold font-mono text-[#007cc0] mt-0.5 block">
            {toPersianDigits(kpis.activeOrders)} <span className="text-xs font-normal text-[#666666]">در خط</span>
          </span>
        </div>
        <div className="sap-card p-3">
          <span className="text-[11px] text-[#666666] block">دستورات تکمیل‌شده</span>
          <span className="text-lg font-bold font-mono text-[#107e3e] mt-0.5 block">
            {toPersianDigits(kpis.completedOrders)} <span className="text-xs font-normal text-[#666666]">تکمیل</span>
          </span>
        </div>
        <div className="sap-card p-3">
          <span className="text-[11px] text-[#666666] block">مجموع تیراژ هدف / تکمیل‌شده</span>
          <span className="text-sm font-bold font-mono text-[#333333] mt-1 block">
            {formatNumber(kpis.totalCompleted)} / {formatNumber(kpis.totalTarget)}{' '}
            <span className="text-[11px] font-normal text-[#666666]">PCS</span>
          </span>
        </div>
        <div className="sap-card p-3 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-[11px] text-[#666666]">
            <span>پیشرفت کل دستورات</span>
            <span className="font-mono font-bold text-[#107e3e]">{toPersianDigits(kpis.overallProgressPct)}٪</span>
          </div>
          <div className="w-full h-2.5 bg-[#e8e8e8] rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-[#107e3e] transition-all"
              style={{ width: `${kpis.overallProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* FILTER BAR: STATUS TABS, SEARCH & ACTIONS                            */}
      {/* ==================================================================== */}
      <div className="sap-card p-3 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Filter Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'ALL' as const, label: 'همه دستورات' },
              { id: 'RELEASED' as const, label: 'آماده تولید (RELEASED)' },
              { id: 'IN_PROGRESS' as const, label: 'در حال تولید (IN_PROGRESS)' },
              { id: 'COMPLETED' as const, label: 'تکمیل‌شده (COMPLETED)' },
              { id: 'PLANNED' as const, label: 'برنامه‌ریزی‌شده (PLANNED)' },
            ].map(st => {
              const active = statusFilter === st.id;
              const count = statusCounts[st.id] || 0;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#007cc0] text-white border-[#006299]'
                      : 'bg-white text-[#333333] border-[#bfbfbf] hover:bg-[#f5f5f5]'
                  }`}
                >
                  <span>{st.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                      active ? 'bg-white/20 text-white' : 'bg-[#f0f0f0] text-[#555555]'
                    }`}
                  >
                    {toPersianDigits(count)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search & Primary Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="جستجوی شماره MO، کد یا نام قطعه..."
                className="w-full bg-white border border-[#bfbfbf] rounded pr-8 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>

            <button
              type="button"
              onClick={fetchOrders}
              disabled={loading}
              className="sap-btn-standard px-2.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>بروزرسانی</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreateMoOpen(true)}
              className="sap-btn-emphasized px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>صدور دستور ساخت جدید (MO)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MANUFACTURING ORDERS LIST & PER-OPERATION PROGRESS                   */}
      {/* ==================================================================== */}
      {filteredOrders.length === 0 ? (
        <div className="sap-card p-8 text-center space-y-3">
          <Layers className="w-8 h-8 text-[#999999] mx-auto" />
          <div className="text-sm font-bold text-[#333333]">
            هیچ دستور ساختی با فیلتر انتخابی یافت نشد
          </div>
          <p className="text-xs text-[#666666]">
            می‌توانید فیلتر وضعیت را روی «همه دستورات» قرار دهید یا با کلیک روی دکمه زیر یک دستور ساخت جدید صادر نمایید.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            {statusFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer"
              >
                نمایش همه دستورات ({toPersianDigits(orders.length)})
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCreateMoOpen(true)}
              className="sap-btn-emphasized px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>صدور دستور ساخت جدید (MO)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(mo => {
            const stMeta = STATUS_LABELS[mo.status] || {
              label: mo.status,
              badgeClass: 'bg-[#f2f2f2] text-[#333333] border-[#d9d9d9]',
            };
            const sortedOps = [...(mo.operations || [])].sort((a, b) => a.stepNumber - b.stepNumber);
            const totalOps = sortedOps.length;
            const completedOps = sortedOps.filter(o => o.status === 'COMPLETED').length;
            const finalCompletionPct =
              mo.targetQuantity > 0
                ? Math.min(100, Math.round(((mo.completedQuantity || 0) / mo.targetQuantity) * 100))
                : 0;
            const opWeightedPct =
              totalOps > 0 && mo.targetQuantity > 0
                ? Math.min(
                    100,
                    Math.round(
                      (sortedOps.reduce(
                        (sum, o) => sum + Math.min(1, (o.goodOutputQty || 0) / mo.targetQuantity),
                        0
                      ) /
                        totalOps) *
                        100
                    )
                  )
                : finalCompletionPct;
            const displayProgressPct = Math.max(finalCompletionPct, opWeightedPct);

            return (
              <div key={mo.id} className="sap-card overflow-hidden border border-[#d9d9d9]">
                {/* MO Header */}
                <div className="px-4 py-3 bg-[#f7f7f7] border-b border-[#d9d9d9] flex flex-col xl:flex-row xl:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-sm text-[#007cc0] bg-[#e5f3fa] border border-[#b3d7ff] px-2.5 py-0.5 rounded">
                        {mo.moNumber}
                      </span>
                      <span className="font-bold text-sm text-[#333333]">{mo.partName}</span>
                      <span className="font-mono text-xs text-[#555555] bg-white border border-[#d9d9d9] px-2 py-0.5 rounded">
                        کد قطعه: {mo.partCode}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded border text-[11px] font-bold ${stMeta.badgeClass}`}>
                        {stMeta.label}
                      </span>
                      {mo.parentMoNumber && (
                        <span className="px-2 py-0.5 rounded bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7] text-[11px] font-mono">
                          فرعیِ دستور: {mo.parentMoNumber}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#666666] flex-wrap">
                      <span>مسیر فرآیند: نسخه {mo.routingVersion || '1.0'}</span>
                      <span>·</span>
                      <span>
                        مراحل تکمیل‌شده: {toPersianDigits(completedOps)} از {toPersianDigits(totalOps)} ایستگاه
                      </span>
                      {mo.startDate && (
                        <>
                          <span>·</span>
                          <span>تاریخ شروع: {mo.startDate}</span>
                        </>
                      )}
                      {mo.notes && (
                        <>
                          <span>·</span>
                          <span className="text-[#333333]">{mo.notes}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress & Primary MO Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Quantities & Progress Bar */}
                    <div className="min-w-[230px] bg-white border border-[#d9d9d9] rounded px-3 py-1.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#666666]">
                          تحقق: <strong className="text-[#107e3e] font-mono">{formatNumber(mo.completedQuantity)}</strong> از{' '}
                          <strong className="text-[#333333] font-mono">{formatNumber(mo.targetQuantity)}</strong> عدد
                        </span>
                        <span className="font-mono font-bold text-[#007cc0]">
                          {toPersianDigits(displayProgressPct)}٪
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#e8e8e8] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            displayProgressPct >= 100 ? 'bg-[#107e3e]' : 'bg-[#007cc0]'
                          }`}
                          style={{ width: `${displayProgressPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#666666] font-mono">
                        <span>ورودی خط: {formatNumber(mo.initialInputQuantity)}</span>
                        <span className="text-[#bb0000]">ضایعات کل: {formatNumber(mo.totalScrapQuantity)}</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setLoadMaterialOrder(mo);
                          setLoadMaterialQty(String(mo.targetQuantity || 500));
                          setLoadMaterialNotes('');
                        }}
                        className="sap-btn-standard px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1 cursor-pointer text-[#007cc0]"
                        title="تغذیه سرکلاف یا شیت ورودی به ایستگاه اول (OP10)"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        <span>بارگذاری سرکلاف / مواد (OP10)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          router.navigate({
                            tab: 'wip',
                            wipSubTab: 'UNIFIED_DIRECTORY',
                            moId: mo.id,
                          })
                        }
                        className="sap-btn-standard px-2.5 py-1.5 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                        title="مشاهده پرونده کامل و درخت رهگیری در کارتابل WIP"
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        <span>رهگیری در WIP</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDeleteModal(mo)}
                        className="px-2.5 py-1.5 rounded border border-[#f5b8b8] bg-[#fde8e8] hover:bg-[#fbd0d0] text-[#bb0000] text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                        title="حذف کامل دستور ساخت و بازگشت مواد مصرفی به انبار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف و بازگشت موجودی</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Operations Table for this MO */}
                <div className="overflow-x-auto">
                  <table className="sap-table-compact w-full text-right text-xs">
                    <thead className="bg-white border-b border-[#d9d9d9] text-[#555555]">
                      <tr>
                        <th className="w-28">کد ایستگاه (OP)</th>
                        <th>شرح عملیات تولید</th>
                        <th>دستگاه / ایستگاه کاری</th>
                        <th className="w-32">وضعیت ایستگاه</th>
                        <th className="w-28">صف ورودی (PCS)</th>
                        <th className="w-28">پای دستگاه (PCS)</th>
                        <th className="w-32">خروجی سالم / هدف</th>
                        <th className="w-24">ضایعات</th>
                        <th className="w-44 text-left">عملیات ثبت خروجی و QC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eeeeee] tabular-nums">
                      {sortedOps.map((op, idx) => {
                        const availableToProduce = (op.inProgressQty || 0) + (op.waitingInputQty || 0);
                        return (
                          <tr key={op.id} className="hover:bg-[#f5faff] transition-colors">
                            <td className="font-mono font-bold text-[#333333] whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span>{op.stepCode}</span>
                                {idx === 0 && (
                                  <span className="px-1.5 py-0.2 bg-[#e5f3fa] text-[#007cc0] rounded text-[10px]">
                                    ورودی سرکلاف
                                  </span>
                                )}
                                {idx === sortedOps.length - 1 && (
                                  <span className="px-1.5 py-0.2 bg-[#eef8f2] text-[#107e3e] rounded text-[10px]">
                                    نهایی
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="font-medium text-[#333333]">{op.stepName}</td>
                            <td className="text-[#666666] whitespace-nowrap">
                              {op.machineName || 'ایستگاه استاندارد'}
                            </td>
                            <td>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  op.status === 'COMPLETED'
                                    ? 'bg-[#eef8f2] text-[#107e3e] border-[#b7dfc5]'
                                    : op.status === 'IN_PROGRESS' || op.status === 'READY'
                                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#b3d7ff]'
                                    : 'bg-[#f5f5f5] text-[#666666] border-[#d9d9d9]'
                                }`}
                              >
                                {op.status === 'COMPLETED'
                                  ? 'تکمیل‌شده'
                                  : op.status === 'IN_PROGRESS'
                                  ? 'در حال تولید'
                                  : op.status === 'READY'
                                  ? 'آماده شروع'
                                  : 'در انتظار مرحله قبل'}
                              </span>
                            </td>
                            <td className="font-mono font-semibold text-[#007cc0]">
                              {formatNumber(op.waitingInputQty || 0)}
                            </td>
                            <td className="font-mono font-semibold text-[#e9730c]">
                              {formatNumber(op.inProgressQty || 0)}
                            </td>
                            <td className="font-mono">
                              <strong className="text-[#107e3e]">{formatNumber(op.goodOutputQty || 0)}</strong>
                              <span className="text-[#999999]"> / {formatNumber(mo.targetQuantity)}</span>
                            </td>
                            <td className="font-mono text-[#bb0000]">
                              {formatNumber(op.scrapQty || 0)}
                            </td>
                            <td className="text-left whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setActiveProdOp(op)}
                                className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer inline-flex items-center gap-1 transition ${
                                  availableToProduce > 0
                                    ? 'bg-[#107e3e] hover:bg-[#0d6832] text-white'
                                    : 'bg-white hover:bg-[#f0f0f0] text-[#333333] border border-[#bfbfbf]'
                                }`}
                              >
                                <Play className="w-3 h-3" />
                                <span>ثبت خروجی و QC ({op.stepCode})</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: CREATE NEW MANUFACTURING ORDER (MO)                         */}
      {/* ==================================================================== */}
      <CreateMoModal
        isOpen={isCreateMoOpen}
        onClose={() => setIsCreateMoOpen(false)}
        parts={parts}
        routings={routings}
        onSubmit={handleCreateMo}
      />

      {/* ==================================================================== */}
      {/* MODAL 2: REGISTER OPERATION PRODUCTION & QC (OP10_SLIT .. FINAL)     */}
      {/* ==================================================================== */}
      <OperationProductionModal
        isOpen={Boolean(activeProdOp)}
        onClose={() => setActiveProdOp(null)}
        operation={activeProdOp}
        onSubmit={handleRegisterOpProduction}
      />

      {/* ==================================================================== */}
      {/* MODAL 3: LOAD COIL / RAW MATERIAL INTO OP10                          */}
      {/* ==================================================================== */}
      {loadMaterialOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40 backdrop-blur-xs">
          <div className="bg-white border border-[#d9d9d9] rounded-md max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#e5f3fa] text-[#007cc0] border border-[#b3d7ff] rounded">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#333333]">
                    بارگذاری سرکلاف / شیت ورودی به خط ({loadMaterialOrder.moNumber})
                  </h3>
                  <p className="text-xs text-[#666666]">
                    {loadMaterialOrder.partName} ({loadMaterialOrder.partCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoadMaterialOrder(null)}
                className="p-1 text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLoadMaterialSubmit} className="space-y-3.5 text-xs">
              <div className="p-3 bg-[#f0f8ff] border border-[#b3ddf2] rounded space-y-1 text-[11px] text-[#333333]">
                <div className="font-bold text-[#004e7a]">تغذیه ورودی ایستگاه اول (OP10):</div>
                <p>
                  با ثبت این فرم، تعداد شیت/بلنک معادل سرکلاف در صف ورودی ایستگاه اول قرار می‌گیرد تا اپراتور بتواند بدون خطای کمبود موجودی، خروجی <code>OP10</code> را ثبت نماید.
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#333333] block">
                  تعداد ورودی قابل تولید از سرکلاف / پالت ورق (PCS) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={loadMaterialQty}
                  onChange={e => setLoadMaterialQty(e.target.value)}
                  className="w-full bg-white border border-[#bfbfbf] rounded p-2 font-mono font-bold text-sm text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#333333] block">شماره کلاف / ذوب یا توضیحات حواله</label>
                <input
                  type="text"
                  value={loadMaterialNotes}
                  onChange={e => setLoadMaterialNotes(e.target.value)}
                  placeholder="مثال: سرکلاف MOB-DC01A-2.0-1140-A - ذوب HT-DC01A-9921"
                  className="w-full bg-white border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => {
                    setLoadMaterialOrder(null);
                    router.navigate({ tab: 'inventory', inventorySubTab: 'COILS' });
                  }}
                  className="text-[11px] font-semibold text-[#007cc0] hover:underline cursor-pointer"
                >
                  رفتن به جدول رول‌های ورق و کویل‌پک ←
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLoadMaterialOrder(null)}
                    className="sap-btn-standard px-3.5 py-1.5 cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={isLoadingMaterial}
                    className="sap-btn-emphasized px-4 py-1.5 font-bold cursor-pointer"
                  >
                    {isLoadingMaterial ? 'در حال ثبت...' : 'تایید و شارژ ورودی OP10'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: DELETE MO & CASCADING INVENTORY ROLLBACK                    */}
      {/* ==================================================================== */}
      {deleteTargetOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#333333]/40 backdrop-blur-xs">
          <div className="bg-white border border-[#d9d9d9] rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs">
            <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#fde8e8] text-[#bb0000] border border-[#f5b8b8] rounded">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#bb0000]">
                    حذف کامل دستور ساخت و بازگشت موجودی به انبار ({deleteTargetOrder.moNumber})
                  </h3>
                  <p className="text-xs text-[#666666]">
                    {deleteTargetOrder.partName} ({deleteTargetOrder.partCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTargetOrder(null)}
                className="p-1 text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewLoading ? (
              <div className="p-4 text-center text-[#666666]">
                در حال محاسبه اسناد انبار و دستورات فرعی وابسته...
              </div>
            ) : (
              rollbackPreview && (
                <div className="p-3 bg-[#fff8f8] border border-[#f5b8b8] rounded space-y-2">
                  <div className="font-bold text-[#bb0000]">پیش‌نمایش تاثیر حذف و بازگشت به انبار:</div>
                  <div className="space-y-1 text-[11px] text-[#333333]">
                    <div>
                      • <strong>دستورات ساخت حذف‌شونده:</strong>{' '}
                      {(rollbackPreview.mosToDelete || []).map((m: any) => m.moNumber).join(' ، ') ||
                        deleteTargetOrder.moNumber}
                    </div>
                    <div>
                      • <strong>اسناد انبار جهت ابطال معکوس:</strong>{' '}
                      {toPersianDigits(rollbackPreview.documentsToReverseCount || 0)} سند
                    </div>
                    {Array.isArray(rollbackPreview.materialsToReturn) &&
                      rollbackPreview.materialsToReturn.length > 0 && (
                        <div>
                          • <strong>مواد اولیه بازگشتی به انبار:</strong>{' '}
                          {rollbackPreview.materialsToReturn
                            .map((m: any) => `${m.partName}: ${formatNumber(m.quantity)} ${m.unit}`)
                            .join(' | ')}
                        </div>
                      )}
                  </div>
                </div>
              )
            )}

            <form onSubmit={handleConfirmDeleteMo} className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cascadeSubMos}
                  onChange={e => setCascadeSubMos(e.target.checked)}
                />
                <span className="font-semibold text-[#333333]">
                  حذف همزمان دستورات ساخت فرعی وابسته (Sub-MOs) و بازگشت مواد آن‌ها
                </span>
              </label>

              <div className="space-y-1">
                <label className="font-bold text-[#333333] block">
                  علت حذف دستور ساخت (ثبت در لاگ ممیزی) *
                </label>
                <input
                  type="text"
                  required
                  minLength={5}
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="w-full bg-white border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] focus:outline-none focus:border-[#bb0000]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setDeleteTargetOrder(null)}
                  disabled={isDeleting}
                  className="sap-btn-standard px-4 py-1.5 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="px-4 py-1.5 bg-[#bb0000] hover:bg-[#990000] text-white rounded font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'در حال حذف و بازگشت موجودی...' : 'تایید حذف کامل و بازگشت موجودی'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive Visual Step-by-Step Guide Modal */}
      <MoRelationalGuideModal
        isOpen={isVisualGuideOpen}
        onClose={() => setIsVisualGuideOpen(false)}
        onOpenCreateMo={() => setIsCreateMoOpen(true)}
      />
    </div>
  );
};
