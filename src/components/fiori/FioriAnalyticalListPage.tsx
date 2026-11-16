import React from 'react';
import { Search, FilterX } from 'lucide-react';
import { toPersianDigits } from '../../utils/formatters';

export interface AlpVisualKpiItem {
  id: string;
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'positive' | 'critical' | 'negative' | 'brand';
  active?: boolean;
  onClick?: () => void;
  sublabel?: string;
}

interface FioriAnalyticalListPageProps {
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  kpiFilters?: AlpVisualKpiItem[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filterControls?: React.ReactNode;
  onResetFilters?: () => void;
  hasActiveFilters?: boolean;
  totalRowsCount?: number;
  children: React.ReactNode;
}

export const FioriAnalyticalListPage: React.FC<FioriAnalyticalListPageProps> = ({
  title,
  subtitle,
  headerActions,
  kpiFilters = [],
  searchValue,
  onSearchChange,
  searchPlaceholder = 'جستجو در کد، شرح، شماره سند یا لات...',
  filterControls,
  onResetFilters,
  hasActiveFilters,
  totalRowsCount,
  children,
}) => {
  const toneBorder = (tone?: AlpVisualKpiItem['tone'], active?: boolean) => {
    if (active) return 'border-[#007cc0] bg-[#e5f3fa]';
    switch (tone) {
      case 'positive':
        return 'border-[#d9d9d9] bg-white hover:border-[#107e3e]';
      case 'critical':
        return 'border-[#d9d9d9] bg-white hover:border-[#e9730c]';
      case 'negative':
        return 'border-[#d9d9d9] bg-white hover:border-[#bb0000]';
      case 'brand':
        return 'border-[#d9d9d9] bg-white hover:border-[#007cc0]';
      default:
        return 'border-[#d9d9d9] bg-white hover:border-[#007cc0]';
    }
  };

  const toneValueText = (tone?: AlpVisualKpiItem['tone']) => {
    switch (tone) {
      case 'positive':
        return 'text-[#107e3e]';
      case 'critical':
        return 'text-[#e9730c]';
      case 'negative':
        return 'text-[#bb0000]';
      case 'brand':
        return 'text-[#007cc0]';
      default:
        return 'text-[#333333]';
    }
  };

  return (
    <div className="space-y-3">
      {/* SAP ALP Header + Filter Strip */}
      <div className="fiori-alp-filterbar space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2.5 border-b border-[#e8e8e8]">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[#333333] truncate">{title}</h2>
            {subtitle && (
              <p className="text-[11px] text-[#666666] mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {headerActions && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">{headerActions}</div>
          )}
        </div>

        {/* Visual KPI Micro-Filter Strip */}
        {kpiFilters.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {kpiFilters.map(kpi => (
              <button
                key={kpi.id}
                type="button"
                onClick={kpi.onClick}
                disabled={!kpi.onClick}
                className={`text-right p-2.5 rounded border transition-colors ${
                  kpi.onClick ? 'cursor-pointer' : 'cursor-default'
                } ${toneBorder(kpi.tone, kpi.active)}`}
              >
                <div className="text-[11px] text-[#666666] truncate">{kpi.label}</div>
                <div className={`text-base font-semibold font-mono tabular-nums mt-0.5 ${toneValueText(kpi.tone)}`}>
                  {typeof kpi.value === 'number' ? toPersianDigits(kpi.value.toLocaleString('en-US')) : toPersianDigits(kpi.value)}
                  {kpi.unit && <span className="text-[10px] font-normal text-[#666666] mr-1">{kpi.unit}</span>}
                </div>
                {kpi.sublabel && (
                  <div className="text-[10px] text-[#666666] mt-0.5 truncate">{kpi.sublabel}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Search & Smart Filter Bar */}
        {(onSearchChange || filterControls) && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {onSearchChange && (
              <div className="relative flex-1 min-w-[210px]">
                <Search className="w-3.5 h-3.5 text-[#007cc0] absolute right-2.5 top-2 pointer-events-none" />
                <input
                  type="text"
                  value={searchValue || ''}
                  onChange={e => onSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pr-8 pl-3 py-1.5 bg-[#fafafa] border border-[#bfbfbf] focus:border-[#007cc0] focus:bg-white rounded text-xs text-[#333333] focus:outline-none"
                />
              </div>
            )}
            {filterControls}
            {hasActiveFilters && onResetFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="sap-btn-standard px-2.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>پاکسازی فیلترها</span>
              </button>
            )}
            {typeof totalRowsCount === 'number' && (
              <span className="text-[11px] text-[#666666] font-mono tabular-nums whitespace-nowrap mr-auto">
                {toPersianDigits(totalRowsCount)} ردیف
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main SAP Compact Table Area */}
      <div className="sap-card overflow-hidden">{children}</div>
    </div>
  );
};
