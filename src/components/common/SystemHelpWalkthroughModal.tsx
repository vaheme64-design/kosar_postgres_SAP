import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Compass,
  BookOpen,
  Cloud,
  ArrowRight,
  Workflow,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Settings,
  BarChart3,
  Search,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Play,
  MousePointerClick,
} from 'lucide-react';
import { toPersianDigits } from '../../utils/formatters';
import { WizardScenarioId } from './AdvancedIndustrialScenarioWizardModal';
import { PAGE_TRAINING_CATALOG } from '../../data/pageTrainingCatalog';
import { usePersistedValue } from '../../hooks/usePersistedCollapse';

export interface HelpWizardLaunchParams {
  scenarioId?: WizardScenarioId;
  partQuery?: string;
  quantity?: number;
  autoEvaluate?: boolean;
}

interface SystemHelpWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (
    tab: any,
    subTab?: any,
    actionModal?: any,
    docQuery?: string | null,
    moId?: string | null,
  ) => void;
  onOpenAdvancedWizard: (params?: HelpWizardLaunchParams) => void;
}

interface CatalogScenarioItem {
  id: WizardScenarioId;
  code: string;
  title: string;
  subtitle: string;
  category: string;
  sapFlow: string;
  defaultActionLabel: string;
  detailedFlow: string[];
  linkedKpis: string[];
  defaultNavTarget: { tab: string; subTab?: string };
}

interface IndustrialKpiMetric {
  id: string;
  code: string;
  title: string;
  category: 'برنامه‌ریزی تولید' | 'کنترل موجودی' | 'کیفیت و OEE' | 'ظرفیت و WIP';
  valueDisplay: string;
  formulaFa: string;
  benchmark: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  description: string;
  navTarget: {
    tab: string;
    subTab?: string;
    docQuery?: string;
    moId?: string;
    label: string;
  };
}

interface DirectoryModuleGroup {
  title: string;
  sapCode: string;
  desc: string;
  primaryTab: string;
  primarySubTab?: string;
  links: Array<{ label: string; tab: string; subTab?: string }>;
}

