import React, { useState } from 'react';
import { X, Printer } from 'lucide-react';
import { FioriDocumentFlowPanel } from './FioriDocumentFlowPanel';

export interface ObjectPageKpi {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'critical' | 'negative' | 'brand';
}

export interface ObjectPageTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface FioriObjectPageProps {
  isOpen: boolean;
  onClose: () => void;
  objectTypeLabel: string;
  objectId: string;
  title: string;
  subtitle?: string;
  statusText?: string;
  statusTone?: 'positive' | 'critical' | 'negative' | 'brand';
  kpis?: ObjectPageKpi[];
  headerActions?: React.ReactNode;
  tabs: ObjectPageTab[];
  documentFlowQuery?: string;
  onSelectDocumentFlowDoc?: (docNumber: string) => void;
  enablePrint?: boolean;
}

export const FioriObjectPage: React.FC<FioriObjectPageProps> = ({
  isOpen,
  onClose,
  objectTypeLabel,
  objectId,
  title,
  subtitle,
  statusText,
  statusTone = 'brand',
  kpis = [],
  headerActions,
  tabs,
  documentFlowQuery,
  onSelectDocumentFlowDoc,
  enablePrint = true,
}) => {
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || 'overview');

  if (!isOpen) return null;

  const statusColor =
    statusTone === 'positive'
      ? 'text-[#107e3e]'
      : statusTone === 'negative'
      ? 'text-[#bb0000]'
      : statusTone === 'critical'
      ? 'text-[#e9730c]'
      : 'text-[#007cc0]';

  const kpiColor = (tone?: ObjectPageKpi['tone']) => {
    if (tone === 'positive') return 'text-[#107e3e]';
    if (tone === 'negative') return 'text-[#bb0000]';
    if (tone === 'critical') return 'text-[#e9730c]';
    if (tone === 'brand') return 'text-[#007cc0]';
    return 'text-[#333333]';
  };

  const effectiveTabs: ObjectPageTab[] = [
    ...tabs,
    ...(documentFlowQuery
      ? [
          {
            id: '__document_flow__',
            label: 'جریان اسناد و ممیزی (Document Flow)',
            content: (
              <FioriDocumentFlowPanel
                docNumber={documentFlowQuery}
                onSelectDoc={onSelectDocumentFlowDoc}
              />
            ),
          },
        ]
      : []),
  ];

  const currentTab = effectiveTabs.find(t => t.id === activeTabId) || effectiveTabs[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-[#f0f0f0] border border-[#bfbfbf] rounded-md shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* SAP Object Page Sticky Header */}
        <div className="fiori-object-header shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#666666]">
                <span>{objectTypeLabel}</span>
                <span>·</span>
                <span className="font-mono font-semibold text-[#007cc0]">{objectId}</span>
                {statusText && (
                  <>
                    <span>·</span>
                    <span className={`font-semibold ${statusColor}`}>{statusText}</span>
                  </>
                )}
              </div>
              <h3 className="text-base font-semibold text-[#333333] mt-0.5 truncate">{title}</h3>
              {subtitle && <p className="text-xs text-[#666666] mt-0.5">{subtitle}</p>}
            </div>

            {/* Header Actions (Never includes Delete on transactional records) */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {headerActions}
              {enablePrint && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="sap-btn-standard px-2.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>چاپ</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded bg-[#f5f5f5] hover:bg-[#e8e8e8] border border-[#cccccc] text-[#333333] cursor-pointer"
                title="بستن صفحه شیء"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Object Header KPIs */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#e8e8e8]">
              {kpis.map((kpi, idx) => (
                <div key={idx}>
                  <div className="text-[11px] text-[#666666]">{kpi.label}</div>
                  <div className={`text-sm font-semibold font-mono tabular-nums mt-0.5 ${kpiColor(kpi.tone)}`}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SAP Icon Tab Bar Navigation */}
        <div className="sap-icon-tab-bar px-3 shrink-0">
          {effectiveTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`sap-icon-tab whitespace-nowrap shrink-0 ${
                currentTab?.id === tab.id ? 'sap-icon-tab-active' : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Section Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="sap-card p-4">{currentTab?.content}</div>
        </div>
      </div>
    </div>
  );
};
