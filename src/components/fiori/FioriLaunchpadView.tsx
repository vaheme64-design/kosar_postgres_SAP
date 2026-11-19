import React, { useCallback, useEffect, useState } from 'react';
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  Cpu,
  Disc,
  FileSpreadsheet,
  FileSignature,
  GitCommit,
  Hammer,
  Layers,
  ListTree,
  ScrollText,
  ShieldAlert,
  BellRing,
  ArrowUpLeft,
} from 'lucide-react';
import {
  Part,
  Machine,
  Routing,
  DieMold,
  SapcoCoilReceipt,
  InventoryTransaction,
  UserRoleProfile,
  InventoryDashboardMetrics,
} from '../../types/inventory';
import { TabKey, SubModuleNavParams } from '../Sidebar';
import { InventorySubTab } from '../inventory/InventoryModuleView';
import { DashboardView } from '../DashboardView';
import { FioriDocumentFlowPanel } from './FioriDocumentFlowPanel';
import { DashboardMoWipWidget } from './DashboardMoWipWidget';
import { toPersianDigits } from '../../utils/formatters';

interface FioriLaunchpadViewProps {
  currentUser: UserRoleProfile;
  summary: any;
  recentTransactions: InventoryTransaction[];
  machines: Machine[];
  parts: Part[];
  routings: Routing[];
  dies: DieMold[];
  halls: any[];
  coils: SapcoCoilReceipt[];
  reorderAlertsCount: number;
  criticalAlertsCount: number;
  onNavigateToTab: (
    tab: TabKey,
    subTab?: InventorySubTab,
    actionModal?: 'RECEIPT' | 'ISSUE' | 'RETURN' | 'TRANSFER'
  ) => void;
  onNavigateSubModule: (tab: TabKey, navParams?: SubModuleNavParams) => void;
  onOpenNewVoucher: (type: string, partId?: string, stageId?: string) => void;
  onSubmitVoucher: (payload: any) => Promise<{ success: boolean; message: string }>;
  initialOrderId?: string | null;
  initialDrawerTab?: any;
  onOrderDrawerChange?: (orderId: string | null, tab?: any) => void;
}

