import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  ClipboardList,
  Factory,
  GitBranch,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Wrench,
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
  if (st === 'ON_HOLD' || st === 'STOPPED' || st === 'CANCELLED') return true;
  if (st === 'PLANNED') return true;
  return false;
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
    const inProgressOrders = orders.filter(isOrderActive);
    const stoppedOrders = orders.filter(isOrderStopped);
    const completedOrders = orders.filter(o => o.status === 'COMPLETED');

    const totalTarget = orders.reduce((acc, o) => acc + (o.targetQuantity || 0), 0);
    const totalCompleted = orders.reduce((acc, o) => acc + (o.completedQuantity || 0), 0);
    const totalScrap = orders.reduce((acc, o) => acc + (o.totalScrapQuantity || 0), 0);

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
      inProgressCount: inProgressOrders.length,
      stoppedCount: stoppedOrders.length,
      completedCount: completedOrders.length,
      totalTarget,
      totalCompleted,
      totalScrap,
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

    // Prioritize in-progress & stopped orders first for quick floor visibility
    return [...list]
      .sort((a, b) => {
        const rank = (o: ManufacturingOrder) =>
          isOrderStopped(o) ? 0 : isOrderActive(o) ? 1 : 2;
        return rank(a) - rank(b);
      })
      .slice(0, 5);
  }, [orders, statusFilter]);

  const hallSummaries = useMemo(() => {
    if (!halls || halls.length === 0) {
      const activeMachines = machines.filter(m => m.status === 'ACTIVE').length;
      const stoppedMachines = machines.length - activeMachines;
      return [
        {
          id: 'ALL-HALLS',
          name: 'کل سالن‌های تولید',
          activeMachines,
          totalMachines: machines.length,
          stoppedMachines,
        },
      ];
    }

    return halls.slice(0, 4).map((hall: any) => {
      const hallMachines = machines.filter(
        m => m.hallId === hall.id || (hall.name && m.location === hall.name)
      );
      const activeMachines = hallMachines.filter(m => m.status === 'ACTIVE').length;
      return {
        id: hall.id || hall.name,
        name: hall.name || hall.title || 'سالن تولید',
        activeMachines,
        totalMachines: hallMachines.length,
        stoppedMachines: Math.max(0, hallMachines.length - activeMachines),
      };
    });
  }, [halls, machines]);

  const activeMachinesTotal = machines.filter(m => m.status === 'ACTIVE').length;
  const haltedMachinesTotal = Math.max(0, machines.length - activeMachinesTotal);

  return (
    <section
      className="bg-white border border-[#d9dfe5] rounded-md overflow-hidden"
      dir="rtl"
      aria-label="وضعیت یکپارچه دستورات ساخت و جریان تولید"
    >
      {/* Header Row */}
      <div className="px-4 py-2.5 border-b border-[#e8edf2] flex flex-wrap items-center justify-between gap-2 bg-[#fafbfc]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded bg-[#e8f3fc] border border-[#c5e0f7] text-[#007cc0] flex items-center justify-center shrink-0">
            <Factory className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-[#1d2d3e] truncate">
              پایش یکپارچه دستورات ساخت (MO) و وضعیت سالن‌های تولید (WIP)
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-[#556b82] flex-wrap tabular-nums">
              <span>{toPersianDigits(metrics.totalOrders)} دستور ثبت‌شده</span>
              <span aria-hidden="true">·</span>
              <span>
                {formatNumber(metrics.totalCompleted)} از {formatNumber(metrics.totalTarget)} قطعه تکمیل‌شده
              </span>
              <span aria-hidden="true">·</span>
              <span>
                آماده‌بکاری ماشین‌آلات: {toPersianDigits(activeMachinesTotal)} از {toPersianDigits(machines.length)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={fetchOrders}
            disabled={loading}
            className="sap-btn-standard px-2 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            title="بروزرسانی لحظه‌ای وضعیت دستورات ساخت"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>بروزرسانی</span>
          </button>
          <button
            type="button"
            onClick={() =>
              router.navigate({
                tab: 'production',
                productionViewMode: 'ERP_WORKBENCH',
                productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
              })
            }
            className="sap-btn-emphasized px-2.5 py-1 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>مدیریت دستورات (MO)</span>
          </button>
          <button
            type="button"
            onClick={() => router.navigate({ tab: 'wip', wipSubTab: 'ORDERS' })}
            className="sap-btn-standard px-2.5 py-1 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 text-[#007cc0]"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>کارتابل WIP</span>
          </button>
        </div>
      </div>

      {/* Unified KPI Strip + Overall Progress Bar */}
      <div className="px-4 py-3 border-b border-[#e8edf2] grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* 4 Compact Status Metrics */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-[#e8edf2] tabular-nums">
          <button
            type="button"
            onClick={() => setStatusFilter(prev => (prev === 'ACTIVE' ? 'ALL' : 'ACTIVE'))}
            className={`text-right px-2.5 py-1 transition-colors cursor-pointer rounded-sm ${
              statusFilter === 'ACTIVE' ? 'bg-[#e8f3fc]' : 'hover:bg-[#f5f7fa]'
            }`}
          >
            <div className="flex items-center gap-1 text-[11px] text-[#556b82]">
              <PlayCircle className="w-3.5 h-3.5 text-[#007cc0] shrink-0" />
              <span className="truncate">در حال انجام</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-[#007cc0]">
                {toPersianDigits(metrics.inProgressCount)}
              </span>
              <span className="text-[11px] text-[#666666]">دستور فعال</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(prev => (prev === 'STOPPED' ? 'ALL' : 'STOPPED'))}
            className={`text-right px-2.5 py-1 transition-colors cursor-pointer rounded-sm ${
              statusFilter === 'STOPPED' ? 'bg-[#fff4e5]' : 'hover:bg-[#f5f7fa]'
            }`}
          >
            <div className="flex items-center gap-1 text-[11px] text-[#556b82]">
              <PauseCircle
                className={`w-3.5 h-3.5 shrink-0 ${
                  metrics.stoppedCount > 0 ? 'text-[#bb0000]' : 'text-[#666666]'
                }`}
              />
              <span className="truncate">متوقف / منتظر شروع</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span
                className={`text-xl font-bold font-mono ${
                  metrics.stoppedCount > 0 ? 'text-[#bb0000]' : 'text-[#333333]'
                }`}
              >
                {toPersianDigits(metrics.stoppedCount)}
              </span>
              <span className="text-[11px] text-[#666666]">دستور</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(prev => (prev === 'COMPLETED' ? 'ALL' : 'COMPLETED'))}
            className={`text-right px-2.5 py-1 transition-colors cursor-pointer rounded-sm ${
              statusFilter === 'COMPLETED' ? 'bg-[#eef8f2]' : 'hover:bg-[#f5f7fa]'
            }`}
          >
            <div className="flex items-center gap-1 text-[11px] text-[#556b82]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e] shrink-0" />
              <span className="truncate">تکمیل‌شده</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-[#107e3e]">
                {toPersianDigits(metrics.completedCount)}
              </span>
              <span className="text-[11px] text-[#666666]">دستور</span>
            </div>
          </button>

          <div className="px-2.5 py-1">
            <div className="flex items-center gap-1 text-[11px] text-[#556b82]">
              <Activity className="w-3.5 h-3.5 text-[#e9730c] shrink-0" />
              <span className="truncate">قطعات در جریان (WIP)</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-bold font-mono text-[#1d2d3e]">
                {formatNumber(metrics.totalWipQty)}
              </span>
              <span className="text-[11px] text-[#666666]">عدد</span>
            </div>
          </div>
        </div>

        {/* Overall Progress Bar + Hall Readiness */}
        <div className="lg:col-span-5 lg:border-r lg:border-[#e8edf2] lg:pr-4 space-y-2">
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="font-semibold text-[#1d2d3e]">پیشرفت کلی برنامه تولید سالن‌ها</span>
            <span className="font-mono font-bold text-[#007cc0]">
              {toPersianDigits(metrics.overallProgressPct)}٪
            </span>
          </div>
          <div
            className="w-full h-2.5 bg-[#eaedf0] rounded-full overflow-hidden"
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
              style={{ width: `${Math.max(metrics.overallProgressPct, metrics.totalOrders > 0 ? 3 : 0)}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-[#556b82] flex-wrap tabular-nums">
            <div className="flex items-center gap-2 flex-wrap">
              {hallSummaries.map(h => (
                <span key={h.id} className="inline-flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-[#556b82]" />
                  <span>{h.name}:</span>
                  <strong
                    className={
                      h.stoppedMachines > 0 ? 'text-[#e9730c] font-mono' : 'text-[#107e3e] font-mono'
                    }
                  >
                    {toPersianDigits(h.activeMachines)}/{toPersianDigits(h.totalMachines)}
                  </strong>
                </span>
              ))}
            </div>
            {haltedMachinesTotal > 0 && (
              <span className="text-[#bb0000] font-semibold">
                {toPersianDigits(haltedMachinesTotal)} دستگاه متوقف/نت
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar + Compact Orders Snapshot Table */}
      <div className="px-4 py-2 bg-white flex flex-wrap items-center justify-between gap-2 border-b border-[#eff2f5]">
        <div className="flex items-center gap-1 p-0.5 bg-[#f2f4f7] rounded-md">
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
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-white text-[#007cc0] font-bold shadow-2xs'
                  : 'text-[#556b82] hover:text-[#1d2d3e]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {metrics.totalScrap > 0 && (
          <div className="text-[11px] text-[#bb0000] tabular-nums">
            مجموع ضایعات ثبت‌شده: <strong className="font-mono">{formatNumber(metrics.totalScrap)}</strong> عدد
          </div>
        )}
      </div>

      {/* Data Area: Loading / Error / Empty / Compact High-Density Table */}
      {loading ? (
        <div className="p-4 space-y-2 animate-pulse">
          {[0, 1, 2].map(idx => (
            <div key={idx} className="h-9 bg-[#f2f4f7] rounded" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 flex items-center justify-between gap-3 text-xs text-[#bb0000] bg-[#fff5f5]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchOrders}
            className="sap-btn-standard px-2.5 py-1 text-xs cursor-pointer"
          >
            تلاش مجدد
          </button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-[#556b82] flex flex-col sm:flex-row items-center justify-center gap-3">
          <span>
            {orders.length === 0
              ? 'هنوز هیچ دستور ساختی (MO) در سیستم ثبت نشده است.'
              : 'هیچ دستور ساختی با فیلتر انتخابی یافت نشد.'}
          </span>
          {orders.length === 0 ? (
            <button
              type="button"
              onClick={() =>
                router.navigate({
                  tab: 'production',
                  productionViewMode: 'ERP_WORKBENCH',
                  productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
                })
              }
              className="sap-btn-emphasized px-3 py-1 text-xs cursor-pointer"
            >
              صدور اولین دستور ساخت (MO)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className="sap-btn-standard px-3 py-1 text-xs cursor-pointer"
            >
              نمایش همه دستورات
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead className="bg-[#fafbfc] border-b border-[#e8edf2] text-[11px] text-[#556b82]">
              <tr>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">شماره دستور (MO)</th>
                <th className="py-2 px-3 font-semibold">قطعه / محصول</th>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">ایستگاه فعال</th>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">وضعیت</th>
                <th className="py-2 px-3 font-semibold w-44">پیشرفت ساخت</th>
                <th className="py-2 px-3 font-semibold text-left whitespace-nowrap">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eff2f5] tabular-nums">
              {filteredOrders.map(mo => {
                const pct = computeOrderProgressPct(mo);
                const sortedOps = [...(mo.operations || [])].sort((a, b) => a.stepNumber - b.stepNumber);
                const activeOp =
                  sortedOps.find(o => o.status === 'IN_PROGRESS' || o.status === 'READY') ||
                  sortedOps[sortedOps.length - 1];
                const stopped = isOrderStopped(mo);
                const completed = mo.status === 'COMPLETED';

                const statusText = completed
                  ? 'تکمیل‌شده'
                  : mo.status === 'IN_PROGRESS'
                  ? 'در حال تولید'
                  : mo.status === 'RELEASED'
                  ? 'آماده اجرا'
                  : mo.status === 'PLANNED'
                  ? 'منتظر شروع'
                  : 'متوقف / لغو';

                const statusTextColor = completed
                  ? 'text-[#107e3e]'
                  : stopped
                  ? 'text-[#bb0000]'
                  : 'text-[#007cc0]';

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
                    className="hover:bg-[#f4f8fc] transition-colors cursor-pointer group"
                  >
                    <td className="py-2 px-3 font-mono font-bold text-[#007cc0] whitespace-nowrap">
                      {mo.moNumber}
                    </td>
                    <td className="py-2 px-3 max-w-[260px]">
                      <div className="font-semibold text-[#1d2d3e] truncate">{mo.partName}</div>
                      <div className="text-[10px] text-[#556b82] font-mono">{mo.partCode}</div>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-[#333333]">
                      {activeOp ? (
                        <span>
                          <strong className="font-mono text-[11px]">{activeOp.stepCode}</strong>
                          <span className="text-[#556b82]"> · {activeOp.machineName || activeOp.stepName}</span>
                        </span>
                      ) : (
                        <span className="text-[#888888]">—</span>
                      )}
                    </td>
                    <td className={`py-2 px-3 whitespace-nowrap font-semibold ${statusTextColor}`}>
                      {statusText}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-[#eaedf0] rounded-full overflow-hidden min-w-[72px]">
                          <div
                            className={`h-full ${
                              completed
                                ? 'bg-[#107e3e]'
                                : stopped
                                ? 'bg-[#e9730c]'
                                : 'bg-[#007cc0]'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] font-bold text-[#1d2d3e] w-9 text-left">
                          {toPersianDigits(pct)}٪
                        </span>
                      </div>
                      <div className="text-[10px] text-[#556b82] font-mono mt-0.5">
                        {formatNumber(mo.completedQuantity || 0)} / {formatNumber(mo.targetQuantity || 0)} PCS
                      </div>
                    </td>
                    <td className="py-2 px-3 text-left whitespace-nowrap">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          router.navigate({
                            tab: 'production',
                            productionViewMode: 'ERP_WORKBENCH',
                            productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
                            docQuery: mo.moNumber,
                          });
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#007cc0] hover:underline cursor-pointer"
                      >
                        <span>جزئیات</span>
                        <ArrowUpLeft className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
