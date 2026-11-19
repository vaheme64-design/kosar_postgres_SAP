import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Factory,
  GitBranch,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import { Machine } from '../../types/inventory';
import { ManufacturingOrder } from '../../types/productionWip';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';

interface DashboardMoWipWidgetProps {
  machines: Machine[];
  halls: any[];
  onOrdersLoaded?: (summary: {
    totalOrders: number;
    inProgressCount: number;
    stoppedCount: number;
    completedCount: number;
    totalWipQty: number;
    overallProgressPct: number;
  }) => void;
}

type WidgetStatusFilter = 'ALL' | 'ACTIVE' | 'STOPPED' | 'COMPLETED';

function isOrderStopped(order: ManufacturingOrder): boolean {
  const st = String(order.status || '').toUpperCase();
  return st === 'ON_HOLD' || st === 'STOPPED' || st === 'CANCELLED' || st === 'PLANNED';
}

function isOrderActive(order: ManufacturingOrder): boolean {
  const st = String(order.status || '').toUpperCase();
  return st === 'IN_PROGRESS' || st === 'RELEASED';
}

function computeOrderProgressPct(mo: ManufacturingOrder): number {
  const target = mo.targetQuantity || 0;
  if (target <= 0) return 0;
  const finalPct = Math.min(100, Math.round(((mo.completedQuantity || 0) / target) * 100));
  const ops = mo.operations || [];
  if (ops.length === 0) return finalPct;
  const weightedPct = Math.min(
    100,
    Math.round(
      (ops.reduce((sum, op) => sum + Math.min(1, (op.goodOutputQty || 0) / target), 0) /
        ops.length) *
        100
    )
  );
  return Math.max(finalPct, weightedPct);
}

