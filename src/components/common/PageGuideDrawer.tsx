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
} from 'lucide-react';
import {
  PAGE_TRAINING_CATALOG,
  PageTrainingEntry,
  PageButtonGuideItem,
} from '../../data/pageTrainingCatalog';
import { toPersianDigits } from '../../utils/formatters';

interface PageGuideDrawerProps {
  isOpen: boolean;
  entry: PageTrainingEntry;
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
  onClose,
  onNavigate,
}) => {
  const [drawerTab, setDrawerTab] = useState<'CURRENT' | 'ALL_SITE'>('CURRENT');
  const [selectedEntryKey, setSelectedEntryKey] = useState<string>(entry.key);
  const [kindFilter, setKindFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    setSelectedEntryKey(entry.key);
  }, [entry.key]);

  const displayedEntry = useMemo(() => {
    if (drawerTab === 'CURRENT') return entry;
    return PAGE_TRAINING_CATALOG.find(item => item.key === selectedEntryKey) || entry;
  }, [drawerTab, entry, selectedEntryKey]);

  const filteredButtons = useMemo(() => {
    return displayedEntry.buttonsAndLinks.filter(btn => {
      if (kindFilter !== 'ALL' && btn.kind !== kindFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        return (
          btn.label.toLowerCase().includes(q) ||
          btn.purpose.toLowerCase().includes(q) ||
          btn.whenToUse.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [displayedEntry, kindFilter, searchTerm]);

  const filteredSitePages = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return PAGE_TRAINING_CATALOG;
    return PAGE_TRAINING_CATALOG.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        p.moduleGroup.toLowerCase().includes(q) ||
        p.shortGoal.toLowerCase().includes(q) ||
        p.buttonsAndLinks.some(
          b => b.label.toLowerCase().includes(q) || b.purpose.toLowerCase().includes(q),
        ),
    );
  }, [searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#333333]/40 flex justify-end"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="w-full max-w-2xl bg-white h-full border-r border-[#d9d9d9] flex flex-col text-right font-sans"
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
                {displayedEntry.moduleGroup} · <span className="font-mono" dir="ltr">{displayedEntry.sapRef}</span>
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

        {/* Mode Switcher Tabs + Search */}
        <div className="px-4 py-2.5 bg-white border-b border-[#e8e8e8] space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDrawerTab('CURRENT');
                  setSelectedEntryKey(entry.key);
                }}
                className={`px-3 py-1 rounded-sm text-xs font-semibold border cursor-pointer whitespace-nowrap ${
                  drawerTab === 'CURRENT'
                    ? 'bg-[#007cc0] text-white border-[#007cc0]'
                    : 'bg-[#f7f7f7] text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
                }`}
              >
                آموزش صفحه فعلی و دکمه‌ها
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('ALL_SITE')}
                className={`px-3 py-1 rounded-sm text-xs font-semibold border cursor-pointer whitespace-nowrap ${
                  drawerTab === 'ALL_SITE'
                    ? 'bg-[#007cc0] text-white border-[#007cc0]'
                    : 'bg-[#f7f7f7] text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
                }`}
              >
                کل صفحات و دکمه‌های سایت ({toPersianDigits(PAGE_TRAINING_CATALOG.length)} صفحه)
              </button>
            </div>

            {drawerTab === 'ALL_SITE' && onNavigate && displayedEntry.key !== entry.key && (
              <button
                type="button"
                onClick={() => {
                  onNavigate(displayedEntry.tab, displayedEntry.subTab);
                  onClose();
                }}
                className="sap-btn-standard text-[11px] px-2.5 py-1 flex items-center gap-1 cursor-pointer whitespace-nowrap text-[#007cc0] border-[#b3ddf2]"
              >
                <ExternalLink className="w-3 h-3" />
                <span>ورود به این صفحه</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder={
                  drawerTab === 'CURRENT'
                    ? 'جستجوی نام دکمه یا لینک در این صفحه (مثلاً ذخیره در MRP)...'
                    : 'جستجوی صفحه یا نام دکمه در کل سایت (مثلاً کاردکس، BOM، MO، Pull)...'
                }
                className="w-full bg-[#f7f7f7] focus:bg-white border border-[#d9d9d9] focus:border-[#007cc0] rounded-sm pr-8 pl-2.5 py-1.5 text-xs focus:outline-none"
              />
            </div>

            {drawerTab === 'CURRENT' && (
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
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {drawerTab === 'ALL_SITE' && (
            <div className="bg-[#f7f7f7] border border-[#d9d9d9] rounded-sm p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-[#555555]">
                انتخاب صفحه از فهرست کل نرم‌افزار ({toPersianDigits(filteredSitePages.length)} مورد):
              </div>
              <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
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
                      <div className="text-[10px] text-[#666666] font-normal truncate mt-0.5">
                        {page.moduleGroup} · {toPersianDigits(page.buttonsAndLinks.length)} دکمه
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. Purpose of this page */}
          <div className="border border-[#d9d9d9] rounded-sm bg-white p-3.5 space-y-1.5">
            <div className="text-xs font-bold text-[#007cc0] flex items-center gap-1.5">
              <Layers className="w-4 h-4 shrink-0" />
              <span>منظور و کاربرد این صفحه در کارخانه چیست؟</span>
            </div>
            <p className="text-xs text-[#333333] leading-relaxed">{displayedEntry.fullPurpose}</p>
          </div>

          {/* 2. All Buttons & Links Explanation */}
          <div className="border border-[#d9d9d9] rounded-sm bg-white overflow-hidden">
            <div className="px-3.5 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] flex items-center justify-between">
              <div className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                <MousePointerClick className="w-4 h-4 text-[#007cc0]" />
                <span>توضیح کامل دکمه‌ها، لینک‌ها و ابزارهای این صفحه</span>
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
                    <p className="text-xs text-[#444444] leading-relaxed">{btn.purpose}</p>
                    <div className="text-[11px] text-[#666666]">
                      <span className="font-semibold text-[#007cc0]">زمان استفاده: </span>
                      {btn.whenToUse}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 3. Page Sections */}
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

          {/* 4. Recommended Operator Sequence */}
          <div className="border border-[#d9d9d9] rounded-sm bg-[#f7f9fb] p-3.5 space-y-2">
            <div className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
              <ListChecks className="w-4 h-4 text-[#007cc0]" />
              <span>ترتیب پیشنهادی کار در این صفحه (۱ تا ۳)</span>
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

          {/* 5. Data Quality Principle */}
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
            <span>راهنمای سبک و بدون افت سرعت (بارگذاری پویا)</span>
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
