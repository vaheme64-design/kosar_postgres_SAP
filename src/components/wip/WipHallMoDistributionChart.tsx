import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Factory,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';
import { FactoryHall, Machine } from '../../types/inventory';
import { ManufacturingOrder } from '../../types/productionWip';
import { formatNumber, toPersianDigits } from '../../utils/formatters';

interface WipHallMoDistributionChartProps {
  orders: ManufacturingOrder[];
  machines: Machine[];
  halls?: FactoryHall[];
  activeStatusFilter?: string;
  onSelectStatusFilter?: (status: string) => void;
}

interface HallDistributionRow {
  hallKey: string;
  hallName: string;
  inProgress: number;
  stopped: number;
  completed: number;
  total: number;
  avgProgressPct: number;
  wipQty: number;
  activeMachines: number;
  totalMachines: number;
}

function classifyMoStatus(mo: ManufacturingOrder): 'IN_PROGRESS' | 'STOPPED' | 'COMPLETED' {
  const st = String(mo.status || '').toUpperCase();
  if (st === 'COMPLETED') return 'COMPLETED';
  if (st === 'IN_PROGRESS' || st === 'RELEASED') return 'IN_PROGRESS';
  return 'STOPPED'; // PLANNED, ON_HOLD, CANCELLED, STOPPED
}

