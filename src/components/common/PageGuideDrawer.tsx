import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  BookOpen,
  MousePointerClick,
  Layers,
  CheckCircle2,
  Search,
  ExternalLink,
  ShieldCheck,
  ListChecks,
  Workflow,
  Cpu,
  BookMarked,
} from 'lucide-react';
import {
  PAGE_TRAINING_CATALOG,
  PageTrainingEntry,
  PageButtonGuideItem,
} from '../../data/pageTrainingCatalog';
import { toPersianDigits } from '../../utils/formatters';
import type { GuideDrawerSectionTab } from './PageGuideSystem';

interface PageGuideDrawerProps {
  isOpen: boolean;
  entry: PageTrainingEntry;
  initialFocus?: GuideDrawerSectionTab;
  onClose: () => void;
  onNavigate?: (tab: any, subTab?: any) => void;
}

const KIND_BORDER_TEXT: Record<PageButtonGuideItem['kind'], string> = {
  'دکمه اصلی': 'border-[#b3ddf2] bg-[#e5f3fa] text-[#007cc0]',
  'دکمه ابزاری': 'border-[#d9d9d9] bg-[#f7f7f7] text-[#333333]',
  'لینک ناوبری': 'border-[#b7dfc4] bg-[#f1f8f3] text-[#107e3e]',
  'فیلتر / انتخابگر': 'border-[#f5cba7] bg-[#fff4e5] text-[#b45309]',
  'عملیات ردیف جدول': 'border-[#d9d9d9] bg-white text-[#555555]',
};

