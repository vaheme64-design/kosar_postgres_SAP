import React, { Suspense, useMemo, useState } from 'react';
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
  Link2,
  Check,
  HelpCircle,
  Workflow,
} from 'lucide-react';
import { useErpRouter } from '../../context/RouterContext';
import { TabKey } from '../Sidebar';
import { resolvePageTrainingEntry } from '../../data/pageTrainingCatalog';
import { toPersianDigits } from '../../utils/formatters';
import type { ActivePageGuideContext, GuideDrawerSectionTab } from './PageGuideSystem';

const LazyPageGuideDrawer = React.lazy(() =>
  import('./PageGuideDrawer').then(mod => ({ default: mod.PageGuideDrawer })),
);

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
    subParams: { tab: 'planning', planningSubTab: 'recommendations' },
    isActive: r => r.tab === 'planning',
    icon: <ClipboardList className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۳',
    title: 'مدیریت دستورات (MO) و سرکلاف',
    subtitle: 'صدور، پیشرفت، OP10 و حذف امن',
    tab: 'production',
    subParams: {
      tab: 'production',
      productionViewMode: 'ERP_WORKBENCH',
      productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
    },
    isActive: r => r.tab === 'production' || (r.tab === 'inventory' && r.inventorySubTab === 'COILS'),
    icon: <PackageOpen className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۴',
    title: 'اجرای کارگاه و ردیابی WIP',
    subtitle: 'گزارش مراحل، حواله بین‌ایستگاهی',
    tab: 'wip',
    subParams: { tab: 'wip', wipSubTab: 'ORDERS' },
    isActive: r => r.tab === 'wip',
    icon: <Factory className="w-3.5 h-3.5" />,
  },
  {
    step: '۰۵',
    title: 'رسید انبار محصول و کاردکس',
    subtitle: 'تحویل قطعی و بازبینی اسناد',
    tab: 'inventory',
    subParams: { tab: 'inventory', inventorySubTab: 'INQUIRY' },
    isActive: r => r.tab === 'inventory' && r.inventorySubTab !== 'COILS',
    icon: <Warehouse className="w-3.5 h-3.5" />,
  },
];

