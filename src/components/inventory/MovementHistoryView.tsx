import React, { useState, useMemo, useEffect } from 'react';
import {
  Download,
  RefreshCw,
  RotateCcw,
  AlertCircle,
  ShieldAlert,
  Link2,
  Eye,
} from 'lucide-react';
import {
  InventoryDocument,
  WarehouseDefinition,
  InventoryDocType,
  PostingStatus,
  SAP_MOVEMENT_CATALOG,
  SapMovementType,
  resolveSapMovementType,
  getSapMovementReversal,
} from '../../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  exportToCsv,
} from '../../utils/formatters';
import { useErpRouter } from '../../context/RouterContext';
import { FioriAnalyticalListPage, AlpVisualKpiItem } from '../fiori/FioriAnalyticalListPage';
import { FioriObjectPage } from '../fiori/FioriObjectPage';

interface MovementHistoryViewProps {
  documents: InventoryDocument[];
  warehouses: WarehouseDefinition[];
  loading: boolean;
  initialSearchTerm?: string;
  userRole?: string;
  onRefresh: () => Promise<void>;
  onReverseDocument: (documentId: string, reason: string) => Promise<{ success: boolean; message: string }>;
}

type KpiFilterPreset = 'ALL' | 'POSTED' | 'RECEIPT_101' | 'ISSUE_261' | 'QM_TRANSFERS' | 'REVERSAL';

