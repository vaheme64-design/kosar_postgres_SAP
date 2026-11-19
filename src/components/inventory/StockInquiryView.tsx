import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Download,
  Building2,
  RefreshCw,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Layers,
  Boxes,
  BookmarkCheck,
  FileSpreadsheet,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  Pin,
  ShieldAlert,
  Lock,
  Unlock,
  ClipboardList,
  ListTree,
} from 'lucide-react';
import {
  DetailedStockBalance,
  Part,
  WarehouseDefinition,
  StockOwnership,
  InventoryDocument,
  SapMovementType,
  resolveSapMovementType,
  SAP_MOVEMENT_CATALOG,
} from '../../types/inventory';
import {
  formatNumber,
  formatWeightKg,
  toPersianDigits,
  formatDateTime,
  exportToCsv,
} from '../../utils/formatters';
import { CoilSlittingGenealogyPanel } from './CoilSlittingGenealogyPanel';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { useErpRouter } from '../../context/RouterContext';
import { FormulaTooltip } from '../common/FormulaTooltip';
import { FioriAnalyticalListPage, AlpVisualKpiItem } from '../fiori/FioriAnalyticalListPage';
import { FioriObjectPage } from '../fiori/FioriObjectPage';
import {
  loadQcHoldMap,
  loadVipPartsMap,
  isPartVip,
  QcHoldRecord,
} from '../../utils/qcHoldStore';

export type StockGroupingKey =
  | 'NONE'
  | 'PART'
  | 'WAREHOUSE'
  | 'OWNERSHIP'
  | 'CONTRACT'
  | 'COIL_PACK'
  | 'GRADE'
  | 'THICKNESS';

interface StockInquiryViewProps {
  balances: DetailedStockBalance[];
  parts: Part[];
  warehouses: WarehouseDefinition[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onQmTransferApplied?: (payload: { balances?: DetailedStockBalance[]; metrics?: any; message?: string }) => void;
}

const DEFAULT_VISIBLE_COLUMNS = {
  partCode: true,
  partName: true,
  warehouse: true,
  lotNumber: true,
  contract: true,
  ownership: true,
  physicalQty: true,
  availableQty: true,
  reservedQty: true,
  blockedQty: false,
  physicalKg: true,
  lastTx: false,
};

export const StockInquiryView: React.FC<StockInquiryViewProps> = ({
  balances: rawBalances,
  parts,
  warehouses,
  loading,
  onRefresh,
  onQmTransferApplied,
}) => {
  const { showUndoToast, recordAudit } = useEnterpriseUx();
  const { route, traceDocument, clearDocQuery, navigate } = useErpRouter();
  const [qcHoldMap, setQcHoldMap] = useState<Record<string, QcHoldRecord>>(() => loadQcHoldMap());
  const [vipMap, setVipMap] = useState<Record<string, boolean>>(() => loadVipPartsMap());
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, Partial<DetailedStockBalance>>>({});
  const [selectedObjectBalance, setSelectedObjectBalance] = useState<DetailedStockBalance | null>(null);

  useEffect(() => {
    const onHoldChange = () => setQcHoldMap(loadQcHoldMap());
    const onVipChange = () => setVipMap(loadVipPartsMap());
    window.addEventListener('kpims-qc-hold-changed', onHoldChange);
    window.addEventListener('kpims-vip-parts-changed', onVipChange);
    return () => {
      window.removeEventListener('kpims-qc-hold-changed', onHoldChange);
      window.removeEventListener('kpims-vip-parts-changed', onVipChange);
    };
  }, []);

  // Derive 3 physical QM statuses (Unrestricted, Quality Inspection, Blocked) + optimistic overrides
  const balances = useMemo(() => {
    return rawBalances.map(b => {
      const override = optimisticOverrides[b.id];
      const baseUnrestricted =
        typeof b.unrestrictedQty === 'number'
          ? b.unrestrictedQty
          : Math.max(0, b.physicalQty - (b.qualityBlockedQty || 0));
      const baseQi = typeof b.qualityInspectionQty === 'number' ? b.qualityInspectionQty : 0;
      const baseBlocked =
        typeof b.blockedQty === 'number' ? b.blockedQty : b.qualityBlockedQty || 0;

      const effective: DetailedStockBalance = {
        ...b,
        unrestrictedQty: override?.unrestrictedQty ?? baseUnrestricted,
        qualityInspectionQty: override?.qualityInspectionQty ?? baseQi,
        blockedQty: override?.blockedQty ?? baseBlocked,
        qualityBlockedQty:
          override?.qualityBlockedQty ?? baseQi + baseBlocked,
        availableQty:
          override?.availableQty ??
          Math.max(0, (override?.unrestrictedQty ?? baseUnrestricted) - (b.reservedQty || 0)),
      };

      const unitWeight = effective.physicalQty > 0 ? effective.physicalKg / effective.physicalQty : 1;
      effective.unrestrictedKg = Math.round(effective.unrestrictedQty * unitWeight * 100) / 100;
      effective.qualityInspectionKg = Math.round(effective.qualityInspectionQty * unitWeight * 100) / 100;
      effective.blockedKg = Math.round(effective.blockedQty * unitWeight * 100) / 100;
      effective.qualityBlockedKg = Math.round(effective.qualityBlockedQty * unitWeight * 100) / 100;
      effective.availableKg = Math.round(effective.availableQty * unitWeight * 100) / 100;

      // Apply legacy local QC hold only if server doesn't already track QI/Blocked for this balance
      const legacyHold =
        effective.qualityBlockedQty === 0
          ? qcHoldMap[b.id] ||
            (b.lotNumber ? qcHoldMap[b.lotNumber] : undefined) ||
            qcHoldMap[`${b.partId}-${b.warehouseId}`]
          : undefined;
      if (legacyHold?.isHeld && effective.qualityBlockedQty === 0) {
        const heldQty = Math.min(effective.unrestrictedQty, Number(legacyHold.heldQty || effective.physicalQty || 0));
        effective.unrestrictedQty = Math.max(0, effective.unrestrictedQty - heldQty);
        effective.qualityInspectionQty = heldQty;
        effective.qualityBlockedQty = heldQty;
        effective.availableQty = Math.max(0, effective.unrestrictedQty - effective.reservedQty);
        effective.unrestrictedKg = Math.round(effective.unrestrictedQty * unitWeight * 100) / 100;
        effective.qualityInspectionKg = Math.round(effective.qualityInspectionQty * unitWeight * 100) / 100;
        effective.qualityBlockedKg = Math.round(heldQty * unitWeight * 100) / 100;
        effective.availableKg = Math.round(effective.availableQty * unitWeight * 100) / 100;
      }

      return effective;
    });
  }, [rawBalances, qcHoldMap, optimisticOverrides]);

  // SAP QM Status Transfer Modal State (322: Unrestricted->QI, 344: Unrestricted->Blocked, 321: QI/Blocked->Unrestricted)
  const [qmTargetBalance, setQmTargetBalance] = useState<DetailedStockBalance | null>(null);
  const [qmMovementCode, setQmMovementCode] = useState<'321' | '322' | '344'>('322');
  const [qmQuantityInput, setQmQuantityInput] = useState('');
  const [qmReasonText, setQmReasonText] = useState('');
  const [qmSubmitting, setQmSubmitting] = useState(false);
  const [qmSubmitError, setQmSubmitError] = useState('');

  const STOCK_QC_HOLD_PRESETS: string[] = [
    'زنگ‌زدگی سطحی یا اکسیداسیون ورق در انبار',
    'مغایرت ابعادی / ضخامت با نقشه فنی ساپکو',
    'عدم تأیید آزمایشگاه متالورژی (گواهی ذوب)',
    'آسیب فیزیکی پالت یا لبه کلاف در جابجایی',
    'تأیید نهایی آزمایشگاه و آزادسازی جهت مصرف در خط پرس',
  ];

  // Live ceiling calculation for QM transfer onChange validation
  const qmCeilingQty = useMemo(() => {
    if (!qmTargetBalance) return 0;
    if (qmMovementCode === '321') {
      return Math.max(0, qmTargetBalance.qualityInspectionQty + qmTargetBalance.blockedQty);
    }
    return Math.max(0, qmTargetBalance.unrestrictedQty - (qmTargetBalance.reservedQty || 0));
  }, [qmTargetBalance, qmMovementCode]);

  const qmLiveQtyValidation = useMemo(() => {
    if (!qmTargetBalance) return null;
    const raw = qmQuantityInput.trim();
    if (!raw) return 'مقدار انتقال وضعیت کیفی را وارد کنید.';
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      return 'مقدار انتقال باید عددی مثبت و بزرگ‌تر از صفر باشد.';
    }
    if (num > qmCeilingQty) {
      return `مقدار درخواستی (${formatNumber(num)}) بیشتر از سقف مجاز ${
        qmMovementCode === '321' ? 'موجودی قرنطینه/مسدود' : 'موجودی آزاد غیررزرو'
      } (${formatNumber(qmCeilingQty)}) است.`;
    }
    return null;
  }, [qmTargetBalance, qmQuantityInput, qmCeilingQty, qmMovementCode]);

  const openQmTransferModal = (b: DetailedStockBalance, defaultCode: '321' | '322' | '344') => {
    setQmTargetBalance(b);
    setQmMovementCode(defaultCode);
    const maxForCode =
      defaultCode === '321'
        ? Math.max(0, b.qualityInspectionQty + b.blockedQty)
        : Math.max(0, b.unrestrictedQty - (b.reservedQty || 0));
    setQmQuantityInput(maxForCode > 0 ? String(maxForCode) : '');
    setQmReasonText('');
    setQmSubmitError('');
  };

