import React, { useEffect, useState } from 'react';
import {
  Boxes,
  CalendarDays,
  Cpu,
  Disc,
  FileSpreadsheet,
  FileSignature,
  GitCommit,
  Hammer,
  Layers,
  ScrollText,
  Settings,
  ShieldAlert,
  BellRing,
  ArrowUpLeft,
  Activity,
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
  const [liveWipStats, setLiveWipStats] = useState<{ activeMosCount: number; totalWipQty: number; openOrdersCount: number }>({
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

  const ppGroupTiles: SmartTileConfig[] = [
    {
      id: 'pp-mrp',
      title: 'نیازسنجی مواد و MRP',
      subtitle: 'تحلیل کسری، سهمیه ساپکو و پیشنهاد خرید',
      kpiValue: toPersianDigits(mrpShortagesCount),
      kpiUnit: 'کسری قطعی',
      kpiTone: mrpShortagesCount > 0 ? 'negative' : 'positive',
      footerMeta: mrpShortagesCount > 0 ? 'نیازمند تأمین یا آزادسازی کیفی' : 'پوشش کامل مواد اولیه',
      icon: CalendarDays,
      onClick: () => onNavigateSubModule('planning', { planningSubTab: 'mrp' }),
    },
    {
      id: 'pp-orders',
      title: 'دستور ساخت و پرس‌کاری',
      subtitle: 'برنامه‌ریزی و زمان‌بندی خطوط تولید',
      kpiValue: toPersianDigits(liveWipStats.activeMosCount),
      kpiUnit: 'دستور فعال',
      kpiTone: 'brand',
      footerMeta: 'میز کار برنامه تولید (SAP PP)',
      icon: Hammer,
      onClick: () =>
        onNavigateSubModule('production', {
          productionViewMode: 'ERP_WORKBENCH',
          productionModuleTab: 'MULTI_PART_SCHEDULER',
        }),
    },
    {
      id: 'pp-wip',
      title: 'کنترل جریان ساخت (WIP)',
      subtitle: 'رهگیری ایستگاه‌ها و ثبت تولید / Backflush',
      kpiValue: toPersianDigits(liveWipStats.totalWipQty.toLocaleString('en-US')),
      kpiUnit: 'قطعه در خط',
      kpiTone: 'brand',
      footerMeta: 'انتقال بین مراحل و ضایعات',
      icon: GitCommit,
      onClick: () => onNavigateToTab('wip'),
    },
    {
      id: 'pp-machines',
      title: 'ماشین‌آلات، قالب و OEE',
      subtitle: 'پرس‌های سنگین، قالب‌ها و درخواست نت',
      kpiValue: `${toPersianDigits(activeMachinesCount)}/${toPersianDigits(machines.length)}`,
      kpiUnit: 'پرس آماده',
      kpiTone: activeMachinesCount === machines.length ? 'positive' : 'critical',
      footerMeta: `${toPersianDigits(dies.length)} قالب سنبه و ماتریس`,
      icon: Cpu,
      onClick: () => onNavigateSubModule('machines', { machineSubTab: 'machines' }),
    },
  ];

  const mmQmGroupTiles: SmartTileConfig[] = [
    {
      id: 'mm-stock-inquiry',
      title: 'استعلام موجودی ۳ وضعیتی (MM/QM)',
      subtitle: 'تفکیک آزاد، قرنطینه QI و مسدود شده',
      kpiValue: toPersianDigits(unrestrictedKg.toLocaleString('en-US')),
      kpiUnit: 'kg آزاد',
      kpiTone: qmBlockedKg > 0 ? 'critical' : 'positive',
      footerMeta: qmBlockedKg > 0
        ? `هشدار کیفی: ${toPersianDigits(qmBlockedKg.toLocaleString('en-US'))} kg در قرنطینه/مسدود`
        : 'تمامی اقلام در وضعیت آزاد (Unrestricted)',
      icon: Boxes,
      onClick: () => onNavigateToTab('inventory', 'INQUIRY'),
    },
    {
      id: 'mm-kardex',
      title: 'دفتر گردش کاردکس و ابطال اسناد',
      subtitle: 'کدهای حرکت ۱۰۱، ۲۶۱، ۳۱۱، ۳۲۱، ۶۰۱',
      kpiValue: toPersianDigits(postedDocsCount),
      kpiUnit: 'سند قطعی',
      kpiTone: 'brand',
      footerMeta: 'ثبت ابطال جبرانی با ردپای ممیزی',
      icon: ScrollText,
      onClick: () => onNavigateToTab('inventory', 'MOVEMENT'),
    },
    {
      id: 'mm-coils',
      title: 'کویل‌های فیزیکی و نواربری ساپکو',
      subtitle: 'شماره ذوب، پکینگ و ردیابی ته‌کلاف',
      kpiValue: toPersianDigits(coils.length),
      kpiUnit: 'کلاف فعال',
      kpiTone: 'default',
      footerMeta: `${toPersianDigits(liveInvMetrics?.activeLotsCount ?? coils.length)} لات ردیابی‌شده`,
      icon: Disc,
      onClick: () => onNavigateToTab('inventory', 'COILS'),
    },
    {
      id: 'mm-alerts',
      title: 'هشدارهای کسری و نقطه سفارش',
      subtitle: 'پایش حداقل موجودی اطمینان و قرنطینه',
      kpiValue: toPersianDigits(reorderAlertsCount),
      kpiUnit: 'هشدار فعال',
      kpiTone: criticalAlertsCount > 0 ? 'negative' : reorderAlertsCount > 0 ? 'critical' : 'positive',
      footerMeta: criticalAlertsCount > 0
        ? `${toPersianDigits(criticalAlertsCount)} مورد بحرانی نیازمند اقدام فوری`
        : 'بدون کمبود بحرانی انبار',
      icon: criticalAlertsCount > 0 ? ShieldAlert : BellRing,
      onClick: () => onNavigateToTab('inventory', 'ALERTS'),
    },
  ];

  const sdAnalyticsGroupTiles: SmartTileConfig[] = [
    {
      id: 'sd-contracts',
      title: 'سفارشات مشتری و قراردادهای ساپکو',
      subtitle: 'مدیریت تعهدات فروش (SD) و سهمیه‌ها',
      kpiValue: toPersianDigits(liveInvMetrics?.activeContractsCount || 1),
      kpiUnit: 'قرارداد فعال',
      kpiTone: 'brand',
      footerMeta: 'متصل به MRP و حواله تحویل ۶۰۱',
      icon: FileSignature,
      onClick: () => onNavigateToTab('contracts'),
    },
    {
      id: 'sd-docflow',
      title: 'زنجیره اسناد سرتاسری (Document Flow)',
      subtitle: 'ردیابی سفارش تا دستور ساخت، ۲۶۱ و ۱۰۱',
      kpiValue: toPersianDigits(postedDocsCount),
      kpiUnit: 'گره متصل',
      kpiTone: 'positive',
      footerMeta: 'مشاهده گراف اسناد و تاریخچه Audit Trail',
      icon: Layers,
      onClick: () => setViewMode('DOCUMENT_FLOW'),
    },
    {
      id: 'sd-reports',
      title: 'گزارش‌های مدیریتی و تطبیق بهای تمام‌شده',
      subtitle: 'تحلیل انحراف، ماندگاری WIP و OEE',
      kpiValue: toPersianDigits(parts.length),
      kpiUnit: 'قلم تحت پایش',
      kpiTone: 'default',
      footerMeta: 'گزارش‌های رسمی قابل چاپ',
      icon: FileSpreadsheet,
      onClick: () => onNavigateToTab('reports'),
    },
    {
      id: 'sd-masterdata',
      title: 'اطلاعات پایه، BOM و کاربران',
      subtitle: 'تعریف قطعات، مسیر تولید و سطوح دسترسی',
      kpiValue: toPersianDigits(routings.length),
      kpiUnit: 'مسیر مصوب',
      kpiTone: 'default',
      footerMeta: 'تنظیمات سازمانی و نقش‌های کاربری',
      icon: Settings,
      onClick: () => onNavigateToTab('master_data'),
    },
  ];

  const renderTileGroup = (groupTitle: string, tiles: SmartTileConfig[]) => (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between border-b border-[#d9d9d9] pb-1.5">
        <h2 className="text-xs font-semibold text-[#333333]">{groupTitle}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              : 'text-[#333333]';

          return (
            <button
              key={tile.id}
              type="button"
              onClick={tile.onClick}
              className="fiori-tile p-4 text-right flex flex-col justify-between min-h-[144px] cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#333333] group-hover:text-[#007cc0] transition-colors truncate">
                    {tile.title}
                  </div>
                  <div className="text-[11px] text-[#666666] mt-0.5 line-clamp-1">
                    {tile.subtitle}
                  </div>
                </div>
                <div className="w-8 h-8 rounded bg-[#f5f5f5] group-hover:bg-[#e5f3fa] border border-[#e8e8e8] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-[#007cc0]" />
                </div>
              </div>

              <div className="my-2 flex items-baseline gap-1.5">
                <span className={`text-2xl font-semibold font-mono tabular-nums leading-none ${kpiColor}`}>
                  {tile.kpiValue}
                </span>
                {tile.kpiUnit && (
                  <span className="text-[11px] text-[#666666]">{tile.kpiUnit}</span>
                )}
              </div>

              <div className="pt-2 border-t border-[#e8e8e8] flex items-center justify-between text-[11px] text-[#666666]">
                <span className="truncate">{tile.footerMeta}</span>
                <ArrowUpLeft className="w-3.5 h-3.5 text-[#007cc0] opacity-70 group-hover:opacity-100 shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {/* SAP Fiori Launchpad Top Strip + View Mode Switcher */}
      <div className="sap-card px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setViewMode('LAUNCHPAD')}
            className={`sap-icon-tab ${viewMode === 'LAUNCHPAD' ? 'sap-icon-tab-active' : ''}`}
          >
            لانچ‌پد برنامه‌های SAP Fiori
          </button>
          <button
            type="button"
            onClick={() => setViewMode('DOCUMENT_FLOW')}
            className={`sap-icon-tab ${viewMode === 'DOCUMENT_FLOW' ? 'sap-icon-tab-active' : ''}`}
          >
            ردیابی جریان اسناد (Document Flow)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('OPERATIONS_ANALYTICS')}
            className={`sap-icon-tab ${viewMode === 'OPERATIONS_ANALYTICS' ? 'sap-icon-tab-active' : ''}`}
          >
            نمای تحلیلی خط تولید و شاهراه عملیات
          </button>
        </div>

        {/* Fast MIGO Operational Shortcuts */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory', 'DASHBOARD', 'RECEIPT')}
            className="sap-btn-emphasized px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            ثبت رسید ۱۰۱
          </button>
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory', 'DASHBOARD', 'ISSUE')}
            className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            صدور حواله ۲۶۱
          </button>
        </div>
      </div>

      {viewMode === 'LAUNCHPAD' && (
        <div className="space-y-6">
          {renderTileGroup('برنامه‌ریزی تولید و عملیات کارگاه (SAP PP & Capacity)', ppGroupTiles)}
          {renderTileGroup('مدیریت مواد، انبار و کنترل کیفیت (SAP MM & QM)', mmQmGroupTiles)}
          {renderTileGroup('فروش، جریان اسناد و گزارش‌های مدیریتی (SAP SD & Analytics)', sdAnalyticsGroupTiles)}
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
            onSelectDoc={docNum => onNavigateToTab('inventory', 'MOVEMENT')}
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
