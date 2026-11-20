import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Folder,
  ChevronDown,
  ChevronLeft,
  Clock,
  Play,
  ShieldCheck,
  Gauge,
  AlertTriangle,
  ExternalLink,
  Trash2,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import {
  Part,
  Machine,
  Operator,
  Routing,
  FactoryHall,
  StageInventorySummary,
  ProcessType,
  FACTORY_STAGES,
} from '../../types/inventory';
import {
  ManufacturingOrder,
  ManufacturingOperation,
  WipTransfer,
  WipDashboardMetrics,
} from '../../types/productionWip';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { WipDashboardView } from './WipDashboardView';
import { ManufacturingOrdersView } from './ManufacturingOrdersView';
import { InterOperationTransfersView } from './InterOperationTransfersView';
import { WipReconciliationModal } from './WipReconciliationModal';
import { CreateMoModal } from './CreateMoModal';
import { OperationInputModal } from './OperationInputModal';
import { OperationProductionModal } from './OperationProductionModal';
import { OperationTransferModal } from './OperationTransferModal';
import { InventoryReportView } from '../InventoryReportView';
import { WipModuleSkeleton, Skeleton } from '../ui/Skeleton';
import { TraceabilityInquiryView } from './TraceabilityInquiryView';
import { useErpRouter } from '../../context/RouterContext';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';
import { MoRelationalGuideModal } from '../production/MoRelationalGuideModal';
import { WipHallMoDistributionChart } from './WipHallMoDistributionChart';
import { usePersistedOpen, usePersistedExpandMap } from '../../hooks/usePersistedCollapse';

export type WipViewMode =
  | 'UNIFIED_DIRECTORY'
  | 'TRACEABILITY'
  | 'DASHBOARD'
  | 'BOTTLENECK'
  | 'ORDERS'
  | 'TRANSFERS'
  | 'STAGES';

interface MoRollbackPreviewData {
  rootMoId: string;
  rootMoNumber: string;
  canRollback: boolean;
  blockingErrors: string[];
  mosToDelete: Array<{
    id: string;
    moNumber: string;
    partId: string;
    partCode: string;
    partName: string;
    targetQuantity: number;
    initialInputQuantity: number;
    completedQuantity: number;
    status: string;
    isSubMo: boolean;
    operationsCount: number;
  }>;
  materialsToReturn: Array<{
    documentId: string;
    documentNumber: string;
    partId: string;
    partCode: string;
    partName: string;
    quantity: number;
    quantityKg: number;
    unit: string;
    warehouseId: string;
    warehouseName: string;
    lotNumber?: string;
  }>;
  outputsToDeduct: Array<{
    documentId: string;
    documentNumber: string;
    partId: string;
    partCode: string;
    partName: string;
    quantity: number;
    quantityKg: number;
    unit: string;
    warehouseId: string;
    warehouseName: string;
    lotNumber?: string;
    availableAfterIssueReturn: number;
    shortage: number;
  }>;
  draftDocsToCancel: Array<{ id: string; documentNumber: string; documentType: string }>;
  wipTransfersCount: number;
  productionLogsCount: number;
  reservationsCount: number;
  kardexTransactionsCount: number;
}

interface ProductionWipModuleViewProps {
  parts: Part[];
  machines: Machine[];
  operators: Operator[];
  halls?: FactoryHall[];
  stageBalances: StageInventorySummary[];
  initialView?: WipViewMode;
  initialTraceQuery?: string;
  onViewChange?: (view: WipViewMode) => void;
  onGlobalRefresh?: () => Promise<void>;
}