export const PageGuideDrawer: React.FC<PageGuideDrawerProps> = ({
  isOpen,
  entry,
  initialFocus = 'ALL',
  onClose,
  onNavigate,
}) => {
  const [drawerTab, setDrawerTab] = useState<'CURRENT' | 'ALL_SITE'>('CURRENT');
  const [sectionTab, setSectionTab] = useState<GuideDrawerSectionTab>(initialFocus);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string>(entry.key);
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    setSelectedEntryKey(entry.key);
  }, [entry.key]);

  useEffect(() => {
    if (isOpen) {
      setDrawerTab('CURRENT');
      setSectionTab(initialFocus);
      setKindFilter('ALL');
      setSearchTerm('');
    }
  }, [isOpen, initialFocus, entry.key]);

  const displayedEntry = useMemo(() => {
    if (drawerTab === 'CURRENT') return entry;
    return PAGE_TRAINING_CATALOG.find(item => item.key === selectedEntryKey) || entry;
  }, [drawerTab, entry, selectedEntryKey]);

  const moduleGroups = useMemo(() => {
    const unique = new Set<string>();
    PAGE_TRAINING_CATALOG.forEach(p => unique.add(p.moduleGroup));
    return Array.from(unique);
  }, []);

  const filteredButtons = useMemo(() => {
    return displayedEntry.buttonsAndLinks.filter(btn => {
      if (kindFilter !== 'ALL' && btn.kind !== kindFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        return (
          btn.label.toLowerCase().includes(q) ||
          btn.purpose.toLowerCase().includes(q) ||
          (btn.behindTheScenes || '').toLowerCase().includes(q) ||
          btn.whenToUse.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [displayedEntry, kindFilter, searchTerm]);

  const filteredScenarios = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return displayedEntry.scenarios;
    return displayedEntry.scenarios.filter(
      sc =>
        sc.title.toLowerCase().includes(q) ||
        sc.trigger.toLowerCase().includes(q) ||
        sc.behindTheScenes.toLowerCase().includes(q) ||
        sc.expectedResult.toLowerCase().includes(q) ||
        sc.stepByStep.some(st => st.toLowerCase().includes(q)),
    );
  }, [displayedEntry, searchTerm]);

  const filteredSitePages = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return PAGE_TRAINING_CATALOG.filter(p => {
      if (moduleFilter !== 'ALL' && p.moduleGroup !== moduleFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.moduleGroup.toLowerCase().includes(q) ||
        p.shortGoal.toLowerCase().includes(q) ||
        p.sapRef.toLowerCase().includes(q) ||
        p.buttonsAndLinks.some(
          b =>
            b.label.toLowerCase().includes(q) ||
            b.purpose.toLowerCase().includes(q) ||
            (b.behindTheScenes || '').toLowerCase().includes(q),
        ) ||
        p.scenarios.some(
          s =>
            s.title.toLowerCase().includes(q) ||
            s.trigger.toLowerCase().includes(q) ||
            s.behindTheScenes.toLowerCase().includes(q),
        ) ||
        (p.keyTerms || []).some(
          k => k.term.toLowerCase().includes(q) || k.meaning.toLowerCase().includes(q),
        )
      );
    });
  }, [searchTerm, moduleFilter]);

  if (!isOpen) return null;

  const showPurpose = sectionTab === 'ALL' || sectionTab === 'CONCEPTS';
  const showKeyTerms =
    (sectionTab === 'ALL' || sectionTab === 'CONCEPTS') &&
    displayedEntry.keyTerms &&
    displayedEntry.keyTerms.length > 0;
  const showScenarios = sectionTab === 'ALL' || sectionTab === 'SCENARIOS';
  const showButtons = sectionTab === 'ALL' || sectionTab === 'BUTTONS';
  const showSectionsAndSteps = sectionTab === 'ALL' || sectionTab === 'CONCEPTS';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#333333]/40 flex justify-end"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-3xl bg-white h-full border-r border-[#d9d9d9] flex flex-col text-right font-sans"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#f7f7f7] border-b border-[#d9d9d9] flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-sm bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#666666] truncate">
                {displayedEntry.moduleGroup} ·{' '}
                <span className="font-mono" dir="ltr">
                  {displayedEntry.sapRef}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[#333333] mt-0.5 truncate">
                {displayedEntry.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-sm bg-white border border-[#d9d9d9] text-[#555555] hover:text-[#333333] hover:bg-[#f0f0f0] cursor-pointer shrink-0"
            title="بستن راهنما"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs + Section Tabs + Search */}
        <div className="px-4 py-2.5 bg-white border-b border-[#e8e8e8] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDrawerTab('CURRENT');
                  setSelectedEntryKey(entry.key);
                }}
                className={`px-3 py-1 rounded-sm text-xs font-semibold border cursor-pointer whitespace-nowrap shrink-0 ${
                  drawerTab === 'CURRENT'
                    ? 'bg-[#007cc0] text-white border-[#007cc0]'
                    : 'bg-[#f7f7f7] text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
                }`}
              >
                آموزش تخصصی صفحه فعلی
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('ALL_SITE')}
                className={`px-3 py-1 rounded-sm text-xs font-semibold border cursor-pointer whitespace-nowrap shrink-0 ${
                  drawerTab === 'ALL_SITE'
                    ? 'bg-[#007cc0] text-white border-[#007cc0]'
                    : 'bg-[#f7f7f7] text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
                }`}
              >
                کل صفحات و گزارش‌های سایت ({toPersianDigits(PAGE_TRAINING_CATALOG.length)} صفحه)
              </button>
            </div>

            {drawerTab === 'ALL_SITE' && onNavigate && displayedEntry.key !== entry.key && (
              <button
                type="button"
                onClick={() => {
                  onNavigate(displayedEntry.tab, displayedEntry.subTab);
                  onClose();
                }}
                className="sap-btn-standard text-[11px] px-2.5 py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 text-[#007cc0] border-[#b3ddf2]"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span>ورود به این صفحه</span>
              </button>
            )}
          </div>

          {/* Section Sub-tabs inside Drawer */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {(
              [
                { id: 'ALL', label: 'نمای کامل صفحه' },
                {
                  id: 'SCENARIOS',
                  label: `سناریوهای پشت‌پرده (${toPersianDigits(displayedEntry.scenarios.length)})`,
                },
                {
                  id: 'BUTTONS',
                  label: `دکمه‌ها و لینک‌ها (${toPersianDigits(displayedEntry.buttonsAndLinks.length)})`,
                },
                { id: 'CONCEPTS', label: 'اصطلاحات، بخش‌ها و مراحل' },
              ] as Array<{ id: GuideDrawerSectionTab; label: string }>
            ).map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSectionTab(t.id)}
                className={`px-2.5 py-1 rounded-sm text-[11px] font-semibold border cursor-pointer whitespace-nowrap shrink-0 ${
                  sectionTab === t.id
                    ? 'bg-[#e5f3fa] text-[#007cc0] border-[#007cc0]'
                    : 'bg-white text-[#555555] border-[#d9d9d9] hover:bg-[#f7f7f7]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={
                  drawerTab === 'CURRENT'
                    ? 'جستجو در دکمه‌ها و سناریوهای این صفحه (مثلاً ذخیره در MRP، ۳۲۱، Roll Forward)...'
                    : 'جستجوی صفحه، گزارش، سناریو یا دکمه در کل سایت...'
                }
                className="w-full bg-[#f7f7f7] focus:bg-white border border-[#d9d9d9] focus:border-[#007cc0] rounded-sm pr-8 pl-2.5 py-1.5 text-xs focus:outline-none"
              />
            </div>

            {drawerTab === 'CURRENT' ? (
              <select
                value={kindFilter}
                onChange={e => setKindFilter(e.target.value)}
                className="bg-white border border-[#d9d9d9] rounded-sm px-2 py-1.5 text-[11px] font-medium text-[#333333] cursor-pointer focus:outline-none focus:border-[#007cc0]"
              >
                <option value="ALL">همه انواع دکمه</option>
                <option value="دکمه اصلی">دکمه‌های اصلی</option>
                <option value="دکمه ابزاری">دکمه‌های ابزاری</option>
                <option value="لینک ناوبری">لینک‌های ناوبری</option>
                <option value="عملیات ردیف جدول">عملیات سطرهای جدول</option>
                <option value="فیلتر / انتخابگر">فیلترها و انتخابگرها</option>
              </select>
            ) : (
              <select
                value={moduleFilter}
                onChange={e => setModuleFilter(e.target.value)}
                className="bg-white border border-[#d9d9d9] rounded-sm px-2 py-1.5 text-[11px] font-medium text-[#333333] cursor-pointer focus:outline-none focus:border-[#007cc0]"
              >
                <option value="ALL">همه ماژول‌های سایت</option>
                {moduleGroups.map(grp => (
                  <option key={grp} value={grp}>
                    {grp}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {drawerTab === 'ALL_SITE' && (
            <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-[#555555]">
                انتخاب صفحه یا گزارش از فهرست کل نرم‌افزار ({toPersianDigits(filteredSitePages.length)} مورد):
              </div>
              <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {filteredSitePages.map(page => {
                  const isSel = page.key === displayedEntry.key;
                  return (
                    <button
                      key={page.key}
                      type="button"
                      onClick={() => setSelectedEntryKey(page.key)}
                      className={`text-right p-2 rounded-sm border text-[11px] transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-[#e5f3fa] border-[#007cc0] text-[#007cc0] font-bold'
                          : 'bg-white border-[#d9d9d9] text-[#333333] hover:bg-[#f5f5f5]'
                      }`}
                    >
                      <div className="truncate">{page.title}</div>
                      <div className="text-[10px] text-[#666666] font-normal truncate mt-0.5 tabular-nums">
                        {page.moduleGroup} · {toPersianDigits(page.scenarios.length)} سناریو ·{' '}
                        {toPersianDigits(page.buttonsAndLinks.length)} دکمه
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. Purpose of this page */}
          {showPurpose && (
            <div className="border border-[#d9d9d9] rounded-sm bg-white p-3.5 space-y-1.5">
              <div className="text-xs font-bold text-[#007cc0] flex items-center gap-1.5">
                <Layers className="w-4 h-4 shrink-0" />
                <span>منظور، هدف مهندسی و کاربرد این بخش در کارخانه چیست؟</span>
              </div>
              <p className="text-xs text-[#333333] leading-relaxed">{displayedEntry.fullPurpose}</p>
            </div>
          )}

          {/* 2. Domain Terms & Formulas */}
          {showKeyTerms && (
            <div className="border border-[#d9d9d9] rounded-sm bg-white overflow-hidden">
              <div className="px-3.5 py-2 bg-[#f7f7f7] border-b border-[#d9d9d9] text-xs font-bold text-[#333333] flex items-center gap-1.5">
                <BookMarked className="w-4 h-4 text-[#007cc0]" />
                <span>اصطلاحات و فرمول‌های تخصصی این بخش</span>
              </div>
              <div className="divide-y divide-[#e8e8e8]">
                {displayedEntry.keyTerms!.map((kt, idx) => (
                  <div key={idx} className="p-3 text-xs space-y-0.5">
                    <div className="font-bold text-[#007cc0]">{kt.term}</div>
                    <div className="text-[#444444] leading-relaxed">{kt.meaning}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Specialized Behind-the-Scenes Scenarios */}
          {showScenarios && (
            <div className="border border-[#d9d9d9] rounded-sm bg-white overflow-hidden">
              <div className="px-3.5 py-2.5 bg-[#f1f8f3] border-b border-[#b7dfc4] flex items-center justify-between">
                <div className="text-xs font-bold text-[#107e3e] flex items-center gap-1.5">
                  <Workflow className="w-4 h-4 shrink-0" />
                  <span>سناریوهای واقعی کارخانه و منطق پشت‌پرده این صفحه</span>
                </div>
                <span className="text-[11px] text-[#107e3e] font-semibold tabular-nums">
                  {toPersianDigits(filteredScenarios.length)} سناریو
                </span>
              </div>

              <div className="divide-y divide-[#e8e8e8]">
                {filteredScenarios.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#666666]">
                    سناریویی مطابق عبارت جستجو یافت نشد.
                  </div>
                ) : (
                  filteredScenarios.map((sc, idx) => (
                    <div key={idx} className="p-3.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-bold text-[#333333]">{sc.title}</div>
                        {sc.relatedTab && onNavigate && (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate(sc.relatedTab, sc.relatedSubTab);
                              onClose();
                            }}
                            className="sap-btn-standard px-2 py-0.5 text-[11px] flex items-center gap-1 text-[#007cc0] border-[#b3ddf2] cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span>باز کردن بخش مرتبط</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-[#f7f7f7] border border-[#e2e2e2] rounded-sm p-2.5 space-y-1">
                          <div className="font-bold text-[#333333]">شرایط شروع (ماشه عملیاتی):</div>
                          <div className="text-[#444444] leading-relaxed">{sc.trigger}</div>
                        </div>

                        <div className="bg-[#f4f9fd] border border-[#cde5f5] rounded-sm p-2.5 space-y-1">
                          <div className="font-bold text-[#007cc0] flex items-center gap-1">
                            <Cpu className="w-3.5 h-3.5 shrink-0" />
                            <span>اتفاق پشت‌پرده در سیستم و فرمول‌ها:</span>
                          </div>
                          <div className="text-[#333333] leading-relaxed">{sc.behindTheScenes}</div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-[#333333]">مراحل اجرای اپراتور در صفحه:</div>
                        <ol className="space-y-1">
                          {sc.stepByStep.map((st, sIdx) => (
                            <li
                              key={sIdx}
                              className="flex items-start gap-2 text-[11px] text-[#444444] leading-relaxed"
                            >
                              <span className="w-4 h-4 rounded-sm bg-[#f7f7f7] border border-[#d9d9d9] text-[#333333] font-bold text-[10px] flex items-center justify-center shrink-0 tabular-nums mt-0.5">
                                {toPersianDigits(sIdx + 1)}
                              </span>
                              <span>{st}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="bg-[#f1f8f3] border border-[#cfe9d7] rounded-sm px-2.5 py-1.5 text-[11px] text-[#107e3e]">
                        <span className="font-bold">نتیجه نهایی و اثر در کارخانه: </span>
                        <span>{sc.expectedResult}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 4. All Buttons & Links Explanation */}
          {showButtons && (
            <div className="border border-[#d9d9d9] rounded-sm bg-white overflow-hidden">
              <div className="px-3.5 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] flex items-center justify-between">
                <div className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                  <MousePointerClick className="w-4 h-4 text-[#007cc0]" />
                  <span>توضیح کامل دکمه‌ها، لینک‌ها و عملکرد پشت‌پرده آن‌ها</span>
                </div>
                <span className="text-[11px] text-[#666666] font-medium tabular-nums">
                  {toPersianDigits(filteredButtons.length)} مورد
                </span>
              </div>

              <div className="divide-y divide-[#e8e8e8]">
                {filteredButtons.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#666666]">
                    موردی مطابق فیلتر جستجو یافت نشد.
                  </div>
                ) : (
                  filteredButtons.map((btn, idx) => (
                    <div key={idx} className="p-3 space-y-1.5 hover:bg-[#fafcfe]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#333333]">{btn.label}</span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm border whitespace-nowrap ${KIND_BORDER_TEXT[btn.kind]}`}
                        >
                          {btn.kind}
                        </span>
                      </div>
                      <p className="text-xs text-[#333333] leading-relaxed">{btn.purpose}</p>
                      {btn.behindTheScenes && (
                        <div className="text-[11px] text-[#444444] bg-[#f7f9fb] border border-[#e1e9f0] rounded-sm px-2.5 py-1.5 leading-relaxed">
                          <span className="font-bold text-[#107e3e]">عملکرد پشت‌پرده در دیتابیس/موتور: </span>
                          {btn.behindTheScenes}
                        </div>
                      )}
                      <div className="text-[11px] text-[#666666]">
                        <span className="font-semibold text-[#007cc0]">زمان استفاده: </span>
                        {btn.whenToUse}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 5. Page Sections & Operator Sequence */}
          {showSectionsAndSteps && (
            <>
              <div className="border border-[#d9d9d9] rounded-sm bg-white overflow-hidden">
                <div className="px-3.5 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] text-xs font-bold text-[#333333]">
                  آشنایی با بخش‌ها و جدول‌های این صفحه
                </div>
                <div className="divide-y divide-[#e8e8e8]">
                  {displayedEntry.sections.map((sec, idx) => (
                    <div key={idx} className="p-3 text-xs space-y-0.5">
                      <div className="font-semibold text-[#333333]">{sec.name}</div>
                      <div className="text-[#555555] leading-relaxed">{sec.purpose}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-[#d9d9d9] rounded-sm bg-[#f7f9fb] p-3.5 space-y-2">
                <div className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-[#007cc0]" />
                  <span>ترتیب استاندارد کار در این صفحه</span>
                </div>
                <ol className="space-y-1.5">
                  {displayedEntry.operatorSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-[#333333] leading-relaxed">
                      <span className="w-5 h-5 rounded-sm bg-white border border-[#b3ddf2] text-[#007cc0] font-bold text-[11px] flex items-center justify-center shrink-0 tabular-nums">
                        {toPersianDigits(i + 1)}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}

          {/* 6. Data Quality Principle */}
          <div className="border border-[#b7dfc4] bg-[#f1f8f3] rounded-sm p-3 flex items-start gap-2 text-xs text-[#107e3e]">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">اصل صحت داده در این بخش: </span>
              <span>{displayedEntry.dataQualityRule}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#f7f7f7] border-t border-[#d9d9d9] flex items-center justify-between text-[11px] text-[#666666]">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e]" />
            <span>بارگذاری پویا بدون افت سرعت · پوشش کامل {toPersianDigits(PAGE_TRAINING_CATALOG.length)} صفحه و گزارش</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="sap-btn-emphasized px-4 py-1 text-xs cursor-pointer"
          >
            بستن آموزش
          </button>
        </div>
      </div>
    </div>
  );
};