const DIRECTORY_GROUPS: DirectoryModuleGroup[] = [
  {
    title: '۱. مهندسی محصول و اطلاعات پایه (Master Data)',
    sapCode: 'MM03 · CS03 · CA03',
    desc: 'تعریف کاتالوگ قطعات، درخت ساختار محصول (BOM)، مسیرهای تولید (Routing)، قالب‌ها و پرس‌ها.',
    primaryTab: 'master_data',
    primarySubTab: 'PARTS',
    links: [
      { label: 'کاتالوگ قطعات', tab: 'master_data', subTab: 'PARTS' },
      { label: 'درخت محصول (BOM)', tab: 'master_data', subTab: 'BOM' },
      { label: 'مسیر عملیات (Routings)', tab: 'master_data', subTab: 'ROUTINGS' },
      { label: 'پرس‌ها و ماشین‌آلات', tab: 'master_data', subTab: 'MACHINES' },
      { label: 'مدیریت قالب‌ها', tab: 'master_data', subTab: 'DIES' },
    ],
  },
  {
    title: '۲. قراردادهای ساپکو و سفارشات فروش (SD)',
    sapCode: 'VA01 · Contracts',
    desc: 'مدیریت قراردادهای ساپکو/سایپا، سهمیه‌های کلاف ورق، سفارشات مشتریان و تعهدات تحویل.',
    primaryTab: 'contracts',
    primarySubTab: 'CONTRACTS_QUOTAS',
    links: [
      { label: 'قراردادها و سهمیه ورق', tab: 'contracts', subTab: 'CONTRACTS_QUOTAS' },
      { label: 'سفارشات مشتریان', tab: 'contracts', subTab: 'CUSTOMER_ORDERS' },
    ],
  },
  {
    title: '۳. کنترل موجودی، انبار و کیفیت (MM / QM)',
    sapCode: 'MMBE · MIGO · QA32',
    desc: 'استعلام کاردکس انبار، موجودی چندمرحله‌ای WIP تا FG، رول‌های ورق، هشدار نقطه سفارش و قرنطینه کیفی.',
    primaryTab: 'inventory',
    primarySubTab: 'DASHBOARD',
    links: [
      { label: 'پیشخوان انبار', tab: 'inventory', subTab: 'DASHBOARD' },
      { label: 'استعلام کاردکس (ATP)', tab: 'inventory', subTab: 'INQUIRY' },
      { label: 'موجودی مراحل WIP تا FG', tab: 'inventory', subTab: 'STAGES' },
      { label: 'رول‌های ورق (Heat)', tab: 'inventory', subTab: 'COILS' },
      { label: 'هشدار نقطه سفارش (ROP)', tab: 'inventory', subTab: 'ALERTS' },
      { label: 'قرنطینه و UD 321', tab: 'inventory', subTab: 'QUALITY_QM' },
    ],
  },
  {
    title: '۴. برنامه‌ریزی تولید، MRP و ظرفیت (PP / CRP)',
    sapCode: 'MD01 · CM25 · PRP',
    desc: 'پیشنهاد برنامه تولید، موتور خالص نیاز MRP، زمان‌بندی ظرفیت پرس‌ها، برنامه روزانه و سفارشات.',
    primaryTab: 'planning',
    primarySubTab: 'recommendations',
    links: [
      { label: 'تأیید پیشنهاد و صدور MO', tab: 'planning', subTab: 'recommendations' },
      { label: 'موتور نیازسنجی (MRP)', tab: 'planning', subTab: 'mrp' },
      { label: 'ظرفیت پرس‌ها (CRP)', tab: 'planning', subTab: 'capacity_planning' },
      { label: 'برنامه روزانه شیفت', tab: 'planning', subTab: 'daily_schedule' },
      { label: 'سفارشات برنامه‌ریزی', tab: 'planning', subTab: 'orders' },
    ],
  },
  {
    title: '۵. کارگاه، دستور کارها و میز کار تولید (WIP / SFC)',
    sapCode: 'CO01 · CO11N · SFC',
    desc: 'کارتابل دستورات کار تولید (MO)، ردیابی شجره تولید، انتقال بین عملیات و ثبت قبوض تولید.',
    primaryTab: 'wip',
    primarySubTab: 'ORDERS',
    links: [
      { label: 'کارتابل دستورات کار (MO)', tab: 'wip', subTab: 'ORDERS' },
      { label: 'ردیابی بین‌مرحله‌ای', tab: 'wip', subTab: 'TRACEABILITY' },
      { label: 'انتقالات بین عملیات', tab: 'wip', subTab: 'TRANSFERS' },
      { label: 'میز کار شیفت سالن', tab: 'production', subTab: 'MULTI_PART_SCHEDULER' },
      { label: 'قبض تکی کارگاه', tab: 'production', subTab: 'VOUCHERS' },
    ],
  },
  {
    title: '۶. گزارش‌های تحلیلی، OEE، ضایعات و تنظیمات پایگاه داده',
    sapCode: 'OEE · CO88 · DB Sync',
    desc: 'تحقق برنامه، معوقات Backlog، خواب WIP، تحلیل ضایعات، انحراف BOM، نگهداری PM و لینک پایگاه داده.',
    primaryTab: 'reports',
    primarySubTab: 'comprehensive_production',
    links: [
      { label: 'گزارش جامع بهره‌وری', tab: 'reports', subTab: 'comprehensive_production' },
      { label: 'تطبیق برنامه و واقعی', tab: 'reports', subTab: 'plan_vs_actual' },
      { label: 'سفارشات معوق (Backlog)', tab: 'reports', subTab: 'backlog' },
      { label: 'مانده راکد (WIP Aging)', tab: 'reports', subTab: 'wip_aging' },
      { label: 'تحلیل ضایعات عملیات', tab: 'reports', subTab: 'scrap_analysis' },
      { label: 'انحراف مصرف BOM', tab: 'reports', subTab: 'consumption' },
      { label: 'تنظیمات نت (PM) و OEE', tab: 'machines', subTab: 'maintenance' },
      { label: 'مدیریت دسترسی و لینک DB', tab: 'settings', subTab: 'db_architecture' },
    ],
  },
];

