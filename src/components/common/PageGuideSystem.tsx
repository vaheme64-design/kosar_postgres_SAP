import React, { Suspense, useMemo, useState } from 'react';
import { BookOpen, HelpCircle, ChevronDown, ChevronUp, Workflow } from 'lucide-react';
import { resolvePageTrainingEntry } from '../../data/pageTrainingCatalog';
import { toPersianDigits } from '../../utils/formatters';

export type GuideDrawerSectionTab = 'ALL' | 'SCENARIOS' | 'BUTTONS' | 'CONCEPTS';

const LazyPageGuideDrawer = React.lazy(() =>
  import('./PageGuideDrawer').then(mod => ({ default: mod.PageGuideDrawer })),
);

export interface ActivePageGuideContext {
  tab: string;
  masterSubSection?: string;
  inventorySubTab?: string;
  planningSubTab?: string;
  productionViewMode?: 'ERP_WORKBENCH' | 'VOUCHERS';
  productionModuleTab?: string;
  wipSubTab?: string;
  machineSubTab?: string;
  contractsSubTab?: string;
  settingsSubTab?: string;
  reportSubTab?: string;
}

interface PageGuideBarProps {
  context: ActivePageGuideContext;
  onNavigate?: (tab: any, subTab?: any) => void;
}

export const PageGuideBar: React.FC<PageGuideBarProps> = ({ context, onNavigate }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState<GuideDrawerSectionTab>('ALL');
  const [showQuickButtons, setShowQuickButtons] = useState(false);

  const entry = useMemo(
    () => resolvePageTrainingEntry(context),
    [
      context.tab,
      context.masterSubSection,
      context.inventorySubTab,
      context.planningSubTab,
      context.productionViewMode,
      context.productionModuleTab,
      context.wipSubTab,
      context.machineSubTab,
      context.contractsSubTab,
      context.settingsSubTab,
      context.reportSubTab,
    ],
  );

  const openDrawer = (section: GuideDrawerSectionTab) => {
    setDrawerSection(section);
    setDrawerOpen(true);
  };

  return (
    <>
      <div className="bg-white border border-[#d9d9d9] rounded-sm px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
            <BookOpen className="w-4 h-4 text-[#007cc0] shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-bold text-[#333333]">{entry.title}</span>
                <span className="text-[#999999] hidden sm:inline">·</span>
                <span className="text-[11px] text-[#555555] truncate">{entry.shortGoal}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowQuickButtons(prev => !prev)}
              className="px-2.5 py-1 rounded-sm bg-[#f7f7f7] hover:bg-[#eeeeee] border border-[#d9d9d9] text-[11px] font-semibold text-[#333333] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              title="نمایش سریع کاربرد و منطق پشت‌پرده دکمه‌های این صفحه"
            >
              <span>خلاصه {toPersianDigits(entry.buttonsAndLinks.length)} دکمه</span>
              {showQuickButtons ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <button
              type="button"
              onClick={() => openDrawer('SCENARIOS')}
              className="px-2.5 py-1 rounded-sm bg-[#f1f8f3] hover:bg-[#e4f3e8] border border-[#b7dfc4] text-[11px] font-semibold text-[#107e3e] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              title="مشاهده سناریوهای واقعی کارخانه و منطق پشت‌پرده این صفحه"
            >
              <Workflow className="w-3.5 h-3.5 shrink-0" />
              <span>سناریوهای پشت‌پرده ({toPersianDigits(entry.scenarios.length)})</span>
            </button>

            <button
              type="button"
              onClick={() => openDrawer('ALL')}
              className="px-2.5 py-1 rounded-sm bg-[#e5f3fa] hover:bg-[#d2eaf7] border border-[#b3ddf2] text-[11px] font-bold text-[#007cc0] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>آموزش کامل صفحه</span>
            </button>
          </div>
        </div>

        {showQuickButtons && (
          <div className="mt-2 pt-2 border-t border-[#e8e8e8] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {entry.buttonsAndLinks.map((b, i) => (
              <div key={i} className="bg-[#f7f9fb] border border-[#d9e2ec] rounded-sm p-2 space-y-1">
                <div className="text-[11px] font-bold text-[#007cc0]">{b.label}</div>
                <div className="text-[11px] text-[#333333] leading-snug">{b.purpose}</div>
                {b.behindTheScenes && (
                  <div className="text-[10px] text-[#555555] leading-snug pt-1 border-t border-[#e5ecf3]">
                    <span className="font-semibold text-[#107e3e]">پشت‌پرده: </span>
                    {b.behindTheScenes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {drawerOpen && (
        <Suspense fallback={null}>
          <LazyPageGuideDrawer
            isOpen={drawerOpen}
            entry={entry}
            initialFocus={drawerSection}
            onClose={() => setDrawerOpen(false)}
            onNavigate={onNavigate}
          />
        </Suspense>
      )}
    </>
  );
};

interface InlinePageGuideButtonProps {
  routeContext: ActivePageGuideContext;
  label?: string;
  initialSection?: GuideDrawerSectionTab;
  onNavigate?: (tab: any, subTab?: any) => void;
}

export const InlinePageGuideButton: React.FC<InlinePageGuideButtonProps> = ({
  routeContext,
  label = 'آموزش دکمه‌ها و سناریوها',
  initialSection = 'ALL',
  onNavigate,
}) => {
  const [open, setOpen] = useState(false);
  const entry = useMemo(
    () => resolvePageTrainingEntry(routeContext),
    [
      routeContext.tab,
      routeContext.masterSubSection,
      routeContext.inventorySubTab,
      routeContext.planningSubTab,
      routeContext.productionViewMode,
      routeContext.productionModuleTab,
      routeContext.wipSubTab,
      routeContext.machineSubTab,
      routeContext.contractsSubTab,
      routeContext.settingsSubTab,
      routeContext.reportSubTab,
    ],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sap-btn-standard px-2.5 py-1.5 text-xs flex items-center gap-1.5 text-[#007cc0] border-[#b3ddf2] bg-[#f4f9fd] hover:bg-[#e5f3fa] cursor-pointer whitespace-nowrap shrink-0"
        title={`مشاهده آموزش تخصصی ${entry.title}، دکمه‌ها و سناریوهای پشت‌پرده`}
      >
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </button>

      {open && (
        <Suspense fallback={null}>
          <LazyPageGuideDrawer
            isOpen={open}
            entry={entry}
            initialFocus={initialSection}
            onClose={() => setOpen(false)}
            onNavigate={onNavigate}
          />
        </Suspense>
      )}
    </>
  );
};