export const MoLifecycleGuideStrip: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const router = useErpRouter();

  return (
    <div className="bg-white border border-[#d9d9d9] rounded-md px-3 py-2" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#1d2d3e]">
          <Map className="w-3.5 h-3.5 text-[#007cc0]" />
          <span>نقشه مسیر چرخه دستور تولید (از تعریف BOM تا انبار و ابطال امن)</span>
        </div>
        {!compact && (
          <span className="text-[11px] text-[#556b82]">
            برای رفتن مستقیم به هر مرحله، روی کارت آن کلیک کنید
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
              className={`text-right px-2.5 py-1.5 rounded border transition-colors cursor-pointer flex items-start gap-2 ${
                active
                  ? 'bg-[#e8f2fc] border-[#007cc0] text-[#003b80]'
                  : 'bg-[#fafafa] border-[#e4e7eb] text-[#32363a] hover:bg-[#f0f6fd] hover:border-[#b3d4fc]'
              }`}
            >
              <span
                className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold shrink-0 tabular-nums ${
                  active ? 'bg-[#007cc0] text-white' : 'bg-[#eaecef] text-[#475569]'
                }`}
              >
                {stage.step}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[11px] font-bold truncate">
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

interface WorkspaceNavigationBarProps {
  guideContext?: ActivePageGuideContext;
  onNavigate?: (tab: any, subTab?: any) => void;
}

export const WorkspaceNavigationBar: React.FC<WorkspaceNavigationBarProps> = ({
  guideContext,
  onNavigate,
}) => {
  const router = useErpRouter();
  const [showLifecycleMap, setShowLifecycleMap] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<GuideDrawerSectionTab>('ALL');

  const guideEntry = useMemo(() => {
    if (!guideContext) return null;
    return resolvePageTrainingEntry(guideContext);
  }, [
    guideContext?.tab,
    guideContext?.masterSubSection,
    guideContext?.inventorySubTab,
    guideContext?.planningSubTab,
    guideContext?.productionViewMode,
    guideContext?.productionModuleTab,
    guideContext?.wipSubTab,
    guideContext?.machineSubTab,
    guideContext?.contractsSubTab,
    guideContext?.settingsSubTab,
    guideContext?.reportSubTab,
  ]);

  const handleCopyDirectLink = async () => {
    const shareUrl = router.buildShareableUrl();
    if (!shareUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2200);
      } catch {
        // ignore
      }
      document.body.removeChild(textarea);
    }
  };

  const openGuide = (section: GuideDrawerSectionTab) => {
    setDrawerSection(section);
    setDrawerOpen(true);
  };

  const isDashboardRoot =
    router.route.tab === 'dashboard' &&
    !router.route.moId &&
    !router.route.timelineMoId &&
    !router.route.modal &&
    !router.canGoBack;

  return (
    <div className="space-y-2" dir="rtl">
      {/* Single-Line Unified SAP Fiori Context & Action Bar */}
      <div className="bg-white border border-[#d9d9d9] rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
        {/* Right side: Back + Home + Breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {!isDashboardRoot && (
            <>
              <button
                type="button"
                onClick={() => router.goBack()}
                disabled={!router.canGoBack}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold border border-[#007cc0] bg-[#f4f8fe] text-[#0057b8] hover:bg-[#e5f0fd] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={`بازگشت به: ${router.previousEntryLabel}`}
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span className="max-w-[190px] truncate">بازگشت</span>
              </button>

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
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-[#d9d9d9] bg-white text-[#32363a] hover:bg-[#f5f6f7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="بازگشت سریع به صفحه اصلی (لانچ‌پد SAP Fiori)"
              >
                <Home className="w-3.5 h-3.5 text-[#556b82]" />
                <span className="hidden sm:inline">خانه</span>
              </button>
            </>
          )}

          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[11px] text-[#556b82] pr-1">
            {router.breadcrumbs.map((crumb, idx) => {
              const isLast = idx === router.breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${idx}`}>
                  {idx > 0 && <ChevronLeft className="w-3 h-3 text-[#9aa5b1] shrink-0" />}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="hover:text-[#007cc0] hover:underline transition-colors whitespace-nowrap cursor-pointer"
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

        {/* Left side: Universal Direct Page Link Copy + Lifecycle Map + Compact Page Guide */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyDirectLink}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              copiedLink
                ? 'bg-[#eef8f2] border-[#a9dfbf] text-[#107e3e]'
                : 'bg-white border-[#d9d9d9] text-[#333333] hover:bg-[#f0f6fd] hover:border-[#b3ddf2] hover:text-[#007cc0]'
            }`}
            title={`کپی لینک مستقیم این صفحه: ${router.buildShareableUrl()}`}
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5 text-[#007cc0]" />}
            <span>{copiedLink ? 'لینک صفحه کپی شد' : 'کپی لینک صفحه'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLifecycleMap(prev => !prev)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showLifecycleMap
                ? 'bg-[#e8f2fc] border-[#007cc0] text-[#0057b8]'
                : 'bg-[#fafafa] border-[#d9d9d9] text-[#32363a] hover:bg-[#f0f2f5]'
            }`}
            title="نمایش نقشه مراحل چرخه دستور تولید (BOM -> MRP -> صدور MO -> کارگاه WIP -> انبار)"
          >
            <Map className="w-3.5 h-3.5" />
            <span>{showLifecycleMap ? 'بستن نقشه تولید' : 'مسیر تولید'}</span>
          </button>

          {guideEntry && (
            <>
              <button
                type="button"
                onClick={() => openGuide('SCENARIOS')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-[#b7dfc4] bg-[#f1f8f3] hover:bg-[#e4f3e8] text-[#107e3e] whitespace-nowrap shrink-0 cursor-pointer"
                title="مشاهده سناریوهای عملیاتی این صفحه"
              >
                <Workflow className="w-3.5 h-3.5" />
                <span className="hidden md:inline">
                  سناریوها ({toPersianDigits(guideEntry.scenarios.length)})
                </span>
              </button>

              <button
                type="button"
                onClick={() => openGuide('ALL')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold border border-[#b3ddf2] bg-[#e5f3fa] hover:bg-[#d2eaf7] text-[#007cc0] whitespace-nowrap shrink-0 cursor-pointer"
                title={`آموزش کامل «${guideEntry.title}» و کاربرد همه دکمه‌ها`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>آموزش این صفحه</span>
              </button>
            </>
          )}
        </div>
      </div>

      {showLifecycleMap && <MoLifecycleGuideStrip />}

      {drawerOpen && guideEntry && (
        <Suspense fallback={null}>
          <LazyPageGuideDrawer
            isOpen={drawerOpen}
            entry={guideEntry}
            initialFocus={drawerSection}
            onClose={() => setDrawerOpen(false)}
            onNavigate={onNavigate}
          />
        </Suspense>
      )}
    </div>
  );
};
