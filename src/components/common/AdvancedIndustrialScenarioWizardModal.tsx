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
    setSelectedCategory('ALL');
    setSelectedScenario(nextScenario);
    setTargetQty(nextQty);
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

  const partOptions = useMemo(() => {
    if (selectorParts.length > 0) return selectorParts;
    return parts
      .filter(p => p.category === 'FINISHED_GOOD' || p.category === 'WIP_PART')
      .map(p => ({ id: p.id, code: p.code, name: p.name, availableQty: 0, materialGrade: p.materialGrade || '' }));
  }, [selectorParts, parts]);

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

        {/* Step Indicator */}
        <div className="px-5 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] shrink-0 flex items-center justify-between text-xs font-semibold flex-wrap gap-2">
          <div className={`flex items-center gap-1.5 ${step === 1 ? 'text-[#007cc0]' : 'text-[#107e3e]'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white flex items-center justify-center text-[10px] tabular-nums">۱</span>
            <span>انتخاب سناریو و ورود قطعه/تیراژ هدف</span>
          </div>
          <div className="hidden sm:block w-8 h-[1px] bg-[#d9d9d9]" />
          <div className={`flex items-center gap-1.5 ${step === 2 ? 'text-[#007cc0]' : step > 2 ? 'text-[#107e3e]' : 'text-[#666666]'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white flex items-center justify-center text-[10px] tabular-nums">۲</span>
            <span>ممیزی زنده مراحل با لینک مستقیم به هر ماژول</span>
          </div>
          <div className="hidden sm:block w-8 h-[1px] bg-[#d9d9d9]" />
          <div className={`flex items-center gap-1.5 ${step === 3 ? 'text-[#107e3e]' : 'text-[#666666]'}`}>
            <span className="w-5 h-5 rounded-full bg-current text-white flex items-center justify-center text-[10px] tabular-nums">۳</span>
            <span>تأیید پیشنهاد، صدور اسناد رسمی و پیگیری</span>
          </div>
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
                  <div className="space-y-1">
                    <label className="font-semibold text-[#333333] block">نام یا کد قطعه (انتخاب یا تایپ آزاد):</label>
                    <input
                      type="text"
                      list="wizard-parts-datalist"
                      value={targetPartQuery}
                      onChange={e => setTargetPartQuery(e.target.value)}
                      placeholder="مثلاً: قطعه A یا SAPCO-ASY-ECU-BRK-01"
                      className="w-full bg-white border border-[#bfbfbf] rounded px-2.5 py-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    />
                    <datalist id="wizard-parts-datalist">
                      {partOptions.map(p => (
                        <option key={p.id} value={p.code}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </datalist>
                  </div>

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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#f7f7f7] border-t border-[#d9d9d9] shrink-0 text-xs">
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
        </div>
      </div>
    </div>
  );
};