interface SmartTileConfig {
  id: string;
  title: string;
  subtitle: string;
  kpiValue: string;
  kpiUnit?: string;
  kpiTone?: 'default' | 'brand' | 'positive' | 'critical' | 'negative';
  footerMeta: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

export const FioriLaunchpadView: React.FC<FioriLaunchpadViewProps> = ({
  currentUser,
  summary,
  recentTransactions,
  machines,
  parts,
  routings,
  dies,
  halls,
  coils,
  reorderAlertsCount,
  criticalAlertsCount,
  onNavigateToTab,
  onNavigateSubModule,
  onOpenNewVoucher,
  onSubmitVoucher,
  initialOrderId,
  initialDrawerTab,
  onOrderDrawerChange,
}) => {
  const [viewMode, setViewMode] = useState<'LAUNCHPAD' | 'DOCUMENT_FLOW' | 'OPERATIONS_ANALYTICS'>(
    initialOrderId ? 'OPERATIONS_ANALYTICS' : 'LAUNCHPAD'
  );
  const [liveInvMetrics, setLiveInvMetrics] = useState<InventoryDashboardMetrics | null>(null);
  const [liveWipStats, setLiveWipStats] = useState<{
    activeMosCount: number;
    totalWipQty: number;
    openOrdersCount: number;
  }>({
    activeMosCount: 0,
    totalWipQty: 0,
    openOrdersCount: 0,
  });
  const [mrpShortagesCount, setMrpShortagesCount] = useState<number>(0);
  const [flowQuery, setFlowQuery] = useState<string>('');

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/inventory/dashboard-summary').then(r => r.json()).catch(() => null),
      fetch('/api/wip/dashboard').then(r => r.json()).catch(() => null),
      fetch('/api/mrp/run').then(r => r.json()).catch(() => null),
    ]).then(([invRes, wipRes, mrpRes]) => {
      if (!active) return;
      if (invRes?.success && invRes.data?.metrics) {
        setLiveInvMetrics(invRes.data.metrics);
      }
      if (wipRes?.success && wipRes.data) {
        setLiveWipStats({
          activeMosCount: Number(wipRes.data.activeMosCount || wipRes.data.activeOrdersCount || 0),
          totalWipQty: Number(wipRes.data.totalWipQty || wipRes.data.inProgressQty || 0),
          openOrdersCount: Number(wipRes.data.openCustomerOrdersCount || 0),
        });
      }
      if (mrpRes?.success && mrpRes.data?.summary) {
        setMrpShortagesCount(Number(mrpRes.data.summary.hardShortages || 0));
      }
    });
    return () => {
      active = false;
    };
  }, [recentTransactions.length]);

  const handleMoSummaryLoaded = useCallback(
    (moSummary: { inProgressCount: number; totalWipQty: number }) => {
      setLiveWipStats(prev => {
        const nextWip = moSummary.totalWipQty || prev.totalWipQty;
        if (prev.activeMosCount === moSummary.inProgressCount && prev.totalWipQty === nextWip) {
          return prev;
        }
        return {
          ...prev,
          activeMosCount: moSummary.inProgressCount,
          totalWipQty: nextWip,
        };
      });
    },
    []
  );

  const unrestrictedKg = Math.round(
    liveInvMetrics?.totalUnrestrictedKg ?? liveInvMetrics?.totalAvailableKg ?? 0
  );
  const qmBlockedKg = Math.round(
    (liveInvMetrics?.totalQualityInspectionKg ?? 0) +
      (liveInvMetrics?.totalBlockedKg ?? 0) ||
      liveInvMetrics?.totalQualityBlockedKg ||
      0
  );
  const postedDocsCount = liveInvMetrics?.postedDocumentsCount ?? recentTransactions.length;
  const activeMachinesCount = machines.filter(m => m.status === 'ACTIVE').length;

  // Row 1: High-Frequency Daily Core Operations (Production PP, WIP, Inventory MM/QM, MRP)
  const coreOperationalTiles: SmartTileConfig[] = [
    {
      id: 'pp-mo-list',
      title: 'دستورات ساخت (MO)',
      subtitle: 'صدور، رهگیری و OP10',
      kpiValue: toPersianDigits(liveWipStats.activeMosCount),
      kpiUnit: 'فعال',
      kpiTone: 'brand',
      footerMeta: 'میز کار تولید (PP)',
      icon: ClipboardList,
      onClick: () =>
        onNavigateSubModule('production', {
          productionViewMode: 'ERP_WORKBENCH',
          productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
        }),
    },
    {
      id: 'pp-wip',
      title: 'جریان ساخت (WIP)',
      subtitle: 'ایستگاه‌ها و انتقال',
      kpiValue: toPersianDigits(liveWipStats.totalWipQty.toLocaleString('en-US')),
      kpiUnit: 'قطعه',
      kpiTone: 'brand',
      footerMeta: 'Backflush و ضایعات',
      icon: GitCommit,
      onClick: () => onNavigateToTab('wip'),
    },
    {
      id: 'mm-stock-inquiry',
      title: 'موجودی انبار (MM/QM)',
      subtitle: 'آزاد، قرنطینه و مسدود',
      kpiValue: toPersianDigits(unrestrictedKg.toLocaleString('en-US')),
      kpiUnit: 'kg',
      kpiTone: qmBlockedKg > 0 ? 'critical' : 'positive',
      footerMeta:
        qmBlockedKg > 0
          ? `${toPersianDigits(qmBlockedKg.toLocaleString('en-US'))} kg قرنطینه`
          : 'وضعیت آزاد',
      icon: Boxes,
      onClick: () => onNavigateToTab('inventory', 'INQUIRY'),
    },
    {
      id: 'mm-coils',
      title: 'رول ورق و سرکلاف',
      subtitle: 'ذوب، کویل‌پک و برش',
      kpiValue: toPersianDigits(coils.length),
      kpiUnit: 'کلاف',
      kpiTone: 'default',
      footerMeta: `${toPersianDigits(liveInvMetrics?.activeLotsCount ?? coils.length)} لات فعال`,
      icon: Disc,
      onClick: () => onNavigateToTab('inventory', 'COILS'),
    },
    {
      id: 'pp-mrp',
      title: 'نیازسنجی و MRP',
      subtitle: 'پیشنهاد تولید و کسری',
      kpiValue: toPersianDigits(mrpShortagesCount),
      kpiUnit: 'کسری',
      kpiTone: mrpShortagesCount > 0 ? 'negative' : 'positive',
      footerMeta: mrpShortagesCount > 0 ? 'نیازمند تأمین' : 'پوشش کامل',
      icon: CalendarDays,
      onClick: () => onNavigateSubModule('planning', { planningSubTab: 'mrp' }),
    },
    {
      id: 'mm-alerts',
      title: 'هشدار نقطه سفارش',
      subtitle: 'پایش حداقل موجودی',
      kpiValue: toPersianDigits(reorderAlertsCount),
      kpiUnit: 'هشدار',
      kpiTone: criticalAlertsCount > 0 ? 'negative' : reorderAlertsCount > 0 ? 'critical' : 'positive',
      footerMeta:
        criticalAlertsCount > 0
          ? `${toPersianDigits(criticalAlertsCount)} بحرانی`
          : 'موجودی ایمن',
      icon: criticalAlertsCount > 0 ? ShieldAlert : BellRing,
      onClick: () => onNavigateToTab('inventory', 'ALERTS'),
    },
  ];

  // Row 2: Engineering, Documents, Contracts & Analytics
  const secondaryManagementTiles: SmartTileConfig[] = [
    {
      id: 'mm-kardex',
      title: 'کاردکس و اسناد (MIGO)',
      subtitle: 'ورود ۱۰۱، حواله ۲۶۱',
      kpiValue: toPersianDigits(postedDocsCount),
      kpiUnit: 'سند',
      kpiTone: 'brand',
      footerMeta: 'ابطال جبرانی و ممیزی',
      icon: ScrollText,
      onClick: () => onNavigateToTab('inventory', 'MOVEMENT'),
    },
    {
      id: 'pp-machines',
      title: 'ماشین‌آلات و قالب',
      subtitle: 'پرس‌ها، قالب‌ها و نت',
      kpiValue: `${toPersianDigits(activeMachinesCount)}/${toPersianDigits(machines.length)}`,
      kpiUnit: 'آماده',
      kpiTone: activeMachinesCount === machines.length ? 'positive' : 'critical',
      footerMeta: `${toPersianDigits(dies.length)} قالب ثبت‌شده`,
      icon: Cpu,
      onClick: () => onNavigateSubModule('machines', { machineSubTab: 'machines' }),
    },
    {
      id: 'md-bom',
      title: 'درخت محصول (BOM)',
      subtitle: 'اطلاعات پایه و مسیرها',
      kpiValue: toPersianDigits(routings.length),
      kpiUnit: 'مسیر',
      kpiTone: 'default',
      footerMeta: `${toPersianDigits(parts.length)} قطعه و کالا`,
      icon: ListTree,
      onClick: () => onNavigateSubModule('master_data', { masterSubSection: 'BOM' }),
    },
    {
      id: 'sd-contracts',
      title: 'قراردادها و فروش (SD)',
      subtitle: 'سفارش مشتری و سهمیه',
      kpiValue: toPersianDigits(liveInvMetrics?.activeContractsCount || 1),
      kpiUnit: 'قرارداد',
      kpiTone: 'brand',
      footerMeta: 'تحویل ۶۰۱ و تعهدات',
      icon: FileSignature,
      onClick: () => onNavigateToTab('contracts'),
    },
    {
      id: 'sd-docflow',
      title: 'زنجیره اسناد',
      subtitle: 'ردیابی سرتاسری اسناد',
      kpiValue: toPersianDigits(postedDocsCount),
      kpiUnit: 'گره',
      kpiTone: 'positive',
      footerMeta: 'گراف Document Flow',
      icon: Layers,
      onClick: () => setViewMode('DOCUMENT_FLOW'),
    },
    {
      id: 'sd-reports',
      title: 'گزارش‌ها و OEE',
      subtitle: 'بهای تمام‌شده و انحراف',
      kpiValue: toPersianDigits(parts.length),
      kpiUnit: 'قلم',
      kpiTone: 'default',
      footerMeta: 'گزارش‌های مدیریتی',
      icon: FileSpreadsheet,
      onClick: () => onNavigateToTab('reports'),
    },
  ];

  const renderDenseSmartTilesRow = (
    groupTitle: string,
    groupMeta: string,
    tiles: SmartTileConfig[]
  ) => (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 pb-1 border-b border-[#dfe4ea]">
        <h2 className="text-xs font-bold text-[#1d2d3e]">{groupTitle}</h2>
        <span className="text-[11px] text-[#556b82]">{groupMeta}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {tiles.map(tile => {
          const Icon = tile.icon;
          const kpiColor =
            tile.kpiTone === 'negative'
              ? 'text-[#bb0000]'
              : tile.kpiTone === 'critical'
              ? 'text-[#e9730c]'
              : tile.kpiTone === 'positive'
              ? 'text-[#107e3e]'
              : tile.kpiTone === 'brand'
              ? 'text-[#007cc0]'
              : 'text-[#1d2d3e]';

          return (
            <button
              key={tile.id}
              type="button"
              onClick={tile.onClick}
              className="bg-white border border-[#d9dfe5] hover:border-[#007cc0] hover:bg-[#f7fbff] rounded-md p-3 text-right flex flex-col justify-between min-h-[104px] transition-colors cursor-pointer group focus-visible:outline-2 focus-visible:outline-[#007cc0]"
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#1d2d3e] group-hover:text-[#007cc0] transition-colors truncate">
                    {tile.title}
                  </div>
                  <div className="text-[10px] text-[#556b82] mt-0.5 truncate">
                    {tile.subtitle}
                  </div>
                </div>
                <Icon className="w-4 h-4 text-[#007cc0] shrink-0 mt-0.5 opacity-85 group-hover:opacity-100" />
              </div>

              <div className="my-2 flex items-baseline gap-1 tabular-nums">
                <span className={`text-lg font-bold font-mono leading-none ${kpiColor}`}>
                  {tile.kpiValue}
                </span>
                {tile.kpiUnit && (
                  <span className="text-[10px] text-[#556b82] truncate">{tile.kpiUnit}</span>
                )}
              </div>

              <div className="pt-1.5 border-t border-[#eef1f4] flex items-center justify-between gap-1 text-[10px] text-[#556b82]">
                <span className="truncate">{tile.footerMeta}</span>
                <ArrowUpLeft className="w-3 h-3 text-[#007cc0] opacity-60 group-hover:opacity-100 shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-3.5">
      {/* SAP Fiori Launchpad Top Strip + View Mode Switcher */}
      <div className="bg-white border border-[#d9dfe5] rounded-md px-3 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setViewMode('LAUNCHPAD')}
            className={`sap-icon-tab whitespace-nowrap shrink-0 ${
              viewMode === 'LAUNCHPAD' ? 'sap-icon-tab-active' : ''
            }`}
          >
            لانچ‌پد برنامه‌های SAP Fiori
          </button>
          <button
            type="button"
            onClick={() => setViewMode('DOCUMENT_FLOW')}
            className={`sap-icon-tab whitespace-nowrap shrink-0 ${
              viewMode === 'DOCUMENT_FLOW' ? 'sap-icon-tab-active' : ''
            }`}
          >
            ردیابی جریان اسناد (Document Flow)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('OPERATIONS_ANALYTICS')}
            className={`sap-icon-tab whitespace-nowrap shrink-0 ${
              viewMode === 'OPERATIONS_ANALYTICS' ? 'sap-icon-tab-active' : ''
            }`}
          >
            نمای تحلیلی خط تولید و شاهراه عملیات
          </button>
        </div>

        {/* Fast Operational Shortcuts */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() =>
              onNavigateSubModule('production', {
                productionViewMode: 'ERP_WORKBENCH',
                productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
              })
            }
            className="sap-btn-emphasized px-2.5 py-1 text-xs inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span>دستورات ساخت (MO)</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory', 'DASHBOARD', 'RECEIPT')}
            className="sap-btn-standard px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            ثبت رسید ۱۰۱
          </button>
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory', 'DASHBOARD', 'ISSUE')}
            className="sap-btn-standard px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            صدور حواله ۲۶۱
          </button>
        </div>
      </div>

      {viewMode === 'LAUNCHPAD' && (
        <div className="space-y-4">
          {/* 1. Primary Focal Anchor: Consolidated MO & WIP Shop-Floor Status Widget */}
          <DashboardMoWipWidget
            machines={machines}
            halls={halls}
            onOrdersLoaded={handleMoSummaryLoaded}
          />

          {/* 2. Row 1: Dense 6-Column Smart Tiles for High-Frequency Production & Inventory Modules */}
          {renderDenseSmartTilesRow(
            'دسترسی سریع عملیات روزانه (تولید، جریان ساخت و انبار)',
            '۶ ماژول پرکاربرد PP · WIP · MM/QM',
            coreOperationalTiles
          )}

          {/* 3. Row 2: Dense 6-Column Smart Tiles for Engineering, Documents & Analytics */}
          {renderDenseSmartTilesRow(
            'اسناد، اطلاعات پایه، فروش و گزارش‌های مدیریتی',
            'کاردکس · ماشین‌آلات · BOM · SD · OEE',
            secondaryManagementTiles
          )}
        </div>
      )}

      {viewMode === 'DOCUMENT_FLOW' && (
        <div className="sap-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pb-3 border-b border-[#e8e8e8]">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[#333333]">
                کاوشگر جریان اسناد یکپارچه (SAP End-to-End Document Flow)
              </h3>
              <p className="text-[11px] text-[#666666] mt-0.5">
                شماره سفارش مشتری، دستور ساخت (MO)، شماره سند انبار یا خالی بگذارید تا کل زنجیره اسناد نمایش داده شود.
              </p>
            </div>
            <input
              type="text"
              value={flowQuery}
              onChange={e => setFlowQuery(e.target.value)}
              placeholder="فیلتر بر اساس شماره سند، دستور ساخت یا سفارش..."
              className="w-full sm:w-72 px-3 py-1.5 bg-[#fafafa] border border-[#bfbfbf] focus:border-[#007cc0] rounded text-xs"
            />
          </div>
          <FioriDocumentFlowPanel
            docNumber={flowQuery}
            onSelectDoc={() => onNavigateToTab('inventory', 'MOVEMENT')}
          />
        </div>
      )}

      {viewMode === 'OPERATIONS_ANALYTICS' && (
        <DashboardView
          currentUser={currentUser}
          summary={summary}
          recentTransactions={recentTransactions}
          machines={machines}
          parts={parts}
          routings={routings}
          dies={dies}
          halls={halls}
          coils={coils}
          onNavigateToTab={onNavigateToTab}
          onNavigateSubModule={onNavigateSubModule}
          onOpenNewVoucher={onOpenNewVoucher}
          onSubmitVoucher={onSubmitVoucher}
          initialOrderId={initialOrderId}
          initialDrawerTab={initialDrawerTab}
          onOrderDrawerChange={onOrderDrawerChange}
        />
      )}
    </div>
  );
};