export const MovementHistoryView: React.FC<MovementHistoryViewProps> = ({
  documents,
  warehouses,
  loading,
  initialSearchTerm,
  userRole,
  onRefresh,
  onReverseDocument,
}) => {
  const router = useErpRouter();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedMovementFilter, setSelectedMovementFilter] = useState<string>('ALL');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [kpiPreset, setKpiPreset] = useState<KpiFilterPreset>('ALL');

  // Object Page state
  const [selectedObjectDoc, setSelectedObjectDoc] = useState<InventoryDocument | null>(null);

  useEffect(() => {
    if (initialSearchTerm !== undefined) {
      setSearchTerm(initialSearchTerm);
      setCurrentPage(1);
    }
  }, [initialSearchTerm]);

  // Keep Object Page doc synced if optimistic update mutates documents array
  const activeObjectDoc = useMemo(() => {
    if (!selectedObjectDoc) return null;
    return documents.find(d => d.id === selectedObjectDoc.id) || selectedObjectDoc;
  }, [documents, selectedObjectDoc]);

  // Reversal dialog state (No Delete allowed on transactional records)
  const [reversalDoc, setReversalDoc] = useState<InventoryDocument | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [isSubmittingReversal, setIsSubmittingReversal] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 16;

  const docTypeLabels: Record<InventoryDocType, { label: string; colorClass: string }> = {
    OPENING_BALANCE: { label: 'موجودی اول دوره', colorClass: 'text-[#333333]' },
    RECEIPT_RAW_MATERIAL: { label: 'رسید ورود مواد اولیه', colorClass: 'text-[#107e3e]' },
    ISSUE_RAW_MATERIAL: { label: 'حواله مصرف مواد/خط', colorClass: 'text-[#e9730c]' },
    RECEIPT_FINISHED_GOODS: { label: 'رسید محصول نهایی', colorClass: 'text-[#107e3e]' },
    ISSUE_FINISHED_GOODS: { label: 'حواله خروج محصول نهایی', colorClass: 'text-[#007cc0]' },
    DELIVERY_CUSTOMER: { label: 'تحویل و خروج به مشتری', colorClass: 'text-[#007cc0]' },
    SHIPMENT_CUSTOMER: { label: 'حواله بارنامه خودروساز', colorClass: 'text-[#007cc0]' },
    TRANSFER: { label: 'انتقال بین‌انباری', colorClass: 'text-[#333333]' },
    STOCK_STATUS_TRANSFER: { label: 'انتقال وضعیت کیفی (QM)', colorClass: 'text-[#007cc0]' },
    ADJUSTMENT: { label: 'تعدیل انبارگردانی', colorClass: 'text-[#e9730c]' },
    REVERSAL: { label: 'سند ابطال / برگشتی', colorClass: 'text-[#bb0000]' },
  };

  const statusLabels: Record<PostingStatus, { label: string; colorClass: string; tone: 'positive' | 'critical' | 'negative' }> = {
    POSTED: { label: 'قطعی (ثبت کاردکس)', colorClass: 'text-[#107e3e]', tone: 'positive' },
    UNPOSTED: { label: 'پیش‌نویس', colorClass: 'text-[#e9730c]', tone: 'critical' },
    REVERSED: { label: 'ابطال‌شده با سند معکوس', colorClass: 'text-[#bb0000]', tone: 'negative' },
  };

  const getMovementInfo = (doc: InventoryDocument): { code: SapMovementType; shortFa: string; labelFa: string; direction: string } => {
    const code = resolveSapMovementType(doc.documentType, {
      explicitMovementType: doc.movementType,
      totalQuantity: doc.totalQuantity,
      qmTarget: doc.qmStatusTarget,
    });
    const meta = SAP_MOVEMENT_CATALOG[code];
    return {
      code,
      shortFa: meta?.shortFa || doc.movementLabel || doc.documentType,
      labelFa: meta?.labelFa || doc.movementLabel || doc.documentType,
      direction: meta?.direction || 'TRANSFER',
    };
  };

  const filteredDocs = useMemo(() => {
    return documents
      .filter(doc => {
        const mv = getMovementInfo(doc);

        if (kpiPreset === 'POSTED' && doc.postingStatus !== 'POSTED') return false;
        if (kpiPreset === 'RECEIPT_101' && mv.code !== '101' && mv.code !== '561') return false;
        if (kpiPreset === 'ISSUE_261' && mv.code !== '261' && mv.code !== '601') return false;
        if (kpiPreset === 'QM_TRANSFERS' && mv.code !== '321' && mv.code !== '322' && mv.code !== '344') return false;
        if (kpiPreset === 'REVERSAL' && doc.documentType !== 'REVERSAL' && doc.postingStatus !== 'REVERSED') return false;

        if (selectedTypeFilter !== 'ALL' && doc.documentType !== selectedTypeFilter) return false;
        if (selectedMovementFilter !== 'ALL' && mv.code !== selectedMovementFilter) return false;
        if (
          selectedWarehouseFilter !== 'ALL' &&
          doc.warehouseId !== selectedWarehouseFilter &&
          doc.targetWarehouseId !== selectedWarehouseFilter
        ) {
          return false;
        }
        if (selectedStatusFilter !== 'ALL' && doc.postingStatus !== selectedStatusFilter) return false;

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchesDocNo = doc.documentNumber.toLowerCase().includes(q);
          const matchesRef = doc.referenceNumber ? doc.referenceNumber.toLowerCase().includes(q) : false;
          const matchesNote = doc.auditNote ? doc.auditNote.toLowerCase().includes(q) : false;
          const matchesContract = doc.contractNumber ? doc.contractNumber.toLowerCase().includes(q) : false;
          const matchesMv = mv.code.toLowerCase().includes(q) || mv.shortFa.toLowerCase().includes(q);
          const matchesLine = doc.lines.some(
            l =>
              l.partName.toLowerCase().includes(q) ||
              l.partCode.toLowerCase().includes(q) ||
              (l.lotNumber && l.lotNumber.toLowerCase().includes(q)) ||
              (l.heatNumber && l.heatNumber.toLowerCase().includes(q))
          );
          if (!matchesDocNo && !matchesRef && !matchesNote && !matchesContract && !matchesMv && !matchesLine) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [
    documents,
    kpiPreset,
    selectedTypeFilter,
    selectedMovementFilter,
    selectedWarehouseFilter,
    selectedStatusFilter,
    searchTerm,
  ]);

  const totalPages = Math.ceil(filteredDocs.length / pageSize) || 1;
  const pagedDocs = filteredDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Statistics for ALP Visual Filter Micro-Cards
  const postedCount = documents.filter(d => d.postingStatus === 'POSTED').length;
  const reversalCount = documents.filter(d => d.documentType === 'REVERSAL' || d.postingStatus === 'REVERSED').length;
  const qmTransfersCount = documents.filter(d => {
    const c = getMovementInfo(d).code;
    return c === '321' || c === '322' || c === '344';
  }).length;
  const totalWeightIn = documents
    .filter(d => {
      const c = getMovementInfo(d).code;
      return (c === '101' || c === '561') && d.postingStatus === 'POSTED';
    })
    .reduce((s, d) => s + d.totalWeightKg, 0);
  const totalWeightOut = documents
    .filter(d => {
      const c = getMovementInfo(d).code;
      return (c === '261' || c === '601') && d.postingStatus === 'POSTED';
    })
    .reduce((s, d) => s + d.totalWeightKg, 0);

  const handleExportCsv = () => {
    const headers = [
      'شماره سند',
      'کد حرکت SAP',
      'شرح حرکت',
      'نوع سند',
      'تاریخ سند',
      'وضعیت قطعی',
      'انبار مبدأ',
      'انبار مقصد',
      'مالکیت',
      'قرارداد ساپکو',
      'شماره ارجاع / دستور ساخت',
      'تعداد اقلام',
      'تعداد کل',
      'وزن کل (کیلوگرم)',
      'سند ابطال‌شده',
      'یادداشت ممیزی',
      'ثبت‌کننده',
    ];

    const rows = filteredDocs.map(d => {
      const mv = getMovementInfo(d);
      return [
        d.documentNumber,
        mv.code,
        mv.shortFa,
        docTypeLabels[d.documentType]?.label || d.documentType,
        d.documentDate,
        statusLabels[d.postingStatus]?.label || d.postingStatus,
        d.warehouseName,
        d.targetWarehouseName || '-',
        d.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی کارخانه',
        d.contractNumber || '-',
        d.referenceNumber || '-',
        d.lines.length,
        d.totalQuantity,
        d.totalWeightKg,
        d.reversalOfDocNumber || '-',
        d.adjustmentReason || d.auditNote || '-',
        d.createdByName,
      ];
    });

    exportToCsv(`اسناد_حرکت_انبار_SAP_${Date.now()}`, headers, rows);
  };

  const handleConfirmReversal = async () => {
    if (!reversalDoc) return;
    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setReversalError('لطفاً دلیل مستند و مشخصی برای ابطال و صدور سند معکوس درج کنید (حداقل ۵ کاراکتر).');
      return;
    }

    setIsSubmittingReversal(true);
    setReversalError(null);

    try {
      const res = await onReverseDocument(reversalDoc.id, reversalReason.trim());
      if (res.success) {
        setReversalDoc(null);
        setReversalReason('');
      } else {
        setReversalError(res.message);
      }
    } catch (err: any) {
      setReversalError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setIsSubmittingReversal(false);
    }
  };

  const roleAllowedToReverse = !userRole || ['ADMIN', 'WAREHOUSE_KEEPER', 'PRODUCTION_MANAGER'].includes(userRole);

  const hasActiveFilters =
    kpiPreset !== 'ALL' ||
    selectedTypeFilter !== 'ALL' ||
    selectedMovementFilter !== 'ALL' ||
    selectedWarehouseFilter !== 'ALL' ||
    selectedStatusFilter !== 'ALL' ||
    Boolean(searchTerm.trim());

  const kpiFilters: AlpVisualKpiItem[] = [
    {
      id: 'ALL',
      label: 'کل اسناد قطعی (Posted)',
      value: postedCount,
      unit: 'سند',
      tone: 'brand',
      active: kpiPreset === 'ALL' || kpiPreset === 'POSTED',
      onClick: () => {
        setKpiPreset(prev => (prev === 'POSTED' ? 'ALL' : 'POSTED'));
        setCurrentPage(1);
      },
      sublabel: 'کل دفتر کل انبار (MIGO)',
    },
    {
      id: 'RECEIPT_101',
      label: 'رسید ورود به انبار (۱۰۱ / ۵۶۱)',
      value: Math.round(totalWeightIn),
      unit: 'kg',
      tone: 'positive',
      active: kpiPreset === 'RECEIPT_101',
      onClick: () => {
        setKpiPreset(prev => (prev === 'RECEIPT_101' ? 'ALL' : 'RECEIPT_101'));
        setCurrentPage(1);
      },
      sublabel: 'ورود مواد اولیه و محصول تولیدی',
    },
    {
      id: 'ISSUE_261',
      label: 'حواله مصرف و تحویل (۲۶۱ / ۶۰۱)',
      value: Math.round(totalWeightOut),
      unit: 'kg',
      tone: 'critical',
      active: kpiPreset === 'ISSUE_261',
      onClick: () => {
        setKpiPreset(prev => (prev === 'ISSUE_261' ? 'ALL' : 'ISSUE_261'));
        setCurrentPage(1);
      },
      sublabel: 'مصرف پای کار و ارسال به خودروساز',
    },
    {
      id: 'QM_TRANSFERS',
      label: 'انتقال کیفی QM (۳۲۱ / ۳۲۲ / ۳۴۴)',
      value: qmTransfersCount,
      unit: 'سند کیفی',
      tone: 'brand',
      active: kpiPreset === 'QM_TRANSFERS',
      onClick: () => {
        setKpiPreset(prev => (prev === 'QM_TRANSFERS' ? 'ALL' : 'QM_TRANSFERS'));
        setCurrentPage(1);
      },
      sublabel: 'جابجایی بین آزاد، قرنطینه و مسدود',
    },
    {
      id: 'REVERSAL',
      label: 'ابطال و سند برگشتی (۱۰۲ / ۲۶۲ / ۶۰۲)',
      value: reversalCount,
      unit: 'مورد',
      tone: 'negative',
      active: kpiPreset === 'REVERSAL',
      onClick: () => {
        setKpiPreset(prev => (prev === 'REVERSAL' ? 'ALL' : 'REVERSAL'));
        setCurrentPage(1);
      },
      sublabel: 'بدون حذف فیزیکی (Immutable)',
    },
  ];

  const getQualityLabel = (qs: string) => {
    if (qs === 'AVAILABLE') return { label: 'آزاد (Unrestricted)', color: 'text-[#107e3e]' };
    if (qs === 'QUALITY_BLOCKED' || qs === 'REJECTED' || qs === 'BLOCKED') return { label: 'مسدود (Blocked)', color: 'text-[#bb0000]' };
    return { label: 'در حال کنترل کیفی (QI)', color: 'text-[#e9730c]' };
  };

  return (
    <div className="space-y-3">
      <FioriAnalyticalListPage
        title="دفتر کل اسناد انبار و کدهای حرکت SAP MM (Analytical List Page)"
        subtitle="ثبت تغییرناپذیر تراکنش‌ها (کدهای ۱۰۱، ۱۰۲، ۲۶۱، ۲۶۲، ۳۱۱، ۳۲۱، ۳۲۲، ۳۴۴، ۶۰۱)؛ کلیک روی هر سطر برای نمایش Object Page و جریان اسناد"
        kpiFilters={kpiFilters}
        searchValue={searchTerm}
        onSearchChange={val => {
          setSearchTerm(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="جستجوی شماره سند، کد حرکت (مثلاً 261)، دستور ساخت، کلاف، ذوب یا کالا..."
        totalRowsCount={filteredDocs.length}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={() => {
          setSearchTerm('');
          setSelectedTypeFilter('ALL');
          setSelectedMovementFilter('ALL');
          setSelectedWarehouseFilter('ALL');
          setSelectedStatusFilter('ALL');
          setKpiPreset('ALL');
          setCurrentPage(1);
          router.clearDocQuery();
        }}
        headerActions={
          <>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>به‌روزرسانی</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="sap-btn-emphasized flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </>
        }
        filterControls={
          <>
            <select
              value={selectedMovementFilter}
              onChange={e => {
                setSelectedMovementFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] font-mono focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه کدهای حرکت SAP</option>
              {(Object.keys(SAP_MOVEMENT_CATALOG) as SapMovementType[]).map(code => (
                <option key={code} value={code}>
                  {SAP_MOVEMENT_CATALOG[code].labelFa}
                </option>
              ))}
            </select>

            <select
              value={selectedTypeFilter}
              onChange={e => {
                setSelectedTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه انواع اسناد</option>
              <option value="RECEIPT_RAW_MATERIAL">رسید مواد اولیه</option>
              <option value="ISSUE_RAW_MATERIAL">حواله مصرف خط تولید</option>
              <option value="RECEIPT_FINISHED_GOODS">رسید محصول نهایی</option>
              <option value="DELIVERY_CUSTOMER">تحویل به مشتری</option>
              <option value="TRANSFER">انتقال بین‌انباری</option>
              <option value="STOCK_STATUS_TRANSFER">انتقال وضعیت کیفی (QM)</option>
              <option value="ADJUSTMENT">تعدیل انبارگردانی</option>
              <option value="REVERSAL">سند معکوس / ابطال</option>
              <option value="OPENING_BALANCE">موجودی اول دوره</option>
            </select>

            <select
              value={selectedWarehouseFilter}
              onChange={e => {
                setSelectedWarehouseFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه انبارها</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>

            <select
              value={selectedStatusFilter}
              onChange={e => {
                setSelectedStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه وضعیت‌ها</option>
              <option value="POSTED">قطعی (Posted)</option>
              <option value="REVERSED">ابطال‌شده (Reversed)</option>
              <option value="UNPOSTED">پیش‌نویس (Unposted)</option>
            </select>
          </>
        }
      >
        {/* SAP Compact Density Document Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs sap-table-compact">
            <thead className="bg-[#f5f5f5] text-[#333333] border-b border-[#d9d9d9] font-semibold">
              <tr>
                <th className="py-1.5 px-2.5 whitespace-nowrap">شماره سند</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">کد حرکت SAP</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">شرح عملیات</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">تاریخ</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">انبار مبدأ / مقصد</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">اقلام و بچ / مرجع</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">مقدار / وزن</th>
                <th className="py-1.5 px-2.5 whitespace-nowrap">وضعیت</th>
                <th className="py-1.5 px-2.5 text-left whitespace-nowrap">شیء و ابطال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8] bg-white tabular-nums">
              {pagedDocs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[#666666]">
                    هیچ سند انباری منطبق با فیلترهای انتخابی یافت نشد.
                  </td>
                </tr>
              ) : (
                pagedDocs.map(doc => {
                  const mv = getMovementInfo(doc);
                  const typeInfo = docTypeLabels[doc.documentType] || { label: doc.documentType, colorClass: 'text-[#333333]' };
                  const statusInfo = statusLabels[doc.postingStatus] || {
                    label: doc.postingStatus,
                    colorClass: 'text-[#666666]',
                    tone: 'critical' as const,
                  };
                  const canReverse =
                    roleAllowedToReverse && doc.postingStatus === 'POSTED' && doc.documentType !== 'REVERSAL';
                  const revMvCode = getSapMovementReversal(mv.code);
                  const firstLine = doc.lines[0];

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedObjectDoc(doc)}
                      className={`cursor-pointer transition-colors ${
                        doc.postingStatus === 'REVERSED'
                          ? 'bg-[#fafafa] text-[#767676] hover:bg-[#ffecec]/40'
                          : 'hover:bg-[#e5f3fa]/60'
                      }`}
                    >
                      <td className="px-2.5 whitespace-nowrap font-mono font-semibold" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedObjectDoc(doc)}
                          className="sap-doc-link font-mono font-semibold cursor-pointer"
                          title="باز کردن Object Page سند"
                        >
                          {doc.documentNumber}
                        </button>
                      </td>

                      <td className="px-2.5 whitespace-nowrap font-mono font-bold">
                        <span
                          className={
                            mv.direction === 'IN'
                              ? 'text-[#107e3e]'
                              : mv.direction === 'OUT'
                              ? 'text-[#bb0000]'
                              : mv.direction === 'QM'
                              ? 'text-[#e9730c]'
                              : 'text-[#007cc0]'
                          }
                        >
                          MvT {mv.code}
                        </span>
                      </td>

                      <td className="px-2.5 whitespace-nowrap">
                        <span className={`font-semibold ${typeInfo.colorClass}`}>{mv.shortFa}</span>
                        {doc.reversalOfDocNumber && (
                          <span className="text-[11px] text-[#bb0000] font-mono mr-1.5">
                            · برگشت از {doc.reversalOfDocNumber}
                          </span>
                        )}
                      </td>

                      <td className="px-2.5 whitespace-nowrap font-mono text-[#666666]">
                        {doc.documentDate}
                      </td>

                      <td className="px-2.5 whitespace-nowrap text-[#333333]">
                        <span>{doc.warehouseName}</span>
                        {doc.targetWarehouseName && (
                          <span className="text-[#666666]"> ← {doc.targetWarehouseName}</span>
                        )}
                      </td>

                      <td className="px-2.5 whitespace-nowrap text-[#333333]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <span>{firstLine?.partName || '—'}</span>
                          {doc.lines.length > 1 && (
                            <span className="text-[11px] text-[#666666] font-mono">
                              (+{toPersianDigits(doc.lines.length - 1)})
                            </span>
                          )}
                          {doc.referenceNumber && (
                            <button
                              type="button"
                              onClick={() => router.traceDocument(doc.referenceNumber!, 'WIP_TRACEABILITY')}
                              className="sap-doc-link text-[11px] font-mono cursor-pointer mr-1"
                              title="رهگیری دستور ساخت یا بارنامه"
                            >
                              {doc.referenceNumber}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="px-2.5 whitespace-nowrap font-mono font-semibold text-[#333333]">
                        {formatNumber(doc.totalQuantity)} {firstLine?.unit === 'KG' ? 'kg' : 'عدد'} ·{' '}
                        <span className="text-[#666666] font-normal">{formatWeightKg(doc.totalWeightKg)}</span>
                      </td>

                      <td className="px-2.5 whitespace-nowrap">
                        <span className={`font-semibold text-[11px] ${statusInfo.colorClass}`}>
                          {statusInfo.label}
                        </span>
                      </td>

                      <td className="px-2.5 whitespace-nowrap text-left" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedObjectDoc(doc)}
                            className="sap-btn-standard px-2 py-0.5 text-[11px] inline-flex items-center gap-1 cursor-pointer"
                            title="مشاهده جزئیات و جریان اسناد (Object Page)"
                          >
                            <Eye className="w-3 h-3 text-[#007cc0]" />
                            <span>جزئیات</span>
                          </button>

                          {canReverse && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversalDoc(doc);
                                setReversalReason('');
                                setReversalError(null);
                              }}
                              className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#bb0000] border-[#f2b8b5] hover:bg-[#ffecec] inline-flex items-center gap-1 cursor-pointer"
                              title={`صدور سند معکوس با کد حرکت ${revMvCode}`}
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>ابطال ({revMvCode})</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-3 py-2 bg-[#fafafa] border-t border-[#d9d9d9] flex items-center justify-between text-xs text-[#666666]">
            <div>
              صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="sap-btn-standard px-2.5 py-1 disabled:opacity-40 cursor-pointer"
              >
                قبلی
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="sap-btn-standard px-2.5 py-1 disabled:opacity-40 cursor-pointer"
              >
                بعدی
              </button>
            </div>
          </div>
        )}
      </FioriAnalyticalListPage>

      {/* SAP Fiori Object Page for Selected Material Document */}
      {activeObjectDoc && (() => {
        const mv = getMovementInfo(activeObjectDoc);
        const statusInfo = statusLabels[activeObjectDoc.postingStatus] || {
          label: activeObjectDoc.postingStatus,
          colorClass: 'text-[#666666]',
          tone: 'critical' as const,
        };
        const canReverse =
          roleAllowedToReverse &&
          activeObjectDoc.postingStatus === 'POSTED' &&
          activeObjectDoc.documentType !== 'REVERSAL';
        const revMvCode = getSapMovementReversal(mv.code);

        return (
          <FioriObjectPage
            isOpen={Boolean(activeObjectDoc)}
            onClose={() => setSelectedObjectDoc(null)}
            objectTypeLabel={`سند انبار SAP MM (MvT ${mv.code})`}
            objectId={activeObjectDoc.documentNumber}
            title={mv.labelFa}
            subtitle={`انبار مبدأ: ${activeObjectDoc.warehouseName}${
              activeObjectDoc.targetWarehouseName ? ` ← مقصد: ${activeObjectDoc.targetWarehouseName}` : ''
            } · ثبت‌کننده: ${activeObjectDoc.createdByName}`}
            statusText={statusInfo.label}
            statusTone={statusInfo.tone}
            documentFlowQuery={activeObjectDoc.documentNumber}
            onSelectDocumentFlowDoc={docNo => {
              const found = documents.find(d => d.documentNumber === docNo);
              if (found) {
                setSelectedObjectDoc(found);
              } else {
                router.traceDocument(docNo, 'WIP_TRACEABILITY');
              }
            }}
            headerActions={
              <>
                <button
                  type="button"
                  onClick={() => router.traceDocument(activeObjectDoc.documentNumber, 'WIP_TRACEABILITY')}
                  className="sap-btn-standard px-2.5 py-1.5 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#007cc0]" />
                  <span>ردیابی WIP</span>
                </button>
                {canReverse && (
                  <button
                    type="button"
                    onClick={() => {
                      setReversalDoc(activeObjectDoc);
                      setReversalReason('');
                      setReversalError(null);
                    }}
                    className="px-3 py-1.5 rounded bg-[#bb0000] hover:bg-[#990000] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>ابطال و صدور سند معکوس ({revMvCode})</span>
                  </button>
                )}
              </>
            }
            kpis={[
              { label: 'کد حرکت SAP', value: `MvT ${mv.code}`, tone: 'brand' },
              { label: 'تاریخ ثبت سند', value: activeObjectDoc.documentDate, tone: 'default' },
              { label: 'تعداد / مقدار کل', value: formatNumber(activeObjectDoc.totalQuantity), tone: 'default' },
              { label: 'وزن خالص کل', value: formatWeightKg(activeObjectDoc.totalWeightKg), tone: 'positive' },
            ]}
            tabs={[
              {
                id: 'lines',
                label: `اقلام سند (${toPersianDigits(activeObjectDoc.lines.length)})`,
                content: (
                  <div className="space-y-3">
                    {(activeObjectDoc.adjustmentReason || activeObjectDoc.auditNote) && (
                      <div className="p-2.5 bg-[#fafafa] border border-[#d9d9d9] rounded text-xs text-[#333333] flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-[#e9730c] shrink-0 mt-0.5" />
                        <div>
                          <strong>یادداشت / علت سند: </strong>
                          <span>{activeObjectDoc.adjustmentReason || activeObjectDoc.auditNote}</span>
                        </div>
                      </div>
                    )}

                    <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                      <table className="w-full text-right text-xs sap-table-compact">
                        <thead className="bg-[#f5f5f5] text-[#333333] border-b border-[#d9d9d9] font-semibold">
                          <tr>
                            <th className="py-1.5 px-2.5">ردیف</th>
                            <th className="py-1.5 px-2.5">کد کالا</th>
                            <th className="py-1.5 px-2.5">شرح کالا</th>
                            <th className="py-1.5 px-2.5">کویل‌پک / لوت</th>
                            <th className="py-1.5 px-2.5">شماره ذوب</th>
                            <th className="py-1.5 px-2.5">جایگاه</th>
                            <th className="py-1.5 px-2.5">وضعیت کیفی</th>
                            <th className="py-1.5 px-2.5">تعداد / مقدار</th>
                            <th className="py-1.5 px-2.5">وزن (kg)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                          {activeObjectDoc.lines.map((line, idx) => {
                            const qsInfo = getQualityLabel(line.qualityStatus);
                            return (
                              <tr key={line.id || idx} className="hover:bg-[#e5f3fa]/50">
                                <td className="px-2.5 font-mono text-[#666666]">{toPersianDigits(idx + 1)}</td>
                                <td className="px-2.5 font-mono font-semibold text-[#007cc0]">{line.partCode}</td>
                                <td className="px-2.5 font-medium text-[#333333]">{line.partName}</td>
                                <td className="px-2.5 font-mono">{line.lotNumber || '—'}</td>
                                <td className="px-2.5 font-mono">{line.heatNumber || '—'}</td>
                                <td className="px-2.5 font-mono text-[#666666]">{line.locationCode || '—'}</td>
                                <td className={`px-2.5 font-semibold ${qsInfo.color}`}>{qsInfo.label}</td>
                                <td className="px-2.5 font-mono font-semibold">
                                  {formatNumber(line.quantity)} {line.unit}
                                </td>
                                <td className="px-2.5 font-mono font-semibold">{formatWeightKg(line.quantityKg)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ),
              },
              {
                id: 'header',
                label: 'سربرگ و اطلاعات کنترلی',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-[#fafafa] border border-[#d9d9d9] rounded space-y-1.5">
                      <div className="font-semibold text-[#333333]">اطلاعات انبار و مالکیت</div>
                      <div>انبار مبدأ: <strong>{activeObjectDoc.warehouseName}</strong></div>
                      <div>انبار مقصد: <strong>{activeObjectDoc.targetWarehouseName || '—'}</strong></div>
                      <div>
                        مالکیت:{' '}
                        <strong>
                          {activeObjectDoc.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی شرکت'}
                        </strong>
                      </div>
                    </div>

                    <div className="p-3 bg-[#fafafa] border border-[#d9d9d9] rounded space-y-1.5">
                      <div className="font-semibold text-[#333333]">مرجع و زنجیره سفارش</div>
                      <div>شماره قرارداد: <strong className="font-mono">{activeObjectDoc.contractNumber || '—'}</strong></div>
                      <div>شماره ارجاع / MO: <strong className="font-mono">{activeObjectDoc.referenceNumber || '—'}</strong></div>
                      <div>نوع مرجع: <strong className="font-mono">{activeObjectDoc.referenceType || '—'}</strong></div>
                    </div>

                    <div className="p-3 bg-[#fafafa] border border-[#d9d9d9] rounded space-y-1.5">
                      <div className="font-semibold text-[#333333]">حسابرسی و تغییرناپذیری</div>
                      <div>ثبت‌کننده: <strong>{activeObjectDoc.createdByName}</strong></div>
                      <div>تأییدکننده قطعی: <strong>{activeObjectDoc.postedByName || '—'}</strong></div>
                      <div>سند معکوس‌شده: <strong className="font-mono">{activeObjectDoc.reversalOfDocNumber || '—'}</strong></div>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        );
      })()}

      {/* Reversal Confirmation Modal */}
      {reversalDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#333333]/45">
          <div className="bg-white border border-[#d9d9d9] rounded-md max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#ffebee] text-[#bb0000] rounded border border-[#f5c2c7]">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#333333]">
                  ابطال سند و صدور سند معکوس (کد حرکت {getSapMovementReversal(getMovementInfo(reversalDoc).code)})
                </h3>
                <p className="text-xs text-[#666666] mt-0.5">
                  سند شماره <span className="font-mono text-[#333333] font-bold">{reversalDoc.documentNumber}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#ffebee]/60 border border-[#f5c2c7] rounded text-xs text-[#bb0000] space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-[#bb0000]" />
                <span>قانون تغییرناپذیری اسناد در SAP S/4HANA</span>
              </div>
              <p className="text-[#333333] leading-relaxed text-[11px]">
                هیچ سند قطعی قابلیت حذف (Delete) ندارد. با تأیید این فرم، سند معکوس جبرانی با کد حرکت{' '}
                <strong className="font-mono">{getSapMovementReversal(getMovementInfo(reversalDoc).code)}</strong>{' '}
                صادر شده و تاریخچه ممیزی به صورت کامل حفظ می‌شود.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">
                دلیل رسمی ابطال و صدور سند معکوس <span className="text-[#bb0000]">*</span>
              </label>
              <textarea
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="مثال: اصلاح خطای اپراتور در ثبت باسکول، برگشت از دستور ساخت..."
                rows={3}
                className="w-full bg-white border border-[#bfbfbf] rounded p-2.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
              />
            </div>

            {reversalError && (
              <div className="p-3 bg-[#ffebee] border border-[#f5c2c7] rounded text-xs text-[#bb0000] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#bb0000]" />
                <span>{reversalError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#e8e8e8]">
              <button
                type="button"
                onClick={() => setReversalDoc(null)}
                disabled={isSubmittingReversal}
                className="sap-btn-standard px-4 py-1.5 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmReversal}
                disabled={isSubmittingReversal}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#bb0000] hover:bg-[#990000] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isSubmittingReversal ? 'animate-spin' : ''}`} />
                <span>تأیید و صدور سند معکوس</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