export const DashboardMoWipWidget: React.FC<DashboardMoWipWidgetProps> = ({
  machines,
  halls,
  onOrdersLoaded,
}) => {
  const router = useErpRouter();
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<WidgetStatusFilter>('ALL');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/wip/manufacturing-orders');
      if (!res.ok) throw new Error('خطا در دریافت اطلاعات دستورات ساخت');
      const json = await res.json();
      const list: ManufacturingOrder[] = json?.success && Array.isArray(json.data) ? json.data : [];
      setOrders(list);
    } catch (err: any) {
      setError(err?.message || 'خطا در اتصال به سرور تولید');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const handler = () => fetchOrders();
    window.addEventListener('kpims-master-data-updated', handler);
    return () => window.removeEventListener('kpims-master-data-updated', handler);
  }, [fetchOrders]);

  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const inProgressCount = orders.filter(isOrderActive).length;
    const stoppedCount = orders.filter(isOrderStopped).length;
    const completedCount = orders.filter(o => o.status === 'COMPLETED').length;

    const totalTarget = orders.reduce((acc, o) => acc + (o.targetQuantity || 0), 0);
    const totalCompleted = orders.reduce((acc, o) => acc + (o.completedQuantity || 0), 0);

    const totalWipQty = orders.reduce((acc, o) => {
      const opsQty = (o.operations || []).reduce(
        (s, op) => s + (op.waitingInputQty || 0) + (op.inProgressQty || 0),
        0
      );
      return acc + opsQty;
    }, 0);

    const overallProgressPct =
      totalOrders > 0
        ? Math.round(
            orders.reduce((acc, o) => acc + computeOrderProgressPct(o), 0) / totalOrders
          )
        : 0;

    return {
      totalOrders,
      inProgressCount,
      stoppedCount,
      completedCount,
      totalTarget,
      totalCompleted,
      totalWipQty,
      overallProgressPct,
    };
  }, [orders]);

  const onOrdersLoadedRef = useRef(onOrdersLoaded);
  useEffect(() => {
    onOrdersLoadedRef.current = onOrdersLoaded;
  }, [onOrdersLoaded]);

  useEffect(() => {
    if (!loading && onOrdersLoadedRef.current) {
      onOrdersLoadedRef.current({
        totalOrders: metrics.totalOrders,
        inProgressCount: metrics.inProgressCount,
        stoppedCount: metrics.stoppedCount,
        completedCount: metrics.completedCount,
        totalWipQty: metrics.totalWipQty,
        overallProgressPct: metrics.overallProgressPct,
      });
    }
  }, [loading, metrics]);

  const filteredOrders = useMemo(() => {
    const list = orders.filter(order => {
      if (statusFilter === 'ACTIVE') return isOrderActive(order);
      if (statusFilter === 'STOPPED') return isOrderStopped(order);
      if (statusFilter === 'COMPLETED') return order.status === 'COMPLETED';
      return true;
    });
    return [...list]
      .sort((a, b) => {
        const rank = (o: ManufacturingOrder) =>
          isOrderStopped(o) ? 0 : isOrderActive(o) ? 1 : 2;
        return rank(a) - rank(b);
      })
      .slice(0, 5);
  }, [orders, statusFilter]);

  const activeMachinesTotal = machines.filter(m => m.status === 'ACTIVE').length;
  const hallsCount = halls?.length || 0;

  return (
    <section
      className="bg-white border border-[#d9dfe5] rounded-md overflow-hidden"
      dir="rtl"
      aria-label="خلاصه فشرده وضعیت دستورات ساخت و WIP"
    >
      {/* Slim Header Bar with Inline Progress & Quick Links */}
      <div className="px-3.5 py-2 border-b border-[#e8edf2] bg-[#fafbfc] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Factory className="w-4 h-4 text-[#007cc0] shrink-0" />
          <h2 className="text-xs font-bold text-[#1d2d3e] truncate">
            خلاصه وضعیت دستورات ساخت (MO) و جریان کارگاه (WIP)
          </h2>
          <span className="hidden md:inline text-[11px] text-[#556b82] tabular-nums">
            · {formatNumber(metrics.totalCompleted)} از {formatNumber(metrics.totalTarget)} قطعه
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Compact Inline Progress Indicator */}
          <div className="flex items-center gap-2 tabular-nums">
            <span className="text-[11px] text-[#556b82] hidden sm:inline">پیشرفت کل:</span>
            <div
              className="w-24 sm:w-32 h-2 bg-[#e8edf2] rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={metrics.overallProgressPct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full transition-all duration-300 ${
                  metrics.overallProgressPct >= 85
                    ? 'bg-[#107e3e]'
                    : metrics.stoppedCount > 0 && metrics.overallProgressPct < 40
                    ? 'bg-[#e9730c]'
                    : 'bg-[#007cc0]'
                }`}
                style={{ width: `${Math.max(metrics.overallProgressPct, metrics.totalOrders > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-[#007cc0]">
              {toPersianDigits(metrics.overallProgressPct)}٪
            </span>
          </div>

          <span className="text-[#d9dfe5] hidden sm:inline">|</span>

          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="p-1 rounded border border-[#d9dfe5] bg-white hover:bg-[#f0f6fd] text-[#556b82] hover:text-[#007cc0] cursor-pointer"
            title="بروزرسانی"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setExpandedDetails(prev => !prev)}
            className="sap-btn-standard px-2 py-1 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span>{expandedDetails ? 'بستن فهرست' : `فهرست دستورات (${toPersianDigits(metrics.totalOrders)})`}</span>
            {expandedDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => router.navigate({ tab: 'wip', wipSubTab: 'UNIFIED_DIRECTORY' })}
            className="sap-btn-emphasized px-2.5 py-1 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>نمودار و کارتابل WIP</span>
          </button>
        </div>
      </div>

      {/* Compact 5-Card Smart Tiles Band */}
      {error ? (
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs text-[#bb0000] bg-[#fff5f5]">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={fetchOrders} className="sap-btn-standard px-2 py-0.5 text-[11px] cursor-pointer">
            تلاش مجدد
          </button>
        </div>
      ) : (
        <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 tabular-nums">
          {/* Smart Tile 1: Total MOs */}
          <button
            type="button"
            onClick={() =>
              router.navigate({
                tab: 'production',
                productionViewMode: 'ERP_WORKBENCH',
                productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
              })
            }
            className="bg-[#fafbfc] hover:bg-[#f0f7fe] border border-[#e3e8ee] hover:border-[#007cc0] rounded px-3 py-2 text-right transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[11px] text-[#556b82]">
              <span className="truncate font-medium">کل دستورات (MO)</span>
              <ClipboardList className="w-3.5 h-3.5 text-[#007cc0] shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-lg font-bold font-mono text-[#1d2d3e] leading-none">
                {loading ? '—' : toPersianDigits(metrics.totalOrders)}
              </span>
              <span className="text-[10px] text-[#007cc0] inline-flex items-center gap-0.5 group-hover:underline">
                <span>مدیریت</span>
                <ArrowUpLeft className="w-3 h-3" />
              </span>
            </div>
          </button>

          {/* Smart Tile 2: In Progress */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ACTIVE');
              setExpandedDetails(true);
            }}
            className="bg-[#fafbfc] hover:bg-[#f0f7fe] border border-[#e3e8ee] hover:border-[#007cc0] rounded px-3 py-2 text-right transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[11px] text-[#556b82]">
              <span className="truncate font-medium">در حال انجام</span>
              <PlayCircle className="w-3.5 h-3.5 text-[#007cc0] shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-lg font-bold font-mono text-[#007cc0] leading-none">
                {loading ? '—' : toPersianDigits(metrics.inProgressCount)}
              </span>
              <span className="text-[10px] text-[#556b82]">فعال در خط</span>
            </div>
          </button>

          {/* Smart Tile 3: Stopped / Waiting */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter('STOPPED');
              setExpandedDetails(true);
            }}
            className="bg-[#fafbfc] hover:bg-[#fff8ee] border border-[#e3e8ee] hover:border-[#e9730c] rounded px-3 py-2 text-right transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[11px] text-[#556b82]">
              <span className="truncate font-medium">متوقف / منتظر</span>
              <PauseCircle
                className={`w-3.5 h-3.5 shrink-0 ${
                  metrics.stoppedCount > 0 ? 'text-[#bb0000]' : 'text-[#666666]'
                }`}
              />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span
                className={`text-lg font-bold font-mono leading-none ${
                  metrics.stoppedCount > 0 ? 'text-[#bb0000]' : 'text-[#1d2d3e]'
                }`}
              >
                {loading ? '—' : toPersianDigits(metrics.stoppedCount)}
              </span>
              <span className="text-[10px] text-[#556b82]">
                {metrics.stoppedCount > 0 ? 'نیازمند پیگیری' : 'بدون توقف'}
              </span>
            </div>
          </button>

          {/* Smart Tile 4: Completed */}
          <button
            type="button"
            onClick={() => {
              setStatusFilter('COMPLETED');
              setExpandedDetails(true);
            }}
            className="bg-[#fafbfc] hover:bg-[#f1f9f4] border border-[#e3e8ee] hover:border-[#107e3e] rounded px-3 py-2 text-right transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[11px] text-[#556b82]">
              <span className="truncate font-medium">تکمیل‌شده</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e] shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-lg font-bold font-mono text-[#107e3e] leading-none">
                {loading ? '—' : toPersianDigits(metrics.completedCount)}
              </span>
              <span className="text-[10px] text-[#556b82]">آماده تحویل</span>
            </div>
          </button>

          {/* Smart Tile 5: WIP Qty & Halls Readiness */}
          <button
            type="button"
            onClick={() => router.navigate({ tab: 'wip', wipSubTab: 'ORDERS' })}
            className="col-span-2 sm:col-span-1 bg-[#fafbfc] hover:bg-[#f0f7fe] border border-[#e3e8ee] hover:border-[#007cc0] rounded px-3 py-2 text-right transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between text-[11px] text-[#556b82]">
              <span className="truncate font-medium">قطعات WIP · سالن‌ها</span>
              <Activity className="w-3.5 h-3.5 text-[#e9730c] shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-lg font-bold font-mono text-[#1d2d3e] leading-none">
                {loading ? '—' : formatNumber(metrics.totalWipQty)}
              </span>
              <span className="text-[10px] text-[#556b82] truncate">
                {toPersianDigits(activeMachinesTotal)}/{toPersianDigits(machines.length)} پرس
                {hallsCount > 0 ? ` · ${toPersianDigits(hallsCount)} سالن` : ''}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Optional Collapsible Compact Orders List (Hidden by Default to Save Viewport Space) */}
      {expandedDetails && (
        <div className="border-t border-[#e8edf2]">
          <div className="px-3 py-1.5 bg-[#fafbfc] border-b border-[#eff2f5] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-0.5 bg-[#edf1f5] rounded">
              {(
                [
                  { id: 'ALL', label: `همه (${toPersianDigits(metrics.totalOrders)})` },
                  { id: 'ACTIVE', label: `در حال انجام (${toPersianDigits(metrics.inProgressCount)})` },
                  { id: 'STOPPED', label: `متوقف/منتظر (${toPersianDigits(metrics.stoppedCount)})` },
                  { id: 'COMPLETED', label: `تکمیل‌شده (${toPersianDigits(metrics.completedCount)})` },
                ] as { id: WidgetStatusFilter; label: string }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white text-[#007cc0] shadow-2xs'
                      : 'text-[#556b82] hover:text-[#1d2d3e]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                router.navigate({
                  tab: 'production',
                  productionViewMode: 'ERP_WORKBENCH',
                  productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
                })
              }
              className="text-[11px] font-semibold text-[#007cc0] hover:underline cursor-pointer"
            >
              مشاهده همه در میز کار تولید ←
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="px-4 py-3 text-center text-xs text-[#556b82]">
              هیچ دستور ساختی با این وضعیت یافت نشد.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse tabular-nums">
                <tbody className="divide-y divide-[#eff2f5]">
                  {filteredOrders.map(mo => {
                    const pct = computeOrderProgressPct(mo);
                    const stopped = isOrderStopped(mo);
                    const completed = mo.status === 'COMPLETED';
                    return (
                      <tr
                        key={mo.id}
                        onClick={() =>
                          router.navigate({
                            tab: 'wip',
                            wipSubTab: 'UNIFIED_DIRECTORY',
                            moId: mo.id,
                          })
                        }
                        className="hover:bg-[#f4f8fc] cursor-pointer"
                      >
                        <td className="py-1.5 px-3 font-mono font-bold text-[#007cc0] whitespace-nowrap">
                          {mo.moNumber}
                        </td>
                        <td className="py-1.5 px-3 text-[#1d2d3e] font-medium truncate max-w-[220px]">
                          {mo.partName}{' '}
                          <span className="text-[10px] font-mono text-[#556b82]">({mo.partCode})</span>
                        </td>
                        <td
                          className={`py-1.5 px-3 font-semibold whitespace-nowrap ${
                            completed
                              ? 'text-[#107e3e]'
                              : stopped
                              ? 'text-[#bb0000]'
                              : 'text-[#007cc0]'
                          }`}
                        >
                          {completed ? 'تکمیل‌شده' : stopped ? 'متوقف / منتظر' : 'در حال انجام'}
                        </td>
                        <td className="py-1.5 px-3 w-36">
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-[#eaedf0] rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  completed ? 'bg-[#107e3e]' : stopped ? 'bg-[#e9730c]' : 'bg-[#007cc0]'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[10px] font-bold text-[#1d2d3e] w-8 text-left">
                              {toPersianDigits(pct)}٪
                            </span>
                          </div>
                        </td>
                        <td className="py-1.5 px-3 text-left whitespace-nowrap">
                          <span className="text-[10px] text-[#007cc0] font-semibold">رهگیری ←</span>
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
    </section>
  );
};
