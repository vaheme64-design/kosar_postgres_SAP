import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  FileCheck,
  Layers,
  Plus,
  Filter,
  Search,
  Calculator,
  Clock,
  FileText,
  Package,
  ChevronDown,
} from 'lucide-react';
import { Part } from '../../types/inventory';
import { formatNumber, toPersianDigits } from '../../utils/formatters';

export type WizardScenarioId =
  | 'PART_LIFECYCLE_PRODUCTION'
  | 'PROD_ORDER'
  | 'COIL_SLITTING'
  | 'QM_UD'
  | 'MATERIAL_SHORTAGE'
  | 'SUB_ASSEMBLY_PARALLEL'
  | 'CAPACITY_REROUTE'
  | 'SAFETY_STOCK'
  | 'OEE_SCRAP_RECOVERY'
  | 'ECO_REVISION_CONTROL'
  | 'SUBCONTRACT_OUTSIDE_PROC'
  | 'KPI_EXEC_CONTROL_TOWER';

interface ScenarioNavTarget {
  tab: string;
  subTab?: string;
  docQuery?: string;
  moId?: string;
  label: string;
}

interface ScenarioCatalogItem {
  id: WizardScenarioId;
  code: string;
  title: string;
  subtitle: string;
  category: string;
  sapFlow: string;
  defaultActionLabel: string;
  detailedFlow?: string[];
  linkedKpis?: string[];
  defaultNavTarget?: { tab: string; subTab?: string };
}

interface ScenarioStepEvaluation {
  stepNumber: number;
  title: string;
  sapCode: string;
  moduleName: string;
  status: 'READY' | 'WARNING' | 'BLOCKED' | 'EXECUTED';
  summary: string;
  metrics: Array<{ label: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }>;
  navTarget: ScenarioNavTarget;
  secondaryNavTargets?: ScenarioNavTarget[];
}

interface EvaluationResult {
  scenario: ScenarioCatalogItem;
  evaluatedAt: string;
  requestedPartQuery?: string;
  partExists: boolean;
  selectedPart: { id: string; code: string; name: string; unit: string; materialGrade?: string; minStock: number } | null;
  selectedCoil: { id: string; coilId: string; materialGrade: string; thicknessMm: number; remainingWeightKg: number; heatNumber: string; qualityStatus: string } | null;
  selectedQuantity: number;
  summary: string;
  canExecute: boolean;
  blockingReason?: string;
  proposalPreview?: {
    netToProduce: number;
    requiredCoilKg: number;
    estimatedMachineHours: number;
    routingStepsCount: number;
    bomComponentsCount: number;
    primaryMachineName?: string;
  };
  steps: ScenarioStepEvaluation[];
}

interface ExecuteResult {
  success: boolean;
  scenarioId: WizardScenarioId;
  message: string;
  generatedDocs: {
    orderNumber?: string;
    proposalId?: string;
    proposalNumber?: string;
    planNumber?: string;
    moNumbers?: string[];
    moIds?: string[];
    prNumbers?: string[];
    inventoryDocNumber?: string;
  };
  evaluation: EvaluationResult;
}

interface MrpFeasibilityMaterialRow {
  partId: string;
  partCode: string;
  partName: string;
  categoryLabel: string;
  unit: string;
  materialGrade?: string;
  bomQtyPerUnit: number;
  scrapPercent: number;
  requiredGrossQty: number;
  requiredNetQty: number;
  availableStockQty: number;
  availableCoilKg: number;
  committedToOpenMosQty: number;
  freeForProposedMoQty: number;
  shortageGrossQty: number;
  shortageNetQty: number;
  minSafetyStock: number;
  projectedBalanceAfterMo: number;
  leadTimeDays: number;
  coveragePercent: number;
  status: 'SUFFICIENT' | 'TIGHT' | 'SHORTAGE' | 'MISSING_MASTER';
}

interface MrpFeasibilityContractItem {
  id: string;
  contractNumber: string;
  title: string;
  customerName: string;
  materialGrade: string;
  allocatedWeightKg: number;
  totalReceivedKg: number;
  totalConsumedKg: number;
  remainingQuotaKg: number;
  status: string;
  endDate: string;
}

interface MrpFeasibilityResult {
  evaluatedAt: string;
  partExists: boolean;
  requestedPartQuery?: string;
  proposedQty: number;
  netToManufactureQty: number;
  deductExistingFgAndWip: boolean;
  feasibilityStatus: 'FEASIBLE_IMMEDIATE' | 'FEASIBLE_WITH_WARNINGS' | 'BLOCKED_SHORTAGE' | 'PART_NOT_FOUND';
  canCreateMoSafely: boolean;
  summaryFa: string;
  selectedPart: {
    id: string;
    code: string;
    name: string;
    category: string;
    unit: string;
    materialGrade?: string;
    thicknessMm?: number;
    weightPerUnitKg: number;
    minStock: number;
    leadTimeDays: number;
    hasBom: boolean;
    hasRouting: boolean;
  } | null;
  stockSnapshot: {
    finishedGoodsAvailable: number;
    finishedGoodsReserved: number;
    wipActiveQty: number;
    wipWarehouseQty: number;
    qcHeldQty: number;
    openCustomerDemandQty: number;
    matchingCoilKg: number;
    blockedCoilKg: number;
  };
  openContracts: MrpFeasibilityContractItem[];
  competingOrders: Array<{
    orderNumber: string;
    customerName: string;
    openQty: number;
    dueDate: string;
    status: string;
  }>;
  materialRequirements: MrpFeasibilityMaterialRow[];
  scheduleProjection: {
    partManufacturingLeadTimeDays: number;
    criticalMaterialLeadTimeDays: number;
    estimatedProductionHours: number;
    estimatedProductionDays: number;
    totalCumulativeLeadTimeDays: number;
    earliestFeasibleDateIso: string;
    earliestFeasibleDateFa: string;
    targetDueDateIso?: string;
    daysSlackOrDelay?: number;
  };
  warnings: Array<{ severity: 'CRITICAL' | 'WARNING' | 'INFO'; title: string; detail: string }>;
}