export const SystemHelpWalkthroughModal: React.FC<SystemHelpWalkthroughModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenAdvancedWizard,
}) => {
  const [activeTab, setActiveTab] = useState<'SCENARIOS' | 'PAGE_ATLAS' | 'KPI_MATRIX' | 'DIRECTORY' | 'HYBRID_SYNC'>('SCENARIOS');
  const [atlasSearch, setAtlasSearch] = useState('');
  const [selectedAtlasKey, setSelectedAtlasKey] = useState<string>('master_data:PRODUCT_STRUCTURE');
  const [scenarios, setScenarios] = useState<CatalogScenarioItem[]>([]);
  const [partHints, setPartHints] = useState<Array<{ code: string; name: string }>>([]);
  const [kpis, setKpis] = useState<IndustrialKpiMetric[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(false);

  // Filters & Simulator Strip
  const [simPartQuery, setSimPartQuery] = useState('قطعه A');
  const [simQty, setSimQty] = useState(5000);
  const [scenarioCategory, setScenarioCategory] = useState('ALL');
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [expandedScenarioId, setExpandedScenarioId] = usePersistedValue<string | null>('help_walkthrough_scenario_id', null);
  const [kpiCategoryFilter, setKpiCategoryFilter] = useState<string>('ALL');

  // Dual DB state
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadKpiSnapshot = () => {
    setLoadingKpis(true);
    fetch('/api/scenarios/kpi-snapshot')
      .then(r => r.json())
      .then(d => {
        if (d.success && Array.isArray(d.data?.metrics)) {
          setKpis(d.data.metrics);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingKpis(false));
  };

  useEffect(() => {
    if (!isOpen) return;

    fetch('/api/scenarios/catalog')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) {
          if (Array.isArray(d.data.catalog)) {
            setScenarios(d.data.catalog);
          }
          if (Array.isArray(d.data.finishedParts)) {
            setPartHints(d.data.finishedParts.map((p: any) => ({ code: p.code, name: p.name })));
          }
          if (Array.isArray(d.data.kpiSnapshot?.metrics)) {
            setKpis(d.data.kpiSnapshot.metrics);
          }
        }
      })
      .catch(() => {});

    fetch('/api/db/config')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.data) setDbStatus(d.data);
      })
      .catch(() => {});
  }, [isOpen]);

  const scenarioCategories = useMemo(() => {
    const set = new Set<string>();
    scenarios.forEach(s => set.add(s.category));
    return ['ALL', ...Array.from(set)];
  }, [scenarios]);

  const filteredScenarios = useMemo(() => {
    return scenarios.filter(s => {
      if (scenarioCategory !== 'ALL' && s.category !== scenarioCategory) return false;
      if (scenarioSearch.trim()) {
        const q = scenarioSearch.trim().toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          s.subtitle.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.sapFlow.toLowerCase().includes(q) ||
          (s.detailedFlow || []).some(line => line.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [scenarios, scenarioCategory, scenarioSearch]);

  const filteredKpis = useMemo(() => {
    if (kpiCategoryFilter === 'ALL') return kpis;
    return kpis.filter(k => k.category === kpiCategoryFilter);
  }, [kpis, kpiCategoryFilter]);

  const filteredAtlasPages = useMemo(() => {
    const q = atlasSearch.trim().toLowerCase();
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
  }, [atlasSearch]);

  const activeAtlasPage = useMemo(() => {
    return (
      filteredAtlasPages.find(p => p.key === selectedAtlasKey) ||
      filteredAtlasPages[0] ||
      PAGE_TRAINING_CATALOG[0]
    );
  }, [filteredAtlasPages, selectedAtlasKey]);

  if (!isOpen) return null;

  const handleLaunchQuickLifecycle = () => {
    const partQuery = simPartQuery.trim() || 'قطعه A';
    const qty = Math.max(1, Number(simQty) || 5000);
    onClose();
    onOpenAdvancedWizard({
      scenarioId: 'PART_LIFECYCLE_PRODUCTION',
      partQuery,
      quantity: qty,
      autoEvaluate: true,
    });
  };

  const handleTriggerSync = async () => {
    setSyncBusy(true);
    setSyncNotice(null);
    try {
      const res = await fetch('/api/db/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'ACTIVE' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'همگام‌سازی ناموفق بود.');
      }
      setSyncNotice({ type: 'success', text: data.message || 'همگام‌سازی کامل با پایگاه داده انجام شد.' });
      fetch('/api/db/config')
        .then(r => r.json())
        .then(d => {
          if (d.success && d.data) setDbStatus(d.data);
        })
        .catch(() => {});
    } catch (err) {
      setSyncNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'خطا در برقراری ارتباط با پایگاه داده',
      });
    } finally {
      setSyncBusy(false);
    }
  };

  const kpiToneStyles = (tone: IndustrialKpiMetric['tone']) => {
    if (tone === 'good') return { border: 'border-[#b7dfbf]', value: 'text-[#107e3e]', label: 'وضعیت مطلوب' };
    if (tone === 'warn') return { border: 'border-[#f9d6a7]', value: 'text-[#e9730c]', label: 'نیازمند پیگیری' };
    if (tone === 'bad') return { border: 'border-[#f5b8b8]', value: 'text-[#bb0000]', label: 'وضعیت بحرانی' };
    return { border: 'border-[#d9d9d9]', value: 'text-[#007cc0]', label: 'پایش مستمر' };
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#333333]/55 backdrop-blur-[1px] flex items-center justify-center p-3 sm:p-5" dir="rtl">
      <div className="bg-white border border-[#d9d9d9] rounded-md w-full max-w-6xl shadow-2xl overflow-hidden h-[90vh] flex flex-col">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[#d9d9d9] shrink-0">
          <div className="flex items-center gap-2.5">
            <Compass className="w-5 h-5 text-[#007cc0]" />
            <div>
              <h3 className="text-sm font-bold text-[#333333]">
                مرکز جامع راهنما، سناریوهای مهندسی و شاخص‌های برنامه‌ریزی تولید و کنترل موجودی
              </h3>
              <p className="text-[11px] text-[#666666]">
                پوشش کامل ۱۲ فرآیند استاندارد ERP صنعتی، شبیه‌ساز تولید قطعه جدید/موجود، ۱۰ شاخص کلیدی زنده (KPI) و نقشه لینک‌دار ماژول‌ها
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

        {/* Interactive Quick Simulator Strip ("Produce 5000 units of Part A") */}
        <div className="px-5 py-3 bg-[#f4f9fd] border-b border-[#cfe5f5] shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="font-bold text-[#007cc0] flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>شبیه‌ساز سریع سناریوی صفر تا صد تولید قطعه (بررسی وجود قطعه ← قرارداد ← مسیر ← BOM ← موجودی مراحل ← KPI ← صدور MO)</span>
            </div>
            <div className="text-[11px] text-[#555555]">
              نام یک قطعه فرضی (مثل «قطعه A») یا کد قطعه موجود را با تیراژ دلخواه وارد کنید تا کل زنجیره الزامات به‌صورت زنده ممیزی و لینک شود.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              type="text"
              list="help-sim-parts-list"
              value={simPartQuery}
              onChange={e => setSimPartQuery(e.target.value)}
              placeholder="نام یا کد قطعه (مثلاً: قطعه A)"
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs text-[#333333] w-48 focus:outline-none focus:border-[#007cc0]"
            />
            <datalist id="help-sim-parts-list">
              {partHints.map(p => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </datalist>

            <input
              type="number"
              min="1"
              value={simQty}
              onChange={e => setSimQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="bg-white border border-[#bfbfbf] rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#333333] w-24 focus:outline-none focus:border-[#007cc0]"
            />

            <button
              type="button"
              onClick={handleLaunchQuickLifecycle}
              className="sap-btn-emphasized px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5" />
              <span>بررسی صفر تا صد در جادوگر</span>
            </button>
          </div>
        </div>

        {/* Primary Section Tabs */}
        <div className="flex items-center gap-2 px-5 py-2.5 bg-[#f7f7f7] border-b border-[#d9d9d9] shrink-0 text-xs font-semibold flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('SCENARIOS')}
            className={`px-3 py-1.5 rounded cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'SCENARIOS' ? 'bg-[#007cc0] text-white' : 'bg-white text-[#333333] border border-[#d9d9d9] hover:bg-[#e5f3fa]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>۱۲ سناریوی صنعتی و چرخه تولید</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('KPI_MATRIX');
              if (kpis.length === 0) loadKpiSnapshot();
            }}
            className={`px-3 py-1.5 rounded cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'KPI_MATRIX' ? 'bg-[#007cc0] text-white' : 'bg-white text-[#333333] border border-[#d9d9d9] hover:bg-[#e5f3fa]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>شاخص‌های کلیدی زنده (KPI Matrix)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DIRECTORY')}
            className={`px-3 py-1.5 rounded cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'DIRECTORY' ? 'bg-[#007cc0] text-white' : 'bg-white text-[#333333] border border-[#d9d9d9] hover:bg-[#e5f3fa]'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            <span>نقشه لینک‌دار کل ماژول‌ها (Directory)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PAGE_ATLAS')}
            className={`px-3 py-1.5 rounded cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'PAGE_ATLAS' ? 'bg-[#007cc0] text-white' : 'bg-white text-[#333333] border border-[#d9d9d9] hover:bg-[#e5f3fa]'
            }`}
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span>آموزش صفحات و دکمه‌ها ({toPersianDigits(PAGE_TRAINING_CATALOG.length)} صفحه)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HYBRID_SYNC')}
            className={`px-3 py-1.5 rounded cursor-pointer transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'HYBRID_SYNC' ? 'bg-[#007cc0] text-white' : 'bg-white text-[#333333] border border-[#d9d9d9] hover:bg-[#e5f3fa]'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>لینک دوگانه پایگاه داده</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-[#333333] flex-1">
          {activeTab === 'SCENARIOS' && (
            <div className="space-y-4">
              {/* Filter & Search Row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {scenarioCategories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setScenarioCategory(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                        scenarioCategory === cat
                          ? 'bg-[#007cc0] text-white font-semibold'
                          : 'bg-[#f5f5f5] text-[#555555] hover:bg-[#e5f3fa]'
                      }`}
                    >
                      {cat === 'ALL' ? `همه سناریوها (${toPersianDigits(scenarios.length)})` : cat}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[220px]">
                  <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
                  <input
                    type="text"
                    value={scenarioSearch}
                    onChange={e => setScenarioSearch(e.target.value)}
                    placeholder="جستجو در عنوان یا گام‌های فرآیند..."
                    className="w-full bg-white border border-[#bfbfbf] rounded pr-8 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              {/* Scenarios List */}
              <div className="space-y-3">
                {filteredScenarios.map(scen => {
                  const isExpanded = expandedScenarioId === scen.id;
                  return (
                    <div key={scen.id} className="sap-card p-4 space-y-3">
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 text-[11px] text-[#666666] flex-wrap">
                            <span className="font-mono font-bold text-[#333333]">{scen.code}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#007cc0] font-semibold">{scen.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono" dir="ltr">{scen.sapFlow}</span>
                          </div>
                          <h4 className="font-bold text-[#333333] text-sm">{scen.title}</h4>
                          <p className="text-xs text-[#666666] leading-relaxed">{scen.subtitle}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setExpandedScenarioId(isExpanded ? null : scen.id)}
                            className="sap-btn-standard px-2.5 py-1.5 text-xs cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>{isExpanded ? 'بستن جزئیات' : 'گام‌ها و شاخص‌ها'}</span>
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenAdvancedWizard({
                                scenarioId: scen.id,
                                quantity: scen.id === 'PART_LIFECYCLE_PRODUCTION' ? simQty : 500,
                              });
                            }}
                            className="sap-btn-standard px-3 py-1.5 text-xs font-semibold text-[#107e3e] border-[#b7dfbf] hover:bg-[#ebf5ec] cursor-pointer whitespace-nowrap"
                          >
                            اجرا در جادوگر
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onNavigate(scen.defaultNavTarget.tab, scen.defaultNavTarget.subTab);
                              onClose();
                            }}
                            className="sap-btn-emphasized px-3.5 py-1.5 text-xs font-semibold cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <span>ورود به ماژول</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pt-3 border-t border-[#e8e8e8] grid grid-cols-1 lg:grid-cols-3 gap-4">
                          <div className="lg:col-span-2 space-y-1.5">
                            <div className="font-bold text-xs text-[#333333]">مراحل اجرایی فرآیند (Step-by-Step Workflow):</div>
                            <ul className="space-y-1 text-xs text-[#555555] leading-relaxed">
                              {(scen.detailedFlow || []).map((stepLine, i) => (
                                <li key={i}>{stepLine}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="space-y-2 border-t lg:border-t-0 lg:border-r border-[#e8e8e8] pt-3 lg:pt-0 lg:pr-4">
                            <div className="font-bold text-xs text-[#333333]">شاخص‌های کلیدی مرتبط (KPIs):</div>
                            <div className="text-xs text-[#555555] leading-relaxed">
                              {(scen.linkedKpis || []).join(' · ')}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('KPI_MATRIX');
                                if (kpis.length === 0) loadKpiSnapshot();
                              }}
                              className="text-xs font-semibold text-[#007cc0] hover:underline cursor-pointer inline-flex items-center gap-1 pt-1"
                            >
                              <span>مشاهده مقادیر زنده شاخص‌ها</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'KPI_MATRIX' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['ALL', 'برنامه‌ریزی تولید', 'کنترل موجودی', 'ظرفیت و WIP', 'کیفیت و OEE'] as const).map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setKpiCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer whitespace-nowrap ${
                        kpiCategoryFilter === cat
                          ? 'bg-[#007cc0] text-white font-semibold'
                          : 'bg-[#f5f5f5] text-[#555555] hover:bg-[#e5f3fa]'
                      }`}
                    >
                      {cat === 'ALL' ? `همه شاخص‌ها (${toPersianDigits(kpis.length)})` : cat}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={loadKpiSnapshot}
                  disabled={loadingKpis}
                  className="sap-btn-standard px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingKpis ? 'animate-spin' : ''}`} />
                  <span>به‌روزرسانی زنده شاخص‌ها</span>
                </button>
              </div>

              {loadingKpis && kpis.length === 0 ? (
                <div className="p-10 text-center text-[#666666] flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#007cc0]" />
                  <span>در حال محاسبه زنده شاخص‌های برنامه‌ریزی تولید و کنترل موجودی...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredKpis.map(kpi => {
                    const st = kpiToneStyles(kpi.tone);
                    return (
                      <div key={kpi.id} className={`sap-card p-4 border ${st.border} flex flex-col justify-between gap-3`}>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-[#666666]">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-[#333333]">{kpi.code}</span>
                              <span aria-hidden="true">·</span>
                              <span>{kpi.category}</span>
                            </div>
                            <span className={`font-bold ${st.value}`}>{st.label}</span>
                          </div>

                          <div className="flex items-baseline justify-between gap-3">
                            <h4 className="font-bold text-xs text-[#333333]">{kpi.title}</h4>
                            <span className={`font-mono font-bold text-sm tabular-nums shrink-0 ${st.value}`}>
                              {kpi.valueDisplay}
                            </span>
                          </div>

                          <p className="text-[11px] text-[#555555] leading-relaxed">{kpi.description}</p>
                        </div>

                        <div className="pt-2 border-t border-[#e8e8e8] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                          <div className="text-[#666666] space-y-0.5">
                            <div>فرمول: {kpi.formulaFa}</div>
                            <div className="font-semibold text-[#333333]">{kpi.benchmark}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              onNavigate(
                                kpi.navTarget.tab,
                                kpi.navTarget.subTab,
                                undefined,
                                kpi.navTarget.docQuery ?? null,
                                kpi.navTarget.moId ?? null,
                              );
                              onClose();
                            }}
                            className="sap-btn-standard px-3 py-1.5 text-xs text-[#007cc0] border-[#b3ddf2] hover:bg-[#e5f3fa] cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap"
                          >
                            <span>{kpi.navTarget.label}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'DIRECTORY' && (
            <div className="space-y-4">
              <p className="text-xs text-[#666666]">
                دسترسی مستقیم به تمام ماژول‌ها و زیرصفحات عملیاتی سامانه. روی هر دکمه کلیک کنید تا بلافاصله به صفحه مرتبط هدایت شوید:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {DIRECTORY_GROUPS.map((grp, i) => (
                  <div key={i} className="sap-card p-4 space-y-3 flex flex-col justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-[#007cc0]" dir="ltr">{grp.sapCode}</span>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigate(grp.primaryTab, grp.primarySubTab);
                            onClose();
                          }}
                          className="text-xs font-semibold text-[#007cc0] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <span>باز کردن بخش</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h4 className="font-bold text-[#333333] text-xs">{grp.title}</h4>
                      <p className="text-[11px] text-[#666666] leading-relaxed">{grp.desc}</p>
                    </div>

                    <div className="pt-2 border-t border-[#e8e8e8] flex flex-wrap gap-1.5">
                      {grp.links.map((lnk, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onNavigate(lnk.tab, lnk.subTab);
                            onClose();
                          }}
                          className="px-2.5 py-1 rounded bg-[#f5f5f5] hover:bg-[#e5f3fa] border border-[#d9d9d9] hover:border-[#b3ddf2] text-[11px] text-[#333333] hover:text-[#007cc0] transition cursor-pointer whitespace-nowrap"
                        >
                          {lnk.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'PAGE_ATLAS' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#555555]">
                  مرجع کامل تمام صفحات، بخش‌ها، دکمه‌ها و لینک‌های کل نرم‌افزار (مثلاً «ذخیره در MRP» در ساختار درختی محصول یا همگام‌سازی پایگاه داده):
                </div>
                <div className="relative min-w-[260px]">
                  <Search className="w-3.5 h-3.5 text-[#666666] absolute right-2.5 top-2" />
                  <input
                    type="text"
                    value={atlasSearch}
                    onChange={e => setAtlasSearch(e.target.value)}
                    placeholder="جستجوی صفحه یا نام دکمه (مثلاً: ذخیره در MRP)..."
                    className="w-full bg-white border border-[#bfbfbf] rounded-sm pr-8 pl-3 py-1.5 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
                {/* Page List */}
                <div className="border border-[#d9d9d9] rounded-sm bg-[#f7f7f7] p-2 space-y-1 max-h-[420px] overflow-y-auto">
                  {filteredAtlasPages.map(p => {
                    const isSel = p.key === activeAtlasPage.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedAtlasKey(p.key)}
                        className={`w-full text-right p-2 rounded-sm border text-xs transition cursor-pointer ${
                          isSel
                            ? 'bg-[#e5f3fa] border-[#007cc0] text-[#007cc0] font-bold'
                            : 'bg-white border-[#e5e5e5] text-[#333333] hover:bg-[#f0f4f8]'
                        }`}
                      >
                        <div className="truncate">{p.title}</div>
                        <div className="text-[10px] font-normal text-[#666666] truncate mt-0.5">
                          {p.moduleGroup} · {toPersianDigits(p.buttonsAndLinks.length)} دکمه و لینک
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Page Deep Guide */}
                <div className="lg:col-span-2 border border-[#d9d9d9] rounded-sm bg-white p-4 space-y-3 max-h-[420px] overflow-y-auto">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#e8e8e8]">
                    <div>
                      <div className="text-[11px] text-[#666666]">
                        {activeAtlasPage.moduleGroup} · <span className="font-mono" dir="ltr">{activeAtlasPage.sapRef}</span>
                      </div>
                      <h4 className="text-sm font-bold text-[#333333]">{activeAtlasPage.title}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(activeAtlasPage.tab, activeAtlasPage.subTab);
                        onClose();
                      }}
                      className="sap-btn-emphasized px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <span>ورود مستقیم به این صفحه</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="text-xs text-[#333333] leading-relaxed bg-[#f7f9fb] border border-[#d9e2ec] rounded-sm p-3">
                    <span className="font-bold text-[#007cc0]">منظور و کاربرد صفحه: </span>
                    {activeAtlasPage.fullPurpose}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-bold text-[#333333]">دکمه‌ها، لینک‌ها و ابزارهای این صفحه:</div>
                    <div className="space-y-2">
                      {activeAtlasPage.buttonsAndLinks.map((btn, i) => (
                        <div key={i} className="border border-[#e8e8e8] rounded-sm p-2.5 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-[#007cc0]">{btn.label}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 border border-[#d9d9d9] bg-[#f7f7f7] rounded-sm">
                              {btn.kind}
                            </span>
                          </div>
                          <div className="text-xs text-[#444444] leading-relaxed">{btn.purpose}</div>
                          <div className="text-[11px] text-[#666666]">زمان استفاده: {btn.whenToUse}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'HYBRID_SYNC' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#ebf5ec] border border-[#b7dfbf] rounded space-y-2">
                <div className="flex items-center gap-2 font-bold text-[#107e3e] text-sm">
                  <Database className="w-4 h-4" />
                  <span>اتصال دوگانه پایگاه داده (Local PostgreSQL + Cloud Supabase PostgreSQL)</span>
                </div>
                <p className="text-xs text-[#333333] leading-relaxed">
                  در سیستم‌های مختلف کارخانه یا محیط کلود، آدرس (Link/URL) پایگاه داده‌ها متفاوت است. از بخش تنظیمات می‌توانید لینک هر دو پایگاه داده <strong>محلی (Local)</strong> و <strong>ابری (Cloud)</strong> را مستقل وارد کرده، تست اتصال بگیرید و هدف فعال را جابه‌جا کنید.
                </p>
              </div>

              {dbStatus && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded space-y-1">
                    <div className="font-bold text-[#333333]">لینک محلی (Local PostgreSQL)</div>
                    <div className="font-mono text-[11px] text-[#007cc0] break-all" dir="ltr">
                      {dbStatus.localDbUrlMasked || 'تنظیم نشده'}
                    </div>
                  </div>
                  <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded space-y-1">
                    <div className="font-bold text-[#333333]">لینک ابری (Cloud / Supabase)</div>
                    <div className="font-mono text-[11px] text-[#107e3e] break-all" dir="ltr">
                      {dbStatus.cloudDbUrlMasked || 'تنظیم نشده'}
                    </div>
                  </div>
                </div>
              )}

              {syncNotice && (
                <div
                  className={`p-3 rounded border text-xs flex items-center gap-2 ${
                    syncNotice.type === 'success'
                      ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]'
                      : 'bg-[#fde8e8] border-[#f5b8b8] text-[#bb0000]'
                  }`}
                >
                  {syncNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{syncNotice.text}</span>
                </div>
              )}

              <div className="p-3 bg-[#f7f7f7] border border-[#d9d9d9] rounded flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-[#333333] text-xs">
                    مسیر فعال فعلی: <span className="font-mono text-[#007cc0]">{dbStatus?.activeTarget || 'AUTO'}</span>
                  </div>
                  <div className="text-[11px] text-[#666666] mt-0.5">
                    {dbStatus?.lastSyncAt
                      ? `آخرین همگام‌سازی: ${new Date(dbStatus.lastSyncAt).toLocaleString('fa-IR')}`
                      : 'برای ثبت یا تست لینک‌های محلی و ابری، وارد تنظیمات پایگاه داده شوید.'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('settings', 'db_architecture');
                      onClose();
                    }}
                    className="sap-btn-standard px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>تنظیم لینک‌های محلی و ابری</span>
                  </button>
                  <button
                    type="button"
                    disabled={syncBusy}
                    onClick={handleTriggerSync}
                    className="sap-btn-emphasized px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                    <span>{syncBusy ? 'در حال همگام‌سازی...' : 'همگام‌سازی با پایگاه داده فعال'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-[#f7f7f7] border-t border-[#d9d9d9] shrink-0 text-xs">
          <span className="text-[#666666]">مرکز راهنما و شبیه‌ساز فرآیندهای صنعتی KPIMS ERP</span>
          <button
            type="button"
            onClick={onClose}
            className="sap-btn-standard px-4 py-1.5 cursor-pointer"
          >
            بستن راهنما
          </button>
        </div>
      </div>
    </div>
  );
};
