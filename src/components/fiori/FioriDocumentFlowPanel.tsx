import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, ShieldCheck, FileText, GitCommit, History } from 'lucide-react';
import { formatToJalali } from '../../utils/jalali';
import { toPersianDigits } from '../../utils/formatters';

export interface DocumentFlowNode {
  stage: string;
  stageLabel: string;
  movementType?: string;
  docNumber: string;
  referenceNumber?: string;
  reversalOfDocNumber?: string;
  title: string;
  status: string;
  date: string;
  dateFa: string;
}

export interface AuditTrailEntry {
  id: string;
  action: string;
  entityName: string;
  entityId: string;
  user?: { uid?: string; displayName?: string };
  details: string;
  timestamp: string;
}

interface FioriDocumentFlowPanelProps {
  docNumber: string;
  onSelectDoc?: (docNumber: string) => void;
}

export const FioriDocumentFlowPanel: React.FC<FioriDocumentFlowPanelProps> = ({
  docNumber,
  onSelectDoc,
}) => {
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<DocumentFlowNode[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadFlow = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/traceability/document-flow?docNumber=${encodeURIComponent(docNumber || '')}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در دریافت زنجیره اسناد');
      }
      setNodes(json.nodes || []);
      setAuditTrail(json.auditTrail || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطای ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlow();
  }, [docNumber]);

  const stageTone = (stage: string, status: string) => {
    if (status === 'REVERSED' || status === 'CANCELLED' || stage === 'MM_REVERSAL') {
      return 'border-[#e5b3b3] bg-[#fdf3f3] text-[#bb0000]';
    }
    if (stage === 'QM_TRANSFER') {
      return 'border-[#f5cba7] bg-[#fff4e5] text-[#b45309]';
    }
    if (stage === 'SD_ORDER') {
      return 'border-[#b3d9f0] bg-[#e5f3fa] text-[#007cc0]';
    }
    if (stage === 'PP_MO') {
      return 'border-[#c2e0cd] bg-[#f1f8f4] text-[#107e3e]';
    }
    return 'border-[#d9d9d9] bg-white text-[#333333]';
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-xs text-[#666666] flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-[#007cc0]" />
        <span>در حال بازیابی گراف جریان اسناد و ممیزی...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-[#fdf3f3] border border-[#e5b3b3] rounded text-xs text-[#bb0000]">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#333333]">
          <GitCommit className="w-4 h-4 text-[#007cc0]" />
          <span>جریان یکپارچه اسناد SAP (سفارش مشتری تا دستور ساخت، حواله ۲۶۱، رسید ۱۰۱ و تحویل ۶۰۱)</span>
        </div>
        <button
          type="button"
          onClick={loadFlow}
          className="sap-btn-standard px-2.5 py-1 text-[11px] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className="w-3 h-3" />
          <span>بروزرسانی</span>
        </button>
      </div>

      {nodes.length === 0 ? (
        <div className="p-4 bg-[#f5f5f5] border border-[#d9d9d9] rounded text-xs text-[#666666] text-center">
          سند مرتبط دیگری برای «{docNumber || 'انتخاب‌شده'}» در زنجیره اسناد ثبت نشده است.
        </div>
      ) : (
        <div className="space-y-2">
          {nodes.map((node, idx) => {
            const isCurrent = docNumber && node.docNumber.toLowerCase() === docNumber.toLowerCase();
            return (
              <div
                key={`${node.stage}-${node.docNumber}-${idx}`}
                className={`p-3 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                  isCurrent ? 'ring-1 ring-[#007cc0] bg-[#e5f3fa]/40 border-[#007cc0]' : stageTone(node.stage, node.status)
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-semibold text-[#333333]">{node.stageLabel}</span>
                    {node.movementType && (
                      <span className="font-mono text-[#007cc0] font-semibold">
                        حرکت {toPersianDigits(node.movementType)}
                      </span>
                    )}
                    <span className="text-[#999999]">·</span>
                    <button
                      type="button"
                      onClick={() => onSelectDoc?.(node.docNumber)}
                      className="sap-doc-link text-xs"
                    >
                      {node.docNumber}
                    </button>
                    {node.referenceNumber && (
                      <>
                        <span className="text-[#999999]">·</span>
                        <span className="text-[#666666] font-mono">مرجع: {node.referenceNumber}</span>
                      </>
                    )}
                    {node.reversalOfDocNumber && (
                      <>
                        <span className="text-[#999999]">·</span>
                        <span className="text-[#bb0000] font-mono">ابطال‌کننده: {node.reversalOfDocNumber}</span>
                      </>
                    )}
                  </div>
                  <div className="text-xs text-[#333333] truncate">{node.title}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-[11px]">
                  <span className="font-mono text-[#666666] tabular-nums">{node.dateFa}</span>
                  <span
                    className={`font-semibold ${
                      node.status === 'REVERSED' || node.status === 'CANCELLED'
                        ? 'text-[#bb0000]'
                        : node.status === 'POSTED' || node.status === 'COMPLETED' || node.status === 'FULFILLED'
                        ? 'text-[#107e3e]'
                        : 'text-[#007cc0]'
                    }`}
                  >
                    {node.status === 'POSTED'
                      ? 'ثبت قطعی'
                      : node.status === 'REVERSED'
                      ? 'ابطال‌شده'
                      : node.status === 'CANCELLED'
                      ? 'لغوشده'
                      : node.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Immutable Audit Trail */}
      <div className="pt-2 border-t border-[#e8e8e8] space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#333333]">
          <ShieldCheck className="w-4 h-4 text-[#107e3e]" />
          <span>تاریخچه ممیزی تغییرناپذیر (SAP Audit Trail)</span>
        </div>
        {auditTrail.length === 0 ? (
          <div className="text-[11px] text-[#666666] bg-[#f7f7f7] p-3 rounded border border-[#e8e8e8]">
            رویداد ممیزی مستقیمی برای این شماره سند یافت نشد.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#d9d9d9] rounded">
            <table className="w-full text-right sap-table-compact">
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>عملیات</th>
                  <th>کاربر ثبت‌کننده</th>
                  <th>شرح ممیزی</th>
                </tr>
              </thead>
              <tbody>
                {auditTrail.map(aud => (
                  <tr key={aud.id}>
                    <td className="font-mono text-[#666666] whitespace-nowrap">{formatToJalali(aud.timestamp, { includeTime: true })}</td>
                    <td className="font-mono text-[#007cc0] font-semibold whitespace-nowrap">{aud.action}</td>
                    <td className="whitespace-nowrap">{aud.user?.displayName || 'سیستم'}</td>
                    <td>{aud.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