export const ProductionWipModuleView: React.FC<ProductionWipModuleViewProps> = ({
  parts,
  machines,
  operators,
  halls = [],
  stageBalances,
  initialView,
  initialTraceQuery,
  onViewChange,
  onGlobalRefresh,
}) => {
  const router = useErpRouter();
  const { requestConfirm } = useEnterpriseUx();
  const [activeView, setActiveView] = useState<WipViewMode>(initialView || 'UNIFIED_DIRECTORY');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Core WIP Data
  const [metrics, setMetrics] = useState<WipDashboardMetrics | null>(null);
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [transfers, setTransfers] = useState<WipTransfer[]>([]);
  const [routings, setRoutings] = useState<Routing[]>([]);

  // Unified Search & Filters
  const [searchQuery, setSearchQuery] = useState(initialTraceQuery || '');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [onlyActiveQueue, setOnlyActiveQueue] = useState(false);
  const {
    map: expandedGroups,
    toggle: toggleGroup,
    expandAll: expandAllGroups,
    collapseAll: collapseAllGroups,
  } = usePersistedExpandMap('wip_unified_groups', {});
  const {
    map: expandedMoIds,
    setExpanded: setMoExpanded,
    toggle: toggleMoExpand,
    expandAll: expandAllMos,
    collapseAll: collapseAllMos,
  } = usePersistedExpandMap('wip_unified_mos', {});
  const [selectedBottleneckStageId, setSelectedBottleneckStageId] = useState<string | null>(null);
  const [showBottleneckPanel, setShowBottleneckPanel] = usePersistedOpen('wip_bottleneck_panel', false);

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialView]);

  const handleChangeView = useCallback(
    (next: WipViewMode) => {
      setActiveView(next);
      if (onViewChange) {
        onViewChange(next);
      } else {
        router.navigate({ wipSubTab: next });
      }
    },
    [onViewChange, router],
  );

  useEffect(() => {
    if (initialTraceQuery !== undefined && initialTraceQuery !== '') {
      setSearchQuery(initialTraceQuery);
    }
  }, [initialTraceQuery]);

  // Action Modals State
  const [isCreateMoOpen, setIsCreateMoOpen] = useState(false);
  const [inputModalOp, setInputModalOp] = useState<ManufacturingOperation | null>(null);
  const [prodModalOp, setProdModalOp] = useState<ManufacturingOperation | null>(null);
  const [transferModalContext, setTransferModalContext] = useState<{
    mo: ManufacturingOrder | null;
    op: ManufacturingOperation | null;
  }>({ mo: null, op: null });
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [reconciliationMoId, setReconciliationMoId] = useState<string | null>(null);
  const [loadMatModalMo, setLoadMatModalMo] = useState<ManufacturingOrder | null>(null);
  const [loadMatQty, setLoadMatQty] = useState<number>(0);
  const [loadMatNotes, setLoadMatNotes] = useState<string>('');
  const [loadMatSubmitting, setLoadMatSubmitting] = useState<boolean>(false);

  // Cascading MO Delete + Inventory Rollback Modal State
  const [rollbackModalTarget, setRollbackModalTarget] = useState<ManufacturingOrder | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<MoRollbackPreviewData | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [isMoGuideOpen, setIsMoGuideOpen] = useState(false);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadWipData = useCallback(async () => {
    setLoading(true);
    try {
      const [metricsRes, mosRes, transfersRes, routingsRes] = await Promise.all([
        fetch('/api/wip/dashboard').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/wip/manufacturing-orders').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/wip/transfers').then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/routings').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      if (metricsRes.success) setMetrics(metricsRes.data);
      if (mosRes.success && Array.isArray(mosRes.data)) {
        setOrders(mosRes.data);
      }
      if (transfersRes.success && Array.isArray(transfersRes.data)) {
        setTransfers(transfersRes.data);
      }
      if (routingsRes.success && Array.isArray(routingsRes.data)) {
        setRoutings(routingsRes.data);
      }
    } catch (err) {
      console.error('Error loading WIP module data:', err);
      setNotification({
        type: 'error',
        message: 'خطا در بارگذاری اطلاعات کار در جریان ساخت (WIP)',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWipData();
  }, [loadWipData, parts]);

  useEffect(() => {
    const handler = () => {
      loadWipData();
    };
    window.addEventListener('kpims-master-data-updated', handler);
    return () => window.removeEventListener('kpims-master-data-updated', handler);
  }, [loadWipData]);

  const bottleneckAnalysis = React.useMemo(() => {
    const STAGE_PROCESS_MAP: Record<string, ProcessType[]> = {
      STAGE_SHEARING: ['SHEARING'],
      STAGE_BLANKING: ['BLANKING'],
      STAGE_FORMING: ['DRAWING', 'PUNCH_FORM', 'TRIMMING'],
      STAGE_BENDING: ['BENDING'],
      STAGE_SPOT_WELD: ['SPOT_WELD'],
      STAGE_CO2_WELD: ['CO2_WELD'],
      STAGE_WELDING: ['SPOT_WELD', 'CO2_WELD'],
      STAGE_PAINT: ['PAINT'],
      STAGE_ED_PAINT: ['PAINT'],
      STAGE_ASSEMBLY: ['ASSEMBLY'],
    };

    const EXCLUDED_NON_WIP_STAGES = new Set([
      'STAGE_RAW_STORE',
      'STAGE_FINISHED_STORE',
      'STAGE_SCRAP_YARD',
    ]);

    const routingByPartId = new Map<string, Routing>();
    const routingByPartCode = new Map<string, Routing>();
    const cycleStatsByProcess = new Map<ProcessType, { sumSec: number; sumSetup: number; count: number }>();

    for (const r of routings) {
      if (r.partId) routingByPartId.set(r.partId, r);
      if (r.partCode) routingByPartCode.set(r.partCode.toUpperCase(), r);
      for (const op of r.operations || []) {
        const cur = cycleStatsByProcess.get(op.processType) || { sumSec: 0, sumSetup: 0, count: 0 };
        cur.sumSec += op.standardCycleTimeSec || 15;
        cur.sumSetup += op.setupTimeMin || 15;
        cur.count += 1;
        cycleStatsByProcess.set(op.processType, cur);
      }
    }

    const stageMetaMap = new Map<string, { id: string; name: string; orderIndex: number }>();
    let idxCounter = 0;
    for (const st of FACTORY_STAGES) {
      if (st.type === 'WIP') {
        stageMetaMap.set(st.id, { id: st.id, name: st.name, orderIndex: idxCounter++ });
      }
    }

    const balancesByStage = new Map<string, StageInventorySummary[]>();
    for (const sb of stageBalances) {
      if (EXCLUDED_NON_WIP_STAGES.has(sb.stageId)) continue;
      if (!stageMetaMap.has(sb.stageId)) {
        stageMetaMap.set(sb.stageId, {
          id: sb.stageId,
          name: sb.stageName || sb.stageId,
          orderIndex: idxCounter++,
        });
      }
      const list = balancesByStage.get(sb.stageId) || [];
      list.push(sb);
      balancesByStage.set(sb.stageId, list);
    }

    let totalWipQtyAllStages = 0;
    let totalThroughputAllHours = 0;

    const stageRows = Array.from(stageMetaMap.values()).map(meta => {
      const stageItems = (balancesByStage.get(meta.id) || []).filter(sb => sb.totalQty > 0);
      const mappedProcs = STAGE_PROCESS_MAP[meta.id] || [];

      let stageAvgCycleSec = 15;
      let stageAvgSetupMin = 15;
      if (mappedProcs.length > 0) {
        let sSec = 0;
        let sSetup = 0;
        let sCnt = 0;
        for (const p of mappedProcs) {
          const stat = cycleStatsByProcess.get(p);
          if (stat) {
            sSec += stat.sumSec;
            sSetup += stat.sumSetup;
            sCnt += stat.count;
          }
        }
        if (sCnt > 0) {
          stageAvgCycleSec = sSec / sCnt;
          stageAvgSetupMin = sSetup / sCnt;
        }
      }

      let totalQty = 0;
      let usableQty = 0;
      let inTransitQty = 0;
      let scrapQty = 0;
      let throughputHours = 0;
      let weightedCycleSum = 0;

      const partBreakdown = stageItems
        .map(sb => {
          const routing =
            routingByPartId.get(sb.partId) ||
            routingByPartCode.get((sb.partCode || '').toUpperCase());

          let matchedOp = routing?.operations?.find(
            op =>
              mappedProcs.includes(op.processType) ||
              (sb.processType && op.processType === sb.processType),
          );
          if (!matchedOp && routing?.operations?.length) {
            // Fallback to mean of the part's routing operations when stage ID isn't explicitly mapped
            const opsCount = routing.operations.length;
            const avgCyc = routing.operations.reduce((s, o) => s + (o.standardCycleTimeSec || 15), 0) / opsCount;
            const avgSet = routing.operations.reduce((s, o) => s + (o.setupTimeMin || 15), 0) / opsCount;
            matchedOp = {
              stepNumber: 1,
              stepCode: meta.id,
              stepName: meta.name,
              processType: mappedProcs[0] || 'PUNCH_FORM',
              standardCycleTimeSec: avgCyc,
              setupTimeMin: avgSet,
              scrapNormPercent: 1.5,
            };
          }

          const cycleTimeSec = matchedOp?.standardCycleTimeSec || stageAvgCycleSec;
          const setupTimeMin = matchedOp?.setupTimeMin ?? stageAvgSetupMin;
          const partThroughputHours = Number(
            ((sb.totalQty * cycleTimeSec) / 3600 + setupTimeMin / 60).toFixed(2),
          );

          totalQty += sb.totalQty;
          usableQty += sb.usableQty;
          inTransitQty += sb.inTransitQty;
          scrapQty += sb.scrapQty;
          throughputHours += partThroughputHours;
          weightedCycleSum += sb.totalQty * cycleTimeSec;

          return {
            partId: sb.partId,
            partCode: sb.partCode,
            partName: sb.partName,
            qty: sb.totalQty,
            usableQty: sb.usableQty,
            inTransitQty: sb.inTransitQty,
            cycleTimeSec: Number(cycleTimeSec.toFixed(1)),
            setupTimeMin: Math.round(setupTimeMin),
            throughputHours: partThroughputHours,
            hasExactRouting: Boolean(routing),
          };
        })
        .sort((a, b) => b.throughputHours - a.throughputHours);

      const roundedThroughputHours = Number(throughputHours.toFixed(1));
      totalWipQtyAllStages += totalQty;
      totalThroughputAllHours += roundedThroughputHours;

      return {
        stageId: meta.id,
        stageName: meta.name,
        orderIndex: meta.orderIndex,
        totalQty,
        usableQty,
        inTransitQty,
        scrapQty,
        partsCount: partBreakdown.length,
        avgCycleTimeSec: totalQty > 0 ? Number((weightedCycleSum / totalQty).toFixed(1)) : Number(stageAvgCycleSec.toFixed(1)),
        throughputHours: roundedThroughputHours,
        shiftLoad: Number((roundedThroughputHours / 7.5).toFixed(2)),
        partBreakdown,
      };
    });

    const maxThroughputHours = Math.max(1, ...stageRows.map(s => s.throughputHours));

    const enrichedStages = stageRows.map(s => {
      const wipSharePercent =
        totalWipQtyAllStages > 0 ? Math.round((s.totalQty / totalWipQtyAllStages) * 100) : 0;
      const barWidthPercent = Math.min(100, Math.round((s.throughputHours / maxThroughputHours) * 100));

      let severity: 'CRITICAL' | 'WARNING' | 'NORMAL' | 'IDLE' = 'IDLE';
      if (
        s.throughputHours >= 15 ||
        (s.totalQty >= 2000 && s.throughputHours >= 8) ||
        (wipSharePercent >= 35 && s.throughputHours >= 6)
      ) {
        severity = 'CRITICAL';
      } else if (s.throughputHours >= 7.5 || s.totalQty >= 800 || wipSharePercent >= 25) {
        severity = 'WARNING';
      } else if (s.totalQty > 0) {
        severity = 'NORMAL';
      }

      return {
        ...s,
        wipSharePercent,
        barWidthPercent,
        severity,
      };
    });

    const peakStage =
      [...enrichedStages].sort((a, b) => b.throughputHours - a.throughputHours)[0] || null;
    const criticalCount = enrichedStages.filter(s => s.severity === 'CRITICAL').length;
    const warningCount = enrichedStages.filter(s => s.severity === 'WARNING').length;

    return {
      stages: enrichedStages,
      totalWipQtyAllStages,
      totalThroughputAllHours: Number(totalThroughputAllHours.toFixed(1)),
      maxThroughputHours,
      peakStage,
      criticalCount,
      warningCount,
    };
  }, [stageBalances, routings]);

  // Show shared Skeleton component during initial data loading phase
  if (loading && orders.length === 0 && !metrics) {
    return <WipModuleSkeleton />;
  }

  // API Handlers
  const handleCreateMo = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/manufacturing-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت دستور کار' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'دستور کار ساخت (MO) با موفقیت صادر شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleLoadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loadMatModalMo || loadMatQty <= 0) return;
    setLoadMatSubmitting(true);
    try {
      const res = await fetch(`/api/wip/manufacturing-orders/${loadMatModalMo.id}/load-material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: loadMatQty,
          operatorName: 'اپراتور خط تولید',
          notes: loadMatNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setNotification({
          type: 'error',
          message: data.error || 'خطا در بارگذاری مواد به دستور کار',
        });
        return;
      }
      setNotification({
        type: 'success',
        message: data.message || 'مواد اولیه / بلنک با موفقیت در دستور کار بارگذاری شد.',
      });
      setLoadMatModalMo(null);
      setLoadMatQty(0);
      setLoadMatNotes('');
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'خطا در ارتباط با سرور',
      });
    } finally {
      setLoadMatSubmitting(false);
    }
  };

  const handleRecordInput = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/operations/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت ورودی ایستگاه' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'ورودی ایستگاه با موفقیت ثبت شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleRecordProduction = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/operations/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت گزارش تولید' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'گزارش تولید و ضایعات ایستگاه با موفقیت ثبت شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleCreateTransfer = async (payload: any) => {
    try {
      const res = await fetch('/api/wip/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در ثبت حواله انتقال' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'حواله انتقال بین مراحل صادر شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleApproveTransfer = async (transferId: string, notes?: string) => {
    try {
      const res = await fetch(`/api/wip/transfers/${transferId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedBy: 'اپراتور ایستگاه مقصد',
          notes: notes || 'تأیید دریافت در ایستگاه مقصد',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در تأیید دریافت حواله' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'دریافت قطعات در ایستگاه مقصد تأیید شد.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const handleRejectTransfer = async (transferId: string, reason: string) => {
    try {
      const res = await fetch(`/api/wip/transfers/${transferId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'خطا در رد حواله انتقال' };
      }
      setNotification({
        type: 'success',
        message: data.message || 'حواله انتقال رد شد و موجودی به ایستگاه مبدأ بازگشت.',
      });
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const filteredOrders = orders.filter(mo => {
    if (statusFilter !== 'ALL' && mo.status !== statusFilter) return false;
    if (onlyActiveQueue) {
      const hasActive = mo.operations.some(
        o =>
          o.waitingInputQty > 0 ||
          o.inProgressQty > 0 ||
          o.readyForTransferQty > 0
      );
      if (!hasActive) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        mo.moNumber.toLowerCase().includes(q) ||
        mo.partName.toLowerCase().includes(q) ||
        mo.partCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const toggleMoRow = (moId: string, moNumber?: string) => {
    const nextOpen = !expandedMoIds[moId];
    toggleMoExpand(moId);
    if (nextOpen && moNumber) {
      router.pushSelectionStep(
        `عملیات دستور ${moNumber}`,
        () => setMoExpanded(moId, false),
        `wip-mo-${moId}`,
      );
    }
  };

  const selectBottleneckStage = (stageId: string | null, stageName?: string) => {
    setSelectedBottleneckStageId(stageId);
    if (stageId) {
      router.pushSelectionStep(
        `گلوگاه: ${stageName || stageId}`,
        () => setSelectedBottleneckStageId(null),
        `wip-stage-${stageId}`,
      );
    }
  };

  const openMoRollbackModal = async (mo: ManufacturingOrder) => {
    setRollbackModalTarget(mo);
    setRollbackPreview(null);
    setRollbackReason('');
    setRollbackError(null);
    setRollbackLoading(true);
    try {
      const res = await fetch(
        `/api/wip/manufacturing-orders/${encodeURIComponent(mo.id)}/rollback-preview?cascadeSubMos=true`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRollbackError(json.error || 'خطا در محاسبه تأثیر حذف و بازگشت موجودی');
      } else {
        setRollbackPreview(json.data);
      }
    } catch (err: any) {
      setRollbackError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleConfirmMoDeleteRollback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rollbackModalTarget || !rollbackPreview) return;
    if (rollbackReason.trim().length < 3) {
      setRollbackError('لطفاً دلیل حذف و ابطال را حداقل با ۳ کاراکتر وارد نمایید.');
      return;
    }
    if (!rollbackPreview.canRollback) {
      setRollbackError(rollbackPreview.blockingErrors[0] || 'امکان بازگشت موجودی به دلیل کسری موجودی خروجی وجود ندارد.');
      return;
    }
    setRollbackSubmitting(true);
    setRollbackError(null);
    try {
      const res = await fetch(
        `/api/wip/manufacturing-orders/${encodeURIComponent(rollbackModalTarget.id)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: rollbackReason.trim(),
            cascadeSubMos: true,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setRollbackError(json.error || 'خطا در حذف دستور تولید و بازگشت موجودی');
        return;
      }
      setNotification({
        type: 'success',
        message:
          json.message ||
          `دستور تولید ${rollbackModalTarget.moNumber} و زیرمجموعه‌های آن با موفقیت حذف شد و موجودی انبار به حالت قبل بازگشت.`,
      });
      setRollbackModalTarget(null);
      setRollbackPreview(null);
      await loadWipData();
      if (onGlobalRefresh) await onGlobalRefresh();
      window.dispatchEvent(new CustomEvent('kpims-master-data-updated'));
    } catch (err: any) {
      setRollbackError(err.message || 'خطا در ارتباط با سرور');
    } finally {
      setRollbackSubmitting(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {/* SAP HANA Fiori Header + Unified Filter Bar */}
      <div className="bg-white border border-[#d9d9d9] rounded-md p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] flex items-center justify-center shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-bold text-[#333333] tracking-tight">
                  قطعات در جریان ساخت و ایستگاه‌ها (WIP)
                </h1>
                {metrics?.overallConservationIntegrity && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#f1f8f3] text-[#107e3e] border border-[#b7dfc4]">
                    <ShieldCheck className="w-3 h-3 text-[#107e3e]" />
                    <span>تراز پایستگی تایید شده</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#666666]">
                مدیریت یکپارچه دستورهای کار ساخت (MO)، صف ایستگاه‌های پرس و جوش، و حواله‌های انتقال بین مراحل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setIsMoGuideOpen(true)}
              className="px-2.5 py-1.5 rounded border border-[#b3ddf2] bg-[#e5f3fa] hover:bg-[#d2eaf7] text-[#0057b8] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="راهنمای تصویری ثبت MO، صدور سرکلاف و رفع خطای OP10"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>راهنمای تصویری MO / OP10</span>
            </button>
            <button
              type="button"
              onClick={loadWipData}
              disabled={loading}
              className="sap-btn-standard inline-flex items-center gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#007cc0] ${loading ? 'animate-spin' : ''}`} />
              <span>به‌روزرسانی</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCreateMoOpen(true)}
              className="sap-btn-emphasized inline-flex items-center gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>دستور کار جدید (MO)</span>
            </button>
          </div>
        </div>

        {/* Unified SAP Fiori Filter Bar */}
        <div className="space-y-2 pt-2 border-t border-[#e5e5e5]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#666666] absolute right-3 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجوی شماره دستور کار (MO)، کد قطعه، نام قطعه یا ایستگاه کاری..."
              className="w-full bg-[#f5f5f5] focus:bg-white border border-[#d9d9d9] focus:border-[#007cc0] rounded pr-9 pl-3 py-1.5 text-xs text-[#333333] placeholder:text-[#767676] focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 bg-white border border-[#d9d9d9] rounded px-2.5 py-1 text-[#333333]">
                <Boxes className="w-3.5 h-3.5 text-[#007cc0]" />
                <span className="text-[#666666]">نمای بخش:</span>
                <select
                  value={activeView}
                  onChange={e => handleChangeView(e.target.value as WipViewMode)}
                  className="bg-transparent text-xs font-semibold text-[#333333] focus:outline-none cursor-pointer"
                >
                  <option value="UNIFIED_DIRECTORY">
                    نمای درختی یکپارچه (همه دستورات کار و ایستگاه‌ها)
                  </option>
                  <option value="BOTTLENECK">
                    تحلیلگر زنده گلوگاه و زمان گذر ایستگاه‌ها (Bottleneck Visualizer)
                  </option>
                  <option value="TRACEABILITY">
                    فرم شناسایی و ردیابی قطعه (استعلام شماره رهگیری و پرینت لیبل)
                  </option>
                  <option value="DASHBOARD">داشبورد گرافیکی گلوگاه‌ها</option>
                  <option value="ORDERS">
                    جدول تفصیلی دستورهای کار ({toPersianDigits(orders.length)})
                  </option>
                  <option value="TRANSFERS">
                    حواله‌های انتقال بین مراحل ({toPersianDigits(transfers.length)})
                  </option>
                  <option value="STAGES">موجودی کل ایستگاه‌های کارخانه</option>
                </select>
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white border border-[#d9d9d9] rounded px-2.5 py-1 text-[#333333]">
                <Filter className="w-3.5 h-3.5 text-[#666666]" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-transparent text-xs font-medium text-[#333333] focus:outline-none cursor-pointer"
                >
                  <option value="ALL">وضعیت MO: همه</option>
                  <option value="IN_PROGRESS">در جریان ساخت</option>
                  <option value="RELEASED">صادرشده به سالن</option>
                  <option value="PLANNED">متوقف / منتظر شروع</option>
                  <option value="COMPLETED">تکمیل‌شده</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#d9d9d9] bg-white text-[#333333] cursor-pointer select-none hover:bg-[#f5f5f5]">
                <input
                  type="checkbox"
                  checked={onlyActiveQueue}
                  onChange={e => setOnlyActiveQueue(e.target.checked)}
                  className="rounded border-[#bfbfbf] text-[#007cc0] focus:ring-0"
                />
                <span>فقط دارای موجودی در صف</span>
              </label>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  handleChangeView(activeView === 'BOTTLENECK' ? 'UNIFIED_DIRECTORY' : 'BOTTLENECK')
                }
                className={`px-2.5 py-1 rounded border text-[11px] font-semibold cursor-pointer flex items-center gap-1.5 transition-colors ${
                  activeView === 'BOTTLENECK'
                    ? 'bg-[#007cc0] text-white border-[#007cc0]'
                    : bottleneckAnalysis.criticalCount > 0
                    ? 'bg-[#fde8e8] text-[#bb0000] border-[#f5b8b8] hover:bg-[#fbd5d5]'
                    : 'bg-white text-[#333333] border-[#d9d9d9] hover:bg-[#e5f3fa]'
                }`}
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>
                  گلوگاه‌های لحظه‌ای ({toPersianDigits(bottleneckAnalysis.totalThroughputAllHours)} ساعت)
                </span>
              </button>
              {activeView !== 'UNIFIED_DIRECTORY' && (
                <button
                  type="button"
                  onClick={() => handleChangeView('UNIFIED_DIRECTORY')}
                  className="sap-btn-standard text-[11px] font-semibold cursor-pointer"
                >
                  بازگشت به نمای درختی یکپارچه
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Compact 6-Stage Summary Strip */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white p-3 rounded-md border border-[#d9d9d9] space-y-2"
            >
              <div className="flex items-center justify-between">
                <Skeleton variant="text" className="w-20 h-3" />
                <Skeleton variant="circle" className="w-4 h-4" />
              </div>
              <Skeleton variant="block" className="w-16 h-6" />
              <Skeleton variant="text" className="w-24 h-2.5" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <div className="bg-white px-3 py-2 rounded-md border border-[#d9d9d9]">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>صف ورودی ایستگاه</span>
              <Clock className="w-3.5 h-3.5 text-[#007cc0]" />
            </div>
            <div className="text-sm font-bold text-[#333333] font-mono tabular-nums mt-0.5">
              {formatNumber(metrics?.totalWaitingQty || 0)}
            </div>
          </div>

          <div className="bg-white px-3 py-2 rounded-md border border-[#d9d9d9]">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>در حال ساخت پای دستگاه</span>
              <Play className="w-3.5 h-3.5 text-[#007cc0]" />
            </div>
            <div className="text-sm font-bold text-[#007cc0] font-mono tabular-nums mt-0.5">
              {formatNumber(metrics?.totalInProgressQty || 0)}
            </div>
          </div>

          <div className="bg-white px-3 py-2 rounded-md border border-[#d9d9d9]">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>آماده انتقال به مرحله بعد</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#107e3e]" />
            </div>
            <div className="text-sm font-bold text-[#107e3e] font-mono tabular-nums mt-0.5">
              {formatNumber(metrics?.totalReadyForTransferQty || 0)}
            </div>
          </div>

          <div className="bg-white px-3 py-2 rounded-md border border-[#d9d9d9]">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>در حال انتقال (حواله باز)</span>
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#e9730c]" />
            </div>
            <div className="text-sm font-bold text-[#b85a00] font-mono tabular-nums mt-0.5">
              {formatNumber(metrics?.totalInTransitQty || 0)}
            </div>
          </div>

          <div className="bg-white px-3 py-2 rounded-md border border-[#d9d9d9]">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>محصول تکمیل‌شده</span>
              <Layers className="w-3.5 h-3.5 text-[#007cc0]" />
            </div>
            <div className="text-sm font-bold text-[#333333] font-mono tabular-nums mt-0.5">
              {formatNumber(metrics?.totalCompletedQty || 0)}
            </div>
          </div>

          <div className="bg-white px-3 py-2 rounded-md border border-[#d9d9d9]">
            <div className="flex items-center justify-between text-[#666666] text-[11px]">
              <span>ضایعات و دوباره‌کاری</span>
              <AlertCircle className="w-3.5 h-3.5 text-[#bb0000]" />
            </div>
            <div className="text-sm font-bold text-[#bb0000] font-mono tabular-nums mt-0.5">
              {formatNumber(
                (metrics?.totalScrapQty || 0) + (metrics?.totalReworkQty || 0)
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visual MO Status Distribution Chart across Production Halls */}
      {!loading &&
        (activeView === 'UNIFIED_DIRECTORY' ||
          activeView === 'ORDERS' ||
          activeView === 'DASHBOARD' ||
          activeView === 'BOTTLENECK') && (
          <WipHallMoDistributionChart
            orders={orders}
            machines={machines}
            halls={halls}
            activeStatusFilter={statusFilter}
            onSelectStatusFilter={setStatusFilter}
          />
        )}

      {/* Real-Time Stage Bottleneck Visualizer (Embedded strip in Unified/Dashboard OR Full Panel in BOTTLENECK mode) */}
      {(activeView === 'BOTTLENECK' || activeView === 'UNIFIED_DIRECTORY' || activeView === 'DASHBOARD') && (
        <div className="bg-white border border-[#d9d9d9] rounded-md shadow-2xs overflow-hidden">
          <div className="px-4 py-2.5 bg-[#fafafa] border-b border-[#e5e5e5] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-[#007cc0]" />
              <div>
                <h2 className="text-xs font-bold text-[#333333]">
                  پایش لحظه‌ای گلوگاه و زمان گذر ایستگاه‌ها (Real-Time Stage Bottleneck & Throughput Visualizer)
                </h2>
                <p className="text-[11px] text-[#666666]">
                  محاسبه‌شده از روی موجودی لحظه‌ای ایستگاه‌ها و زمان سیکل/ستاپ مسیر عملیات (Routing) — مبنای هشدار: شیفت ۷٫۵ ساعته
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-[11px] flex-wrap font-mono tabular-nums">
              <span>
                جمع WIP ایستگاه‌ها:{' '}
                <strong className="text-[#333333]">{formatNumber(bottleneckAnalysis.totalWipQtyAllStages)}</strong> عدد
              </span>
              <span className="text-[#d9d9d9]">|</span>
              <span>
                کل زمان گذر صف:{' '}
                <strong className="text-[#007cc0]">{toPersianDigits(bottleneckAnalysis.totalThroughputAllHours)}</strong> ساعت
              </span>
              {bottleneckAnalysis.criticalCount > 0 && (
                <>
                  <span className="text-[#d9d9d9]">|</span>
                  <span className="font-sans font-bold text-[#bb0000]">
                    {toPersianDigits(bottleneckAnalysis.criticalCount)} ایستگاه با تراکم بحرانی
                  </span>
                </>
              )}
              {activeView !== 'BOTTLENECK' && (
                <button
                  type="button"
                  onClick={() => setShowBottleneckPanel(p => !p)}
                  className="sap-btn-standard px-2.5 py-1 text-[11px] font-sans inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <span>{showBottleneckPanel ? 'بستن جزئیات گلوگاه' : 'باز کردن نمودار گلوگاه'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showBottleneckPanel ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* At-a-Glance Collapsed Bottleneck Strip */}
          {activeView !== 'BOTTLENECK' && !showBottleneckPanel && (
            <div className="px-4 py-2 bg-[#fcfcfd] flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
              <div className="flex items-center gap-2.5 flex-wrap">
                {bottleneckAnalysis.peakStage && bottleneckAnalysis.peakStage.totalQty > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[#333333]">
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        bottleneckAnalysis.peakStage.severity === 'CRITICAL'
                          ? 'text-[#bb0000]'
                          : bottleneckAnalysis.peakStage.severity === 'WARNING'
                          ? 'text-[#e9730c]'
                          : 'text-[#107e3e]'
                      }`}
                    />
                    <span>گلوگاه اصلی:</span>
                    <strong className="text-[#1d2d3e]">{bottleneckAnalysis.peakStage.stageName}</strong>
                    <span className="font-mono tabular-nums text-[#556b82]">
                      ({formatNumber(bottleneckAnalysis.peakStage.totalQty)} عدد ·{' '}
                      <strong className="text-[#007cc0]">{toPersianDigits(bottleneckAnalysis.peakStage.throughputHours)}h</strong> ·{' '}
                      {toPersianDigits(bottleneckAnalysis.peakStage.shiftLoad)} شیفت)
                    </span>
                  </span>
                ) : (
                  <span className="text-[#107e3e] font-medium">صف ایستگاه‌ها متعادل و بدون انباشت بحرانی است</span>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap font-mono tabular-nums text-[#556b82]">
                {bottleneckAnalysis.stages
                  .filter(s => s.totalQty > 0)
                  .slice(0, 4)
                  .map(s => (
                    <span key={s.stageId} className="inline-flex items-center gap-1 font-sans">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          s.severity === 'CRITICAL'
                            ? 'bg-[#bb0000]'
                            : s.severity === 'WARNING'
                            ? 'bg-[#e9730c]'
                            : 'bg-[#107e3e]'
                        }`}
                      />
                      <span className="text-[#333333]">{s.stageName}:</span>
                      <strong className="font-mono text-[#1d2d3e]">{toPersianDigits(s.throughputHours)}h</strong>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {(activeView === 'BOTTLENECK' || showBottleneckPanel) && (
            <div className="p-4 space-y-4">
              {/* Peak Bottleneck Alert Banner */}
              {bottleneckAnalysis.peakStage && bottleneckAnalysis.peakStage.totalQty > 0 && (
                <div
                  className={`p-3 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                    bottleneckAnalysis.peakStage.severity === 'CRITICAL'
                      ? 'bg-[#fde8e8] border-[#f5b8b8] text-[#bb0000]'
                      : bottleneckAnalysis.peakStage.severity === 'WARNING'
                      ? 'bg-[#fff4e5] border-[#f9d6a7] text-[#b85a00]'
                      : 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>گلوگاه اول خط:</strong> {bottleneckAnalysis.peakStage.stageName} با{' '}
                      <strong className="font-mono tabular-nums">
                        {formatNumber(bottleneckAnalysis.peakStage.totalQty)}
                      </strong>{' '}
                      عدد انباشت WIP و زمان گذر برآوردی{' '}
                      <strong className="font-mono tabular-nums">
                        {toPersianDigits(bottleneckAnalysis.peakStage.throughputHours)} ساعت
                      </strong>{' '}
                      (معادل{' '}
                      <strong className="font-mono tabular-nums">
                        {toPersianDigits(bottleneckAnalysis.peakStage.shiftLoad)}
                      </strong>{' '}
                      شیفت کاری)
                    </span>
                  </div>
                    <button
                      type="button"
                      onClick={() => {
                        const peak = bottleneckAnalysis.peakStage;
                        if (!peak) return;
                        const nextId = selectedBottleneckStageId === peak.stageId ? null : peak.stageId;
                        selectBottleneckStage(nextId, peak.stageName);
                      }}
                      className="px-2.5 py-1 rounded bg-white/80 hover:bg-white border border-current text-[11px] font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      مشاهده قطعات متوقف در این گلوگاه
                    </button>
                  </div>
                )}

                {/* Visual Color-Coded Throughput Bars Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {bottleneckAnalysis.stages.map(st => {
                    const isSelected = selectedBottleneckStageId === st.stageId;
                    const borderAccent =
                      st.severity === 'CRITICAL'
                        ? 'border-[#f5b8b8] border-r-4 border-r-[#bb0000] bg-[#fde8e8]/30'
                        : st.severity === 'WARNING'
                        ? 'border-[#f9d6a7] border-r-4 border-r-[#e9730c] bg-[#fff4e5]/40'
                        : st.severity === 'NORMAL'
                        ? 'border-[#d9d9d9] border-r-4 border-r-[#107e3e] bg-white'
                        : 'border-[#e5e5e5] border-r-4 border-r-[#bfbfbf] bg-[#fafafa]';

                    const barColor =
                      st.severity === 'CRITICAL'
                        ? 'bg-[#bb0000]'
                        : st.severity === 'WARNING'
                        ? 'bg-[#e9730c]'
                        : st.severity === 'NORMAL'
                        ? 'bg-[#107e3e]'
                        : 'bg-[#cccccc]';

                    const statusTextColor =
                      st.severity === 'CRITICAL'
                        ? 'text-[#bb0000]'
                        : st.severity === 'WARNING'
                        ? 'text-[#b85a00]'
                        : st.severity === 'NORMAL'
                        ? 'text-[#107e3e]'
                        : 'text-[#777777]';

                    const statusLabel =
                      st.severity === 'CRITICAL'
                        ? 'انباشت بحرانی'
                        : st.severity === 'WARNING'
                        ? 'تراکم بالا'
                        : st.severity === 'NORMAL'
                        ? 'جریان پایدار'
                        : 'صف خالی';

                    return (
                      <button
                        key={st.stageId}
                        type="button"
                        onClick={() =>
                          selectBottleneckStage(isSelected ? null : st.stageId, st.stageName)
                        }
                        className={`p-3 rounded border text-right cursor-pointer transition-all flex flex-col justify-between gap-2 ${borderAccent} ${
                          isSelected ? 'ring-2 ring-[#007cc0]' : 'hover:shadow-sm'
                        }`}
                      >
                      <div className="space-y-1 w-full">
                        <div className="flex items-center justify-between gap-1 text-[10px]">
                          <span className={`font-bold ${statusTextColor}`}>{statusLabel}</span>
                          <span className="font-mono tabular-nums text-[#666666]">
                            {toPersianDigits(st.wipSharePercent)}٪ کل WIP
                          </span>
                        </div>
                        <div className="text-xs font-bold text-[#333333] leading-snug line-clamp-1">
                          {st.stageName}
                        </div>
                      </div>

                      <div className="space-y-1.5 w-full font-mono tabular-nums">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-[#333333]">
                            {toPersianDigits(st.throughputHours)}{' '}
                            <span className="text-[10px] font-sans font-normal text-[#666666]">ساعت</span>
                          </span>
                          <span className="text-[11px] text-[#555555]">
                            {formatNumber(st.totalQty)} <span className="font-sans">عدد</span>
                          </span>
                        </div>

                        <div className="h-2 w-full bg-[#e8e8e8] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                            style={{ width: `${st.barWidthPercent}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#666666]">
                          <span>سیکل میانگین: {toPersianDigits(st.avgCycleTimeSec)}s</span>
                          <span>{toPersianDigits(st.partsCount)} کد قطعه</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Drill-down table for selected stage OR top accumulating stages in BOTTLENECK mode */}
              {(selectedBottleneckStageId || activeView === 'BOTTLENECK') && (
                <div className="border border-[#d9d9d9] rounded overflow-hidden">
                  <div className="px-3.5 py-2 bg-[#f5f5f5] border-b border-[#d9d9d9] flex items-center justify-between text-xs">
                    <span className="font-bold text-[#333333]">
                      {selectedBottleneckStageId
                        ? `ریز قطعات و زمان گذر در: ${
                            bottleneckAnalysis.stages.find(s => s.stageId === selectedBottleneckStageId)?.stageName ||
                            selectedBottleneckStageId
                          }`
                        : 'جدول کامل زمان گذر ایستگاه‌ها و جزئیات صف قطعات (برای مشاهده قطعات روی هر ایستگاه کلیک کنید)'}
                    </span>
                    {selectedBottleneckStageId && (
                      <button
                        type="button"
                        onClick={() => setSelectedBottleneckStageId(null)}
                        className="text-[11px] text-[#007cc0] hover:underline cursor-pointer"
                      >
                        بستن جزئیات ایستگاه
                      </button>
                    )}
                  </div>

                  {selectedBottleneckStageId ? (
                    (() => {
                      const stageObj = bottleneckAnalysis.stages.find(
                        s => s.stageId === selectedBottleneckStageId,
                      );
                      if (!stageObj || stageObj.partBreakdown.length === 0) {
                        return (
                          <div className="p-4 text-center text-xs text-[#666666]">
                            در حال حاضر هیچ قطعه‌ای در صف این ایستگاه انباشته نشده است.
                          </div>
                        );
                      }
                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-right border-collapse text-[11px]">
                            <thead>
                              <tr className="bg-[#fafafa] border-b border-[#e5e5e5] text-[#555555]">
                                <th className="py-2 px-3 font-semibold">کد و نام قطعه</th>
                                <th className="py-2 px-2.5 font-semibold">تعداد موجود در ایستگاه</th>
                                <th className="py-2 px-2.5 font-semibold">قابل استفاده</th>
                                <th className="py-2 px-2.5 font-semibold">در حال انتقال</th>
                                <th className="py-2 px-2.5 font-semibold">زمان سیکل مسیر</th>
                                <th className="py-2 px-2.5 font-semibold">ستاپ (دقیقه)</th>
                                <th className="py-2 px-2.5 font-semibold">زمان گذر (ساعت)</th>
                                <th className="py-2 px-3 font-semibold">پیگیری</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#eeeeee] font-mono tabular-nums">
                              {stageObj.partBreakdown.map(p => (
                                <tr key={`${stageObj.stageId}-${p.partId}`} className="hover:bg-[#f7fbfe]">
                                  <td className="py-2 px-3 font-sans">
                                    <div className="font-semibold text-[#333333]">{p.partName}</div>
                                    <div className="text-[10px] text-[#666666] font-mono">
                                      {p.partCode}
                                      {!p.hasExactRouting ? ' (سیکل استاندارد پیش‌فرض)' : ''}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2.5 font-bold text-[#333333]">{formatNumber(p.qty)}</td>
                                  <td className="py-2 px-2.5 text-[#107e3e]">{formatNumber(p.usableQty)}</td>
                                  <td className="py-2 px-2.5 text-[#e9730c]">{formatNumber(p.inTransitQty)}</td>
                                  <td className="py-2 px-2.5">{toPersianDigits(p.cycleTimeSec)} ثانیه</td>
                                  <td className="py-2 px-2.5">{toPersianDigits(p.setupTimeMin)} دقیقه</td>
                                  <td className="py-2 px-2.5 font-bold text-[#007cc0]">
                                    {toPersianDigits(p.throughputHours)} ساعت
                                  </td>
                                  <td className="py-2 px-3 font-sans">
                                    <button
                                      type="button"
                                      onClick={() => router.traceDocument(p.partCode, 'INVENTORY_LEDGER')}
                                      className="sap-doc-link inline-flex items-center gap-1 text-[11px] cursor-pointer"
                                    >
                                      <span>کاردکس</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-[11px]">
                        <thead>
                          <tr className="bg-[#fafafa] border-b border-[#e5e5e5] text-[#555555]">
                            <th className="py-2 px-3 font-semibold">ایستگاه تولید</th>
                            <th className="py-2 px-2.5 font-semibold">موجودی WIP</th>
                            <th className="py-2 px-2.5 font-semibold">سهم انباشت</th>
                            <th className="py-2 px-2.5 font-semibold">سیکل میانگین</th>
                            <th className="py-2 px-2.5 font-semibold">زمان گذر کل</th>
                            <th className="py-2 px-2.5 font-semibold">بار شیفت (۷.۵h)</th>
                            <th className="py-2 px-3 font-semibold">وضعیت گلوگاه</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eeeeee] font-mono tabular-nums">
                          {bottleneckAnalysis.stages.map(st => (
                            <tr
                              key={st.stageId}
                              onClick={() => selectBottleneckStage(st.stageId, st.stageName)}
                              className="hover:bg-[#f7fbfe] cursor-pointer"
                            >
                              <td className="py-2 px-3 font-sans font-semibold text-[#333333]">{st.stageName}</td>
                              <td className="py-2 px-2.5 font-bold">{formatNumber(st.totalQty)}</td>
                              <td className="py-2 px-2.5">{toPersianDigits(st.wipSharePercent)}٪</td>
                              <td className="py-2 px-2.5">{toPersianDigits(st.avgCycleTimeSec)} ثانیه</td>
                              <td className="py-2 px-2.5 font-bold text-[#007cc0]">
                                {toPersianDigits(st.throughputHours)} ساعت
                              </td>
                              <td className="py-2 px-2.5">{toPersianDigits(st.shiftLoad)} شیفت</td>
                              <td className="py-2 px-3 font-sans font-bold">
                                <span
                                  className={
                                    st.severity === 'CRITICAL'
                                      ? 'text-[#bb0000]'
                                      : st.severity === 'WARNING'
                                      ? 'text-[#e9730c]'
                                      : st.severity === 'NORMAL'
                                      ? 'text-[#107e3e]'
                                      : 'text-[#777777]'
                                  }
                                >
                                  {st.severity === 'CRITICAL'
                                    ? 'گلوگاه بحرانی'
                                    : st.severity === 'WARNING'
                                    ? 'هشدار انباشت'
                                    : st.severity === 'NORMAL'
                                    ? 'عادی'
                                    : 'خالی'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Traceability & Part Identification Flow */}
      {activeView === 'TRACEABILITY' && (
        <TraceabilityInquiryView
          parts={parts}
          machines={machines}
          operators={operators}
          initialQuery={initialTraceQuery}
        />
      )}

      {/* UNIFIED SAP HANA DIRECTORY VIEW */}
      {activeView === 'UNIFIED_DIRECTORY' && (
        <div className="bg-white border border-[#d9d9d9] rounded-md overflow-hidden shadow-2xs">
          <div className="px-3.5 py-2 bg-white border-b border-[#d9d9d9] flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#333333]">
            <span>نام دستور کار (MO) / مرحله عملیات و ایستگاه</span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  expandAllGroups(['orders_group', 'transfers_group']);
                  expandAllMos(filteredOrders.map(m => m.id));
                }}
                className="sap-btn-standard px-2 py-0.5 text-[11px] cursor-pointer whitespace-nowrap"
              >
                باز کردن همه
              </button>
              <button
                type="button"
                onClick={() => {
                  collapseAllMos();
                  collapseAllGroups();
                }}
                className="sap-btn-standard px-2 py-0.5 text-[11px] cursor-pointer whitespace-nowrap"
              >
                بستن همه
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#e5e5e5] text-xs">
            {/* Folder 1: Active Manufacturing Orders (Expandable inline) */}
            <div>
              <button
                type="button"
                onClick={() => toggleGroup('orders_group')}
                className="w-full px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-[#e5f3fa]/50 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 font-semibold text-[#333333]">
                  {expandedGroups.orders_group ? (
                    <ChevronDown className="w-4 h-4 text-[#007cc0]" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-[#666666]" />
                  )}
                  <Folder className="w-4 h-4 text-[#007cc0]" />
                  <span>دستورهای کار تولید و مراحل ساخت (Manufacturing Orders)</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-[#666666] font-mono tabular-nums">
                  <span className="font-sans">
                    تعداد: <strong className="font-mono text-[#333333]">{toPersianDigits(filteredOrders.length)}</strong>
                  </span>
                  <span className="text-[#d9d9d9]">·</span>
                  <span className="font-sans text-[#007cc0]">
                    در جریان: <strong className="font-mono">{toPersianDigits(filteredOrders.filter(o => o.status === 'IN_PROGRESS' || o.status === 'RELEASED').length)}</strong>
                  </span>
                  <span className="text-[#d9d9d9]">·</span>
                  <span className="font-sans text-[#107e3e]">
                    تکمیل‌شده: <strong className="font-mono">{toPersianDigits(filteredOrders.filter(o => o.status === 'COMPLETED').length)}</strong>
                  </span>
                </div>
              </button>

              {expandedGroups.orders_group && (
                <div className="divide-y divide-[#e5e5e5]">
                  {filteredOrders.map(mo => {
                    const isExpanded = !!expandedMoIds[mo.id];
                    const completedOps = mo.operations.filter(
                      o => o.status === 'COMPLETED'
                    ).length;
                    const activeOp =
                      mo.operations.find(o => o.inProgressQty > 0) ||
                      mo.operations.find(o => o.waitingInputQty > 0) ||
                      mo.operations.find(o => o.readyForTransferQty > 0) ||
                      mo.operations.find(o => o.status !== 'COMPLETED');
                    const moWaiting = mo.operations.reduce((s, o) => s + (o.waitingInputQty || 0), 0);
                    const moInProg = mo.operations.reduce((s, o) => s + (o.inProgressQty || 0), 0);
                    const moReady = mo.operations.reduce((s, o) => s + (o.readyForTransferQty || 0), 0);
                    const moProgressPct =
                      mo.targetQuantity > 0
                        ? Math.min(100, Math.round((mo.completedQuantity / mo.targetQuantity) * 100))
                        : 0;
                    return (
                      <div key={mo.id} className="bg-white">
                        {/* MO Row */}
                        <div className="pr-7 pl-3.5 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-[#e5f3fa]/40 transition-colors">
                          <div
                            onClick={() => toggleMoRow(mo.id, mo.moNumber)}
                            className="flex items-center gap-2 cursor-pointer flex-1"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[#007cc0] shrink-0" />
                            ) : (
                              <ChevronLeft className="w-3.5 h-3.5 text-[#666666] shrink-0" />
                            )}
                            <Layers className="w-4 h-4 text-[#007cc0] shrink-0" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    router.traceDocument(mo.moNumber, 'WIP_TRACEABILITY');
                                  }}
                                  className="sap-doc-link font-mono font-bold text-xs cursor-pointer"
                                  title="استعلام شجره‌نامه و شماره رهگیری این دستور کار"
                                >
                                  {mo.moNumber}
                                </button>
                                <span className="font-semibold text-[#333333]">
                                  {mo.partName}
                                </span>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    router.traceDocument(mo.partCode, 'INVENTORY_LEDGER');
                                  }}
                                  className="sap-doc-link font-mono text-[11px] cursor-pointer"
                                  title="مشاهده کاردکس انبار این قطعه"
                                >
                                  ({mo.partCode})
                                </button>
                                {activeOp && (
                                  <span className="text-[11px] text-[#007cc0] font-medium">
                                    · ایستگاه فعال: <strong className="font-mono">{activeOp.stepCode}</strong> ({activeOp.stepName})
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#666666] mt-0.5 flex items-center gap-2.5 flex-wrap tabular-nums">
                                <span>
                                  هدف:{' '}
                                  <strong className="font-mono text-[#333333]">
                                    {formatNumber(mo.targetQuantity)}
                                  </strong>
                                </span>
                                <span>·</span>
                                <span>
                                  تکمیل:{' '}
                                  <strong className="font-mono text-[#107e3e]">
                                    {formatNumber(mo.completedQuantity)} ({toPersianDigits(moProgressPct)}٪)
                                  </strong>
                                </span>
                                <span>·</span>
                                <span>
                                  صف: <strong className="font-mono text-[#e9730c]">{formatNumber(moWaiting)}</strong>
                                </span>
                                <span>·</span>
                                <span>
                                  پای دستگاه: <strong className="font-mono text-[#007cc0]">{formatNumber(moInProg)}</strong>
                                </span>
                                <span>·</span>
                                <span>
                                  آماده انتقال: <strong className="font-mono text-[#107e3e]">{formatNumber(moReady)}</strong>
                                </span>
                                <span>·</span>
                                <span>
                                  ضایعات:{' '}
                                  <strong className="font-mono text-[#bb0000]">
                                    {formatNumber(mo.totalScrapQuantity)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 self-end md:self-center flex-wrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#f1f8f3] text-[#107e3e] border border-[#b7dfc4]">
                              {toPersianDigits(completedOps)} از{' '}
                              {toPersianDigits(mo.operations.length)} مرحله
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
                              {mo.status === 'IN_PROGRESS'
                                ? 'در جریان ساخت'
                                : mo.status === 'COMPLETED'
                                ? 'تکمیل‌شده'
                                : 'صادرشده'}
                            </span>
                            {mo.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLoadMatModalMo(mo);
                                  setLoadMatQty(Math.max(1, mo.targetQuantity - mo.initialInputQuantity) || mo.targetQuantity);
                                  setLoadMatNotes('');
                                }}
                                className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                                title="بارگذاری ورق یا بلنک اولیه در مرحله نخست دستور کار"
                              >
                                بارگذاری مواد
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => router.traceDocument(mo.moNumber, 'INVENTORY_LEDGER')}
                              className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                            >
                              اسناد کاردکس
                            </button>
                            <button
                              type="button"
                              onClick={() => setReconciliationMoId(mo.id)}
                              className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              تراز پایستگی
                            </button>
                            <button
                              type="button"
                              onClick={() => openMoRollbackModal(mo)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#fff0f0] hover:bg-[#fde0e0] text-[#bb0000] border border-[#f2b8b5] text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                              title="حذف دستور تولید + زیرمجموعه‌ها و بازگشت کامل موجودی مصرفی به انبار"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف کامل و بازگشت موجودی</span>
                            </button>
                          </div>
                        </div>

                        {/* Inline Operations Rows (Compact SAP HANA) */}
                        {isExpanded && (
                          <div className="bg-[#f8f9fa] border-t border-[#e5e5e5] divide-y divide-[#e5e5e5]">
                            {mo.operations.map(op => (
                              <div
                                key={op.id}
                                className="pr-12 pl-3.5 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="px-1.5 py-0.5 rounded bg-white border border-[#d9d9d9] font-mono text-[10px] font-bold text-[#007cc0]">
                                    {op.stepCode}
                                  </span>
                                  <div>
                                    <span className="font-semibold text-[#333333]">
                                      {op.stepName}
                                    </span>
                                    <div className="text-[11px] text-[#666666] flex items-center gap-3 mt-0.5 font-mono tabular-nums">
                                      <span>صف: {formatNumber(op.waitingInputQty)}</span>
                                      <span>پای دستگاه: {formatNumber(op.inProgressQty)}</span>
                                      <span className="text-[#107e3e] font-bold">
                                        آماده انتقال: {formatNumber(op.readyForTransferQty)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 self-end sm:self-center">
                                  <button
                                    type="button"
                                    onClick={() => setInputModalOp(op)}
                                    className="sap-btn-standard text-[11px] py-0.5 px-2 cursor-pointer"
                                  >
                                    ثبت ورودی
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setProdModalOp(op)}
                                    className="px-2 py-0.5 rounded bg-[#107e3e] hover:bg-[#0d6832] text-white text-[11px] font-semibold cursor-pointer"
                                  >
                                    ثبت تولید / ضایعات
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTransferModalContext({ mo, op });
                                      setIsTransferModalOpen(true);
                                    }}
                                    className="sap-btn-emphasized text-[11px] py-0.5 px-2 cursor-pointer"
                                  >
                                    انتقال به مرحله بعد
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Folder 2: Pending & Recent Transfers */}
            <div>
              <button
                type="button"
                onClick={() => toggleGroup('transfers_group')}
                className="w-full px-3.5 py-2 flex items-center justify-between hover:bg-[#e5f3fa]/50 transition-colors cursor-pointer text-right"
              >
                <div className="flex items-center gap-2 font-semibold text-[#333333]">
                  {expandedGroups.transfers_group ? (
                    <ChevronDown className="w-4 h-4 text-[#007cc0]" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-[#666666]" />
                  )}
                  <Folder className="w-4 h-4 text-[#007cc0]" />
                  <span>حواله‌های انتقال بین مراحل (Inter-Operation Transfers)</span>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] text-[#666666] font-mono tabular-nums">
                  <span className="font-sans">
                    کل: <strong className="font-mono text-[#333333]">{toPersianDigits(transfers.length)}</strong> حواله
                  </span>
                  <span className="text-[#d9d9d9]">·</span>
                  <span className="font-sans text-[#b85a00]">
                    در انتظار تایید:{' '}
                    <strong className="font-mono">
                      {toPersianDigits(transfers.filter(t => t.status === 'PENDING_APPROVAL').length)}
                    </strong>
                  </span>
                </div>
              </button>

              {expandedGroups.transfers_group && (
                <div className="divide-y divide-[#e5e5e5]">
                  {transfers.slice(0, 6).map(tr => (
                    <div
                      key={tr.id}
                      className="pr-9 pl-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#e5f3fa]/40"
                    >
                      <div className="flex items-center gap-2.5">
                        <ArrowRightLeft className="w-4 h-4 text-[#007cc0] shrink-0" />
                        <div>
                          <div className="font-semibold text-[#333333] flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => router.traceDocument(tr.transferNumber, 'WIP_TRACEABILITY')}
                              className="sap-doc-link font-mono cursor-pointer"
                            >
                              {tr.transferNumber}
                            </button>
                            <span>— {tr.partName}</span>
                            <button
                              type="button"
                              onClick={() => router.traceDocument(tr.moNumber, 'WIP_TRACEABILITY')}
                              className="sap-doc-link font-mono text-[11px] cursor-pointer"
                            >
                              ({tr.moNumber})
                            </button>
                          </div>
                          <div className="text-[11px] text-[#666666] mt-0.5">
                            از {tr.fromStepName} به {tr.toStepName} • تعداد:{' '}
                            <strong className="font-mono text-[#333333] tabular-nums">
                              {formatNumber(tr.quantity)} عدد
                            </strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            tr.status === 'APPROVED'
                              ? 'bg-[#f1f8f3] text-[#107e3e] border-[#b7dfc4]'
                              : tr.status === 'REJECTED'
                              ? 'bg-[#fff0f0] text-[#bb0000] border-[#f2b8b5]'
                              : 'bg-[#fef7f1] text-[#b85a00] border-[#f5d0b3]'
                          }`}
                        >
                          {tr.status === 'APPROVED'
                            ? 'تحویل‌گرفته در ایستگاه مقصد'
                            : tr.status === 'REJECTED'
                            ? 'رد شده'
                            : 'در انتظار تایید دریافت'}
                        </span>
                        {tr.status === 'PENDING_APPROVAL' && (
                          <button
                            type="button"
                            onClick={() => {
                              requestConfirm({
                                title: `تأیید دریافت حواله انتقال ${tr.transferNumber}`,
                                message: `آیا دریافت ${formatNumber(tr.quantity)} عدد «${tr.partName}» از «${tr.fromStepName}» به «${tr.toStepName}» را تأیید می‌کنید؟`,
                                confirmLabel: 'تأیید دریافت',
                                variant: 'emerald',
                                onConfirm: async () => {
                                  await handleApproveTransfer(tr.id);
                                },
                              });
                            }}
                            className="px-2.5 py-0.5 rounded bg-[#107e3e] hover:bg-[#0d6832] text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                          >
                            تایید دریافت
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Specific Filtered Views when chosen from the View Dropdown */}
      {activeView === 'DASHBOARD' && (
        <WipDashboardView
          metrics={metrics}
          orders={orders}
          loading={loading}
          onRefresh={loadWipData}
          onOpenCreateMo={() => setIsCreateMoOpen(true)}
          onOpenTransfer={() => {
            if (orders.length > 0 && orders[0].operations.length > 0) {
              setTransferModalContext({ mo: orders[0], op: orders[0].operations[0] });
              setIsTransferModalOpen(true);
            }
          }}
          onSelectMo={() => handleChangeView('ORDERS')}
          onNavigateToOrders={() => handleChangeView('ORDERS')}
          onNavigateToTransfers={() => handleChangeView('TRANSFERS')}
        />
      )}

      {activeView === 'ORDERS' && (
        <ManufacturingOrdersView
          orders={filteredOrders}
          loading={loading}
          embeddedInParent
          onRefresh={loadWipData}
          onOpenCreateMo={() => setIsCreateMoOpen(true)}
          onOpenInput={op => setInputModalOp(op)}
          onOpenProduction={op => setProdModalOp(op)}
          onOpenTransfer={(mo, op) => {
            setTransferModalContext({ mo, op });
            setIsTransferModalOpen(true);
          }}
          onOpenReconciliation={moId => setReconciliationMoId(moId)}
          onRequestDeleteRollback={openMoRollbackModal}
        />
      )}

      {activeView === 'TRANSFERS' && (
        <InterOperationTransfersView
          transfers={transfers}
          loading={loading}
          onRefresh={loadWipData}
          onApproveTransfer={handleApproveTransfer}
          onRejectTransfer={handleRejectTransfer}
        />
      )}

      {activeView === 'STAGES' && (
        <InventoryReportView
          balances={stageBalances}
          onRefresh={onGlobalRefresh || loadWipData}
          loading={loading}
        />
      )}

      {/* Action Modals */}
      <CreateMoModal
        isOpen={isCreateMoOpen}
        onClose={() => setIsCreateMoOpen(false)}
        parts={parts}
        routings={routings}
        onSubmit={handleCreateMo}
      />

      <OperationInputModal
        isOpen={!!inputModalOp}
        onClose={() => setInputModalOp(null)}
        operation={inputModalOp}
        machines={machines}
        operators={operators}
        onSubmit={handleRecordInput}
      />

      <OperationProductionModal
        isOpen={!!prodModalOp}
        onClose={() => setProdModalOp(null)}
        operation={prodModalOp}
        onSubmit={handleRecordProduction}
      />

      <OperationTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        mo={transferModalContext.mo}
        fromOperation={transferModalContext.op}
        onSubmit={handleCreateTransfer}
      />

      <WipReconciliationModal
        isOpen={!!reconciliationMoId}
        onClose={() => setReconciliationMoId(null)}
        moId={reconciliationMoId}
      />

      <MoRelationalGuideModal
        isOpen={isMoGuideOpen}
        onClose={() => setIsMoGuideOpen(false)}
        onOpenCreateMo={() => setIsCreateMoOpen(true)}
      />

      {loadMatModalMo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#d9d9d9] rounded-md shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between bg-[#f8f9fa]">
              <h3 className="text-xs font-bold text-[#333333]">
                بارگذاری مواد اولیه / بلنک به دستور کار {loadMatModalMo.moNumber}
              </h3>
              <button
                type="button"
                onClick={() => setLoadMatModalMo(null)}
                className="text-xs text-[#666666] hover:text-[#333333] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleLoadMaterial} className="p-4 space-y-3 text-xs">
              <div className="bg-[#f5f5f5] border border-[#d9d9d9] rounded p-2.5 text-[#333333]">
                <div className="font-semibold">{loadMatModalMo.partName}</div>
                <div className="text-[11px] text-[#666666] mt-0.5 font-mono">
                  هدف: {formatNumber(loadMatModalMo.targetQuantity)} • بارگذاری فعلی: {formatNumber(loadMatModalMo.initialInputQuantity)}
                </div>
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">
                  تعداد ورق / بلنک ورودی به مرحله نخست (عدد):
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={loadMatQty || ''}
                  onChange={e => setLoadMatQty(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div>
                <label className="block text-[#333333] font-semibold mb-1">
                  توضیحات / شماره کویل مرجع (اختیاری):
                </label>
                <input
                  type="text"
                  value={loadMatNotes}
                  onChange={e => setLoadMatNotes(e.target.value)}
                  placeholder="مثال: بارگذاری بلنک برش‌خورده از کلاف COIL-ECU-001"
                  className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#007cc0]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e5e5e5]">
                <button
                  type="button"
                  onClick={() => setLoadMatModalMo(null)}
                  className="sap-btn-standard text-xs px-3 py-1.5 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loadMatSubmitting || loadMatQty <= 0}
                  className="sap-btn-emphasized text-xs px-3.5 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  {loadMatSubmitting ? 'در حال ثبت...' : 'تایید بارگذاری در صف خط'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Cascading MO Delete & Inventory Rollback Preview Modal */}
      {rollbackModalTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white border border-[#d9d9d9] rounded-md shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 border-b border-[#e5e5e5] flex items-center justify-between bg-[#fff5f5]">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#bb0000] shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-[#990000]">
                    تأیید حذف کامل دستور تولید ({rollbackModalTarget.moNumber}) و بازگشت موجودی انبار
                  </h3>
                  <p className="text-[11px] text-[#666666]">
                    کلیه دستورات فرعی وابسته، حواله‌ها، گزارش‌های تولید و اسناد انبار مرتبط بررسی و به وضعیت قبل بازمی‌گردند
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !rollbackSubmitting && setRollbackModalTarget(null)}
                className="text-xs text-[#666666] hover:text-[#333333] cursor-pointer px-1.5 py-0.5"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3.5 text-xs flex-1">
              {rollbackLoading ? (
                <div className="py-10 text-center text-[#556b82]">
                  در حال شبیه‌سازی تأثیر حذف و محاسبه تراز موجودی انبارها...
                </div>
              ) : rollbackPreview ? (
                <>
                  {rollbackPreview.blockingErrors.length > 0 && (
                    <div className="p-3 bg-[#fde8e8] border border-[#f5b8b8] rounded text-[#990000] space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>موانع مسدودکننده بازگشت خودکار موجودی:</span>
                      </div>
                      <ul className="list-disc pr-5 space-y-1 text-[11px]">
                        {rollbackPreview.blockingErrors.map((errMsg, idx) => (
                          <li key={idx}>{errMsg}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Summary metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono tabular-nums">
                    <div className="p-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded">
                      <div className="text-[10px] font-sans text-[#666666]">دستورات تولید (اصلی+فرعی)</div>
                      <div className="text-sm font-bold text-[#bb0000] mt-0.5">
                        {toPersianDigits(rollbackPreview.mosToDelete.length)}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded">
                      <div className="text-[10px] font-sans text-[#666666]">اسناد مواد برگشتی به انبار</div>
                      <div className="text-sm font-bold text-[#107e3e] mt-0.5">
                        {toPersianDigits(rollbackPreview.materialsToReturn.length)}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded">
                      <div className="text-[10px] font-sans text-[#666666]">رسیدهای محصول کسری</div>
                      <div className="text-sm font-bold text-[#e9730c] mt-0.5">
                        {toPersianDigits(rollbackPreview.outputsToDeduct.length)}
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded">
                      <div className="text-[10px] font-sans text-[#666666]">حواله‌ها / رزرو / کاردکس</div>
                      <div className="text-sm font-bold text-[#333333] mt-0.5">
                        {toPersianDigits(
                          rollbackPreview.wipTransfersCount +
                            rollbackPreview.productionLogsCount +
                            rollbackPreview.reservationsCount +
                            rollbackPreview.kardexTransactionsCount,
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MOs to Delete */}
                  <div className="border border-[#e5e5e5] rounded overflow-hidden">
                    <div className="px-3 py-1.5 bg-[#f5f5f5] border-b border-[#e5e5e5] font-bold text-[#333333]">
                      ۱. دستورات تولید قابل حذف (اصلی و زیرمجموعه‌های فرعی):
                    </div>
                    <div className="divide-y divide-[#eeeeee] max-h-40 overflow-y-auto">
                      {rollbackPreview.mosToDelete.map(m => (
                        <div key={m.id} className="px-3 py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-[#007cc0]">{m.moNumber}</span>
                            {m.isSubMo && (
                              <span className="px-1.5 py-0.5 rounded bg-[#fff4e5] text-[#b85a00] border border-[#f9d6a7] text-[10px] font-semibold">
                                زیرمجموعه فرعی
                              </span>
                            )}
                            <span className="truncate text-[#333333]">
                              {m.partName} ({m.partCode})
                            </span>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-[#666666] whitespace-nowrap">
                            تیراژ: {formatNumber(m.targetQuantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Materials returning to warehouse */}
                  {rollbackPreview.materialsToReturn.length > 0 && (
                    <div className="border border-[#b7dfc4] rounded overflow-hidden">
                      <div className="px-3 py-1.5 bg-[#f1f8f3] border-b border-[#b7dfc4] font-bold text-[#107e3e]">
                        ۲. مواد اولیه و کلاف‌های برگشتی به انبار:
                      </div>
                      <div className="divide-y divide-[#e8f3ec] max-h-36 overflow-y-auto">
                        {rollbackPreview.materialsToReturn.map((mat, i) => (
                          <div key={`${mat.documentId}-${i}`} className="px-3 py-1.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-[#333333]">{mat.partName}</span>{' '}
                              <span className="font-mono text-[10px] text-[#666666]">
                                ({mat.partCode} • سند {mat.documentNumber})
                              </span>
                              <div className="text-[10px] text-[#666666]">
                                بازگشت به: {mat.warehouseName}
                                {mat.lotNumber ? ` • لات: ${mat.lotNumber}` : ''}
                              </div>
                            </div>
                            <span className="font-mono tabular-nums font-bold text-[#107e3e] whitespace-nowrap">
                              +{formatNumber(mat.quantity)} {mat.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Produced outputs to deduct */}
                  {rollbackPreview.outputsToDeduct.length > 0 && (
                    <div className="border border-[#f9d6a7] rounded overflow-hidden">
                      <div className="px-3 py-1.5 bg-[#fff8ed] border-b border-[#f9d6a7] font-bold text-[#b85a00]">
                        ۳. محصولات رسیدشده قابل کسر از انبار:
                      </div>
                      <div className="divide-y divide-[#fbe8cc] max-h-36 overflow-y-auto">
                        {rollbackPreview.outputsToDeduct.map((out, i) => (
                          <div key={`${out.documentId}-${i}`} className="px-3 py-1.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-[#333333]">{out.partName}</span>{' '}
                              <span className="font-mono text-[10px] text-[#666666]">
                                ({out.partCode} • سند {out.documentNumber})
                              </span>
                              <div className="text-[10px] text-[#666666]">
                                انبار: {out.warehouseName} • قابل کسر: {formatNumber(out.availableAfterIssueReturn)}
                                {out.shortage > 0 && (
                                  <span className="text-[#bb0000] font-bold">
                                    {' '}
                                    • کسری: {formatNumber(out.shortage)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="font-mono tabular-nums font-bold text-[#bb0000] whitespace-nowrap">
                              -{formatNumber(out.quantity)} {out.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audit Reason Input */}
                  <form id="mo-rollback-delete-form" onSubmit={handleConfirmMoDeleteRollback} className="space-y-1.5">
                    <label className="block font-bold text-[#333333]">
                      دلیل حذف دستور تولید و ابطال اسناد انبار (ثبت در لاگ ممیزی) <span className="text-[#bb0000]">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={rollbackReason}
                      onChange={e => setRollbackReason(e.target.value)}
                      placeholder="مثال: اشتباه در تیراژ ابلاغی یا لغو برنامه برش توسط مشتری..."
                      className="w-full bg-white border border-[#bfbfbf] rounded px-3 py-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    />
                  </form>
                </>
              ) : null}

              {rollbackError && (
                <div className="p-2.5 rounded bg-[#fde8e8] border border-[#f5b8b8] text-[#bb0000] text-xs font-semibold">
                  {rollbackError}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-[#e5e5e5] bg-[#fafafa] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={rollbackSubmitting}
                onClick={() => setRollbackModalTarget(null)}
                className="sap-btn-standard text-xs px-3.5 py-1.5 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                form="mo-rollback-delete-form"
                disabled={
                  rollbackLoading ||
                  rollbackSubmitting ||
                  !rollbackPreview?.canRollback ||
                  rollbackReason.trim().length < 3
                }
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#bb0000] hover:bg-[#990000] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {rollbackSubmitting
                    ? 'در حال حذف و بازگشت موجودی...'
                    : 'تأیید نهایی حذف و بازگشت کامل موجودی به قبل'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
