import React, { useState } from 'react';
import {
  ArrowRight,
  Home,
  Map,
  ChevronLeft,
  Layers,
  ClipboardList,
  PackageOpen,
  Factory,
  Warehouse,
} from 'lucide-react';
import { useErpRouter } from '../../context/RouterContext';
import { TabKey } from '../Sidebar';

interface LifecycleStageDef {
  step: string;
  title: string;
  subtitle: string;
  tab: TabKey;
  subParams: Record<string, any>;
  isActive: (route: ReturnType<typeof useErpRouter>['route']) => boolean;
  icon: React.ReactNode;
}

const MO_LIFECYCLE_STAGES: LifecycleStageDef[] = [
  {
    step: '۰۱',
    title: 'تعریف BOM و مسیر تولید',
    subtitle: 'ایستگاه‌ها و قطعات مادر/فرعی',
    tab: 'master_data',
    subParams: { tab: 'master_data', masterSubSection: 'BOM' },
    isActive: r =>
      r.tab === 'master_data' &&
      ['BOM', 'ROUTINGS', 'PRODUCT_STRUCTURE', 'OPERATIONS', 'PARTS'].includes(r.masterSubSection || ''),
    icon: <Layers className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۲',
    title: 'نیازسنجی MRP و صدور MO',
    subtitle: 'پیشنهاد تولید و دستورات فرعی',
    tab: 'planning',
    subParams: { tab: 'planning', planningSubTab: 'mrp' },
    isActive: r => r.tab === 'planning',
    icon: <ClipboardList className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۳',
    title: 'حواله مواد به پای خط',
    subtitle: 'تخصیص رول و موجودی انبار (MIGO)',
    tab: 'production',
    subParams: { tab: 'production', productionViewMode: 'ERP_WORKBENCH', productionModuleTab: 'MULTI_PART_SCHEDULER' },
    isActive: r => r.tab === 'production' || (r.tab === 'inventory' && r.inventorySubTab === 'MOVEMENT'),
    icon: <PackageOpen className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۴',
    title: 'اجرای کارگاه و ردیابی WIP',
    subtitle: 'گزارش مراحل، حواله بین‌ایستگاهی و ابطال',
    tab: 'wip',
    subParams: { tab: 'wip', wipSubTab: 'UNIFIED_DIRECTORY' },
    isActive: r => r.tab === 'wip',
    icon: <Factory className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۵',
    title: 'رسید انبار محصول و کاردکس',
    subtitle: 'تحویل قطعی و بازبینی اسناد',
    tab: 'inventory',
    subParams: { tab: 'inventory', inventorySubTab: 'INQUIRY' },
    isActive: r => r.tab === 'inventory' && r.inventorySubTab !== 'MOVEMENT',
    icon: <Warehouse className="w-3.5 h-3.5" />,
  },
];

export const MoLifecycleGuideStrip: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const router = useErpRouter();

  return (
    <div className="bg-white border border-[#d9d9d9] rounded-md px-3.5 py-2.5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-xs font-bold text-[#1d2d3e]">
          <Map className="w-4 h-4 text-[#0070f2]" />
          <span>نقشه مسیر چرخه دستور تولید (از تعریف BOM تا انبار و ابطال امن)</span>
        </div>
        {!compact && (
          <span className="text-[11px] text-[#556b82]">
            برای رفتن مستقیم به هر مرحله یا پیگیری وضعیت، روی کارت مرحله کلیک کنید (دکمه بازگشت همیشه فعال است)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {MO_LIFECYCLE_STAGES.map(stage => {
          const active = stage.isActive(router.route);
          return (
            <button
              key={stage.step}
              type="button"
              onClick={() => router.navigate(stage.subParams)}
              className={`text-right px-2.5 py-2 rounded border transition-colors cursor-pointer flex items-start gap-2 ${
                active
                  ? 'bg-[#e8f2fc] border-[#0070f2] text-[#003b80]'
                  : 'bg-[#fafafa] border-[#e4e7eb] text-[#32363a] hover:bg-[#f0f6fd] hover:border-[#b3d4fc]'
              }`}
            >
              <span
                className={`mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold shrink-0 tabular-nums ${
                  active ? 'bg-[#0070f2] text-white' : 'bg-[#eaecef] text-[#475569]'
                }`}
              >
                {stage.step}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-xs font-bold truncate">
                  {stage.icon}
                  <span className="truncate">{stage.title}</span>
                </span>
                <span className="block text-[10px] text-[#6a6d70] truncate mt-0.5">{stage.subtitle}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const WorkspaceNavigationBar: React.FC = () => {
  const router = useErpRouter();
  const [showLifecycleMap, setShowLifecycleMap] = useState(false);

  const isDashboardRoot =
    router.route.tab === 'dashboard' &&
    !router.route.moId &&
    !router.route.timelineMoId &&
    !router.route.modal &&
    !router.canGoBack;

  if (isDashboardRoot) {
    return null;
  }

  return (
    <div className="space-y-2" dir="rtl">
      <div className="bg-white border border-[#d9d9d9] rounded-md px-3 py-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => router.goBack()}
            disabled={!router.canGoBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold border border-[#0070f2] bg-[#f4f8fe] text-[#0057b8] hover:bg-[#e5f0fd] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title={`بازگشت به: ${router.previousEntryLabel}`}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>بازگشت به: {router.previousEntryLabel}</span>
          </button>

          {router.route.tab !== 'dashboard' && (
            <button
              type="button"
              onClick={() =>
                router.navigate({
                  tab: 'dashboard',
                  moId: null,
                  timelineMoId: null,
                  modal: null,
                  docQuery: null,
                })
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border border-[#d9d9d9] bg-white text-[#32363a] hover:bg-[#f5f6f7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="بازگشت سریع به صفحه اصلی (لانچ‌پد SAP Fiori)"
            >
              <Home className="w-3.5 h-3.5 text-[#556b82]" />
              <span>خانه</span>
            </button>
          )}

          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-[#556b82] pr-1">
            {router.breadcrumbs.map((crumb, idx) => {
              const isLast = idx === router.breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${idx}`}>
                  {idx > 0 && <ChevronLeft className="w-3.5 h-3.5 text-[#9aa5b1] shrink-0" />}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="hover:text-[#0070f2] hover:underline transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className={isLast ? 'font-bold text-[#1d2d3e]' : ''}>{crumb.label}</span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={() => setShowLifecycleMap(prev => !prev)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showLifecycleMap
              ? 'bg-[#e8f2fc] border-[#0070f2] text-[#0057b8]'
              : 'bg-[#fafafa] border-[#d9d9d9] text-[#32363a] hover:bg-[#f0f2f5]'
          }`}
          title="نمایش نقشه مراحل چرخه دستور تولید (BOM -> MRP -> حواله مواد -> کارگاه WIP -> انبار)"
        >
          <Map className="w-3.5 h-3.5" />
          <span>{showLifecycleMap ? 'بستن نقشه چرخه تولید' : 'مسیر دستور تولید کجاست؟'}</span>
        </button>
      </div>

      {showLifecycleMap && <MoLifecycleGuideStrip />}
    </div>
  );
};