interface CatalogSearchPartItem {
  id: string;
  code: string;
  name: string;
  category: string;
  sapcoCode?: string;
  materialGrade?: string;
  carModel?: string;
  leadTimeDays?: number;
  availableQty: number;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizeSearchQuery(raw: string): string {
  let out = '';
  const trimmed = String(raw || '').trim();
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const pIdx = PERSIAN_DIGITS.indexOf(ch);
    if (pIdx !== -1) {
      out += String(pIdx);
      continue;
    }
    const aIdx = ARABIC_DIGITS.indexOf(ch);
    if (aIdx !== -1) {
      out += String(aIdx);
      continue;
    }
    if (ch === 'ي') {
      out += 'ی';
    } else if (ch === 'ك') {
      out += 'ک';
    } else if (ch === '\u200c') {
      out += ' ';
    } else {
      out += ch;
    }
  }
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

const CATEGORY_FA_LABEL: Record<string, string> = {
  FINISHED_GOOD: 'محصول نهایی',
  WIP_PART: 'نیمه‌ساخته',
  SUB_ASSEMBLY: 'زیرمجموعه',
  RAW_MATERIAL: 'مواد اولیه/کلاف',
};

interface PartSearchComboboxProps {
  items: CatalogSearchPartItem[];
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  label: string;
}

const PartSearchCombobox: React.FC<PartSearchComboboxProps> = ({
  items,
  value,
  onChange,
  placeholder,
  label,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const normValue = normalizeSearchQuery(value);

  const exactMatchedPart = useMemo(() => {
    if (!normValue) return null;
    return (
      items.find(
        p =>
          normalizeSearchQuery(p.code) === normValue ||
          normalizeSearchQuery(p.name) === normValue ||
          (p.sapcoCode && normalizeSearchQuery(p.sapcoCode) === normValue),
      ) || null
    );
  }, [items, normValue]);

  const { filtered, totalMatches } = useMemo(() => {
    if (!normValue) {
      return { filtered: items.slice(0, 60), totalMatches: items.length };
    }
    const exactOrPrefix: CatalogSearchPartItem[] = [];
    const containsList: CatalogSearchPartItem[] = [];
    for (const p of items) {
      const nCode = normalizeSearchQuery(p.code);
      const nName = normalizeSearchQuery(p.name);
      const nSapco = p.sapcoCode ? normalizeSearchQuery(p.sapcoCode) : '';
      const nGrade = p.materialGrade ? normalizeSearchQuery(p.materialGrade) : '';
      const nCar = p.carModel ? normalizeSearchQuery(p.carModel) : '';

      if (nCode.startsWith(normValue) || nName.startsWith(normValue) || (nSapco && nSapco.startsWith(normValue))) {
        exactOrPrefix.push(p);
      } else if (
        nCode.includes(normValue) ||
        nName.includes(normValue) ||
        (nSapco && nSapco.includes(normValue)) ||
        (nGrade && nGrade.includes(normValue)) ||
        (nCar && nCar.includes(normValue))
      ) {
        containsList.push(p);
      }
    }
    const combined = [...exactOrPrefix, ...containsList];
    return {
      filtered: combined.slice(0, 60),
      totalMatches: combined.length,
    };
  }, [items, normValue]);

  return (
    <div ref={containerRef} className="space-y-1 relative">
      <div className="flex items-center justify-between gap-2">
        <label className="font-semibold text-[#333333] block">{label}</label>
        <span className="text-[10px] text-[#666666] font-mono tabular-nums">
          {toPersianDigits(items.length)} قلم کاتالوگ
        </span>
      </div>
      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 pointer-events-none" />
        <input
          type="text"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={e => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          placeholder={placeholder || 'جستجو با کد، نام قطعه، ساپکو یا تایپ نام جدید...'}
          className="w-full bg-white border border-[#bfbfbf] rounded pr-8 pl-12 py-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
        />
        <div className="absolute left-1.5 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(true);
              }}
              className="p-1 text-[#777777] hover:text-[#333333] cursor-pointer"
              title="پاک کردن"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="p-1 text-[#666666] hover:text-[#333333] cursor-pointer"
            title="نمایش فهرست"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Inline existence cue */}
      <div className="min-h-[16px] text-[10px] leading-tight">
        {exactMatchedPart ? (
          <span className="text-[#107e3e] font-medium">
            ✓ موجود در کاتالوگ: {exactMatchedPart.name} ({exactMatchedPart.code})
            {exactMatchedPart.availableQty > 0 ? ` · موجودی ${formatNumber(exactMatchedPart.availableQty)}` : ''}
          </span>
        ) : normValue ? (
          <span className="text-[#e9730c] font-medium">
            {totalMatches > 0
              ? `در حال جستجو (${toPersianDigits(totalMatches)} مورد مشابه) — یا ثبت با نام دلخواه «${value.trim()}»`
              : `«${value.trim()}» در کاتالوگ نیست — سناریوی تعریف قطعه جدید فعال می‌شود`}
          </span>
        ) : (
          <span className="text-[#666666]">
            جستجوی زنده بین {toPersianDigits(items.length)} قطعه کاتالوگ یا تایپ آزاد نام قطعه جدید
          </span>
        )}
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#bfbfbf] rounded shadow-xl max-h-72 overflow-y-auto">
          {normValue && !exactMatchedPart && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-right px-3 py-2 bg-[#fff4e5] hover:bg-[#ffe8c7] border-b border-[#f9d6a7] text-[11px] flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="font-semibold text-[#b85a00]">
                استفاده از عبارت دلخواه «{value.trim()}» ({totalMatches === 0 ? 'تعریف قطعه جدید' : 'تایید'})
              </span>
              <span className="text-[10px] text-[#666666] shrink-0">ادامه ↵</span>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-[#666666]">
              موردی با عبارت «{value}» در کاتالوگ یافت نشد — با ادامه ارزیابی می‌توانید این قطعه را تعریف کنید.
            </div>
          ) : (
            filtered.map(p => {
              const isSelected = normalizeSearchQuery(p.code) === normValue;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.code);
                    setOpen(false);
                  }}
                  className={`w-full text-right px-3 py-2 text-xs border-b border-[#f0f0f0] last:border-b-0 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#e5f3fa] text-[#007cc0] font-semibold' : 'hover:bg-[#f7f7f7] text-[#333333]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[10px] text-[#666666] font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span>{p.code}</span>
                      {p.sapcoCode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>ساپکو: {p.sapcoCode}</span>
                        </>
                      )}
                      {p.materialGrade && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{p.materialGrade}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{CATEGORY_FA_LABEL[p.category] || p.category}</span>
                    </div>
                  </div>
                  <div className="text-left shrink-0 text-[10px] font-mono tabular-nums">
                    <div className={p.availableQty > 0 ? 'text-[#107e3e] font-bold' : 'text-[#888888]'}>
                      {formatNumber(p.availableQty)}
                    </div>
                    {p.leadTimeDays !== undefined && p.leadTimeDays > 0 && (
                      <div className="text-[#666666]">{toPersianDigits(p.leadTimeDays)} روز</div>
                    )}
                  </div>
                </button>
              );
            })
          )}

          {totalMatches > filtered.length && (
            <div className="px-3 py-1.5 bg-[#f7f7f7] border-t border-[#e5e5e5] text-[10px] text-[#666666] text-center font-mono tabular-nums">
              نمایش {toPersianDigits(filtered.length)} از {toPersianDigits(totalMatches)} مورد — برای محدودسازی عبارت دقیق‌تری تایپ کنید
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AdvancedIndustrialScenarioWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  parts: Part[];
  onNavigate: (
    tab: any,
    subTab?: any,
    actionModal?: any,
    docQuery?: string | null,
    moId?: string | null,
  ) => void;
  onGlobalRefresh?: () => Promise<void>;
  initialScenarioId?: WizardScenarioId;
  initialPartQuery?: string;
  initialQty?: number;
  autoEvaluate?: boolean;
}

export const AdvancedIndustrialScenarioWizardModal: React.FC<AdvancedIndustrialScenarioWizardModalProps> = ({
  isOpen,
  onClose,
  parts,
  onNavigate,
  onGlobalRefresh,
  initialScenarioId,
  initialPartQuery,
  initialQty,
  autoEvaluate,
}) => {
  const [activeMode, setActiveMode] = useState<'WIZARD' | 'MRP_SIMULATOR'>('WIZARD');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [catalog, setCatalog] = useState<ScenarioCatalogItem[]>([]);
  const [selectorParts, setSelectorParts] = useState<Array<{ id: string; code: string; name: string; availableQty: number; materialGrade: string }>>([]);
  const [selectorCoils, setSelectorCoils] = useState<Array<{ id: string; coilId: string; materialGrade: string; remainingWeightKg: number; qualityStatus: string; heatNumber: string }>>([]);
  const [selectorMachines, setSelectorMachines] = useState<Array<{ id: string; code: string; name: string; tonnage: number; status: string; workloadHours: number }>>([]);
  const [qcBlockedCount, setQcBlockedCount] = useState(0);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedScenario, setSelectedScenario] = useState<WizardScenarioId>(
    initialScenarioId || 'PART_LIFECYCLE_PRODUCTION',
  );
  const [targetPartQuery, setTargetPartQuery] = useState(initialPartQuery || '');
  const [targetCoilId, setTargetCoilId] = useState('');
  const [targetMachineId, setTargetMachineId] = useState('');
  const [targetQty, setTargetQty] = useState<number>(initialQty || 5000);

  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadingEval, setLoadingEval] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecuteResult | null>(null);

  // MRP Feasibility Simulator state
  const [simPartQuery, setSimPartQuery] = useState(initialPartQuery || '');
  const [simQty, setSimQty] = useState<number>(initialQty || 5000);
  const [simTargetDueDate, setSimTargetDueDate] = useState<string>('');
  const [simDeductExisting, setSimDeductExisting] = useState<boolean>(true);
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<MrpFeasibilityResult | null>(null);

  const evaluateScenarioWithParams = useCallback(
    async (
      scenId: WizardScenarioId,
      partQueryValue: string,
      qtyValue: number,
      coilIdValue?: string,
      machineIdValue?: string,
    ) => {
      setLoadingEval(true);
      setErrorBanner(null);
      try {
        const res = await fetch('/api/scenarios/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scenarioId: scenId,
            partIdOrCode: partQueryValue.trim() || undefined,
            coilId: coilIdValue || undefined,
            machineId: machineIdValue || undefined,
            quantity: qtyValue,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'خطا در تحلیل زنده سناریو');
        }
        setEvaluation(json.data);
        setStep(2);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'خطا در ارزیابی سناریو');
      } finally {
        setLoadingEval(false);
      }
    },
    [],
  );

  const runMrpFeasibilitySimulation = useCallback(
    async (
      partQueryValue: string,
      qtyValue: number,
      dueDateValue: string,
      deductExistingValue: boolean,
    ) => {
      setSimLoading(true);
      setErrorBanner(null);
      try {
        const res = await fetch('/api/scenarios/mrp-feasibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partIdOrCode: partQueryValue.trim() || undefined,
            proposedQty: Math.max(1, Number(qtyValue) || 1),
            targetDueDate: dueDateValue.trim() || undefined,
            deductExistingFgAndWip: deductExistingValue,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'خطا در اجرای شبیه‌ساز امکان‌سنجی MRP');
        }
        setSimResult(json.data);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'خطا در شبیه‌سازی MRP');
      } finally {
        setSimLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isOpen) return;

    const nextScenario: WizardScenarioId = initialScenarioId || 'PART_LIFECYCLE_PRODUCTION';
    const nextQty =
      typeof initialQty === 'number' && initialQty > 0
        ? initialQty
        : nextScenario === 'PART_LIFECYCLE_PRODUCTION'
        ? 5000
        : 500;
    const nextPart = typeof initialPartQuery === 'string' ? initialPartQuery : '';

    setErrorBanner(null);
    setEvaluation(null);
    setExecutionResult(null);
    setSimResult(null);
    setActiveMode('WIZARD');
    setSelectedCategory('ALL');
    setSelectedScenario(nextScenario);
    setTargetQty(nextQty);
    setSimQty(nextQty);
    setStep(1);
    setLoadingCatalog(true);

    fetch('/api/scenarios/catalog')
      .then(async res => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'خطا در بارگذاری کاتالوگ سناریوها');
        }
        const data = json.data;
        setCatalog(data.catalog || []);
        setSelectorParts(data.finishedParts || []);
        setSelectorCoils(data.coils || []);
        setSelectorMachines(data.machines || []);
        setQcBlockedCount(Number(data.qcBlockedCount || 0));

        let resolvedPart = nextPart;
        if (!resolvedPart && data.finishedParts?.length > 0) {
          const preferred =
            data.finishedParts.find((p: any) => p.code === 'SAPCO-ASY-ECU-BRK-01') ||
            data.finishedParts[0];
          resolvedPart = preferred.code;
        }
        setTargetPartQuery(resolvedPart);
        setSimPartQuery(resolvedPart);

        let resolvedCoil = targetCoilId;
        if (!resolvedCoil && data.coils?.length > 0) {
          const availCoil =
            data.coils.find((c: any) => c.remainingWeightKg > 0 && c.qualityStatus === 'AVAILABLE') ||
            data.coils[0];
          resolvedCoil = availCoil.id;
          setTargetCoilId(resolvedCoil);
        }

        let resolvedMachine = targetMachineId;
        if (!resolvedMachine && data.machines?.length > 0) {
          const activeMachine = data.machines.find((m: any) => m.status === 'ACTIVE') || data.machines[0];
          resolvedMachine = activeMachine.id;
          setTargetMachineId(resolvedMachine);
        }

        if (autoEvaluate) {
          await evaluateScenarioWithParams(
            nextScenario,
            resolvedPart,
            nextQty,
            resolvedCoil,
            resolvedMachine,
          );
        }
      })
      .catch(err => {
        setErrorBanner(err instanceof Error ? err.message : 'خطا در دریافت کاتالوگ سناریوها');
      })
      .finally(() => setLoadingCatalog(false));
  }, [isOpen, initialScenarioId, initialPartQuery, initialQty, autoEvaluate, evaluateScenarioWithParams]);

  // Merge all catalog parts (1,461+ supported) with selectorParts live balances in O(N + M)
  const partOptions = useMemo<CatalogSearchPartItem[]>(() => {
    const qtyByCode = new Map<string, number>();
    const qtyById = new Map<string, number>();
    for (const sp of selectorParts) {
      qtyByCode.set(sp.code.toUpperCase(), sp.availableQty || 0);
      qtyById.set(sp.id, sp.availableQty || 0);
    }
    const merged: CatalogSearchPartItem[] = [];
    const seenCodes = new Set<string>();

    const categoryRank: Record<string, number> = {
      FINISHED_GOOD: 0,
      WIP_PART: 1,
      SUB_ASSEMBLY: 2,
      RAW_MATERIAL: 3,
    };

    for (const p of parts) {
      const upper = p.code.toUpperCase();
      seenCodes.add(upper);
      merged.push({
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        sapcoCode: p.sapcoCode,
        materialGrade: p.materialGrade,
        carModel: p.carModel,
        leadTimeDays: p.leadTimeDays,
        availableQty: qtyById.get(p.id) ?? qtyByCode.get(upper) ?? 0,
      });
    }

    for (const sp of selectorParts) {
      const upper = sp.code.toUpperCase();
      if (!seenCodes.has(upper)) {
        merged.push({
          id: sp.id,
          code: sp.code,
          name: sp.name,
          category: 'FINISHED_GOOD',
          materialGrade: sp.materialGrade,
          availableQty: sp.availableQty || 0,
        });
      }
    }

    merged.sort((a, b) => (categoryRank[a.category] ?? 9) - (categoryRank[b.category] ?? 9));
    return merged;
  }, [parts, selectorParts]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    catalog.forEach(c => unique.add(c.category));
    return ['ALL', ...Array.from(unique)];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (selectedCategory === 'ALL') return catalog;
    return catalog.filter(c => c.category === selectedCategory);
  }, [catalog, selectedCategory]);

  if (!isOpen) return null;

  const activeCatalogItem = catalog.find(c => c.id === selectedScenario) || null;

  const handleSelectScenario = (id: WizardScenarioId) => {
    setSelectedScenario(id);
    if (id === 'PART_LIFECYCLE_PRODUCTION' && targetQty === 500) {
      setTargetQty(5000);
    }
  };

  const runScenarioAnalysis = async () => {
    await evaluateScenarioWithParams(
      selectedScenario,
      targetPartQuery,
      targetQty,
      targetCoilId,
      targetMachineId,
    );
  };

  const handleExecuteScenario = async () => {
    setExecuting(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/scenarios/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: selectedScenario,
          partIdOrCode: targetPartQuery.trim() || undefined,
          coilId: targetCoilId || undefined,
          machineId: targetMachineId || undefined,
          quantity: targetQty,
          userName: 'مدیر برنامه‌ریزی و سیستم',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'خطا در اجرای سناریو و صدور اسناد');
      }
      const payload: ExecuteResult = json.data || json;
      setExecutionResult(payload);
      if (payload.evaluation) {
        setEvaluation(payload.evaluation);
      }
      if (onGlobalRefresh) {
        await onGlobalRefresh();
      }
      setStep(3);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'خطا در اجرای سناریو');
    } finally {
      setExecuting(false);
    }
  };

  const navigateAndClose = (target: ScenarioNavTarget) => {
    onClose();
    onNavigate(
      target.tab,
      target.subTab,
      undefined,
      target.docQuery ?? null,
      target.moId ?? null,
    );
  };

  const renderStepStatusLabel = (status: ScenarioStepEvaluation['status']) => {
    if (status === 'BLOCKED') {
      return (
        <span className="text-[11px] font-bold text-[#bb0000]">
          مسدود (نیازمند تکمیل داده)
        </span>
      );
    }
    if (status === 'WARNING') {
      return (
        <span className="text-[11px] font-bold text-[#e9730c]">
          هشدار فرآیندی
        </span>
      );
    }
    return (
      <span className="text-[11px] font-bold text-[#107e3e]">
        آماده اجرا ✓
      </span>
    );
  };

  const toneClass = (tone?: 'neutral' | 'good' | 'warn' | 'bad') => {
    if (tone === 'good') return 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]';
    if (tone === 'warn') return 'bg-[#fff4e5] border-[#f9d6a7] text-[#e9730c]';
    if (tone === 'bad') return 'bg-[#fde8e8] border-[#f5b8b8] text-[#bb0000]';
    return 'bg-[#f5f5f5] border-[#d9d9d9] text-[#333333]';
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/50 backdrop-blur-[1px] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-6xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#d9d9d9] shrink-0">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-[#007cc0]" />
            <div>
              <h3 className="text-sm font-bold text-[#333333]">
                جادوگر یکپارچه ۱۲ سناریوی صنعتی برنامه‌ریزی تولید و کنترل موجودی
              </h3>
              <p className="text-[11px] text-[#666666]">
                واکاوی زنده کاتالوگ قطعات، قراردادها، BOM، مسیر عملیات، موجودی چندمرحله‌ای، شاخص‌های KPI و صدور دستور کار (MO)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#666666] hover:text-[#333333] p-1.5 rounded hover:bg-[#f5f5f5] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Mode Tabs */}
        <div className="px-5 pt-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] shrink-0 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveMode('WIZARD')}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'WIZARD'
                  ? 'border-[#007cc0] text-[#007cc0] bg-white rounded-t'
                  : 'border-transparent text-[#666666] hover:text-[#333333]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>جادوگر ۱۲ سناریوی عملیاتی</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveMode('MRP_SIMULATOR');
                if (!simResult && (simPartQuery || targetPartQuery)) {
                  const p = simPartQuery || targetPartQuery;
                  const q = simQty || targetQty || 5000;
                  setSimPartQuery(p);
                  setSimQty(q);
                  void runMrpFeasibilitySimulation(p, q, simTargetDueDate, simDeductExisting);
                }
              }}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeMode === 'MRP_SIMULATOR'
                  ? 'border-[#007cc0] text-[#007cc0] bg-white rounded-t'
                  : 'border-transparent text-[#666666] hover:text-[#333333]'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>شبیه‌ساز امکان‌سنجی MRP (پیش از صدور MO)</span>
            </button>
          </div>

          {activeMode === 'WIZARD' && (
            <div className="pb-1.5 flex items-center gap-2 text-[11px] font-semibold flex-wrap">
              <div className={`flex items-center gap-1 ${step === 1 ? 'text-[#007cc0]' : 'text-[#107e3e]'}`}>
                <span className="w-4 h-4 rounded-full bg-current text-white flex items-center justify-center text-[10px] tabular-nums">۱</span>
                <span>انتخاب سناریو و قطعه</span>
              </div>
              <span className="text-[#bfbfbf]">/</span>
              <div className={`flex items-center gap-1 ${step === 2 ? 'text-[#007cc0]' : step > 2 ? 'text-[#107e3e]' : 'text-[#666666]'}`}>
                <span className="w-4 h-4 rounded-full bg-current text-white flex items-center justify-center text-[10px] tabular-nums">۲</span>
                <span>ممیزی زنده مراحل</span>
              </div>
              <span className="text-[#bfbfbf]">/</span>
              <div className={`flex items-center gap-1 ${step === 3 ? 'text-[#107e3e]' : 'text-[#666666]'}`}>
                <span className="w-4 h-4 rounded-full bg-current text-white flex items-center justify-center text-[10px] tabular-nums">۳</span>
                <span>تأیید و صدور MO</span>
              </div>
            </div>
          )}
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="mx-5 mt-3 p-3 rounded bg-[#fde8e8] border border-[#f5b8b8] text-[#bb0000] text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button type="button" onClick={() => setErrorBanner(null)} className="font-bold cursor-pointer">
              بستن
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#333333] flex-1">
          {activeMode === 'MRP_SIMULATOR' ? (
            <div className="space-y-4">
              {/* Simulator Parameter Panel */}
              <div className="p-4 rounded border border-[#b3ddf2] bg-[#f7fbfe] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#007cc0] text-xs flex items-center gap-1.5">
                      <Calculator className="w-4 h-4" />
                      <span>شبیه‌ساز امکان‌سنجی MRP پیش از صدور دستور کار ساخت (MO Feasibility Simulator)</span>
                    </div>
                    <p className="text-[11px] text-[#555555] mt-0.5">
                      تطبیق همزمان تیراژ پیشنهادی با موجودی محصول نهایی، WIP، کلاف‌های ورق، قراردادهای باز ساپکو، تعهدات سایر سفارش‌ها و زمان تدارک (Lead Time)
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSimPartQuery('SAPCO-ASY-ECU-BRK-01');
                        setSimQty(5000);
                        void runMrpFeasibilitySimulation('SAPCO-ASY-ECU-BRK-01', 5000, simTargetDueDate, simDeductExisting);
                      }}
                      className="px-2.5 py-1 rounded bg-white border border-[#b3ddf2] text-[#007cc0] hover:bg-[#e5f3fa] text-[11px] font-semibold cursor-pointer"
                    >
                      تست ۵۰۰۰ عددی براکت ECU
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const q = simPartQuery || targetPartQuery || 'SAPCO-ASY-ECU-BRK-01';
                        setSimPartQuery(q);
                        setSimQty(50000);
                        void runMrpFeasibilitySimulation(q, 50000, simTargetDueDate, simDeductExisting);
                      }}
                      className="px-2.5 py-1 rounded bg-white border border-[#f9d6a7] text-[#e9730c] hover:bg-[#fff4e5] text-[11px] font-semibold cursor-pointer"
                    >
                      تست استرس کسری متریال (۵۰٬۰۰۰ عدد)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                  <div className="lg:col-span-2">
                    <PartSearchCombobox
                      items={partOptions}
                      value={simPartQuery}
                      onChange={val => setSimPartQuery(val)}
                      label="انتخاب قطعه هدف برای شبیه‌سازی MRP:"
                      placeholder="جستجو در تمام قطعات کاتالوگ (کد، نام، ساپکو، گرید)..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#333333] block">تیراژ پیشنهادی دستور کار (عدد):</label>
                    <input
                      type="number"
                      min="1"
                      value={simQty}
                      onChange={e => setSimQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-2 text-xs font-mono tabular-nums text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#333333] block">تاریخ تحویل هدف (میلادی - اختیاری):</label>
                    <input
                      type="date"
                      value={simTargetDueDate}
                      onChange={e => setSimTargetDueDate(e.target.value)}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-2 text-xs font-mono text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#dceef8]">
                  <label className="inline-flex items-center gap-2 text-xs text-[#333333] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={simDeductExisting}
                      onChange={e => setSimDeductExisting(e.target.checked)}
                      className="rounded border-[#bfbfbf] text-[#007cc0] focus:ring-0"
                    />
                    <span>کسر موجودی آزاد محصول نهایی (FG) و کار در جریان (WIP) از خالص نیاز تولید (MRP Netting)</span>
                  </label>

                  <button
                    type="button"
                    disabled={simLoading}
                    onClick={() =>
                      runMrpFeasibilitySimulation(
                        simPartQuery,
                        simQty,
                        simTargetDueDate,
                        simDeductExisting,
                      )
                    }
                    className="sap-btn-emphasized px-4 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${simLoading ? 'animate-spin' : ''}`} />
                    <span>{simLoading ? 'در حال شبیه‌سازی موجودی و متریال...' : 'اجرای شبیه‌ساز امکان‌سنجی MRP'}</span>
                  </button>
                </div>
              </div>

              {simLoading && !simResult && (
                <div className="p-8 text-center text-[#666666] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#007cc0]" />
                  <span>در حال انفجار BOM، بررسی کلاف‌های ورق، قراردادهای باز و Lead Time...</span>
                </div>
              )}

              {simResult && (
                <div className="space-y-4">
                  {/* Feasibility Verdict Banner */}
                  <div
                    className={`p-4 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      simResult.feasibilityStatus === 'FEASIBLE_IMMEDIATE'
                        ? 'bg-[#ebf5ec] border-[#b7dfbf]'
                        : simResult.feasibilityStatus === 'FEASIBLE_WITH_WARNINGS'
                        ? 'bg-[#fff4e5] border-[#f9d6a7]'
                        : 'bg-[#fde8e8] border-[#f5b8b8]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {simResult.feasibilityStatus === 'FEASIBLE_IMMEDIATE' ? (
                        <CheckCircle2 className="w-5 h-5 text-[#107e3e] shrink-0 mt-0.5" />
                      ) : simResult.feasibilityStatus === 'FEASIBLE_WITH_WARNINGS' ? (
                        <AlertTriangle className="w-5 h-5 text-[#e9730c] shrink-0 mt-0.5" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-[#bb0000] shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-1">
                        <div className="font-bold text-xs text-[#333333]">
                          {simResult.feasibilityStatus === 'FEASIBLE_IMMEDIATE'
                            ? 'امکان‌سنجی تایید شد — آماده صدور دستور کار (MO)'
                            : simResult.feasibilityStatus === 'FEASIBLE_WITH_WARNINGS'
                            ? 'قابل تولید با هشدارهای کنترلی پیش از صدور MO'
                            : simResult.feasibilityStatus === 'PART_NOT_FOUND'
                            ? 'قطعه در کاتالوگ یافت نشد'
                            : 'هشدار کسری متریال / محدودیت زمان‌بندی پیش از صدور MO'}
                        </div>
                        <p className="text-xs text-[#333333] leading-relaxed">{simResult.summaryFa}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {!simResult.partExists && simResult.requestedPartQuery && (
                        <button
                          type="button"
                          onClick={() =>
                            navigateAndClose({
                              tab: 'parts',
                              docQuery: simResult.requestedPartQuery,
                              label: 'تعریف قطعه',
                            })
                          }
                          className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>تعریف قطعه در کاتالوگ</span>
                        </button>
                      )}
                      {simResult.partExists && simResult.materialRequirements.some(r => r.status === 'SHORTAGE') && (
                        <button
                          type="button"
                          onClick={() =>
                            navigateAndClose({
                              tab: 'mrp',
                              docQuery: simResult.selectedPart?.code,
                              label: 'ثبت درخواست خرید MRP',
                            })
                          }
                          className="sap-btn-standard px-3 py-1.5 text-xs text-[#bb0000] border-[#f5b8b8] bg-white cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>جبران کسری در کارتابل MRP</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                      {simResult.partExists && !simResult.selectedPart?.hasRouting && (
                        <button
                          type="button"
                          onClick={() =>
                            navigateAndClose({
                              tab: 'master_data',
                              subTab: 'ROUTINGS',
                              docQuery: simResult.selectedPart?.code,
                              label: 'تعریف مسیر تولید',
                            })
                          }
                          className="sap-btn-standard px-3 py-1.5 text-xs text-[#e9730c] bg-white cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>تعریف مسیر عملیات (Routing)</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                      {simResult.partExists && simResult.selectedPart?.hasRouting && (
                        <button
                          type="button"
                          onClick={() => {
                            const code = simResult.selectedPart!.code;
                            setSelectedScenario('PART_LIFECYCLE_PRODUCTION');
                            setTargetPartQuery(code);
                            setTargetQty(simResult.proposedQty);
                            setActiveMode('WIZARD');
                            void evaluateScenarioWithParams(
                              'PART_LIFECYCLE_PRODUCTION',
                              code,
                              simResult.proposedQty,
                              targetCoilId,
                              targetMachineId,
                            );
                          }}
                          className="px-3 py-1.5 rounded bg-[#107e3e] hover:bg-[#0e6b35] text-white text-xs font-semibold cursor-pointer flex items-center gap-1 whitespace-nowrap"
                        >
                          <span>ادامه در جادوگر صدور MO</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {simResult.partExists && (
                    <>
                      {/* 6 Stock & Schedule Breakdown Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 tabular-nums">
                        <div className="sap-card p-3">
                          <div className="text-[10px] text-[#666666]">خالص تولید / تیراژ هدف</div>
                          <div className="font-mono font-bold text-sm text-[#007cc0] mt-1">
                            {formatNumber(simResult.netToManufactureQty)}
                          </div>
                          <div className="text-[10px] text-[#666666] font-mono">
                            از {formatNumber(simResult.proposedQty)} هدف
                          </div>
                        </div>

                        <div className="sap-card p-3">
                          <div className="text-[10px] text-[#666666]">محصول نهایی آزاد (FG)</div>
                          <div className="font-mono font-bold text-sm text-[#107e3e] mt-1">
                            {formatNumber(simResult.stockSnapshot.finishedGoodsAvailable)}
                          </div>
                          <div className="text-[10px] text-[#666666] font-mono">
                            رزرو: {formatNumber(simResult.stockSnapshot.finishedGoodsReserved)}
                          </div>
                        </div>

                        <div className="sap-card p-3">
                          <div className="text-[10px] text-[#666666]">در جریان ساخت (WIP)</div>
                          <div className="font-mono font-bold text-sm text-[#333333] mt-1">
                            {formatNumber(simResult.stockSnapshot.wipActiveQty + simResult.stockSnapshot.wipWarehouseQty)}
                          </div>
                          <div className="text-[10px] text-[#e9730c] font-mono">
                            قرنطینه QC: {formatNumber(simResult.stockSnapshot.qcHeldQty)}
                          </div>
                        </div>

                        <div className="sap-card p-3">
                          <div className="text-[10px] text-[#666666]">کلاف ورق متناظر ({simResult.selectedPart?.materialGrade || '—'})</div>
                          <div className="font-mono font-bold text-sm text-[#333333] mt-1">
                            {formatNumber(simResult.stockSnapshot.matchingCoilKg)} kg
                          </div>
                          <div className="text-[10px] text-[#bb0000] font-mono">
                            مسدود: {formatNumber(simResult.stockSnapshot.blockedCoilKg)} kg
                          </div>
                        </div>

                        <div className="sap-card p-3">
                          <div className="text-[10px] text-[#666666]">Lead Time تجمعی</div>
                          <div className="font-mono font-bold text-sm text-[#333333] mt-1">
                            {toPersianDigits(simResult.scheduleProjection.totalCumulativeLeadTimeDays)} روز
                          </div>
                          <div className="text-[10px] text-[#666666] font-mono">
                            متریال {toPersianDigits(simResult.scheduleProjection.criticalMaterialLeadTimeDays)} + ساخت {toPersianDigits(simResult.scheduleProjection.partManufacturingLeadTimeDays)}
                          </div>
                        </div>

                        <div className="sap-card p-3">
                          <div className="text-[10px] text-[#666666]">اولین تحویل ممکن</div>
                          <div className="font-mono font-bold text-sm text-[#007cc0] mt-1">
                            {simResult.scheduleProjection.earliestFeasibleDateFa}
                          </div>
                          <div className="text-[10px] text-[#666666] font-mono">
                            {toPersianDigits(simResult.scheduleProjection.estimatedProductionHours)} ساعت ماشین ({toPersianDigits(simResult.scheduleProjection.estimatedProductionDays)} روز)
                          </div>
                        </div>
                      </div>

                      {/* Pre-MO Warnings List */}
                      {simResult.warnings.length > 0 && (
                        <div className="sap-card p-3.5 space-y-2">
                          <div className="font-bold text-xs text-[#333333] flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-[#e9730c]" />
                            <span>تحلیل ریسک و گلوگاه‌های شناسایی‌شده پیش از صدور MO ({toPersianDigits(simResult.warnings.length)} مورد)</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {simResult.warnings.map((w, idx) => (
                              <div
                                key={idx}
                                className={`p-2.5 rounded border text-xs ${
                                  w.severity === 'CRITICAL'
                                    ? 'bg-[#fde8e8] border-[#f5b8b8] text-[#bb0000]'
                                    : w.severity === 'WARNING'
                                    ? 'bg-[#fff4e5] border-[#f9d6a7] text-[#b85a00]'
                                    : 'bg-[#f5f5f5] border-[#d9d9d9] text-[#333333]'
                                }`}
                              >
                                <div className="font-bold">{w.title}</div>
                                <div className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{w.detail}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* BOM & Raw Material Requirements Table */}
                      <div className="sap-card overflow-hidden">
                        <div className="px-4 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] flex items-center justify-between flex-wrap gap-2">
                          <div className="font-bold text-xs text-[#333333] flex items-center gap-1.5">
                            <Package className="w-4 h-4 text-[#007cc0]" />
                            <span>موازنه متریال، قطعات خریدنی و زمان انتظار تامین (BOM & Lead Time Matrix)</span>
                          </div>
                          <span className="text-[11px] text-[#666666] font-mono tabular-nums">
                            {simResult.selectedPart?.hasBom ? 'محاسبه بر اساس درخت BOM مهندسی' : 'برآورد بر اساس وزن و گرید ورق قطعه'}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-right border-collapse text-[11px]">
                            <thead>
                              <tr className="bg-[#fafafa] border-b border-[#d9d9d9] text-[#555555]">
                                <th className="py-2 px-3 font-semibold">کد و شرح متریال</th>
                                <th className="py-2 px-2.5 font-semibold">مصرف واحد</th>
                                <th className="py-2 px-2.5 font-semibold">نیاز MO</th>
                                <th className="py-2 px-2.5 font-semibold">موجودی آزاد / کلاف</th>
                                <th className="py-2 px-2.5 font-semibold">تعهد MO باز</th>
                                <th className="py-2 px-2.5 font-semibold">آزاد قابل تخصیص</th>
                                <th className="py-2 px-2.5 font-semibold">کسری (Shortage)</th>
                                <th className="py-2 px-2.5 font-semibold">پوشش و Lead Time</th>
                                <th className="py-2 px-3 font-semibold">وضعیت</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#eeeeee] font-mono tabular-nums">
                              {simResult.materialRequirements.map((row, idx) => {
                                const activeNeed = simResult.deductExistingFgAndWip ? row.requiredNetQty : row.requiredGrossQty;
                                const activeShortage = simResult.deductExistingFgAndWip ? row.shortageNetQty : row.shortageGrossQty;
                                return (
                                  <tr key={`${row.partCode}-${idx}`} className={row.status === 'SHORTAGE' ? 'bg-[#fde8e8]/40' : 'hover:bg-[#fafafa]'}>
                                    <td className="py-2 px-3 font-sans">
                                      <div className="font-semibold text-[#333333]">{row.partName}</div>
                                      <div className="text-[10px] text-[#666666] font-mono">
                                        {row.partCode} · {row.categoryLabel}
                                        {row.materialGrade ? ` · ${row.materialGrade}` : ''}
                                      </div>
                                    </td>
                                    <td className="py-2 px-2.5">
                                      {formatNumber(row.bomQtyPerUnit)} {row.unit}
                                      <div className="text-[10px] text-[#666666]">+{toPersianDigits(row.scrapPercent)}٪ پرت</div>
                                    </td>
                                    <td className="py-2 px-2.5 font-bold text-[#333333]">
                                      {formatNumber(activeNeed)} {row.unit}
                                    </td>
                                    <td className="py-2 px-2.5 text-[#333333]">
                                      {formatNumber(Math.max(row.availableStockQty, row.availableCoilKg))} {row.unit}
                                    </td>
                                    <td className="py-2 px-2.5 text-[#666666]">
                                      {formatNumber(row.committedToOpenMosQty)}
                                    </td>
                                    <td className="py-2 px-2.5 font-semibold text-[#007cc0]">
                                      {formatNumber(row.freeForProposedMoQty)} {row.unit}
                                    </td>
                                    <td className={`py-2 px-2.5 font-bold ${activeShortage > 0 ? 'text-[#bb0000]' : 'text-[#107e3e]'}`}>
                                      {activeShortage > 0 ? `${formatNumber(activeShortage)} ${row.unit}` : '۰ (کافی)'}
                                    </td>
                                    <td className="py-2 px-2.5">
                                      <div className="flex items-center gap-1.5">
                                        <div className="w-16 h-1.5 bg-[#e5e5e5] rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${
                                              row.coveragePercent >= 100
                                                ? 'bg-[#107e3e]'
                                                : row.coveragePercent >= 50
                                                ? 'bg-[#e9730c]'
                                                : 'bg-[#bb0000]'
                                            }`}
                                            style={{ width: `${row.coveragePercent}%` }}
                                          />
                                        </div>
                                        <span>{toPersianDigits(row.coveragePercent)}٪</span>
                                      </div>
                                      <div className="text-[10px] text-[#666666] flex items-center gap-1 mt-0.5">
                                        <Clock className="w-3 h-3" />
                                        <span>{toPersianDigits(row.leadTimeDays)} روز تدارک</span>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 font-sans font-semibold">
                                      {row.status === 'SHORTAGE' ? (
                                        <span className="text-[#bb0000]">کسری متریال</span>
                                      ) : row.status === 'TIGHT' ? (
                                        <span className="text-[#e9730c]">لب مرز ایمنی</span>
                                      ) : row.status === 'MISSING_MASTER' ? (
                                        <span className="text-[#bb0000]">فاقد کد کالا</span>
                                      ) : (
                                        <span className="text-[#107e3e]">تامین کامل ✓</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Open Contracts & Competing Customer Orders */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="sap-card p-3.5 space-y-2">
                          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
                            <span className="font-bold text-xs text-[#333333] flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-[#007cc0]" />
                              <span>قراردادهای باز ساپکو و سهمیه ورق مرتبط</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                navigateAndClose({
                                  tab: 'contracts',
                                  subTab: 'CONTRACTS_QUOTAS',
                                  docQuery: simResult.selectedPart?.code,
                                  label: 'قراردادها',
                                })
                              }
                              className="sap-doc-link text-[11px] cursor-pointer"
                            >
                              مدیریت قراردادها ←
                            </button>
                          </div>
                          {simResult.openContracts.length === 0 ? (
                            <div className="text-[11px] text-[#666666] py-2">
                              قرارداد فعالی متصل به این قطعه یا گرید ثبت نشده است.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {simResult.openContracts.map(c => (
                                <div key={c.id} className="p-2.5 rounded border border-[#d9d9d9] bg-[#fafafa] flex items-center justify-between gap-2">
                                  <div>
                                    <div className="font-mono font-bold text-[#007cc0] text-[11px]">
                                      {c.contractNumber} · {c.materialGrade}
                                    </div>
                                    <div className="text-[11px] text-[#333333] font-medium">{c.title}</div>
                                    <div className="text-[10px] text-[#666666]">
                                      {c.customerName} · پایان: {c.endDate}
                                    </div>
                                  </div>
                                  <div className="text-left font-mono tabular-nums shrink-0">
                                    <div className="text-xs font-bold text-[#107e3e]">
                                      {formatNumber(c.remainingQuotaKg)} kg
                                    </div>
                                    <div className="text-[10px] text-[#666666]">مانده سهمیه قرارداد</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="sap-card p-3.5 space-y-2">
                          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-2">
                            <span className="font-bold text-xs text-[#333333] flex items-center gap-1.5">
                              <Layers className="w-4 h-4 text-[#e9730c]" />
                              <span>سفارش‌های باز مشتریان (رقابت تخصیص موجودی FG)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                navigateAndClose({
                                  tab: 'contracts',
                                  subTab: 'CUSTOMER_ORDERS',
                                  docQuery: simResult.selectedPart?.code,
                                  label: 'سفارش‌ها',
                                })
                              }
                              className="sap-doc-link text-[11px] cursor-pointer"
                            >
                              سفارش‌های مشتری ←
                            </button>
                          </div>
                          {simResult.competingOrders.length === 0 ? (
                            <div className="text-[11px] text-[#666666] py-2">
                              سفارش باز رقیبی برای موجودی این قطعه ثبت نشده است؛ کل موجودی FG آزاد است.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {simResult.competingOrders.map(o => (
                                <div key={o.orderNumber} className="p-2.5 rounded border border-[#d9d9d9] bg-[#fafafa] flex items-center justify-between gap-2">
                                  <div>
                                    <div className="font-mono font-bold text-[#333333] text-[11px]">{o.orderNumber}</div>
                                    <div className="text-[11px] text-[#666666]">{o.customerName} · سررسید: {o.dueDate}</div>
                                  </div>
                                  <div className="text-left font-mono tabular-nums shrink-0">
                                    <div className="text-xs font-bold text-[#e9730c]">{formatNumber(o.openQty)} عدد</div>
                                    <div className="text-[10px] text-[#666666]">مانده تحویل</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
          {step === 1 && (
            <div className="space-y-4">
              {/* Top Quick Parameter & Simulator Box */}
              <div className="p-4 rounded border border-[#b3ddf2] bg-[#f7fbfe] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-[#007cc0] text-xs">
                    تنظیم قطعه، تیراژ و منابع هدف (امکان جستجوی قطعه موجود یا تایپ نام قطعه جدید مثل «قطعه A»)
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScenario('PART_LIFECYCLE_PRODUCTION');
                        setTargetPartQuery('قطعه A');
                        setTargetQty(5000);
                      }}
                      className="px-2.5 py-1 rounded bg-white border border-[#b3ddf2] text-[#007cc0] hover:bg-[#e5f3fa] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      شبیه‌سازی قطعه جدید A (۵۰۰۰ عدد)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScenario('PART_LIFECYCLE_PRODUCTION');
                        setTargetPartQuery('SAPCO-ASY-ECU-BRK-01');
                        setTargetQty(5000);
                      }}
                      className="px-2.5 py-1 rounded bg-white border border-[#b7dfbf] text-[#107e3e] hover:bg-[#ebf5ec] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      شبیه‌سازی براکت ECU (۵۰۰۰ عدد)
                    </button>
                    {qcBlockedCount > 0 && (
                      <span className="text-[11px] font-bold text-[#e9730c]">
                        {toPersianDigits(qcBlockedCount)} مورد در قرنطینه کیفی
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <PartSearchCombobox
                    items={partOptions}
                    value={targetPartQuery}
                    onChange={val => setTargetPartQuery(val)}
                    label="نام یا کد قطعه (جستجوی کاتالوگ یا تایپ قطعه جدید):"
                    placeholder="جستجو با کد، نام قطعه، کد ساپکو یا تایپ قطعه جدید مثل «قطعه A»..."
                  />

                  <div className="space-y-1">
                    <label className="font-semibold text-[#333333] block">
                      تیراژ / وزن هدف ({selectedScenario === 'COIL_SLITTING' ? 'کیلوگرم' : 'عدد'}):
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={targetQty}
                      onChange={e => setTargetQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-2 text-xs font-mono tabular-nums text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#333333] block">کلاف مادر (جهت برش/ذوب):</label>
                    <select
                      value={targetCoilId}
                      onChange={e => setTargetCoilId(e.target.value)}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    >
                      {selectorCoils.length === 0 ? (
                        <option value="">کلافی ثبت نشده است</option>
                      ) : (
                        selectorCoils.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.coilId} — {c.materialGrade} ({formatNumber(c.remainingWeightKg)} kg)
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-[#333333] block">پرس / دستگاه هدف:</label>
                    <select
                      value={targetMachineId}
                      onChange={e => setTargetMachineId(e.target.value)}
                      className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    >
                      {selectorMachines.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.code} — {m.name} ({toPersianDigits(m.workloadHours)}h)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Category Filter Bar */}
              <div className="flex items-center gap-1.5 flex-wrap pb-1 border-b border-[#e8e8e8]">
                <Filter className="w-3.5 h-3.5 text-[#666666] ml-1" />
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-[#007cc0] text-white font-semibold'
                        : 'bg-[#f5f5f5] text-[#555555] hover:bg-[#e5f3fa]'
                    }`}
                  >
                    {cat === 'ALL' ? `همه سناریوها (${toPersianDigits(catalog.length)})` : cat}
                  </button>
                ))}
              </div>

              {loadingCatalog ? (
                <div className="p-8 text-center text-[#666666] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#007cc0]" />
                  <span>در حال بارگذاری کاتالوگ ۱۲ سناریوی صنعتی و اطلاعات زنده سیستم...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredCatalog.map(item => {
                    const active = selectedScenario === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectScenario(item.id)}
                        className={`p-3.5 rounded border text-right cursor-pointer transition flex flex-col justify-between gap-2 ${
                          active
                            ? 'bg-[#e5f3fa] border-[#007cc0] ring-1 ring-[#007cc0]'
                            : 'bg-white border-[#d9d9d9] hover:bg-[#f7f7f7]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-[#666666]">
                            <span className="font-mono font-bold text-[#333333]">{item.code}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#007cc0] font-medium truncate">{item.category}</span>
                          </div>
                          <div className="text-xs font-bold text-[#333333] leading-snug">{item.title}</div>
                          <div className="text-[11px] text-[#666666] leading-relaxed">{item.subtitle}</div>
                        </div>
                        <div className="text-[10px] font-mono text-[#666666] pt-1.5 border-t border-[#e8e8e8] truncate" dir="ltr">
                          {item.sapFlow}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 2 && evaluation && (
            <div className="space-y-4">
              {/* Summary Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8e8] pb-3">
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[#333333] text-sm">
                    {evaluation.scenario.code}: {evaluation.scenario.title}
                  </h4>
                  <p className="text-xs text-[#666666]">{evaluation.summary}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const code = evaluation.selectedPart?.code || targetPartQuery;
                      setSimPartQuery(code);
                      setSimQty(evaluation.selectedQuantity || targetQty);
                      setActiveMode('MRP_SIMULATOR');
                      void runMrpFeasibilitySimulation(
                        code,
                        evaluation.selectedQuantity || targetQty,
                        simTargetDueDate,
                        simDeductExisting,
                      );
                    }}
                    className="sap-btn-standard px-3 py-1 text-[11px] text-[#007cc0] border-[#b3ddf2] bg-[#f7fbfe] cursor-pointer flex items-center gap-1 whitespace-nowrap"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>تحلیل عمیق کسری و Lead Time در شبیه‌ساز MRP</span>
                  </button>
                  {evaluation.canExecute ? (
                    <span className="text-xs font-bold text-[#107e3e] shrink-0">
                      آماده اجرا و ثبت تراکنش رسمی ✓
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-[#bb0000] shrink-0">
                      مسدود: نیازمند تکمیل پیش‌نیاز
                    </span>
                  )}
                </div>
              </div>

              {/* Missing Part Immediate Definition Banner */}
              {!evaluation.partExists && evaluation.requestedPartQuery && (
                <div className="p-4 rounded bg-[#fff4e5] border border-[#f9d6a7] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-2.5 text-xs text-[#333333]">
                    <ShieldAlert className="w-5 h-5 text-[#e9730c] shrink-0" />
                    <div>
                      <div className="font-bold text-[#e9730c]">
                        قطعه «{evaluation.requestedPartQuery}» در کاتالوگ نرم‌افزار تعریف نشده است
                      </div>
                      <div className="text-[11px] text-[#666666] mt-0.5">
                        روی دکمه روبه‌رو کلیک کنید تا مستقیماً به کاتالوگ قطعات منتقل شده و این قطعه را با فرم آماده تعریف کنید.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigateAndClose({
                        tab: 'parts',
                        docQuery: evaluation.requestedPartQuery,
                        label: 'تعریف قطعه',
                      })
                    }
                    className="sap-btn-emphasized px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>تعریف فوری قطعه «{evaluation.requestedPartQuery}» در کاتالوگ</span>
                  </button>
                </div>
              )}

              {/* Blocking Reason if still partExists but missing routing/etc */}
              {evaluation.partExists && !evaluation.canExecute && evaluation.blockingReason && (
                <div className="p-3 rounded bg-[#fde8e8] border border-[#f5b8b8] text-[#bb0000] flex items-center gap-2 text-xs">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{evaluation.blockingReason}</span>
                </div>
              )}

              {/* Proposal Preview Strip (for PART_LIFECYCLE_PRODUCTION) */}
              {evaluation.proposalPreview && (
                <div className="p-3.5 rounded border border-[#b7dfbf] bg-[#f4fbf6] space-y-2">
                  <div className="font-bold text-[#107e3e] text-xs">
                    پیشنهاد برنامه تولید محاسبه‌شده (پیش از تأیید و صدور دستور کار MO):
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 tabular-nums">
                    <div className="bg-white border border-[#d9d9d9] rounded p-2">
                      <div className="text-[10px] text-[#666666]">خالص نیاز تولید</div>
                      <div className="font-mono font-bold text-[#107e3e]">
                        {formatNumber(evaluation.proposalPreview.netToProduce)} عدد
                      </div>
                    </div>
                    <div className="bg-white border border-[#d9d9d9] rounded p-2">
                      <div className="text-[10px] text-[#666666]">ورق / کلاف مورد نیاز</div>
                      <div className="font-mono font-bold text-[#333333]">
                        {formatNumber(evaluation.proposalPreview.requiredCoilKg)} kg
                      </div>
                    </div>
                    <div className="bg-white border border-[#d9d9d9] rounded p-2">
                      <div className="text-[10px] text-[#666666]">ساعات کار ماشین</div>
                      <div className="font-mono font-bold text-[#007cc0]">
                        {toPersianDigits(evaluation.proposalPreview.estimatedMachineHours)} ساعت
                      </div>
                    </div>
                    <div className="bg-white border border-[#d9d9d9] rounded p-2">
                      <div className="text-[10px] text-[#666666]">ایستگاه‌های مسیر</div>
                      <div className="font-mono font-bold text-[#333333]">
                        {toPersianDigits(evaluation.proposalPreview.routingStepsCount)} مرحله
                      </div>
                    </div>
                    <div className="bg-white border border-[#d9d9d9] rounded p-2">
                      <div className="text-[10px] text-[#666666]">اقلام درخت BOM</div>
                      <div className="font-mono font-bold text-[#333333]">
                        {toPersianDigits(evaluation.proposalPreview.bomComponentsCount)} جزء
                      </div>
                    </div>
                    <div className="bg-white border border-[#d9d9d9] rounded p-2">
                      <div className="text-[10px] text-[#666666]">پرس منتخب</div>
                      <div className="font-bold text-[#333333] truncate">
                        {evaluation.proposalPreview.primaryMachineName || 'مطابق مسیر'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step Cards */}
              <div className="space-y-3">
                {evaluation.steps.map(s => (
                  <div key={s.stepNumber} className="sap-card p-3.5 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 text-[11px] text-[#666666] flex-wrap">
                          <span className="font-mono font-semibold text-[#333333]">{s.sapCode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{s.moduleName}</span>
                          <span aria-hidden="true">·</span>
                          {renderStepStatusLabel(s.status)}
                        </div>
                        <div className="font-bold text-[#333333] text-xs">{s.title}</div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <button
                          type="button"
                          onClick={() => navigateAndClose(s.navTarget)}
                          className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 text-[#007cc0] bg-[#e5f3fa] border-[#b3ddf2] hover:bg-[#d5ecf8] whitespace-nowrap"
                        >
                          <span>{s.navTarget.label}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        {(s.secondaryNavTargets || []).map((sec, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => navigateAndClose(sec)}
                            className="sap-btn-standard px-2.5 py-1.5 text-[11px] cursor-pointer flex items-center gap-1 text-[#333333] whitespace-nowrap"
                          >
                            <span>{sec.label}</span>
                            <ExternalLink className="w-3 h-3 text-[#666666]" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-[#555555] leading-relaxed">{s.summary}</p>

                    {s.metrics.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {s.metrics.map((m, i) => (
                          <div key={i} className={`px-2.5 py-1 rounded border text-[11px] flex items-center gap-1.5 ${toneClass(m.tone)}`}>
                            <span className="opacity-80">{m.label}:</span>
                            <span className="font-bold font-mono tabular-nums">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && executionResult && (
            <div className="space-y-4">
              <div className="p-4 rounded bg-[#ebf5ec] border border-[#b7dfbf] flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#107e3e] shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="text-sm font-bold text-[#107e3e]">اجرای سناریو با موفقیت در پایگاه داده ثبت شد</div>
                  <p className="text-xs text-[#333333] leading-relaxed">{executionResult.message}</p>
                </div>
              </div>

              {/* Generated Documents Links */}
              <div className="sap-card p-4 space-y-3">
                <div className="font-bold text-xs text-[#333333] flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-[#007cc0]" />
                  <span>اسناد و رکوردهای صادرشده (با لینک مستقیم به ماژول مقصد):</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {executionResult.generatedDocs.orderNumber && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateAndClose({
                          tab: 'planning',
                          subTab: 'orders',
                          docQuery: executionResult.generatedDocs.orderNumber,
                          label: 'سفارش',
                        })
                      }
                      className="sap-btn-standard px-3 py-1.5 text-xs font-mono text-[#007cc0] cursor-pointer flex items-center gap-1"
                    >
                      <span>سفارش: {executionResult.generatedDocs.orderNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}

                  {executionResult.generatedDocs.proposalNumber && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateAndClose({
                          tab: 'planning',
                          subTab: 'recommendations',
                          docQuery: executionResult.generatedDocs.proposalNumber,
                          label: 'پیشنهاد',
                        })
                      }
                      className="sap-btn-standard px-3 py-1.5 text-xs font-mono text-[#007cc0] cursor-pointer flex items-center gap-1"
                    >
                      <span>پیشنهاد: {executionResult.generatedDocs.proposalNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}

                  {executionResult.generatedDocs.planNumber && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateAndClose({
                          tab: 'planning',
                          subTab: 'approved_plans',
                          docQuery: executionResult.generatedDocs.planNumber,
                          label: 'برنامه',
                        })
                      }
                      className="sap-btn-standard px-3 py-1.5 text-xs font-mono text-[#107e3e] cursor-pointer flex items-center gap-1"
                    >
                      <span>برنامه: {executionResult.generatedDocs.planNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}

                  {(executionResult.generatedDocs.moNumbers || []).map((moNum, idx) => (
                    <button
                      key={moNum}
                      type="button"
                      onClick={() =>
                        navigateAndClose({
                          tab: 'wip',
                          subTab: 'ORDERS',
                          docQuery: moNum,
                          moId: executionResult.generatedDocs.moIds?.[idx] || undefined,
                          label: 'دستور کار',
                        })
                      }
                      className="sap-btn-emphasized px-3 py-1.5 text-xs font-mono cursor-pointer flex items-center gap-1"
                    >
                      <span>دستور کار: {moNum}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  ))}

                  {(executionResult.generatedDocs.prNumbers || []).map(prNum => (
                    <button
                      key={prNum}
                      type="button"
                      onClick={() =>
                        navigateAndClose({
                          tab: 'mrp',
                          docQuery: prNum,
                          label: 'درخواست خرید',
                        })
                      }
                      className="sap-btn-standard px-3 py-1.5 text-xs font-mono text-[#e9730c] cursor-pointer flex items-center gap-1"
                    >
                      <span>درخواست خرید: {prNum}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  ))}

                  {executionResult.generatedDocs.inventoryDocNumber && (
                    <button
                      type="button"
                      onClick={() =>
                        navigateAndClose({
                          tab: 'inventory',
                          subTab: 'MOVEMENT',
                          docQuery: executionResult.generatedDocs.inventoryDocNumber,
                          label: 'سند انبار/کیفیت',
                        })
                      }
                      className="sap-btn-standard px-3 py-1.5 text-xs font-mono text-[#107e3e] cursor-pointer flex items-center gap-1"
                    >
                      <span>سند انبار/ممیزی: {executionResult.generatedDocs.inventoryDocNumber}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Post-execution live steps */}
              {executionResult.evaluation?.steps?.length > 0 && (
                <div className="space-y-2">
                  <div className="font-bold text-xs text-[#333333] flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-[#007cc0]" />
                    <span>وضعیت جدید سیستم پس از اجرای سناریو:</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {executionResult.evaluation.steps.map(s => (
                      <div key={s.stepNumber} className="p-3 rounded border border-[#d9d9d9] bg-[#fafafa] flex flex-col justify-between gap-2">
                        <div className="space-y-1">
                          <div className="font-bold text-xs text-[#333333]">{s.title}</div>
                          <div className="text-[11px] text-[#666666]">{s.summary}</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => navigateAndClose(s.navTarget)}
                            className="sap-btn-standard px-2.5 py-1 text-[11px] text-[#007cc0] cursor-pointer whitespace-nowrap"
                          >
                            {s.navTarget.label} ←
                          </button>
                          {(s.secondaryNavTargets || []).slice(0, 1).map((sec, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => navigateAndClose(sec)}
                              className="sap-btn-standard px-2 py-1 text-[11px] text-[#555555] cursor-pointer whitespace-nowrap"
                            >
                              {sec.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#f7f7f7] border-t border-[#d9d9d9] shrink-0 text-xs">
          {activeMode === 'MRP_SIMULATOR' ? (
            <>
              <button
                type="button"
                onClick={() => setActiveMode('WIZARD')}
                className="sap-btn-standard px-4 py-1.5 cursor-pointer"
              >
                بازگشت به جادوگر سناریوها
              </button>
              <button type="button" onClick={onClose} className="sap-btn-standard px-4 py-1.5 cursor-pointer">
                بستن پنجره
              </button>
            </>
          ) : (
            <>
          {step === 1 && (
            <>
              <button type="button" onClick={onClose} className="sap-btn-standard px-4 py-1.5 cursor-pointer">
                انصراف
              </button>
              <button
                type="button"
                disabled={loadingEval || loadingCatalog}
                onClick={runScenarioAnalysis}
                className="sap-btn-emphasized px-4 py-1.5 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
              >
                <span>{loadingEval ? 'در حال واکاوی زنده داده‌ها...' : 'اجرای ارزیابی زنده سناریو'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button type="button" onClick={() => setStep(1)} className="sap-btn-standard px-4 py-1.5 cursor-pointer">
                تغییر سناریو / پارامترها
              </button>
              <button
                type="button"
                disabled={executing || !evaluation?.canExecute}
                onClick={handleExecuteScenario}
                className="px-4 py-1.5 rounded text-white font-semibold cursor-pointer flex items-center gap-1.5 bg-[#107e3e] hover:bg-[#0e6b35] disabled:opacity-50 whitespace-nowrap"
              >
                <span>
                  {executing
                    ? 'در حال ثبت تراکنش و صدور اسناد...'
                    : activeCatalogItem?.defaultActionLabel || 'تایید و اجرای سناریو'}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setExecutionResult(null);
                  setEvaluation(null);
                }}
                className="sap-btn-standard px-4 py-1.5 cursor-pointer"
              >
                اجرای سناریوی دیگر
              </button>
              <button
                type="button"
                onClick={() => {
                  const firstMo = executionResult?.generatedDocs?.moNumbers?.[0];
                  const firstMoId = executionResult?.generatedDocs?.moIds?.[0];
                  if (firstMo) {
                    navigateAndClose({
                      tab: 'wip',
                      subTab: 'ORDERS',
                      docQuery: firstMo,
                      moId: firstMoId,
                      label: 'صف دستور کار',
                    });
                  } else if (executionResult?.generatedDocs?.prNumbers?.[0]) {
                    navigateAndClose({
                      tab: 'mrp',
                      docQuery: executionResult.generatedDocs.prNumbers[0],
                      label: 'MRP',
                    });
                  } else {
                    navigateAndClose({
                      tab: 'inventory',
                      subTab: 'MOVEMENT',
                      docQuery: executionResult?.generatedDocs?.inventoryDocNumber,
                      label: 'اسناد انبار',
                    });
                  }
                }}
                className="sap-btn-emphasized px-5 py-1.5 cursor-pointer whitespace-nowrap"
              >
                مشاهده اسناد صادرشده در سیستم
              </button>
            </>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