  const handleConfirmQmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qmTargetBalance) return;
    if (qmLiveQtyValidation) {
      setQmSubmitError(qmLiveQtyValidation);
      return;
    }
    const reason = qmReasonText.trim();
    if (reason.length < 3) {
      setQmSubmitError('ثبت علت رسمی جابجایی وضعیت کیفی برای Audit Trail الزامی است.');
      return;
    }

    const qty = Number(qmQuantityInput);
    const b = qmTargetBalance;
    const movementCode = qmMovementCode;

    // Optimistic update immediately
    const prevOverride = optimisticOverrides[b.id];
    let nextUnrestricted = b.unrestrictedQty;
    let nextQi = b.qualityInspectionQty;
    let nextBlocked = b.blockedQty;

    if (movementCode === '322') {
      nextUnrestricted = Math.max(0, b.unrestrictedQty - qty);
      nextQi = b.qualityInspectionQty + qty;
    } else if (movementCode === '344') {
      nextUnrestricted = Math.max(0, b.unrestrictedQty - qty);
      nextBlocked = b.blockedQty + qty;
    } else {
      // 321: release from QI first, then Blocked
      const fromQi = Math.min(qty, b.qualityInspectionQty);
      const fromBlocked = Math.max(0, qty - fromQi);
      nextQi = Math.max(0, b.qualityInspectionQty - fromQi);
      nextBlocked = Math.max(0, b.blockedQty - fromBlocked);
      nextUnrestricted = b.unrestrictedQty + qty;
    }

    setOptimisticOverrides(prev => ({
      ...prev,
      [b.id]: {
        unrestrictedQty: nextUnrestricted,
        qualityInspectionQty: nextQi,
        blockedQty: nextBlocked,
        qualityBlockedQty: nextQi + nextBlocked,
        availableQty: Math.max(0, nextUnrestricted - (b.reservedQty || 0)),
      },
    }));

    setQmSubmitting(true);
    setQmSubmitError('');

    try {
      const res = await fetch('/api/inventory/qm-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balanceId: b.id,
          partId: b.partId,
          partCode: b.partCode,
          warehouseId: b.warehouseId,
          lotNumber: b.lotNumber,
          movementType: movementCode,
          quantity: qty,
          reasonFa: reason,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        // Rollback optimistic update on failure
        setOptimisticOverrides(prev => {
          const copy = { ...prev };
          if (prevOverride) copy[b.id] = prevOverride;
          else delete copy[b.id];
          return copy;
        });
        setQmSubmitError(data.error || 'خطا در ثبت سند انتقال وضعیت کیفی');
        setQmSubmitting(false);
        return;
      }

      // Clear local optimistic override once authoritative server balances arrive
      setOptimisticOverrides(prev => {
        const copy = { ...prev };
        delete copy[b.id];
        return copy;
      });

      if (onQmTransferApplied) {
        onQmTransferApplied({
          balances: data.data?.balances,
          metrics: data.data?.metrics,
          message: data.message,
        });
      } else {
        await onRefresh();
      }

      recordAudit({
        actionType: 'STATUS_CHANGE',
        module: 'کنترل کیفیت انبار (SAP QM)',
        entityId: b.id,
        entityCode: b.lotNumber || b.partCode,
        summaryFa: `سند QM کد ${movementCode} برای «${b.partName}» به مقدار ${formatNumber(qty)} ${b.unit} — ${reason}`,
        details: `سند ${data.data?.document?.documentNumber || ''}`,
      });

      showUndoToast({
        title: `سند انتقال کیفی ${movementCode} ثبت شد`,
        description: data.message || `${b.partName} (${formatNumber(qty)} ${b.unit})`,
        variant: movementCode === '321' ? 'success' : 'warning',
      });

      setQmTargetBalance(null);
      setQmReasonText('');
      setQmQuantityInput('');
    } catch (err: any) {
      setOptimisticOverrides(prev => {
        const copy = { ...prev };
        if (prevOverride) copy[b.id] = prevOverride;
        else delete copy[b.id];
        return copy;
      });
      setQmSubmitError(err?.message || 'خطا در ارتباط با سرور');
    } finally {
      setQmSubmitting(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPartFilter, setSelectedPartFilter] = useState('ALL');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('ALL');
  const [selectedOwnershipFilter, setSelectedOwnershipFilter] = useState<'ALL' | StockOwnership>('ALL');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('ALL');
  const [selectedContractFilter, setSelectedContractFilter] = useState('ALL');
  const [selectedLotFilter, setSelectedLotFilter] = useState('ALL');
  const [qmStatusFilter, setQmStatusFilter] = useState<'ALL' | 'UNRESTRICTED' | 'QI' | 'BLOCKED'>('ALL');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // View Mode: ANALYTICAL_TABLE (ALP) vs PART_CARDEX vs COIL_SLITTING
  const [inquiryMode, setInquiryMode] = useState<'PART_CARDEX' | 'ANALYTICAL_TABLE' | 'COIL_SLITTING'>('ANALYTICAL_TABLE');
  const [onlyBelowReorderPoint, setOnlyBelowReorderPoint] = useState(false);
  const [selectedCardexPartId, setSelectedCardexPartId] = useState<string>('');
  const [partSearchQuery, setPartSearchQuery] = useState<string>('');
  const [allDocuments, setAllDocuments] = useState<InventoryDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState<boolean>(false);

  // Grouping & Expandable Details
  const [groupBy, setGroupBy] = useState<StockGroupingKey>('NONE');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [savedViewNotice, setSavedViewNotice] = useState(false);

  // Fetch inventory documents for Cardex calculation
  useEffect(() => {
    setDocsLoading(true);
    fetch('/api/inventory/documents?limit=500')
      .then(r => r.json())
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setAllDocuments(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false));
  }, [balances]);

  // Select default part for Cardex or jump directly from URL docQuery
  useEffect(() => {
    const q = (route.docQuery || '').trim();
    if (q) {
      const qLower = q.toLowerCase();
      setSearchTerm(q);
      const matchedPart = parts.find(
        p => p.code.toLowerCase() === qLower || p.code.toLowerCase().includes(qLower) || p.name.toLowerCase().includes(qLower)
      );
      if (matchedPart) {
        setSelectedCardexPartId(matchedPart.id);
        setPartSearchQuery(matchedPart.code);
        setInquiryMode('PART_CARDEX');
        return;
      }
      const matchedDoc = allDocuments.find(
        d => d.documentNumber.toLowerCase().includes(qLower) || (d.referenceNumber || '').toLowerCase().includes(qLower)
      );
      if (matchedDoc && matchedDoc.lines && matchedDoc.lines.length > 0) {
        const linePart = parts.find(p => p.id === matchedDoc.lines[0].partId || p.code === matchedDoc.lines[0].partCode);
        if (linePart) {
          setSelectedCardexPartId(linePart.id);
          setInquiryMode('PART_CARDEX');
          return;
        }
      }
      const matchedBal = balances.find(
        b =>
          (b.lotNumber && b.lotNumber.toLowerCase().includes(qLower)) ||
          (b.heatNumber && b.heatNumber.toLowerCase().includes(qLower)) ||
          (b.contractNumber && b.contractNumber.toLowerCase().includes(qLower))
      );
      if (matchedBal) {
        setInquiryMode('ANALYTICAL_TABLE');
        return;
      }
    }
    if (!selectedCardexPartId && parts.length > 0) {
      const partWithStock = parts.find(p => balances.some(b => b.partId === p.id || b.partCode === p.code));
      setSelectedCardexPartId((partWithStock || parts[0]).id);
    }
  }, [route.docQuery, parts, balances, allDocuments, selectedCardexPartId]);

  // Saved Column Preferences
  const [visibleCols, setVisibleCols] = useState<typeof DEFAULT_VISIBLE_COLUMNS>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    try {
      const saved = window.localStorage.getItem('kpims_stock_inquiry_cols_v2');
      return saved ? { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(saved) } : DEFAULT_VISIBLE_COLUMNS;
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Sorting
  const [sortField, setSortField] = useState<keyof DetailedStockBalance>('physicalKg');
  const [sortAsc, setSortAsc] = useState(false);

  // Unique material grades
  const grades = useMemo(() => {
    const set = new Set<string>();
    parts.forEach(p => {
      if (p.materialGrade) set.add(p.materialGrade);
    });
    balances.forEach(b => {
      if (b.materialGrade) set.add(b.materialGrade);
    });
    return Array.from(set);
  }, [parts, balances]);

  // Unique contracts
  const contractNumbers = useMemo(() => {
    const set = new Set<string>();
    balances.forEach(b => {
      if (b.contractNumber) set.add(b.contractNumber);
    });
    return Array.from(set);
  }, [balances]);

  // Unique coil-packs / lot numbers dynamically matching current part/grade
  const matchingPacksOrLots = useMemo(() => {
    let list = balances;
    if (selectedPartFilter !== 'ALL') {
      list = list.filter(b => b.partId === selectedPartFilter);
    }
    if (selectedGradeFilter !== 'ALL') {
      list = list.filter(b => b.materialGrade === selectedGradeFilter);
    }
    if (selectedContractFilter !== 'ALL') {
      list = list.filter(b => b.contractNumber === selectedContractFilter);
    }
    const set = new Set<string>();
    list.forEach(b => {
      if (b.lotNumber) set.add(b.lotNumber);
    });
    return Array.from(set);
  }, [balances, selectedPartFilter, selectedGradeFilter, selectedContractFilter]);

  const filteredBalances = useMemo(() => {
    return balances
      .filter(item => {
        if (selectedPartFilter !== 'ALL' && item.partId !== selectedPartFilter) return false;
        if (selectedWarehouseFilter !== 'ALL' && item.warehouseId !== selectedWarehouseFilter) return false;
        if (selectedOwnershipFilter !== 'ALL' && item.ownership !== selectedOwnershipFilter) return false;
        if (selectedGradeFilter !== 'ALL' && item.materialGrade !== selectedGradeFilter) return false;
        if (selectedContractFilter !== 'ALL' && item.contractNumber !== selectedContractFilter) return false;
        if (selectedLotFilter !== 'ALL' && item.lotNumber !== selectedLotFilter) return false;
        if (onlyAvailable && item.availableQty <= 0) return false;
        if (qmStatusFilter === 'UNRESTRICTED' && item.unrestrictedQty <= 0) return false;
        if (qmStatusFilter === 'QI' && item.qualityInspectionQty <= 0) return false;
        if (qmStatusFilter === 'BLOCKED' && item.blockedQty <= 0) return false;

        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchesName = item.partName.toLowerCase().includes(q);
          const matchesCode = item.partCode.toLowerCase().includes(q);
          const matchesLot = item.lotNumber ? item.lotNumber.toLowerCase().includes(q) : false;
          const matchesHeat = item.heatNumber ? item.heatNumber.toLowerCase().includes(q) : false;
          const matchesContract = item.contractNumber ? item.contractNumber.toLowerCase().includes(q) : false;
          const matchesGrade = item.materialGrade ? item.materialGrade.toLowerCase().includes(q) : false;
          const matchesWh = item.warehouseName.toLowerCase().includes(q);
          if (
            !matchesName &&
            !matchesCode &&
            !matchesLot &&
            !matchesHeat &&
            !matchesContract &&
            !matchesGrade &&
            !matchesWh
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField] ?? 0;
        const valB = b[sortField] ?? 0;
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
  }, [
    balances,
    searchTerm,
    selectedPartFilter,
    selectedWarehouseFilter,
    selectedOwnershipFilter,
    selectedGradeFilter,
    selectedContractFilter,
    selectedLotFilter,
    qmStatusFilter,
    onlyAvailable,
    sortField,
    sortAsc,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedPartFilter,
    selectedWarehouseFilter,
    selectedOwnershipFilter,
    selectedGradeFilter,
    selectedContractFilter,
    selectedLotFilter,
    qmStatusFilter,
    onlyAvailable,
    groupBy,
  ]);

  // Aggregate stats (3 physical QM statuses + reserved)
  const totalPhysicalKg = filteredBalances.reduce((sum, b) => sum + b.physicalKg, 0);
  const totalUnrestrictedKg = filteredBalances.reduce((sum, b) => sum + (b.unrestrictedKg || 0), 0);
  const totalQiKg = filteredBalances.reduce((sum, b) => sum + (b.qualityInspectionKg || 0), 0);
  const totalBlockedKg = filteredBalances.reduce((sum, b) => sum + (b.blockedKg || 0), 0);
  const totalReservedKg = filteredBalances.reduce((sum, b) => sum + b.reservedKg, 0);

  // Grouped View Calculation
  const groupedData = useMemo(() => {
    if (groupBy === 'NONE') return [];
    const map = new Map<
      string,
      {
        groupKey: string;
        groupTitle: string;
        items: DetailedStockBalance[];
        totalPhysicalKg: number;
        totalAvailableKg: number;
        coilsCount: number;
      }
    >();

    filteredBalances.forEach(item => {
      let key = 'نامشخص';
      let title = 'نامشخص';
      if (groupBy === 'PART') {
        key = item.partId;
        title = `${item.partName} (${item.partCode})`;
      } else if (groupBy === 'WAREHOUSE') {
        key = item.warehouseId;
        title = item.warehouseName;
      } else if (groupBy === 'OWNERSHIP') {
        key = item.ownership;
        title = item.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'ورق و اقلام امانی ساپکو' : 'مالکیت شرکت کوثر';
      } else if (groupBy === 'CONTRACT') {
        key = item.contractNumber || 'FREE';
        title = item.contractNumber ? `قرارداد شماره ${item.contractNumber}` : 'آزاد / بدون قرارداد مشخص';
      } else if (groupBy === 'COIL_PACK') {
        key = item.lotNumber || 'NO_LOT';
        title = item.lotNumber ? `کویل‌پک / بچ: ${item.lotNumber}` : 'بدون شماره کویل‌پک';
      } else if (groupBy === 'GRADE') {
        key = item.materialGrade || 'OTHER';
        title = item.materialGrade ? `جنس / گرید ورق: ${item.materialGrade}` : 'سایر اقلام (پیچ، مهره، لاستیک و قطعات)';
      } else if (groupBy === 'THICKNESS') {
        key = item.thicknessMm ? `${item.thicknessMm}` : 'NO_THICK';
        title = item.thicknessMm ? `ضخامت ورق: ${item.thicknessMm} میلی‌متر` : 'اقلام غیرورق (بدون ضخامت)';
      }

      const existing = map.get(key) || {
        groupKey: key,
        groupTitle: title,
        items: [],
        totalPhysicalKg: 0,
        totalAvailableKg: 0,
        coilsCount: 0,
      };
      existing.items.push(item);
      existing.totalPhysicalKg += item.physicalKg;
      existing.totalAvailableKg += item.availableKg;
      if (item.lotNumber) existing.coilsCount += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.totalPhysicalKg - a.totalPhysicalKg);
  }, [filteredBalances, groupBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBalances.length / pageSize));
  const paginatedBalances = filteredBalances.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSaveViewPreferences = () => {
    try {
      window.localStorage.setItem('kpims_stock_inquiry_cols_v2', JSON.stringify(visibleCols));
      setSavedViewNotice(true);
      setTimeout(() => setSavedViewNotice(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'کد کالا',
      'عنوان کالا / ورق',
      'جنس/گرید ورق',
      'ضخامت (mm)',
      'انبار',
      'جایگاه',
      'شماره کویل‌پک / بچ',
      'شماره ذوب',
      'شماره قرارداد',
      'نوع مالکیت',
      'موجودی فیزیکی',
      'موجودی قابل استفاده (آزاد)',
      'رزرو شده',
      'قرنطینه کیفی',
      'واحد',
      'وزن کل (کیلوگرم)',
      'وزن آزاد (کیلوگرم)',
      'آخرین گردش',
    ];

    const rows = filteredBalances.map(b => [
      b.partCode,
      b.partName,
      b.materialGrade || '—',
      b.thicknessMm ? `${b.thicknessMm}` : '—',
      b.warehouseName,
      b.locationCode,
      b.lotNumber || '—',
      b.heatNumber || '—',
      b.contractNumber || '—',
      b.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی کارخانه',
      b.physicalQty,
      b.availableQty,
      b.reservedQty,
      b.qualityBlockedQty,
      b.unit === 'KG' ? 'کیلوگرم' : 'عدد',
      b.physicalKg,
      b.availableKg,
      formatDateTime(b.lastTransactionAt),
    ]);

    exportToCsv(`گزارش_موجودی_انبار_${Date.now()}`, headers, rows);
  };

  const handleSort = (field: keyof DetailedStockBalance) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Helper to get effective Reorder Point (نقطه سفارش) for any Part
  const getPartReorderPoint = (part?: Part, unit?: string, category?: string): number => {
    if (part && typeof part.minStock === 'number' && part.minStock > 0) {
      return part.minStock;
    }
    const effectiveUnit = part?.unit || unit || 'PCS';
    const effectiveCategory = part?.category || category || 'RAW_MATERIAL';
    if (effectiveUnit === 'KG' || effectiveCategory === 'RAW_MATERIAL') {
      return 3500; // Default 3,500 kg reorder threshold for coils/sheets
    }
    return 1000; // Default 1,000 pcs reorder threshold for components
  };

  // Master-Detail Part List with aggregated stock & Reorder Point status for PART_CARDEX mode
  const catalogPartsWithStock = useMemo(() => {
    const q = partSearchQuery.trim().toLowerCase();
    return parts
      .map(p => {
        const pBalances = balances.filter(b => b.partId === p.id || b.partCode === p.code);
        const physicalTotal = pBalances.reduce((s, b) => s + b.physicalQty, 0);
        const availableTotal = pBalances.reduce((s, b) => s + b.availableQty, 0);
        const lotsCount = pBalances.length;
        const reorderPoint = getPartReorderPoint(p);
        const needsPurchase = availableTotal < reorderPoint;
        const isCriticalShortage = availableTotal <= reorderPoint * 0.5;
        const isVIP = isPartVip(p, vipMap);
        const blockedTotal = pBalances.reduce((s, b) => s + (b.qualityBlockedQty || 0), 0);
        return {
          part: { ...p, isVIP, isPinned: isVIP },
          isVIP,
          physicalTotal,
          availableTotal,
          blockedTotal,
          lotsCount,
          balances: pBalances,
          reorderPoint,
          needsPurchase,
          isCriticalShortage,
        };
      })
      .filter(item => {
        if (onlyBelowReorderPoint && !item.needsPurchase) return false;
        if (!q) return true;
        return (
          item.part.name.toLowerCase().includes(q) ||
          item.part.code.toLowerCase().includes(q) ||
          (item.part.materialGrade && item.part.materialGrade.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Priority 1: VIP parts with shortage first!
        if (a.isVIP && a.needsPurchase && !(b.isVIP && b.needsPurchase)) return -1;
        if (b.isVIP && b.needsPurchase && !(a.isVIP && a.needsPurchase)) return 1;
        // Priority 2: VIP parts in general
        if (a.isVIP !== b.isVIP) return a.isVIP ? -1 : 1;
        // Priority 3: Any part needing purchase
        if (a.needsPurchase !== b.needsPurchase) return a.needsPurchase ? -1 : 1;
        return b.physicalTotal - a.physicalTotal;
      });
  }, [parts, balances, partSearchQuery, onlyBelowReorderPoint, vipMap]);

  const activeCardexPartSummary =
    catalogPartsWithStock.find(
      c => c.part.id === selectedCardexPartId || c.part.code === selectedCardexPartId
    ) || catalogPartsWithStock[0];

  // Compute chronological Cardex (ورود، خروج و مانده لحظه‌ای) for the selected part
  const selectedPartCardexRows = useMemo(() => {
    if (!activeCardexPartSummary) return [];
    const targetPart = activeCardexPartSummary.part;

    const matchingTx: Array<{
      id: string;
      docId: string;
      docNumber: string;
      docDate: string;
      docType: string;
      movementCode?: SapMovementType;
      warehouseName: string;
      lotNumber: string;
      contractNumber: string;
      referenceNumber: string;
      inQty: number;
      outQty: number;
      unit: string;
      notes: string;
    }> = [];

    // Sort documents ascending by date to compute running balance accurately
    const sortedDocs = [...allDocuments]
      .filter(d => d.postingStatus === 'POSTED')
      .sort((a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime());

    for (const doc of sortedDocs) {
      const docMvCode: SapMovementType = resolveSapMovementType(doc.documentType as any, {
        explicitMovementType: doc.movementType,
        totalQuantity: doc.totalQuantity,
        qmTarget: doc.qmStatusTarget,
      });

      for (const line of doc.lines || []) {
        if (line.partId !== targetPart.id && line.partCode !== targetPart.code) continue;
        const qty = Number(line.quantity) || 0;
        const docTypeStr = String(doc.documentType);
        const isReceipt =
          docTypeStr === 'OPENING_BALANCE' ||
          docTypeStr === 'RECEIPT_RAW_MATERIAL' ||
          docTypeStr === 'RECEIPT_FINISHED_GOODS' ||
          docTypeStr === 'PRODUCTION_RECEIPT' ||
          docTypeStr === 'RETURN_FROM_PRODUCTION';

        const isIssue =
          docTypeStr === 'ISSUE_RAW_MATERIAL' ||
          docTypeStr === 'ISSUE_FINISHED_GOODS' ||
          docTypeStr === 'DELIVERY_CUSTOMER' ||
          docTypeStr === 'SHIPMENT_CUSTOMER' ||
          docTypeStr === 'ISSUE_TO_PRODUCTION' ||
          docTypeStr === 'DELIVERY_TO_CUSTOMER';

        matchingTx.push({
          id: `${doc.id}-${line.id || line.lineNumber}`,
          docId: doc.id,
          docNumber: doc.documentNumber,
          docDate: doc.documentDate,
          docType: doc.documentType,
          movementCode: docMvCode,
          warehouseName: doc.warehouseName,
          lotNumber: line.lotNumber || 'عمومی',
          contractNumber: line.contractNumber || doc.contractNumber || 'آزاد',
          referenceNumber: doc.referenceNumber || '—',
          inQty: isReceipt ? qty : 0,
          outQty: isIssue ? qty : 0,
          unit: line.unit || targetPart.unit,
          notes: line.notes || doc.auditNote || '',
        });
      }
    }

    let runningBalance = 0;
    const withRunning = matchingTx.map(tx => {
      runningBalance = Math.max(0, Number((runningBalance + tx.inQty - tx.outQty).toFixed(3)));
      return {
        ...tx,
        runningBalance,
      };
    });

    // Return newest first for display
    return withRunning.reverse();
  }, [activeCardexPartSummary, allDocuments]);

  const getDocTypeBadge = (docType: string, movementCode?: SapMovementType) => {
    const code = movementCode || resolveSapMovementType(docType as any);
    const meta = SAP_MOVEMENT_CATALOG[code];
    return {
      code,
      label: meta?.shortFa || docType,
      colorClass:
        meta?.direction === 'IN'
          ? 'text-[#107e3e]'
          : meta?.direction === 'OUT'
          ? 'text-[#bb0000]'
          : meta?.direction === 'QM'
          ? 'text-[#e9730c]'
          : 'text-[#007cc0]',
    };
  };

  return (
    <div className="space-y-4">
      {/* SAP Fiori IconTabBar & Actions */}
      <div className="sap-card overflow-hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2 px-3 bg-[#ffffff] border-b border-[#d9d9d9]">
          <div className="sap-icon-tab-bar border-b-0 flex-1">
            <button
              type="button"
              onClick={() => setInquiryMode('PART_CARDEX')}
              className={`sap-icon-tab ${inquiryMode === 'PART_CARDEX' ? 'sap-icon-tab-active' : ''}`}
            >
              <History className="w-3.5 h-3.5" />
              <span>۱. فهرست قطعات و کاردکس کالا</span>
            </button>

            <button
              type="button"
              onClick={() => setInquiryMode('ANALYTICAL_TABLE')}
              className={`sap-icon-tab ${inquiryMode === 'ANALYTICAL_TABLE' ? 'sap-icon-tab-active' : ''}`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>۲. جدول تحلیلی کل موجودی انبارها</span>
            </button>

            <button
              type="button"
              onClick={() => setInquiryMode('COIL_SLITTING')}
              className={`sap-icon-tab ${inquiryMode === 'COIL_SLITTING' ? 'sap-icon-tab-active' : ''}`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>۳. شجره‌نامه برش کلاف</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 py-2 lg:py-0">
            {route.docQuery && (
              <button
                type="button"
                onClick={() => {
                  clearDocQuery();
                  setSearchTerm('');
                  setPartSearchQuery('');
                }}
                className="px-2.5 py-1 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] text-[11px] font-medium cursor-pointer whitespace-nowrap"
                title="پاک کردن فیلتر رهگیری سند"
              >
                فیلتر رهگیری: {route.docQuery} ×
              </button>
            )}
            {inquiryMode === 'ANALYTICAL_TABLE' && (
              <button
                type="button"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
                className="sap-btn-standard flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>تنظیم ستون‌ها</span>
              </button>
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="sap-btn-standard flex items-center gap-1.5 px-2.5 py-1 text-xs cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>به‌روزرسانی</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#107e3e] hover:bg-[#0d6832] text-white rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>خروجی اکسل (CSV)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODE 3: VISUAL COIL SLITTING GENEALOGY (شجره‌نامه برش کلاف)           */}
      {/* ==================================================================== */}
      {inquiryMode === 'COIL_SLITTING' ? (
        <CoilSlittingGenealogyPanel />
      ) : inquiryMode === 'PART_CARDEX' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* SAP Master-Detail Right List (3 columns) */}
          <div className="lg:col-span-3 sap-card overflow-hidden">
            <div className="p-3 border-b border-[#d9d9d9] bg-[#ffffff] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[#333333]">فهرست اقلام و ورق‌ها</h3>
                <span className="text-[11px] font-mono tabular-nums bg-[#e5f3fa] px-2 py-0.5 rounded border border-[#b3ddf2] text-[#007cc0]">
                  {toPersianDigits(catalogPartsWithStock.length)} قلم
                </span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
                <input
                  type="text"
                  value={partSearchQuery}
                  onChange={e => setPartSearchQuery(e.target.value)}
                  placeholder="جستجوی نام یا کد کالا..."
                  className="w-full bg-[#ffffff] border border-[#d9d9d9] rounded pr-8 pl-2.5 py-1 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-normal text-[#666666] cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={onlyBelowReorderPoint}
                  onChange={e => setOnlyBelowReorderPoint(e.target.checked)}
                  className="rounded border-[#cccccc] text-[#007cc0] focus:ring-[#007cc0]"
                />
                <span>فقط اقلام زیر نقطه سفارش</span>
              </label>
            </div>

            <div className="max-h-[660px] overflow-y-auto divide-y divide-[#e8e8e8] bg-[#ffffff]">
              {catalogPartsWithStock.map(item => {
                const isSelected =
                  activeCardexPartSummary?.part.id === item.part.id;
                return (
                  <button
                    key={item.part.id}
                    type="button"
                    onClick={() => setSelectedCardexPartId(item.part.id)}
                    className={`w-full text-right px-3 py-2 transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-[#e5f3fa] text-[#007cc0] border-r-[3px] border-[#007cc0]'
                        : 'hover:bg-[#e5f3fa]/50 text-[#333333]'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className={`text-xs leading-snug truncate ${isSelected ? 'font-semibold text-[#007cc0]' : 'font-normal text-[#333333]'}`}>
                        {item.part.name}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-[#ffffff] text-[#007cc0] border border-[#b3ddf2]'
                            : 'bg-[#f5f5f5] text-[#666666] border border-[#e8e8e8]'
                        }`}>
                          {item.part.code}
                        </span>
                        {item.blockedTotal > 0 && (
                          <span className="w-2 h-2 rounded-full bg-[#bb0000]" title="دارای موجودی قرنطینه کیفی" />
                        )}
                        {item.needsPurchase && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#fff0f0] text-[#bb0000]">
                            کسری
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-left shrink-0 tabular-nums">
                      <div
                        className={`text-xs font-mono font-semibold whitespace-nowrap ${
                          item.needsPurchase
                            ? 'text-[#bb0000]'
                            : item.availableTotal > 0
                            ? 'text-[#107e3e]'
                            : 'text-[#666666]'
                        }`}
                      >
                        {formatNumber(item.availableTotal)}{' '}
                        <span className="text-[10px] font-sans font-normal">
                          {item.part.unit === 'KG' ? 'kg' : 'عدد'}
                        </span>
                      </div>
                      <div className="text-[10px] mt-0.5 font-mono whitespace-nowrap text-[#666666]">
                        حداقل: {formatNumber(item.reorderPoint)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Left Main Panel: Selected Part Stock Breakdown + Chronological Cardex (9 columns) */}
          <div className="lg:col-span-9 space-y-4">
            {activeCardexPartSummary ? (
              <>
                {/* SAP Object Header & Warehouse Stock Breakdown */}
                <div className="sap-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-[#d9d9d9] bg-[#ffffff] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2] font-mono text-xs font-semibold whitespace-nowrap">
                          {activeCardexPartSummary.part.code}
                        </span>
                        <h3 className="text-sm font-semibold text-[#333333]">
                          {activeCardexPartSummary.part.name}
                        </h3>
                        {activeCardexPartSummary.needsPurchase ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#fff0f0] text-[#bb0000] border border-[#f5b7b1] whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3" />
                            زیر نقطه سفارش
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#f2f8f4] text-[#107e3e] border border-[#b7dfc7] whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" />
                            موجودی ایمن
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#666666]">
                        واحد سنجش:{' '}
                        <strong className="text-[#333333]">
                          {activeCardexPartSummary.part.unit === 'KG' ? 'کیلوگرم (KG)' : 'عدد (PCS)'}
                        </strong>
                        {activeCardexPartSummary.part.materialGrade && (
                          <span>
                            {' '}
                            · گرید: <strong className="text-[#333333]">{activeCardexPartSummary.part.materialGrade}</strong>
                          </span>
                        )}
                        {activeCardexPartSummary.part.thicknessMm && (
                          <span>
                            {' '}
                            · ضخامت: <strong className="text-[#333333]">{activeCardexPartSummary.part.thicknessMm} mm</strong>
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              tab: 'production',
                              productionViewMode: 'ERP_WORKBENCH',
                              productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
                              docQuery: activeCardexPartSummary.part.code,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#e5f3fa] hover:bg-[#d2eaf7] text-[#007cc0] border border-[#b3ddf2] text-[11px] font-semibold cursor-pointer transition-colors"
                          title="مشاهده دستورات ساخت (MO) مرتبط با این کد کالا"
                        >
                          <ClipboardList className="w-3 h-3" />
                          <span>مشاهده دستور ساخت مرتبط (MO)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate({
                              tab: 'master_data',
                              masterSubSection: 'BOM',
                              docQuery: activeCardexPartSummary.part.code,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-[#e5f3fa] text-[#333333] hover:text-[#007cc0] border border-[#d9d9d9] text-[11px] font-semibold cursor-pointer transition-colors"
                          title="مشاهده درخت محصول (BOM) مرتبط با این کد کالا"
                        >
                          <ListTree className="w-3 h-3 text-[#007cc0]" />
                          <span>درخت محصول (BOM)</span>
                        </button>
                      </div>
                    </div>

                    {/* Clean Inline KPI Strip */}
                    <div className="flex flex-wrap items-center gap-4 text-xs bg-[#f5f5f5] px-3 py-1.5 rounded border border-[#d9d9d9] tabular-nums">
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">موجودی فیزیکی:</span>
                        <strong className="font-mono text-[#333333]">
                          {formatNumber(activeCardexPartSummary.physicalTotal)}
                        </strong>
                      </div>
                      <div className="h-3.5 w-px bg-[#d9d9d9]" />
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">قرنطینه:</span>
                        <strong className="font-mono text-[#bb0000]">
                          {formatNumber(activeCardexPartSummary.blockedTotal)}
                        </strong>
                      </div>
                      <div className="h-3.5 w-px bg-[#d9d9d9]" />
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">موجودی آزاد (ATP):</span>
                        <strong className="font-mono text-sm text-[#107e3e]">
                          {formatNumber(activeCardexPartSummary.availableTotal)}{' '}
                          <span className="text-[11px] font-sans font-normal">
                            {activeCardexPartSummary.part.unit === 'KG' ? 'kg' : 'عدد'}
                          </span>
                        </strong>
                      </div>
                      <div className="h-3.5 w-px bg-[#d9d9d9]" />
                      <div>
                        <span className="text-[#666666] text-[11px] ml-1.5">نقطه سفارش:</span>
                        <strong className="font-mono text-[#333333]">
                          {formatNumber(activeCardexPartSummary.reorderPoint)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Section A: Warehouse & Coil-Pack Balances for this Part */}
                  <div className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                        <Boxes className="w-3.5 h-3.5 text-[#007cc0]" />
                        <span>
                          الف) تفکیک موجودی در انبارها و بچ‌ها ({toPersianDigits(activeCardexPartSummary.balances.length)} ردیف)
                        </span>
                      </h4>
                    </div>

                    {activeCardexPartSummary.balances.length === 0 ? (
                      <div className="p-4 bg-[#f5f5f5] border border-[#d9d9d9] rounded text-xs text-[#666666] text-center">
                        در حال حاضر هیچ موجودی فعالی برای این قطعه در انبارها ثبت نشده است.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                        <table className="sap-table-compact w-full text-right text-xs">
                          <thead className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                            <tr>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">انبار و جایگاه</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">شماره کویل‌پک / بچ</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap">مالکیت / قرارداد</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap text-[#107e3e]">آزاد (Unrestricted)</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap text-[#e9730c]">کنترل کیفی (QI)</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap text-[#bb0000]">مسدود (Blocked)</th>
                              <th className="py-1.5 px-2.5 whitespace-nowrap text-[#007cc0]">آزاد قابل تخصیص (ATP)</th>
                              <th className="py-1.5 px-2.5 text-center whitespace-nowrap">انتقال وضعیت کیفی QM</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                            {activeCardexPartSummary.balances.map(b => {
                              const hasHold = b.qualityInspectionQty + b.blockedQty > 0;
                              const unitLbl = b.unit === 'KG' ? 'kg' : 'عدد';
                              return (
                                <tr
                                  key={b.id}
                                  onClick={() => setSelectedObjectBalance(b)}
                                  className={`cursor-pointer ${hasHold ? 'bg-[#fff5eb]/40 hover:bg-[#ffecec]/60' : 'hover:bg-[#e5f3fa]/60'}`}
                                >
                                  <td className="px-2.5 font-medium text-[#333333] whitespace-nowrap">
                                    <span>{b.warehouseName}</span>{' '}
                                    <span className="text-[10px] font-mono text-[#666666]">({b.locationCode})</span>
                                  </td>
                                  <td className="px-2.5 font-mono font-semibold whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    {b.lotNumber ? (
                                      <button
                                        type="button"
                                        onClick={() => setSelectedObjectBalance(b)}
                                        className="sap-doc-link font-mono font-semibold cursor-pointer"
                                        title="نمایش Object Page و جریان اسناد"
                                      >
                                        {b.lotNumber}
                                      </button>
                                    ) : (
                                      <span className="text-[#666666]">عمومی</span>
                                    )}
                                  </td>
                                  <td className="px-2.5 whitespace-nowrap">
                                    <span>{b.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی شرکت'}</span>
                                    {b.contractNumber && (
                                      <span className="font-mono text-[11px] text-[#007cc0] mr-1.5">{b.contractNumber}</span>
                                    )}
                                  </td>
                                  <td className="px-2.5 font-mono font-semibold text-[#107e3e] whitespace-nowrap">
                                    {formatNumber(b.unrestrictedQty)} {unitLbl}
                                  </td>
                                  <td className="px-2.5 font-mono font-semibold text-[#e9730c] whitespace-nowrap">
                                    {b.qualityInspectionQty > 0 ? `${formatNumber(b.qualityInspectionQty)} ${unitLbl}` : '—'}
                                  </td>
                                  <td className="px-2.5 font-mono font-semibold text-[#bb0000] whitespace-nowrap">
                                    {b.blockedQty > 0 ? `${formatNumber(b.blockedQty)} ${unitLbl}` : '—'}
                                  </td>
                                  <td className="px-2.5 font-mono font-bold text-[#007cc0] whitespace-nowrap">
                                    {formatNumber(b.availableQty)} {unitLbl}
                                  </td>
                                  <td className="px-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    <div className="inline-flex items-center gap-1">
                                      {b.unrestrictedQty - (b.reservedQty || 0) > 0 && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => openQmTransferModal(b, '322')}
                                            className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#e9730c] border-[#f5cba7] hover:bg-[#fff4e5] cursor-pointer whitespace-nowrap"
                                            title="انتقال به قرنطینه کیفی (MvT 322)"
                                          >
                                            قرنطینه ۳۲۲
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => openQmTransferModal(b, '344')}
                                            className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#bb0000] border-[#f2b8b5] hover:bg-[#ffecec] cursor-pointer whitespace-nowrap"
                                            title="مسدودسازی کیفی (MvT 344)"
                                          >
                                            مسدود ۳۴۴
                                          </button>
                                        </>
                                      )}
                                      {hasHold && (
                                        <button
                                          type="button"
                                          onClick={() => openQmTransferModal(b, '321')}
                                          className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#107e3e] border-[#b7dfc7] hover:bg-[#eef8f2] cursor-pointer whitespace-nowrap"
                                          title="آزادسازی به موجودی آزاد (MvT 321)"
                                        >
                                          آزادسازی ۳۲۱
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section B: Chronological Stock Cardex (کاردکس جامع ورود و خروج قطعه) */}
                <div className="sap-card p-3.5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-[#007cc0]" />
                      <span>
                        ب) کاردکس گردش کالا («{activeCardexPartSummary.part.name}»)
                      </span>
                    </h4>
                    <span className="text-[11px] text-[#666666] tabular-nums">
                      تعداد اسناد گردش:{' '}
                      <strong className="font-mono text-[#333333]">
                        {toPersianDigits(selectedPartCardexRows.length)}
                      </strong>{' '}
                      تراکنش
                    </span>
                  </div>

                  {docsLoading ? (
                    <div className="py-8 text-center text-xs text-[#666666]">
                      در حال بارگذاری کاردکس گردش کالا...
                    </div>
                  ) : selectedPartCardexRows.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#666666] bg-[#f5f5f5] rounded border border-[#d9d9d9]">
                      هنوز هیچ سند ورود یا خروجی برای این کالا در کاردکس ثبت نشده است.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                      <table className="sap-table-compact w-full text-right text-xs">
                        <thead className="bg-[#ffffff] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                          <tr>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">تاریخ و ساعت</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">شماره سند</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">نوع عملیات</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">انبار</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap">کویل‌پک / بچ</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap text-[#107e3e]">وارده (+)</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap text-[#bb0000]">صادره (-)</th>
                            <th className="py-1.5 px-2.5 whitespace-nowrap bg-[#f5f5f5] font-bold text-[#333333]">
                              مانده پس از سند
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                          {selectedPartCardexRows.map((tx: any) => {
                            const badge = getDocTypeBadge(tx.docType, tx.movementCode);
                            return (
                              <tr key={tx.id} className="hover:bg-[#e5f3fa]/60">
                                <td className="px-2.5 font-mono text-[11px] text-[#666666] whitespace-nowrap">
                                  {formatDateTime(tx.docDate)}
                                </td>
                                <td className="px-2.5 font-mono font-semibold text-[#333333] whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => traceDocument(tx.docNumber, 'INVENTORY_LEDGER')}
                                    className="sap-doc-link font-mono font-semibold cursor-pointer"
                                  >
                                    {tx.docNumber}
                                  </button>
                                  {tx.referenceNumber !== '—' && (
                                    <span className="text-[10px] text-[#666666] font-normal mr-1.5">
                                      · مرجع: {tx.referenceNumber}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2.5 whitespace-nowrap">
                                  <span className={`font-mono font-bold text-[11px] ${badge.colorClass}`}>
                                    {badge.code}
                                  </span>
                                  <span className="text-[11px] text-[#333333] mr-1.5">{badge.label}</span>
                                </td>
                                <td className="px-2.5 text-[#333333] whitespace-nowrap">{tx.warehouseName}</td>
                                <td className="px-2.5 font-mono text-[#333333] whitespace-nowrap">{tx.lotNumber}</td>
                                <td className="px-2.5 font-mono font-bold text-[#107e3e] whitespace-nowrap">
                                  {tx.inQty > 0 ? `+${formatNumber(tx.inQty)}` : '—'}
                                </td>
                                <td className="px-2.5 font-mono font-bold text-[#bb0000] whitespace-nowrap">
                                  {tx.outQty > 0 ? `-${formatNumber(tx.outQty)}` : '—'}
                                </td>
                                <td className="px-2.5 font-mono font-bold text-[#333333] bg-[#f5f5f5] whitespace-nowrap">
                                  {formatNumber(tx.runningBalance)}{' '}
                                  <span className="text-[10px] font-normal text-[#666666]">
                                    {tx.unit === 'KG' ? 'kg' : 'عدد'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <>
      {/* ==================================================================== */}
      {/* MODE 2: SAP ANALYTICAL LIST PAGE (3-Status QM & Compact Table)        */}
      {/* ==================================================================== */}
      {showColumnPicker && (
        <div className="sap-card p-3.5 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
            <span className="font-bold text-[#333333]">انتخاب ستون‌های قابل نمایش در جدول موجودی:</span>
            <div className="flex items-center gap-2">
              {savedViewNotice && (
                <span className="text-[#107e3e] font-semibold flex items-center gap-1">
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>نمای دلخواه ذخیره شد</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveViewPreferences}
                className="sap-btn-emphasized px-3 py-1 text-[11px] cursor-pointer"
              >
                ذخیره پیش‌فرض
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {[
              { key: 'partCode', label: 'کد کالا' },
              { key: 'partName', label: 'نام و مشخصات فنی' },
              { key: 'warehouse', label: 'انبار و جایگاه' },
              { key: 'lotNumber', label: 'کویل‌پک / ذوب' },
              { key: 'contract', label: 'شماره قرارداد' },
              { key: 'ownership', label: 'نوع مالکیت' },
              { key: 'reservedQty', label: 'رزرو تولید' },
              { key: 'physicalKg', label: 'وزن فیزیکی کل' },
              { key: 'lastTx', label: 'آخرین گردش' },
            ].map(col => (
              <label key={col.key} className="flex items-center gap-1.5 text-[#333333] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={(visibleCols as any)[col.key]}
                  onChange={e => setVisibleCols(prev => ({ ...prev, [col.key]: e.target.checked }))}
                  className="rounded border-[#cccccc] text-[#007cc0]"
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <FioriAnalyticalListPage
        title="استعلام موجودی انبار به تفکیک وضعیت کیفی SAP MM & QM"
        subtitle="تفکیک دقیق موجودی بین آزاد (Unrestricted)، کنترل کیفی / قرنطینه (QI) و مسدود (Blocked)؛ موجودی QI و Blocked اجازه تخصیص به دستور کار ندارد"
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="جستجوی نام کالا، کد، کویل‌پک، ذوب، قرارداد یا انبار..."
        totalRowsCount={filteredBalances.length}
        hasActiveFilters={
          qmStatusFilter !== 'ALL' ||
          selectedPartFilter !== 'ALL' ||
          selectedWarehouseFilter !== 'ALL' ||
          selectedOwnershipFilter !== 'ALL' ||
          selectedGradeFilter !== 'ALL' ||
          selectedContractFilter !== 'ALL' ||
          selectedLotFilter !== 'ALL' ||
          onlyAvailable ||
          Boolean(searchTerm.trim())
        }
        onResetFilters={() => {
          setSearchTerm('');
          setQmStatusFilter('ALL');
          setSelectedPartFilter('ALL');
          setSelectedWarehouseFilter('ALL');
          setSelectedOwnershipFilter('ALL');
          setSelectedGradeFilter('ALL');
          setSelectedContractFilter('ALL');
          setSelectedLotFilter('ALL');
          setOnlyAvailable(false);
          setGroupBy('NONE');
        }}
        kpiFilters={[
          {
            id: 'ALL_PHYS',
            label: 'موجودی فیزیکی کل (On-Hand)',
            value: Math.round(totalPhysicalKg),
            unit: 'kg',
            tone: 'default',
            active: qmStatusFilter === 'ALL',
            onClick: () => setQmStatusFilter('ALL'),
          },
          {
            id: 'UNRESTRICTED',
            label: 'موجودی آزاد (Unrestricted)',
            value: Math.round(totalUnrestrictedKg),
            unit: 'kg',
            tone: 'positive',
            active: qmStatusFilter === 'UNRESTRICTED',
            onClick: () => setQmStatusFilter(prev => (prev === 'UNRESTRICTED' ? 'ALL' : 'UNRESTRICTED')),
            sublabel: 'مجاز برای حواله ۲۶۱ و MRP',
          },
          {
            id: 'QI',
            label: 'در حال کنترل کیفی (QI / قرنطینه)',
            value: Math.round(totalQiKg),
            unit: 'kg',
            tone: 'critical',
            active: qmStatusFilter === 'QI',
            onClick: () => setQmStatusFilter(prev => (prev === 'QI' ? 'ALL' : 'QI')),
            sublabel: 'غیرقابل تخصیص به دستور کار',
          },
          {
            id: 'BLOCKED',
            label: 'مسدود شده کیفی (Blocked)',
            value: Math.round(totalBlockedKg),
            unit: 'kg',
            tone: 'negative',
            active: qmStatusFilter === 'BLOCKED',
            onClick: () => setQmStatusFilter(prev => (prev === 'BLOCKED' ? 'ALL' : 'BLOCKED')),
            sublabel: 'نیازمند تعیین تکلیف (MvT 321)',
          },
          {
            id: 'RESERVED',
            label: 'رزرو شده خطوط تولید (Reserved)',
            value: Math.round(totalReservedKg),
            unit: 'kg',
            tone: 'brand',
          },
        ] as AlpVisualKpiItem[]}
        filterControls={
          <>
            <select
              value={selectedWarehouseFilter}
              onChange={e => setSelectedWarehouseFilter(e.target.value)}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه انبارها</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>

            <select
              value={selectedGradeFilter}
              onChange={e => {
                setSelectedGradeFilter(e.target.value);
                setSelectedLotFilter('ALL');
              }}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه گریدهای ورق</option>
              {grades.map(g => (
                <option key={g} value={g}>گرید: {g}</option>
              ))}
            </select>

            <select
              value={selectedOwnershipFilter}
              onChange={e => setSelectedOwnershipFilter(e.target.value as any)}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="ALL">همه مالکیت‌ها</option>
              <option value="SAPCO_SUPPLIER_OWNED">امانی ساپکو</option>
              <option value="COMPANY_OWNED">ملکی شرکت کوثر</option>
            </select>

            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as StockGroupingKey)}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
            >
              <option value="NONE">بدون گروه‌بندی</option>
              <option value="GRADE">گروه‌بندی: گرید ورق</option>
              <option value="THICKNESS">گروه‌بندی: ضخامت</option>
              <option value="WAREHOUSE">گروه‌بندی: انبار</option>
              <option value="CONTRACT">گروه‌بندی: قرارداد</option>
              <option value="OWNERSHIP">گروه‌بندی: مالکیت</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs text-[#333333] cursor-pointer whitespace-nowrap px-1">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={e => setOnlyAvailable(e.target.checked)}
                className="rounded border-[#cccccc] text-[#007cc0]"
              />
              <span>فقط دارای آزاد</span>
            </label>
          </>
        }
      >
        {groupBy !== 'NONE' ? (
          <div className="divide-y divide-[#d9d9d9]">
            {groupedData.map(group => (
              <div key={group.groupKey}>
                <div className="bg-[#f5f5f5] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#007cc0]" />
                    <strong className="text-[#333333]">{group.groupTitle}</strong>
                    <span className="text-[#666666] font-mono">({toPersianDigits(group.items.length)} ردیف)</span>
                  </div>
                  <div className="flex items-center gap-4 font-mono tabular-nums">
                    <span className="text-[#666666]">فیزیکی: <strong>{formatWeightKg(group.totalPhysicalKg)}</strong></span>
                    <span className="text-[#107e3e]">آزاد ATP: <strong>{formatWeightKg(group.totalAvailableKg)}</strong></span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="sap-table-compact w-full text-right text-xs">
                    <thead className="bg-white border-b border-[#d9d9d9] text-[#333333] font-semibold">
                      <tr>
                        <th className="py-1.5 px-2.5">کد و نام کالا</th>
                        <th className="py-1.5 px-2.5">انبار</th>
                        <th className="py-1.5 px-2.5">کویل‌پک / بچ</th>
                        <th className="py-1.5 px-2.5 text-[#107e3e]">آزاد (Unrestricted)</th>
                        <th className="py-1.5 px-2.5 text-[#e9730c]">کنترل کیفی (QI)</th>
                        <th className="py-1.5 px-2.5 text-[#bb0000]">مسدود (Blocked)</th>
                        <th className="py-1.5 px-2.5">وزن فیزیکی</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                      {group.items.map(item => (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedObjectBalance(item)}
                          className="hover:bg-[#e5f3fa]/60 cursor-pointer"
                        >
                          <td className="px-2.5 font-medium text-[#333333]">
                            <span className="font-mono text-[#007cc0] ml-1.5">{item.partCode}</span>
                            {item.partName}
                          </td>
                          <td className="px-2.5 text-[#666666]">{item.warehouseName}</td>
                          <td className="px-2.5 font-mono">{item.lotNumber || '—'}</td>
                          <td className="px-2.5 font-mono font-semibold text-[#107e3e]">{formatNumber(item.unrestrictedQty)}</td>
                          <td className="px-2.5 font-mono text-[#e9730c]">{item.qualityInspectionQty > 0 ? formatNumber(item.qualityInspectionQty) : '—'}</td>
                          <td className="px-2.5 font-mono text-[#bb0000]">{item.blockedQty > 0 ? formatNumber(item.blockedQty) : '—'}</td>
                          <td className="px-2.5 font-mono font-semibold">{formatWeightKg(item.physicalKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="sap-table-compact w-full text-right text-xs">
                <thead>
                  <tr className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#333333] font-semibold select-none">
                    {visibleCols.partCode && <th className="py-1.5 px-2.5">کد کالا</th>}
                    {visibleCols.partName && <th className="py-1.5 px-2.5">نام کالا و مشخصات</th>}
                    {visibleCols.warehouse && <th className="py-1.5 px-2.5">انبار و جایگاه</th>}
                    {visibleCols.lotNumber && <th className="py-1.5 px-2.5">کویل‌پک / ذوب</th>}
                    {visibleCols.contract && <th className="py-1.5 px-2.5">قرارداد</th>}
                    {visibleCols.ownership && <th className="py-1.5 px-2.5">مالکیت</th>}
                    <th
                      onClick={() => handleSort('availableQty')}
                      className="py-1.5 px-2.5 cursor-pointer text-[#107e3e]"
                    >
                      آزاد (Unrestricted)
                    </th>
                    <th className="py-1.5 px-2.5 text-[#e9730c]">کنترل کیفی (QI)</th>
                    <th className="py-1.5 px-2.5 text-[#bb0000]">مسدود (Blocked)</th>
                    {visibleCols.reservedQty && <th className="py-1.5 px-2.5 text-[#007cc0]">رزرو تولید</th>}
                    {visibleCols.physicalKg && (
                      <th onClick={() => handleSort('physicalKg')} className="py-1.5 px-2.5 cursor-pointer">
                        وزن کل (kg)
                      </th>
                    )}
                    <th className="py-1.5 px-2.5 text-left whitespace-nowrap">عملیات کیفی QM (۳۲۱/۳۲۲/۳۴۴)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8e8e8] bg-white tabular-nums">
                  {paginatedBalances.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-[#666666]">
                        هیچ موجودی منطبق با فیلترهای انتخابی یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    paginatedBalances.map(item => {
                      const unitLbl = item.unit === 'KG' ? 'kg' : 'عدد';
                      const hasHold = item.qualityInspectionQty + item.blockedQty > 0;
                      const freeToMove = Math.max(0, item.unrestrictedQty - (item.reservedQty || 0));
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedObjectBalance(item)}
                          className={`cursor-pointer transition-colors ${
                            hasHold ? 'bg-[#fff5eb]/35 hover:bg-[#ffecec]/55' : 'hover:bg-[#e5f3fa]/60'
                          }`}
                        >
                          {visibleCols.partCode && (
                            <td className="px-2.5 font-mono font-semibold text-[#007cc0] whitespace-nowrap" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedObjectBalance(item)}
                                className="sap-doc-link font-mono font-semibold cursor-pointer"
                                title="نمایش Object Page و جریان اسناد"
                              >
                                {item.partCode}
                              </button>
                            </td>
                          )}
                          {visibleCols.partName && (
                            <td className="px-2.5 font-medium text-[#333333]">
                              <span>{item.partName}</span>
                              {item.materialGrade && (
                                <span className="text-[11px] text-[#666666] mr-1.5 font-mono">
                                  ({item.materialGrade}{item.thicknessMm ? ` · ${item.thicknessMm}mm` : ''})
                                </span>
                              )}
                            </td>
                          )}
                          {visibleCols.warehouse && (
                            <td className="px-2.5 text-[#333333] whitespace-nowrap">
                              <span>{item.warehouseName}</span>
                              <span className="text-[10px] font-mono text-[#666666] mr-1">({item.locationCode})</span>
                            </td>
                          )}
                          {visibleCols.lotNumber && (
                            <td className="px-2.5 font-mono whitespace-nowrap">
                              {item.lotNumber || '—'}
                              {item.heatNumber && (
                                <span className="text-[10px] text-[#666666] mr-1.5">ذوب: {item.heatNumber}</span>
                              )}
                            </td>
                          )}
                          {visibleCols.contract && (
                            <td className="px-2.5 font-mono text-[#333333] whitespace-nowrap">
                              {item.contractNumber || 'آزاد'}
                            </td>
                          )}
                          {visibleCols.ownership && (
                            <td className="px-2.5 whitespace-nowrap">
                              <span className={item.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'text-[#e9730c] font-semibold' : 'text-[#333333]'}>
                                {item.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی شرکت'}
                              </span>
                            </td>
                          )}
                          <td className="px-2.5 font-mono font-semibold text-[#107e3e] whitespace-nowrap">
                            {formatNumber(item.unrestrictedQty)} {unitLbl}
                          </td>
                          <td className="px-2.5 font-mono font-semibold text-[#e9730c] whitespace-nowrap">
                            {item.qualityInspectionQty > 0 ? `${formatNumber(item.qualityInspectionQty)} ${unitLbl}` : '—'}
                          </td>
                          <td className="px-2.5 font-mono font-semibold text-[#bb0000] whitespace-nowrap">
                            {item.blockedQty > 0 ? `${formatNumber(item.blockedQty)} ${unitLbl}` : '—'}
                          </td>
                          {visibleCols.reservedQty && (
                            <td className="px-2.5 font-mono text-[#007cc0] whitespace-nowrap">
                              {item.reservedQty > 0 ? formatNumber(item.reservedQty) : '—'}
                            </td>
                          )}
                          {visibleCols.physicalKg && (
                            <td className="px-2.5 font-mono font-semibold text-[#333333] whitespace-nowrap">
                              {formatWeightKg(item.physicalKg)}
                            </td>
                          )}
                          <td className="px-2.5 text-left whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1">
                              {freeToMove > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openQmTransferModal(item, '322')}
                                    className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#e9730c] border-[#f5cba7] hover:bg-[#fff4e5] cursor-pointer"
                                    title="انتقال به قرنطینه کیفی (MvT 322)"
                                  >
                                    قرنطینه ۳۲۲
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openQmTransferModal(item, '344')}
                                    className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#bb0000] border-[#f2b8b5] hover:bg-[#ffecec] cursor-pointer"
                                    title="مسدودسازی کیفی (MvT 344)"
                                  >
                                    مسدود ۳۴۴
                                  </button>
                                </>
                              )}
                              {hasHold && (
                                <button
                                  type="button"
                                  onClick={() => openQmTransferModal(item, '321')}
                                  className="sap-btn-standard px-2 py-0.5 text-[11px] text-[#107e3e] border-[#b7dfc7] hover:bg-[#eef8f2] cursor-pointer"
                                  title="آزادسازی به موجودی آزاد (MvT 321)"
                                >
                                  آزاد ۳۲۱
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

            {totalPages > 1 && (
              <div className="px-3 py-2 bg-[#fafafa] border-t border-[#d9d9d9] flex items-center justify-between text-xs">
                <span className="text-[#666666]">
                  صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="sap-btn-standard px-3 py-1 disabled:opacity-40 cursor-pointer"
                  >
                    قبلی
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="sap-btn-standard px-3 py-1 disabled:opacity-40 cursor-pointer"
                  >
                    بعدی
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </FioriAnalyticalListPage>
        </>
      )}

      {/* SAP Fiori Object Page for Selected Stock Balance / Lot */}
      {selectedObjectBalance && (() => {
        const synced = balances.find(b => b.id === selectedObjectBalance.id) || selectedObjectBalance;
        const unitLbl = synced.unit === 'KG' ? 'kg' : 'عدد';
        const hasHold = synced.qualityInspectionQty + synced.blockedQty > 0;
        const freeToMove = Math.max(0, synced.unrestrictedQty - (synced.reservedQty || 0));
        const relatedDocs = allDocuments.filter(d =>
          d.lines.some(
            l =>
              (l.partId === synced.partId || l.partCode === synced.partCode) &&
              (!synced.lotNumber || l.lotNumber === synced.lotNumber)
          )
        );

        return (
          <FioriObjectPage
            isOpen={Boolean(selectedObjectBalance)}
            onClose={() => setSelectedObjectBalance(null)}
            objectTypeLabel="موجودی و ردیابی کیفی انبار (SAP MM / QM)"
            objectId={synced.lotNumber || synced.partCode}
            title={synced.partName}
            subtitle={`انبار: ${synced.warehouseName} (${synced.locationCode}) · ${
              synced.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی شرکت'
            }${synced.contractNumber ? ` · قرارداد ${synced.contractNumber}` : ''}`}
            statusText={
              synced.blockedQty > 0
                ? 'دارای موجودی مسدود (Blocked)'
                : synced.qualityInspectionQty > 0
                ? 'در حال کنترل کیفی (QI)'
                : 'موجودی آزاد (Unrestricted)'
            }
            statusTone={synced.blockedQty > 0 ? 'negative' : synced.qualityInspectionQty > 0 ? 'critical' : 'positive'}
            documentFlowQuery={synced.lotNumber || synced.partCode}
            onSelectDocumentFlowDoc={docNo => traceDocument(docNo, 'INVENTORY_LEDGER')}
            headerActions={
              <>
                {freeToMove > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => openQmTransferModal(synced, '322')}
                      className="sap-btn-standard px-2.5 py-1.5 text-xs text-[#e9730c] border-[#f5cba7] cursor-pointer"
                    >
                      انتقال به قرنطینه (۳۲۲)
                    </button>
                    <button
                      type="button"
                      onClick={() => openQmTransferModal(synced, '344')}
                      className="sap-btn-standard px-2.5 py-1.5 text-xs text-[#bb0000] border-[#f2b8b5] cursor-pointer"
                    >
                      مسدودسازی (۳۴۴)
                    </button>
                  </>
                )}
                {hasHold && (
                  <button
                    type="button"
                    onClick={() => openQmTransferModal(synced, '321')}
                    className="sap-btn-emphasized px-2.5 py-1.5 text-xs cursor-pointer"
                  >
                    آزادسازی به Unrestricted (۳۲۱)
                  </button>
                )}
              </>
            }
            kpis={[
              { label: 'موجودی آزاد (Unrestricted)', value: `${formatNumber(synced.unrestrictedQty)} ${unitLbl}`, tone: 'positive' },
              { label: 'کنترل کیفی (QI)', value: `${formatNumber(synced.qualityInspectionQty)} ${unitLbl}`, tone: 'critical' },
              { label: 'مسدود (Blocked)', value: `${formatNumber(synced.blockedQty)} ${unitLbl}`, tone: 'negative' },
              { label: 'آزاد قابل تخصیص (ATP)', value: `${formatNumber(synced.availableQty)} ${unitLbl}`, tone: 'brand' },
            ]}
            tabs={[
              {
                id: 'stock',
                label: 'تفکیک وضعیت فیزیکی QM',
                content: (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-[#fafafa] border border-[#d9d9d9] rounded space-y-1.5">
                      <div className="font-semibold text-[#333333]">وضعیت سه‌گانه موجودی SAP MM/QM</div>
                      <div className="flex justify-between"><span>فیزیکی کل:</span><strong className="font-mono">{formatNumber(synced.physicalQty)} {unitLbl}</strong></div>
                      <div className="flex justify-between text-[#107e3e]"><span>آزاد (Unrestricted):</span><strong className="font-mono">{formatNumber(synced.unrestrictedQty)} {unitLbl}</strong></div>
                      <div className="flex justify-between text-[#e9730c]"><span>قرنطینه (QI):</span><strong className="font-mono">{formatNumber(synced.qualityInspectionQty)} {unitLbl}</strong></div>
                      <div className="flex justify-between text-[#bb0000]"><span>مسدود (Blocked):</span><strong className="font-mono">{formatNumber(synced.blockedQty)} {unitLbl}</strong></div>
                      <div className="flex justify-between text-[#007cc0]"><span>رزرو دستور کار:</span><strong className="font-mono">{formatNumber(synced.reservedQty)} {unitLbl}</strong></div>
                    </div>

                    <div className="p-3 bg-[#fafafa] border border-[#d9d9d9] rounded space-y-1.5">
                      <div className="font-semibold text-[#333333]">شناسایی متالورژیکی و مکان</div>
                      <div>کد کالا: <strong className="font-mono">{synced.partCode}</strong></div>
                      <div>کویل‌پک / بچ: <strong className="font-mono">{synced.lotNumber || 'عمومی'}</strong></div>
                      <div>شماره ذوب: <strong className="font-mono">{synced.heatNumber || '—'}</strong></div>
                      <div>گرید و ضخامت: <strong className="font-mono">{synced.materialGrade || '—'} {synced.thicknessMm ? `(${synced.thicknessMm} mm)` : ''}</strong></div>
                    </div>

                    <div className="p-3 bg-[#fafafa] border border-[#d9d9d9] rounded space-y-1.5">
                      <div className="font-semibold text-[#333333]">مالکیت و محدودیت مصرف</div>
                      <div>مالکیت: <strong>{synced.ownership === 'SAPCO_SUPPLIER_OWNED' ? 'امانی ساپکو' : 'ملکی شرکت'}</strong></div>
                      <div>قرارداد مرتبط: <strong className="font-mono">{synced.contractNumber || 'آزاد'}</strong></div>
                      <div className="text-[11px] text-[#666666] pt-1">
                        موجودی‌های قرنطینه (QI) و مسدود (Blocked) به صورت خودکار توسط موتور MRP و فرم حواله ۲۶۱ غیرقابل تخصیص هستند.
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                id: 'movements',
                label: `تراکنش‌های مرتبط (${toPersianDigits(relatedDocs.length)})`,
                content: relatedDocs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-[#666666]">تراکنشی برای این ردیف ثبت نشده است.</div>
                ) : (
                  <div className="overflow-x-auto border border-[#d9d9d9] rounded">
                    <table className="sap-table-compact w-full text-right text-xs">
                      <thead className="bg-[#f5f5f5] border-b border-[#d9d9d9] text-[#333333] font-semibold">
                        <tr>
                          <th className="py-1.5 px-2.5">شماره سند</th>
                          <th className="py-1.5 px-2.5">کد حرکت</th>
                          <th className="py-1.5 px-2.5">تاریخ</th>
                          <th className="py-1.5 px-2.5">وضعیت</th>
                          <th className="py-1.5 px-2.5">توضیحات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e8e8e8] tabular-nums">
                        {relatedDocs.map(d => {
                          const mv = resolveSapMovementType(d.documentType, {
                            explicitMovementType: d.movementType,
                            totalQuantity: d.totalQuantity,
                            qmTarget: d.qmStatusTarget,
                          });
                          return (
                            <tr key={d.id}>
                              <td className="px-2.5 font-mono text-[#007cc0]">{d.documentNumber}</td>
                              <td className="px-2.5 font-mono font-bold">MvT {mv}</td>
                              <td className="px-2.5 font-mono text-[#666666]">{d.documentDate}</td>
                              <td className="px-2.5">{d.postingStatus}</td>
                              <td className="px-2.5 text-[#666666]">{d.auditNote || d.adjustmentReason || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ),
              },
            ]}
          />
        );
      })()}

      {/* SAP QM Transfer Modal (322: Unrestricted->QI, 344: Unrestricted->Blocked, 321: Release->Unrestricted) with live onChange validation */}
      {qmTargetBalance && (
        <div
          className="fixed inset-0 bg-[#333333]/45 flex items-center justify-center z-[60] p-4"
          onClick={() => setQmTargetBalance(null)}
        >
          <div
            className="bg-[#ffffff] border border-[#d9d9d9] rounded-md max-w-lg w-full p-4 text-right shadow-xl space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#e8e8e8] pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded bg-[#fff4e5] border border-[#f5cba7] text-[#e9730c] flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#333333]">
                    ثبت سند انتقال وضعیت کیفی SAP QM (MvT {qmMovementCode})
                  </h3>
                  <p className="text-[11px] text-[#666666] mt-0.5">
                    {qmTargetBalance.partName} · بچ:{' '}
                    <span className="font-mono font-semibold text-[#333333]">
                      {qmTargetBalance.lotNumber || qmTargetBalance.partCode}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQmTargetBalance(null)}
                className="px-2 py-1 rounded text-[#666666] hover:text-[#333333] hover:bg-[#f5f5f5] text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmQmTransfer} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { code: '322', label: '۳۲۲ · ورود به قرنطینه (QI)' },
                    { code: '344', label: '۳۴۴ · مسدودسازی (Blocked)' },
                    { code: '321', label: '۳۲۱ · آزادسازی به آزاد' },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setQmMovementCode(opt.code);
                      const maxForCode =
                        opt.code === '321'
                          ? Math.max(0, qmTargetBalance.qualityInspectionQty + qmTargetBalance.blockedQty)
                          : Math.max(0, qmTargetBalance.unrestrictedQty - (qmTargetBalance.reservedQty || 0));
                      setQmQuantityInput(maxForCode > 0 ? String(maxForCode) : '0');
                      setQmSubmitError('');
                    }}
                    className={`py-1.5 px-2 rounded border text-[11px] font-semibold cursor-pointer ${
                      qmMovementCode === opt.code
                        ? 'bg-[#007cc0] text-white border-[#007cc0]'
                        : 'bg-[#f5f5f5] text-[#333333] border-[#d9d9d9]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-[#333333]">
                    مقدار انتقال ({qmTargetBalance.unit === 'KG' ? 'کیلوگرم' : 'عدد'})
                  </label>
                  <span className="text-[11px] font-mono text-[#007cc0]">
                    سقف مجاز: {formatNumber(qmCeilingQty)} {qmTargetBalance.unit === 'KG' ? 'kg' : 'عدد'}
                  </span>
                </div>
                <input
                  type="number"
                  step="any"
                  value={qmQuantityInput}
                  onChange={e => {
                    setQmQuantityInput(e.target.value);
                    setQmSubmitError('');
                  }}
                  className={`w-full rounded border px-3 py-1.5 font-mono text-xs focus:outline-none ${
                    qmLiveQtyValidation
                      ? 'border-[#bb0000] bg-[#ffecec]/40 text-[#bb0000]'
                      : 'border-[#bfbfbf] bg-white text-[#333333] focus:border-[#007cc0]'
                  }`}
                />
                {qmLiveQtyValidation && (
                  <p className="text-[11px] text-[#bb0000] font-semibold mt-1">{qmLiveQtyValidation}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#333333] mb-1">
                  انتخاب سریع علت کیفی:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STOCK_QC_HOLD_PRESETS.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setQmReasonText(preset);
                        setQmSubmitError('');
                      }}
                      className={`px-2 py-1 rounded text-[11px] border transition cursor-pointer ${
                        qmReasonText === preset
                          ? 'bg-[#007cc0] text-[#ffffff] border-[#007cc0] font-semibold'
                          : 'bg-[#f5f5f5] hover:bg-[#e8e8e8] text-[#333333] border-[#d9d9d9]'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#333333] mb-1">
                  علت ثبت سند کیفی (Audit Reason) <span className="text-[#bb0000]">*</span>
                </label>
                <textarea
                  rows={2}
                  value={qmReasonText}
                  onChange={e => {
                    setQmReasonText(e.target.value);
                    setQmSubmitError('');
                  }}
                  placeholder="شماره گزارش عدم انطباق (NCR) یا نتیجه تست آزمایشگاه..."
                  className="w-full rounded border border-[#bfbfbf] bg-[#ffffff] px-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                />
                {qmSubmitError && !qmLiveQtyValidation && (
                  <p className="text-[11px] text-[#bb0000] font-semibold mt-1">{qmSubmitError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e8e8e8]">
                <button
                  type="button"
                  onClick={() => setQmTargetBalance(null)}
                  disabled={qmSubmitting}
                  className="sap-btn-standard px-3.5 py-1.5 text-xs cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={qmSubmitting || Boolean(qmLiveQtyValidation) || qmReasonText.trim().length < 3}
                  className="sap-btn-emphasized px-4 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{qmSubmitting ? 'در حال ثبت...' : `ثبت قطعی سند QM (${qmMovementCode})`}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