function computeMoProgressPct(mo: ManufacturingOrder): number {
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

function inferHallNameFromProcess(processType?: string, stepName?: string): string {
  const text = `${processType || ''} ${stepName || ''}`.toUpperCase();
  if (text.includes('WELD') || text.includes('جوش') || text.includes('مهره')) {
    return 'سالن جوشکاری و مونتاژ';
  }
  if (text.includes('SLIT') || text.includes('SHEAR') || text.includes('برش') || text.includes('نوار')) {
    return 'سالن برشکاری و آماده‌سازی ورق';
  }
  if (text.includes('COAT') || text.includes('PAINT') || text.includes('رنگ') || text.includes('کاتافورز')) {
    return 'خط رنگ و پوشش (ED)';
  }
  if (text.includes('ASSY') || text.includes('ASSEM') || text.includes('مونتاژ')) {
    return 'سالن مونتاژ و بسته‌بندی';
  }
  return 'سالن پرسکاری و کشش';
}

export const WipHallMoDistributionChart: React.FC<WipHallMoDistributionChartProps> = ({
  orders,
  machines,
  halls = [],
  activeStatusFilter = 'ALL',
  onSelectStatusFilter,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<'IN_PROGRESS' | 'STOPPED' | 'COMPLETED' | null>(null);

  const { totals, hallRows } = useMemo(() => {
    const machineById = new Map<string, Machine>();
    const machineByName = new Map<string, Machine>();
    machines.forEach(m => {
      if (m.id) machineById.set(m.id, m);
      if (m.name) machineByName.set(m.name.trim().toLowerCase(), m);
      if (m.code) machineByName.set(m.code.trim().toLowerCase(), m);
    });

    const hallById = new Map<string, FactoryHall>();
    halls.forEach(h => {
      if (h.id) hallById.set(h.id, h);
    });

    const hallMap = new Map<string, HallDistributionRow>();

    // Pre-populate configured factory halls so empty halls are also visible in the unified chart
    halls.forEach(h => {
      const hallMachines = machines.filter(
        m => m.hallId === h.id || (h.name && m.location === h.name)
      );
      hallMap.set(h.name, {
        hallKey: h.id || h.name,
        hallName: h.name,
        inProgress: 0,
        stopped: 0,
        completed: 0,
        total: 0,
        avgProgressPct: 0,
        wipQty: 0,
        activeMachines: hallMachines.filter(m => m.status === 'ACTIVE').length,
        totalMachines: hallMachines.length,
      });
    });

    const progressSumByHall = new Map<string, number>();

    let inProgressTotal = 0;
    let stoppedTotal = 0;
    let completedTotal = 0;

    orders.forEach(mo => {
      const bucket = classifyMoStatus(mo);
      if (bucket === 'IN_PROGRESS') inProgressTotal++;
      else if (bucket === 'STOPPED') stoppedTotal++;
      else completedTotal++;

      const sortedOps = [...(mo.operations || [])].sort((a, b) => a.stepNumber - b.stepNumber);
      const activeOp =
        sortedOps.find(o => o.status === 'IN_PROGRESS' || o.status === 'READY') ||
        sortedOps[0];

      let resolvedHallName = '';
      if (activeOp) {
        const matchedMachine =
          (activeOp.machineId ? machineById.get(activeOp.machineId) : undefined) ||
          (activeOp.machineName ? machineByName.get(activeOp.machineName.trim().toLowerCase()) : undefined);

        if (matchedMachine) {
          if (matchedMachine.hallId && hallById.has(matchedMachine.hallId)) {
            resolvedHallName = hallById.get(matchedMachine.hallId)!.name;
          } else if (matchedMachine.location && matchedMachine.location.trim()) {
            resolvedHallName = matchedMachine.location.trim();
          }
        }
        if (!resolvedHallName) {
          resolvedHallName = inferHallNameFromProcess(activeOp.processType, activeOp.stepName);
        }
      } else {
        resolvedHallName = 'سالن پرسکاری و کشش';
      }

      if (!hallMap.has(resolvedHallName)) {
        const hallMachines = machines.filter(m => m.location === resolvedHallName);
        hallMap.set(resolvedHallName, {
          hallKey: resolvedHallName,
          hallName: resolvedHallName,
          inProgress: 0,
          stopped: 0,
          completed: 0,
          total: 0,
          avgProgressPct: 0,
          wipQty: 0,
          activeMachines: hallMachines.filter(m => m.status === 'ACTIVE').length,
          totalMachines: hallMachines.length,
        });
      }

      const row = hallMap.get(resolvedHallName)!;
      if (bucket === 'IN_PROGRESS') row.inProgress++;
      else if (bucket === 'STOPPED') row.stopped++;
      else row.completed++;
      row.total++;

      const moWipQty = sortedOps.reduce(
        (sum, op) => sum + (op.waitingInputQty || 0) + (op.inProgressQty || 0),
        0
      );
      row.wipQty += moWipQty;

      const moPct = computeMoProgressPct(mo);
      progressSumByHall.set(resolvedHallName, (progressSumByHall.get(resolvedHallName) || 0) + moPct);
    });

    const rows: HallDistributionRow[] = Array.from(hallMap.values())
      .map(r => ({
        ...r,
        avgProgressPct:
          r.total > 0 ? Math.round((progressSumByHall.get(r.hallName) || 0) / r.total) : 0,
      }))
      .filter(r => r.total > 0 || r.totalMachines > 0)
      .sort((a, b) => b.total - a.total || b.wipQty - a.wipQty);

    return {
      totals: {
        all: orders.length,
        inProgress: inProgressTotal,
        stopped: stoppedTotal,
        completed: completedTotal,
      },
      hallRows: rows,
    };
  }, [orders, machines, halls]);

  // SVG Donut Geometry
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const safeTotal = Math.max(totals.all, 1);
  const inProgressLen = (totals.inProgress / safeTotal) * circumference;
  const stoppedLen = (totals.stopped / safeTotal) * circumference;
  const completedLen = (totals.completed / safeTotal) * circumference;

  const inProgressPct = totals.all > 0 ? Math.round((totals.inProgress / totals.all) * 100) : 0;
  const stoppedPct = totals.all > 0 ? Math.round((totals.stopped / totals.all) * 100) : 0;
  const completedPct = totals.all > 0 ? Math.round((totals.completed / totals.all) * 100) : 0;

  const maxHallTotal = Math.max(1, ...hallRows.map(r => r.total));

  const legendItems = [
    {
      key: 'IN_PROGRESS' as const,
      filterValue: 'IN_PROGRESS',
      label: 'در حال انجام',
      count: totals.inProgress,
      pct: inProgressPct,
      color: '#007cc0',
      textClass: 'text-[#007cc0]',
      icon: PlayCircle,
    },
    {
      key: 'STOPPED' as const,
      filterValue: 'PLANNED',
      label: 'متوقف / منتظر شروع',
      count: totals.stopped,
      pct: stoppedPct,
      color: '#e9730c',
      textClass: 'text-[#e9730c]',
      icon: PauseCircle,
    },
    {
      key: 'COMPLETED' as const,
      filterValue: 'COMPLETED',
      label: 'تکمیل‌شده',
      count: totals.completed,
      pct: completedPct,
      color: '#107e3e',
      textClass: 'text-[#107e3e]',
      icon: CheckCircle2,
    },
  ];

  return (
    <section className="bg-white border border-[#d9d9d9] rounded-md overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="px-4 py-2 bg-[#fafbfc] border-b border-[#e5e8ec] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BarChart3 className="w-4 h-4 text-[#007cc0] shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-[#1d2d3e] truncate">
              نمودار توزیع وضعیت دستورات ساخت (MO) در سالن‌های تولید
            </h2>
            <p className="text-[11px] text-[#556b82] truncate">
              نمایش بصری و یکپارچه دستورات در حال انجام، متوقف/منتظر و تکمیل‌شده به تفکیک هر سالن کارگاهی
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] shrink-0 tabular-nums">
          <div className="hidden md:flex items-center gap-2.5 text-[#556b82]">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#007cc0] inline-block" />
              در حال انجام: <strong className="font-mono text-[#007cc0]">{toPersianDigits(totals.inProgress)}</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#e9730c] inline-block" />
              متوقف/منتظر: <strong className="font-mono text-[#e9730c]">{toPersianDigits(totals.stopped)}</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#107e3e] inline-block" />
              تکمیل‌شده: <strong className="font-mono text-[#107e3e]">{toPersianDigits(totals.completed)}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCollapsed(prev => !prev)}
            className="sap-btn-standard px-2 py-0.5 text-[11px] inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <span>{collapsed ? 'نمایش نمودار' : 'جمع‌کردن'}</span>
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          {/* Right: Overall Status Distribution Donut Chart + Interactive Legend */}
          <div className="lg:col-span-4 flex flex-col sm:flex-row lg:flex-row items-center gap-4 lg:border-l lg:border-[#eaeef2] lg:pl-4">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90" role="img" aria-label="نمودار دایره‌ای وضعیت دستورات ساخت">
                {/* Track */}
                <circle
                  cx="55"
                  cy="55"
                  r={radius}
                  fill="none"
                  stroke="#eef1f4"
                  strokeWidth="12"
                />
                {totals.all > 0 && (
                  <>
                    {/* In Progress */}
                    {totals.inProgress > 0 && (
                      <circle
                        cx="55"
                        cy="55"
                        r={radius}
                        fill="none"
                        stroke="#007cc0"
                        strokeWidth={hoveredSegment === 'IN_PROGRESS' ? 14 : 12}
                        strokeDasharray={`${inProgressLen} ${circumference}`}
                        strokeDashoffset={0}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredSegment('IN_PROGRESS')}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() =>
                          onSelectStatusFilter?.(
                            activeStatusFilter === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS'
                          )
                        }
                      />
                    )}
                    {/* Stopped / Waiting */}
                    {totals.stopped > 0 && (
                      <circle
                        cx="55"
                        cy="55"
                        r={radius}
                        fill="none"
                        stroke="#e9730c"
                        strokeWidth={hoveredSegment === 'STOPPED' ? 14 : 12}
                        strokeDasharray={`${stoppedLen} ${circumference}`}
                        strokeDashoffset={-inProgressLen}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredSegment('STOPPED')}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() =>
                          onSelectStatusFilter?.(
                            activeStatusFilter === 'PLANNED' ? 'ALL' : 'PLANNED'
                          )
                        }
                      />
                    )}
                    {/* Completed */}
                    {totals.completed > 0 && (
                      <circle
                        cx="55"
                        cy="55"
                        r={radius}
                        fill="none"
                        stroke="#107e3e"
                        strokeWidth={hoveredSegment === 'COMPLETED' ? 14 : 12}
                        strokeDasharray={`${completedLen} ${circumference}`}
                        strokeDashoffset={-(inProgressLen + stoppedLen)}
                        className="transition-all duration-200 cursor-pointer"
                        onMouseEnter={() => setHoveredSegment('COMPLETED')}
                        onMouseLeave={() => setHoveredSegment(null)}
                        onClick={() =>
                          onSelectStatusFilter?.(
                            activeStatusFilter === 'COMPLETED' ? 'ALL' : 'COMPLETED'
                          )
                        }
                      />
                    )}
                  </>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none tabular-nums">
                <span className="text-xl font-bold font-mono text-[#1d2d3e] leading-none">
                  {toPersianDigits(totals.all)}
                </span>
                <span className="text-[10px] text-[#556b82] mt-0.5">کل MO</span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-1.5 tabular-nums">
              {legendItems.map(item => {
                const Icon = item.icon;
                const isActive = activeStatusFilter === item.filterValue;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setHoveredSegment(item.key)}
                    onMouseLeave={() => setHoveredSegment(null)}
                    onClick={() =>
                      onSelectStatusFilter?.(isActive ? 'ALL' : item.filterValue)
                    }
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#e8f3fc] border-[#007cc0]'
                        : 'bg-[#fafbfc] border-[#ebeff3] hover:bg-[#f2f6fa]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${item.textClass}`} />
                      <span className="font-semibold text-[#1d2d3e] truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 font-mono">
                      <strong className={item.textClass}>{toPersianDigits(item.count)}</strong>
                      <span className="text-[10px] text-[#556b82]">({toPersianDigits(item.pct)}٪)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Left: Stacked Horizontal Bar Chart per Production Hall */}
          <div className="lg:col-span-8 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-[#556b82]">
              <span className="font-semibold text-[#1d2d3e] flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5 text-[#007cc0]" />
                توزیع دستورات ساخت به تفکیک سالن تولید
              </span>
              <span>عرض هر نوار متناسب با تعداد کل دستورات سالن</span>
            </div>

            {hallRows.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#666666] bg-[#fafbfc] border border-[#eaeef2] rounded">
                هنوز دستور ساختی برای نمایش در سالن‌های تولید ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-2.5">
                {hallRows.map(row => {
                  const barScalePct = row.total > 0 ? Math.max(12, Math.round((row.total / maxHallTotal) * 100)) : 0;
                  const segInProg = row.total > 0 ? (row.inProgress / row.total) * 100 : 0;
                  const segStopped = row.total > 0 ? (row.stopped / row.total) * 100 : 0;
                  const segCompleted = row.total > 0 ? (row.completed / row.total) * 100 : 0;

                  return (
                    <div key={row.hallKey} className="space-y-1 tabular-nums">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-[#1d2d3e] truncate">{row.hallName}</span>
                          {row.totalMachines > 0 && (
                            <span className="text-[10px] text-[#556b82] font-mono">
                              ماشین‌آلات: {toPersianDigits(row.activeMachines)}/{toPersianDigits(row.totalMachines)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[11px] text-[#556b82] font-mono">
                          <span>
                            جمع: <strong className="text-[#1d2d3e]">{toPersianDigits(row.total)} MO</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            WIP: <strong className="text-[#007cc0]">{formatNumber(row.wipQty)}</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            پیشرفت: <strong className="text-[#107e3e]">{toPersianDigits(row.avgProgressPct)}٪</strong>
                          </span>
                        </div>
                      </div>

                      {/* Stacked Proportional Bar */}
                      <div className="w-full h-5 bg-[#f0f3f6] rounded overflow-hidden flex items-center">
                        {row.total > 0 ? (
                          <div
                            className="h-full flex overflow-hidden transition-all duration-300"
                            style={{ width: `${barScalePct}%` }}
                          >
                            {row.inProgress > 0 && (
                              <div
                                style={{ width: `${segInProg}%` }}
                                className="h-full bg-[#007cc0] text-white text-[10px] font-mono font-bold flex items-center justify-center px-1 truncate"
                                title={`در حال انجام: ${row.inProgress} دستور`}
                              >
                                {toPersianDigits(row.inProgress)}
                              </div>
                            )}
                            {row.stopped > 0 && (
                              <div
                                style={{ width: `${segStopped}%` }}
                                className="h-full bg-[#e9730c] text-white text-[10px] font-mono font-bold flex items-center justify-center px-1 truncate"
                                title={`متوقف / منتظر شروع: ${row.stopped} دستور`}
                              >
                                {toPersianDigits(row.stopped)}
                              </div>
                            )}
                            {row.completed > 0 && (
                              <div
                                style={{ width: `${segCompleted}%` }}
                                className="h-full bg-[#107e3e] text-white text-[10px] font-mono font-bold flex items-center justify-center px-1 truncate"
                                title={`تکمیل‌شده: ${row.completed} دستور`}
                              >
                                {toPersianDigits(row.completed)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-[#888888] px-2">بدون دستور فعال در این سالن</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
