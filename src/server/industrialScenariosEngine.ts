import {
  Part,
  Machine,
  Routing,
  DieMold,
  InventoryDocument,
  InventoryReservation,
  PhysicalCoil,
  SapcoContract,
  InventoryTransaction,
} from '../types/inventory';
import {
  calculateDetailedStockBalances,
  issuePhysicalCoilPartial,
  AuditRecord,
} from './inventoryEngine';
import {
  customerOrdersStore,
  evaluateMachineEligibility,
  machineWorkloadHoursMap,
} from './productionPlanningEngine';
import {
  manufacturingOrdersStore,
  createManufacturingOrder,
  persistProductionWipState,
} from './productionWipEngine';
import {
  runFullMrp,
  serverQcHoldStore,
  mrpPurchaseRequisitionsStore,
  MrpPurchaseRequisition,
} from './mrpEngine';
import { getAllBoms } from './bomAndParallelEngine';
import {
  applyQcHoldsToBalances,
  getManagementDashboardSummary,
  getWipAgingReport,
  getScrapByPartAndOperationReport,
  getMaterialConsumptionVsStandardReport,
  getProductionBacklogReport,
} from './managementReportsEngine';
import {
  createFallbackProposal,
  approveFallbackProposal,
  releaseFallbackProposal,
  listFallbackProposals,
  reviseFallbackProposal,
} from './inMemoryRelationalFallback';
import { CustomerOrder } from '../types/productionPlanning';
import { formatToJalali } from '../utils/jalali';

export type ScenarioId =
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

export interface ScenarioNavTarget {
  tab:
    | 'contracts'
    | 'inventory'
    | 'master_data'
    | 'parts'
    | 'planning'
    | 'mrp'
    | 'machines'
    | 'production'
    | 'wip'
    | 'reports'
    | 'bom'
    | 'settings';
  subTab?: string;
  docQuery?: string;
  moId?: string;
  label: string;
}

export interface ScenarioStepEvaluation {
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

export interface ScenarioCatalogItem {
  id: ScenarioId;
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

export interface IndustrialKpiMetric {
  id: string;
  code: string;
  title: string;
  category: 'برنامه‌ریزی تولید' | 'کنترل موجودی' | 'کیفیت و OEE' | 'ظرفیت و WIP';
  valueDisplay: string;
  formulaFa: string;
  benchmark: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  description: string;
  navTarget: ScenarioNavTarget;
}

export interface ScenarioRuntimeStores {
  parts: Part[];
  machines: Machine[];
  routings: Routing[];
  dies: DieMold[];
  contracts: SapcoContract[];
  physicalCoils: PhysicalCoil[];
  inventoryDocs: InventoryDocument[];
  reservations: InventoryReservation[];
  transactions: InventoryTransaction[];
  auditLogs: AuditRecord[];
}

export const SCENARIO_CATALOG: ScenarioCatalogItem[] = [
  {
    id: 'PART_LIFECYCLE_PRODUCTION',
    code: 'SCN-01',
    title: 'سناریوی صفر تا صد تولید قطعه جدید یا موجود (مثلاً ۵۰۰۰ عدد قطعه A)',
    subtitle: 'بررسی وجود قطعه در کاتالوگ (و لینک تعریف فوری در صورت نبود)، قرارداد، مسیر عملیات، BOM، کنترل موجودی چندمرحله‌ای فیلترشده، شاخص‌های KPI و تأیید پیشنهاد تا صدور MO',
    category: 'چرخه جامع مهندسی و تولید (E2E)',
    sapFlow: 'MM01/03 → VA01 → CA03 → CS03 → MMBE (WIP) → MRP/KPI → PRP → CO01',
    defaultActionLabel: 'تأیید پیشنهاد برنامه و صدور دستور کار (MO)',
    detailedFlow: [
      '۱. احراز وجود قطعه در کاتالوگ مرکزی (در صورت نبودن، لینک مستقیم به صفحه تعریف قطعه با کد پیشنهادی)',
      '۲. کنترل قرارداد تجاری فعال و سفارش مشتری ساپکو/سایپا',
      '۳. ممیزی مسیر عملیات تولید (Routing)، ایستگاه‌های کاری، قالب‌ها و پرس‌های واجد شرایط',
      '۴. انفجار درخت ساختار محصول (Multi-Level BOM) شامل ورق خام، زیرقطعات و اتصالات جوشی',
      '۵. کنترل موجودی فیلترشده از انبار مواد اولیه و رول‌ها تا مراحل WIP و انبار محصول نهایی',
      '۶. تحلیل خالص نیاز MRP، ظرفیت پرس (CRP)، ریسک ضایعات و شاخص‌های کلیدی (KPI)',
      '۷. تولید پیشنهاد برنامه (PRP)، دریافت تأیید کاربر و صدور رسمی دستور کار (MO) به کارگاه',
    ],
    linkedKpis: ['خالص نیاز تولید (Net Req)', 'پوشش کلاف ورق', 'بار ظرفیت پرس (CRP %)', 'میزان WIP در جریان'],
    defaultNavTarget: { tab: 'planning', subTab: 'recommendations' },
  },
  {
    id: 'PROD_ORDER',
    code: 'SCN-02',
    title: 'تأمین قرارداد ساپکو تا صدور دستور کار (MO) و صف تولید (MTO)',
    subtitle: 'بررسی قرارداد تجاری، موجودی کلاف با گرید متناظر، خالص احتیاجات MRP، پیشنهاد برنامه و صدور رسمی دستور کار به WIP',
    category: 'برنامه‌ریزی و فروش (SD/PP)',
    sapFlow: 'VA01 → MD04 → CO01 → WIP',
    defaultActionLabel: 'تأیید پیشنهاد و صدور فوری دستور کار (MO)',
    detailedFlow: [
      '۱. تطبیق سفارش مشتری و قرارداد مرجع ساپکو',
      '۲. بررسی موجودی کلاف با گرید و ضخامت هم‌تراز',
      '۳. محاسبه خالص نیاز پس از کسر FG و WIP فعال',
      '۴. صدور پیشنهاد، تصویب و آزادسازی به صف اجرای دستور کار',
    ],
    linkedKpis: ['نرخ تحقق سفارش (OTD)', 'موجودی آزاد محصول (FG)', 'انباشت سفارشات (Backlog)'],
    defaultNavTarget: { tab: 'planning', subTab: 'recommendations' },
  },
  {
    id: 'COIL_SLITTING',
    code: 'SCN-03',
    title: 'رول‌بازکنی، تخصیص قرارداد و حواله جزئی کلاف مادر (Heat Traceability)',
    subtitle: 'ارزیابی وزن واقعی رول، شماره ذوب، وضعیت QC و حواله جزئی ۲۶۱ به اولین ایستگاه دستور کار بدون ابطال مانده کلاف',
    category: 'انبار ورق و خط برش (MM/PP)',
    sapFlow: 'MMBE → MIGO 261 → WIP Load → Genealogy',
    defaultActionLabel: 'اجرای حواله جزئی کلاف و ثبت سند مصرف ۲۶۱',
    detailedFlow: [
      '۱. شناسایی کلاف فیزیکی و احراز شماره ذوب (Heat Number) و گرید ورق',
      '۲. کنترل عدم قرنطینه کیفی و کفایت مانده وزنی کلاف',
      '۳. صدور حواله جزئی ۲۶۱ و اتصال به دستور کار خط برش و پرس',
      '۴. نگهداری مانده کلاف مادر در انبار و ثبت در گزارش مصرف رول',
    ],
    linkedKpis: ['بازده برش رول (Coil Yield %)', 'پرت کناره برش (Trim Scrap)', 'ردیابی شماره ذوب'],
    defaultNavTarget: { tab: 'inventory', subTab: 'COILS' },
  },
  {
    id: 'QM_UD',
    code: 'SCN-04',
    title: 'مدیریت قرنطینه کیفی و آزادسازی موجودی (QM Hold → Movement 321)',
    subtitle: 'شناسایی ردیف‌ها و کلاف‌های مسدودشده در QC، ارزیابی اثر روی MRP و صدور تصمیم مصرف کیفی (Usage Decision)',
    category: 'کنترل کیفیت (QM)',
    sapFlow: 'QA32 → MIGO 321 → MD04',
    defaultActionLabel: 'ثبت تصمیم مصرف (UD) و آزادسازی از قرنطینه (۳۲۱)',
    detailedFlow: [
      '۱. پایش موجودی مسدود و در بازرسی کیفی (QI / Blocked Stock)',
      '۲. تحلیل اثر قرنطینه روی کمبود ظاهری MRP و توقف خطوط',
      '۳. صدور تصمیم مصرف کیفی (UD) با حرکت ۳۲۱ به موجودی آزاد',
      '۴. آزادسازی آنی کلاف و قطعات برای مصرف خط تولید',
    ],
    linkedKpis: ['حجم موجودی قرنطینه', 'First Pass Yield (FPY)', 'نرخ ردیابی کیفی'],
    defaultNavTarget: { tab: 'inventory', subTab: 'QUALITY_QM' },
  },
  {
    id: 'MATERIAL_SHORTAGE',
    code: 'SCN-05',
    title: 'انفجار چندسطحی BOM، کشف کسری متریال/اتصالات و صدور درخواست خرید (PR)',
    subtitle: 'محاسبه دقیق کسری ورق و پیچ/مهره جوشی بر اساس BOM زنده و صدور خودکار درخواست خرید (PR) در سیستم تدارکات',
    category: 'تدارکات و MRP (MM/PP)',
    sapFlow: 'CS12 → MD02 → ME51N',
    defaultActionLabel: 'اجرای MRP و صدور درخواست خرید (PR) برای کسری‌ها',
    detailedFlow: [
      '۱. انفجار درخت محصول و استخراج مصرف ورق، مهره و پیچ جوشی',
      '۲. موازنه تقاضای ناخالص با موجودی آزاد، رزروشده و قراردادها',
      '۳. استخراج لیست کسری خالص (Hard Shortages)',
      '۴. صدور خودکار درخواست خرید (PR) با اولویت بحرانی',
    ],
    linkedKpis: ['تعداد اقلام کسری MRP', 'نرخ پوشش قرارداد ورق', 'زمان انتظار تأمین'],
    defaultNavTarget: { tab: 'planning', subTab: 'mrp' },
  },
  {
    id: 'SUB_ASSEMBLY_PARALLEL',
    code: 'SCN-06',
    title: 'برنامه‌ریزی موازی زیرمجموعه‌های پرسی-جوشی و مونتاژ نهایی',
    subtitle: 'هماهنگ‌سازی دستورات کار قطعات اصلی و مکمل با مونتاژ نهایی و بررسی موجودی اتصالات پای خط جوش',
    category: 'تولید موازی و WIP (PP/SFC)',
    sapFlow: 'CO07 (Parent/Child Sub-MO) → WIP Join',
    defaultActionLabel: 'صدور همزمان دستور کار مونتاژ و زیرمجموعه‌های WIP',
    detailedFlow: [
      '۱. تفکیک محصول نهایی به شاخه‌های موازی (صفحه اصلی و مکمل)',
      '۲. صدور همزمان دستور کار برای هر شاخه پرسی متصل به مسیر ساخت',
      '۳. همگام‌سازی در ایستگاه جوشکاری CO2 و خط کاتافورز',
      '۴. ثبت ورود یکپارچه مجموعه نهایی در WIP',
    ],
    linkedKpis: ['بالانس خطوط موازی', 'موجودی بین‌مرحله‌ای WIP', 'زمان سیکل مونتاژ'],
    defaultNavTarget: { tab: 'wip', subTab: 'ORDERS' },
  },
  {
    id: 'CAPACITY_REROUTE',
    code: 'SCN-07',
    title: 'تحلیل گلوگاه پرس‌های سنگین و بازتخصیص به دستگاه جایگزین واجد شرایط',
    subtitle: 'بررسی بار واقعی ساعات کاری پرس‌ها (CRP)، شناسایی ماشین جایگزین سازگار با تناژ و قالب، و ایجاد نسخه بازنگری‌شده برنامه',
    category: 'ظرفیت و زمان‌بندی (CRP)',
    sapFlow: 'CM01 / CM25 → PRP Revise → CO01',
    defaultActionLabel: 'بازتخصیص ماشین جایگزین و صدور دستور کار بهینه‌شده',
    detailedFlow: [
      '۱. ارزیابی بار ساعتی تمام پرس‌ها و تشخیص ایستگاه گلوگاه',
      '۲. فیلتر ماشین‌آلات جایگزین با تناژ کافی، فرآیند متناظر و سازگاری قالب',
      '۳. ایجاد نسخه بازنگری‌شده پیشنهاد برنامه (v+1)',
      '۴. تصویب و صدور دستور کار روی خط کم‌بارتر',
    ],
    linkedKpis: ['بهره‌وری ظرفیت پرس (%)', 'تعداد ایستگاه‌های گلوگاه', 'زمان تعویض قالب (SMED)'],
    defaultNavTarget: { tab: 'planning', subTab: 'capacity_planning' },
  },
  {
    id: 'SAFETY_STOCK',
    code: 'SCN-08',
    title: 'پایش نقطه سفارش (Reorder Point) و جبران کسری موجودی ایمنی انبار',
    subtitle: 'مقایسه موجودی آزاد تمام اقلام با حداقل ایمنی مهندسی و ایجاد دستور ساخت جبرانی (MO) یا درخواست خرید (PR)',
    category: 'کنترل موجودی (MM/MRP)',
    sapFlow: 'MD07 → CO01 / ME51N',
    defaultActionLabel: 'صدور دستور جبران موجودی ایمنی (MO / PR)',
    detailedFlow: [
      '۱. اسکن تمام اقلام کاتالوگ در برابر حداقل موجودی ایمنی',
      '۲. شناسایی موارد بحرانی با پوشش زیر ۲۵٪',
      '۳. صدور خودکار MO برای قطعات ساختنی دارای مسیر',
      '۴. صدور خودکار PR برای مواد اولیه و اتصالات خریدنی',
    ],
    linkedKpis: ['اقلام زیر نقطه سفارش', 'درصد پوشش ایمنی', 'ریسک توقف خط خودروساز'],
    defaultNavTarget: { tab: 'inventory', subTab: 'ALERTS' },
  },
  {
    id: 'OEE_SCRAP_RECOVERY',
    code: 'SCN-09',
    title: 'تحلیل افت OEE، کنترل ضایعات پرس‌کاری و صدور دستور کار جبرانی (TPM / Rework)',
    subtitle: 'پایش شاخص OEE (دسترس‌پذیری × کارایی × کیفیت)، شناسایی مراحل با ضایعات بالاتر از نرم مهندسی و صدور دستور کار جبرانی تولید',
    category: 'کیفیت، نت و شاخص OEE',
    sapFlow: 'OEE / TPM → Scrap Analysis → Makeup MO',
    defaultActionLabel: 'صدور دستور کار جبرانی ضایعات و ثبت گزارش تحلیل OEE',
    detailedFlow: [
      '۱. بررسی نرخ ضایعات واقعی در مقایسه با نرم استاندارد عملیات',
      '۲. ردیابی توقفات اضطراری پرس، مشکلات کشش و شکستگی سنبه‌ماتریس',
      '۳. محاسبه کسری ناشی از ضایعات و ایجاد دستور کار جبرانی در WIP',
      '۴. اتصال به داشبورد OEE و نت پیشگیرانه ماشین‌آلات',
    ],
    linkedKpis: ['شاخص OEE کل خط', 'نرخ ضایعات واقعی (%)', 'MTBF / MTTR پرس‌ها'],
    defaultNavTarget: { tab: 'reports', subTab: 'oee_module' },
  },
  {
    id: 'ECO_REVISION_CONTROL',
    code: 'SCN-10',
    title: 'مدیریت تغییر مهندسی (ECO / ECN) و ارزیابی اثر روی BOM، مسیر و WIP',
    subtitle: 'کنترل ریسک تغییرات نقشه یا ضخامت ورق خودروساز (cut-in)، بررسی اثر روی دستورات کار باز و ایجاد نسخه جدید پیشنهاد برنامه',
    category: 'مهندسی محصول و تغییرات (PLM)',
    sapFlow: 'CC01 / ECO Impact → BOM & Routing → PRP v+1',
    defaultActionLabel: 'ثبت ممیزی تغییر مهندسی و بازنگری پیشنهاد برنامه',
    detailedFlow: [
      '۱. بررسی تغییرات نسخه BOM و مسیر عملیات قطعه منتخب',
      '۲. ردیابی موجودی در جریان (WIP) و دستورات کار باز با نسخه قبلی',
      '۳. ارزیابی مصرف ورق و اتصالات پس از تغییر مهندسی',
      '۴. ثبت لاگ تغییر مهندسی (ECO) و صدور نسخه جدید پیشنهاد تولید',
    ],
    linkedKpis: ['دستور کارهای باز متأثر از ECO', 'حجم WIP نسخه قدیم', 'انحراف مصرف استاندارد BOM'],
    defaultNavTarget: { tab: 'master_data', subTab: 'BOM' },
  },
  {
    id: 'SUBCONTRACT_OUTSIDE_PROC',
    code: 'SCN-11',
    title: 'برون‌سپاری عملیات پیمانکار (رنگ کاتافورز ED / آبکاری) و کنترل موجودی نزد پیمانکار',
    subtitle: 'پایش اقلام ارسال‌شده به پیمانکار (Vendor WIP)، شناسایی گلوگاه ماندگاری بالای ۴۸ ساعت و ثبت سند بازگشت/تکمیل به انبار',
    category: 'عملیات برون‌سپاری و WIP',
    sapFlow: 'ME2O / Subcontract Transfer → Vendor WIP → MIGO 101',
    defaultActionLabel: 'ثبت ممیزی پیگیری برون‌سپاری و کنترل موجودی پیمانکار',
    detailedFlow: [
      '۱. شناسایی ایستگاه‌های رنگ کاتافورز / عملیات بیرونی در مسیر ساخت',
      '۲. کنترل مانده اقلام در جریان نزد پیمانکار (STAGE_ED_PAINT)',
      '۳. پایش اقلام معوق و سن‌یابی خواب بین‌عملیاتی (WIP Aging)',
      '۴. همگام‌سازی ورود پس از عملیات پیمانکار با انبار محصول نهایی',
    ],
    linkedKpis: ['موجودی امانی نزد پیمانکار', 'اقلام خواب بالای ۴۸ ساعت', 'زمان برگشت از برون‌سپاری'],
    defaultNavTarget: { tab: 'reports', subTab: 'wip_aging' },
  },
  {
    id: 'KPI_EXEC_CONTROL_TOWER',
    code: 'SCN-12',
    title: 'برج کنترل شاخص‌های کلیدی برنامه تولید و کنترل موجودی (Executive KPI Tower)',
    subtitle: 'ممیزی زنده ۱۰ شاخص استاندارد صنعتی (OTD، انحراف برنامه، Backlog، لود پرس‌ها، WIP Aging، ضایعات، انحراف BOM و پوشش ایمنی) با لینک مستقیم به گزارش هر شاخص',
    category: 'شاخص‌ها و پایش مدیریتی (KPI)',
    sapFlow: 'KPI Control Tower → Plan vs Actual / MRP / OEE / Aging',
    defaultActionLabel: 'تولید گزارش ممیزی برج کنترل KPI در کارنامه ممیزی',
    detailedFlow: [
      '۱. پایش شاخص‌های فروش و تعهدات (OTD %، سفارشات عقب‌افتاده Backlog)',
      '۲. پایش شاخص‌های تولید و ظرفیت (نرخ تحقق برنامه، لود ماشین‌آلات، OEE)',
      '۳. پایش شاخص‌های موجودی و مواد (کسری MRP، اقلام زیر نقطه سفارش، موجودی قرنطینه)',
      '۴. پایش سلامت کارگاه (خواب WIP بالای ۴۸ ساعت، ضایعات و انحراف مصرف استاندارد)',
    ],
    linkedKpis: ['تحقق برنامه (%)', 'تاخیرات و Backlog', 'خواب WIP بالای ۴۸ ساعت', 'انحراف مصرف مواد'],
    defaultNavTarget: { tab: 'reports', subTab: 'comprehensive_production' },
  },
];

export interface EvaluateScenarioInput {
  scenarioId: ScenarioId;
  partIdOrCode?: string;
  coilId?: string;
  quantity?: number;
  machineId?: string;
  userName?: string;
}

export interface EvaluateScenarioResult {
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

export interface ExecuteScenarioResult {
  success: boolean;
  scenarioId: ScenarioId;
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
  evaluation: EvaluateScenarioResult;
}

const fmt = (n: number) => Math.round(n * 100) / 100;

function normalizeSearchQuery(raw?: string): string {
  if (!raw) return '';
  return String(raw)
    .replace(/[۰-۹]/g, ch => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(ch)))
    .replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exact/fuzzy lookup WITHOUT silently falling back when the user explicitly queried a part name/code!
 * Fast and reliable across 1,461+ parts with Persian/Arabic digit normalization.
 */
function findRequestedPart(parts: Part[], partIdOrCode?: string): { part: Part | null; explicitQuery: string | undefined } {
  const trimmed = normalizeSearchQuery(partIdOrCode);
  if (trimmed) {
    const lower = trimmed.toLowerCase();
    const exact = parts.find(
      p =>
        normalizeSearchQuery(p.id).toLowerCase() === lower ||
        normalizeSearchQuery(p.code).toLowerCase() === lower ||
        (p.sapcoCode && normalizeSearchQuery(p.sapcoCode).toLowerCase() === lower) ||
        normalizeSearchQuery(p.name).toLowerCase() === lower,
    );
    if (exact) return { part: exact, explicitQuery: trimmed };

    const prefix = parts.find(
      p =>
        normalizeSearchQuery(p.code).toLowerCase().startsWith(lower) ||
        (p.sapcoCode && normalizeSearchQuery(p.sapcoCode).toLowerCase().startsWith(lower)) ||
        normalizeSearchQuery(p.name).toLowerCase().startsWith(lower),
    );
    if (prefix) return { part: prefix, explicitQuery: trimmed };

    const fuzzy = parts.find(
      p =>
        normalizeSearchQuery(p.code).toLowerCase().includes(lower) ||
        normalizeSearchQuery(p.name).toLowerCase().includes(lower) ||
        (p.sapcoCode && normalizeSearchQuery(p.sapcoCode).toLowerCase().includes(lower)),
    );
    return { part: fuzzy || null, explicitQuery: trimmed };
  }

  const defaultPart =
    parts.find(p => p.code === 'SAPCO-ASY-ECU-BRK-01') ||
    parts.find(p => p.category === 'FINISHED_GOOD') ||
    parts[0] ||
    null;
  return { part: defaultPart, explicitQuery: undefined };
}

export function getIndustrialKpiSnapshot(stores: ScenarioRuntimeStores): {
  generatedAt: string;
  metrics: IndustrialKpiMetric[];
} {
  const summary = getManagementDashboardSummary();
  const aging = getWipAgingReport().data;
  const scrapRows = getScrapByPartAndOperationReport().data;
  const backlogRows = getProductionBacklogReport().data;
  const consumptionRows = getMaterialConsumptionVsStandardReport().data;
  const { balances: rawBalances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const balances = applyQcHoldsToBalances(rawBalances, serverQcHoldStore);

  const mrpReport = runFullMrp({ includeWip: true, includeConsignment: true });
  const mrpShortageCount = mrpReport.materials.filter(m => m.hardShortageQuantity > 0 || m.shortageQuantity > 0).length;

  const belowSafetyCount = stores.parts.filter(p => {
    if (!p.minStock || p.minStock <= 0) return false;
    const avail = balances.filter(b => b.partId === p.id || b.partCode === p.code).reduce((s, b) => s + b.availableQty, 0);
    return avail < p.minStock;
  }).length;

  const heldCount =
    Object.values(serverQcHoldStore).filter(h => h.isHeld).length +
    stores.physicalCoils.filter(c => ['QUARANTINE', 'QUALITY_BLOCKED', 'REJECTED'].includes(c.qualityStatus) || c.physicalStatus === 'BLOCKED').length;

  const totalScrapPcs = scrapRows.reduce((s, r) => s + r.scrapPieces, 0);
  const totalInputPcs = scrapRows.reduce((s, r) => s + r.totalInputQty, 0);
  const avgScrapPct = totalInputPcs > 0 ? Math.round((totalScrapPcs / totalInputPcs) * 1000) / 10 : 0;
  const aboveNormScrapCount = scrapRows.filter(r => r.isAboveNorm).length;

  const totalConsVarKg = Math.round(consumptionRows.reduce((s, r) => s + Math.abs(r.varianceKg), 0) * 10) / 10;
  const stagnantCount = aging.filter(a => a.idleHours >= 48).length;

  const otdRate =
    summary.activeCustomerOrdersCount + backlogRows.length > 0
      ? Math.max(0, Math.round((1 - backlogRows.length / Math.max(1, summary.activeCustomerOrdersCount + backlogRows.length)) * 100))
      : 100;

  const metrics: IndustrialKpiMetric[] = [
    {
      id: 'KPI_PLAN_ACHIEVEMENT',
      code: 'KPI-PP-01',
      title: 'نرخ تحقق برنامه تولید (Plan Achievement)',
      category: 'برنامه‌ریزی تولید',
      valueDisplay: `${summary.overallPlanAchievementRatePercent}%`,
      formulaFa: '(جمع تولید واقعی تکمیل‌شده ÷ جمع تیراژ برنامه‌ریزی‌شده) × ۱۰۰',
      benchmark: 'هدف استاندارد: ≥ ۹۰٪',
      tone: summary.overallPlanAchievementRatePercent >= 80 ? 'good' : summary.overallPlanAchievementRatePercent > 0 ? 'warn' : 'neutral',
      description: `${summary.totalActualProducedPieces.toLocaleString('fa-IR')} تولید واقعی از ${summary.totalPlannedProductionPieces.toLocaleString('fa-IR')} عدد برنامه‌ریزی‌شده`,
      navTarget: { tab: 'reports', subTab: 'plan_vs_actual', label: 'گزارش تحقق برنامه' },
    },
    {
      id: 'KPI_OTD_BACKLOG',
      code: 'KPI-SD-02',
      title: 'تحویل به‌موقع (OTD) و سفارشات معوق (Backlog)',
      category: 'برنامه‌ریزی تولید',
      valueDisplay: `${otdRate}% (${backlogRows.length} معوق)`,
      formulaFa: '(سفارشات تحویل به‌موقع ÷ کل تعهدات فعال خودروساز) × ۱۰۰',
      benchmark: 'هدف IATF 16949: ≥ ۹۸٪',
      tone: backlogRows.length === 0 ? 'good' : backlogRows.length <= 2 ? 'warn' : 'bad',
      description: `${summary.activeCustomerOrdersCount} سفارش فعال مشتری و ${summary.totalDelayedOrdersCount} مورد تأخیر ثبت‌شده`,
      navTarget: { tab: 'reports', subTab: 'backlog', label: 'گزارش معوقات تولید' },
    },
    {
      id: 'KPI_CAPACITY_LOAD',
      code: 'KPI-CRP-03',
      title: 'میانگین بار ظرفیت پرس‌ها (Machine Utilization)',
      category: 'ظرفیت و WIP',
      valueDisplay: `${summary.averageMachineUtilizationPercent}%`,
      formulaFa: '(ساعات کار تخصیص‌یافته ÷ ظرفیت اسمی ۱۵ ساعت در روز) × ۱۰۰',
      benchmark: 'محدوده بهینه: ۷۰٪ تا ۸۵٪',
      tone: summary.averageMachineUtilizationPercent > 90 ? 'bad' : summary.averageMachineUtilizationPercent >= 40 ? 'good' : 'neutral',
      description: `محاسبه‌شده روی ${summary.reliableMachinesCount} ماشین دارای داده معتبر ظرفیت`,
      navTarget: { tab: 'planning', subTab: 'CAPACITY', label: 'تایم‌لاین ظرفیت پرس‌ها' },
    },
    {
      id: 'KPI_MRP_SHORTAGE',
      code: 'KPI-MM-04',
      title: 'کسری خالص متریال و کلاف ورق (MRP Shortage)',
      category: 'کنترل موجودی',
      valueDisplay: `${summary.totalMaterialShortageKg.toLocaleString('fa-IR')} kg (${mrpShortageCount} قلم)`,
      formulaFa: 'نیاز ناخالص BOM − (موجودی آزاد + کلاف آزاد + WIP − رزروشده)',
      benchmark: 'هدف: ۰ کیلوگرم کسری سخت',
      tone: mrpShortageCount === 0 && summary.totalMaterialShortageKg === 0 ? 'good' : 'warn',
      description: 'موازنه زنده تقاضای قراردادها و BOM با انبار ورق و کویل‌ها',
      navTarget: { tab: 'mrp', label: 'باز کردن کارتابل MRP' },
    },
    {
      id: 'KPI_SAFETY_STOCK',
      code: 'KPI-MM-05',
      title: 'هشدار نقطه سفارش و موجودی ایمنی (ROP)',
      category: 'کنترل موجودی',
      valueDisplay: `${belowSafetyCount} قلم زیر حداقل`,
      formulaFa: 'موجودی قابل دسترس آزاد < حداقل موجودی ایمنی مهندسی (Min Stock)',
      benchmark: 'هدف: ۰ قلم زیر نقطه سفارش',
      tone: belowSafetyCount === 0 ? 'good' : belowSafetyCount <= 2 ? 'warn' : 'bad',
      description: 'پایش لحظه‌ای قطعات نهایی، WIP و مواد اولیه زیر حد ایمنی',
      navTarget: { tab: 'inventory', subTab: 'ALERTS', label: 'مشاهده هشدارهای نقطه سفارش' },
    },
    {
      id: 'KPI_QC_HOLD',
      code: 'KPI-QM-06',
      title: 'اقلام و کلاف‌های در قرنطینه کیفی (QC Hold)',
      category: 'کیفیت و OEE',
      valueDisplay: `${heldCount} مورد مسدود`,
      formulaFa: 'تعداد ردیف‌های QI/Blocked انبار + کلاف‌های قرنطینه',
      benchmark: 'نیازمند تعیین تکلیف (UD ۳۲۱) زیر ۲۴ ساعت',
      tone: heldCount === 0 ? 'good' : 'warn',
      description: 'موجودی قرنطینه‌شده به‌صورت خودکار از ظرفیت مجاز مصرف MRP کسر می‌شود',
      navTarget: { tab: 'inventory', subTab: 'QUALITY', label: 'کارتابل قرنطینه و UD' },
    },
    {
      id: 'KPI_WIP_STOCK',
      code: 'KPI-SFC-07',
      title: 'حجم کار در جریان ساخت و انبار محصول (WIP & FG)',
      category: 'ظرفیت و WIP',
      valueDisplay: `${summary.totalWipQuantityPieces.toLocaleString('fa-IR')} WIP / ${summary.totalFinishedGoodsStockPieces.toLocaleString('fa-IR')} FG`,
      formulaFa: 'Σ(صف ورودی + در حال تولید + آماده انتقال) در ایستگاه‌های دستور کار',
      benchmark: 'جریان روان بدون انباشت بین‌عملیاتی',
      tone: 'neutral',
      description: `در ${summary.activeManufacturingOrdersCount} دستور کار ثبت‌شده در کارگاه`,
      navTarget: { tab: 'inventory', subTab: 'STAGES', label: 'موجودی چندمرحله‌ای WIP' },
    },
    {
      id: 'KPI_WIP_AGING',
      code: 'KPI-SFC-08',
      title: 'پالت‌های راکد و ماندگاری بالای ۴۸ ساعت (WIP Aging)',
      category: 'ظرفیت و WIP',
      valueDisplay: `${stagnantCount} ایستگاه معوق`,
      formulaFa: 'تعداد عملیات دارای موجودی WIP با آخرین فعالیت بیش از ۴۸ ساعت قبل',
      benchmark: 'هدف: ۰ ایستگاه راکد',
      tone: stagnantCount === 0 ? 'good' : 'warn',
      description: `${summary.stagnantWipItemsCount} ردیف در وضعیت نیازمند توجه یا بحرانی`,
      navTarget: { tab: 'reports', subTab: 'wip_aging', label: 'گزارش سن‌یابی WIP' },
    },
    {
      id: 'KPI_SCRAP_RATE',
      code: 'KPI-QM-09',
      title: 'نرخ ضایعات واقعی خطوط پرس و جوش (Scrap Rate)',
      category: 'کیفیت و OEE',
      valueDisplay: `${avgScrapPct}% (${summary.totalScrapPieces.toLocaleString('fa-IR')} عدد)`,
      formulaFa: '(تعداد ضایعات ÷ کل ورودی عملیات پرس/جوش) × ۱۰۰',
      benchmark: 'نرم مجاز استاندارد: ≤ ۲٪',
      tone: aboveNormScrapCount > 0 || avgScrapPct > 2.5 ? 'bad' : avgScrapPct > 0 ? 'warn' : 'good',
      description: `${aboveNormScrapCount} ایستگاه بالاتر از نرم مجاز ضایعات مهندسی (${summary.totalScrapWeightKg} kg)`,
      navTarget: { tab: 'reports', subTab: 'scrap_analysis', label: 'تحلیل ضایعات عملیات' },
    },
    {
      id: 'KPI_BOM_VARIANCE',
      code: 'KPI-CO-10',
      title: 'انحراف مصرف واقعی مواد از استاندارد BOM',
      category: 'کنترل موجودی',
      valueDisplay: `${totalConsVarKg.toLocaleString('fa-IR')} kg انحراف کل`,
      formulaFa: 'Σ |مصرف واقعی کاردکس ۲۶۱ − مصرف تئوری استاندارد BOM|',
      benchmark: 'نوسان مجاز برش رول: ± ۳٪',
      tone: totalConsVarKg > 100 ? 'warn' : 'good',
      description: 'مقایسه مستقیم حواله‌های مصرف خط برش با وزن ناخالص مهندسی BOM',
      navTarget: { tab: 'reports', subTab: 'consumption', label: 'گزارش انحراف مصرف' },
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    metrics,
  };
}

export function getScenarioSelectors(stores: ScenarioRuntimeStores) {
  const { balances: rawBalances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const balances = applyQcHoldsToBalances(rawBalances, serverQcHoldStore);

  const availByPartId = new Map<string, number>();
  const availByPartCode = new Map<string, number>();
  for (const b of balances) {
    if (b.partId) availByPartId.set(b.partId, (availByPartId.get(b.partId) || 0) + b.availableQty);
    if (b.partCode) availByPartCode.set(b.partCode.toUpperCase(), (availByPartCode.get(b.partCode.toUpperCase()) || 0) + b.availableQty);
  }

  const finishedParts = stores.parts
    .filter(p => p.category === 'FINISHED_GOOD' || p.category === 'WIP_PART')
    .map(p => {
      const avail = availByPartId.get(p.id) ?? availByPartCode.get((p.code || '').toUpperCase()) ?? 0;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        materialGrade: p.materialGrade || '',
        sapcoCode: p.sapcoCode || '',
        minStock: p.minStock || 0,
        leadTimeDays: p.leadTimeDays || 2,
        availableQty: fmt(avail),
      };
    });

  const coils = stores.physicalCoils.map(c => ({
    id: c.id,
    coilId: c.coilId,
    materialGrade: c.materialGrade,
    thicknessMm: c.thicknessMm,
    widthMm: c.widthMm,
    remainingWeightKg: c.remainingWeightKg,
    originalWeightKg: c.originalWeightKg,
    heatNumber: c.heatNumber,
    qualityStatus: c.qualityStatus,
    physicalStatus: c.physicalStatus,
  }));

  const machines = stores.machines.map(m => ({
    id: m.id,
    code: m.code,
    name: m.name,
    tonnage: m.tonnage || 0,
    status: m.status,
    workloadHours: machineWorkloadHoursMap[m.id] || 0,
  }));

  const heldLots = Object.values(serverQcHoldStore).filter(h => h.isHeld);
  const blockedCoils = stores.physicalCoils.filter(
    c => ['QUARANTINE', 'QUALITY_BLOCKED', 'REJECTED'].includes(c.qualityStatus) || c.physicalStatus === 'BLOCKED',
  );

  return {
    catalog: SCENARIO_CATALOG,
    finishedParts,
    allPartsCount: stores.parts.length,
    coils,
    machines,
    qcBlockedCount: heldLots.length + blockedCoils.length,
    kpiSnapshot: getIndustrialKpiSnapshot(stores),
  };
}

export interface MrpFeasibilityInput {
  partIdOrCode?: string;
  proposedQty: number;
  targetDueDate?: string;
  deductExistingFgAndWip?: boolean;
}

export interface MrpFeasibilityMaterialRow {
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

export interface MrpFeasibilityContractItem {
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

export interface MrpFeasibilityResult {
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

export function simulateMrpFeasibility(
  input: MrpFeasibilityInput,
  stores: ScenarioRuntimeStores,
): MrpFeasibilityResult {
  const { part, explicitQuery } = findRequestedPart(stores.parts, input.partIdOrCode);
  const proposedQty = Math.max(1, Math.round(Number(input.proposedQty) || 5000));
  const deductExisting = input.deductExistingFgAndWip !== false;
  const evaluatedAt = new Date().toISOString();

  if (!part) {
    return {
      evaluatedAt,
      partExists: false,
      requestedPartQuery: explicitQuery || input.partIdOrCode || 'نامشخص',
      proposedQty,
      netToManufactureQty: proposedQty,
      deductExistingFgAndWip: deductExisting,
      feasibilityStatus: 'PART_NOT_FOUND',
      canCreateMoSafely: false,
      summaryFa: `قطعه «${explicitQuery || input.partIdOrCode || 'نامشخص'}» در کاتالوگ قطعات یافت نشد؛ پیش از شبیه‌سازی MRP و صدور MO باید قطعه تعریف شود.`,
      selectedPart: null,
      stockSnapshot: {
        finishedGoodsAvailable: 0,
        finishedGoodsReserved: 0,
        wipActiveQty: 0,
        wipWarehouseQty: 0,
        qcHeldQty: 0,
        openCustomerDemandQty: 0,
        matchingCoilKg: 0,
        blockedCoilKg: 0,
      },
      openContracts: [],
      competingOrders: [],
      materialRequirements: [],
      scheduleProjection: {
        partManufacturingLeadTimeDays: 0,
        criticalMaterialLeadTimeDays: 0,
        estimatedProductionHours: 0,
        estimatedProductionDays: 0,
        totalCumulativeLeadTimeDays: 0,
        earliestFeasibleDateIso: evaluatedAt.slice(0, 10),
        earliestFeasibleDateFa: formatToJalali(new Date()),
      },
      warnings: [
        {
          severity: 'CRITICAL',
          title: 'قطعه در کاتالوگ وجود ندارد',
          detail: `برای قطعه «${explicitQuery || input.partIdOrCode || 'نامشخص'}» ابتدا باید رکورد پایه در کاتالوگ قطعات ایجاد شود.`,
        },
      ],
    };
  }

  const { balances: rawBalances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const balances = applyQcHoldsToBalances(rawBalances, serverQcHoldStore);
  const partsById = new Map(stores.parts.map(p => [p.id, p]));
  const partsByCode = new Map(stores.parts.map(p => [p.code.toUpperCase(), p]));
  const boms = getAllBoms();

  // Build O(M) balance index
  const balancesByPartKey = new Map<string, typeof balances>();
  for (const b of balances) {
    if (b.partId) {
      const arr = balancesByPartKey.get(b.partId) || [];
      arr.push(b);
      balancesByPartKey.set(b.partId, arr);
    }
    if (b.partCode) {
      const ck = b.partCode.toUpperCase();
      if (ck !== b.partId) {
        const arr = balancesByPartKey.get(ck) || [];
        arr.push(b);
        balancesByPartKey.set(ck, arr);
      }
    }
  }

  const getPartBalances = (pId?: string, pCode?: string) => {
    const seen = new Set<typeof balances[number]>();
    if (pId && balancesByPartKey.has(pId)) {
      balancesByPartKey.get(pId)!.forEach(b => seen.add(b));
    }
    if (pCode && balancesByPartKey.has(pCode.toUpperCase())) {
      balancesByPartKey.get(pCode.toUpperCase())!.forEach(b => seen.add(b));
    }
    return Array.from(seen);
  };

  const partBalances = getPartBalances(part.id, part.code);
  const finishedGoodsAvailable = fmt(
    partBalances.filter(b => b.warehouseId === 'WH-FINISHED').reduce((s, b) => s + b.availableQty, 0),
  );
  const wipWarehouseQty = fmt(
    partBalances.filter(b => b.warehouseId !== 'WH-FINISHED' && b.warehouseId !== 'WH-RAW').reduce((s, b) => s + b.availableQty, 0),
  );
  const finishedGoodsReserved = fmt(
    stores.reservations
      .filter(r => r.status === 'ACTIVE' && (r.partId === part.id || r.partCode === part.code))
      .reduce((s, r) => s + r.quantity, 0),
  );
  const qcHeldQty = fmt(
    Object.values(serverQcHoldStore)
      .filter(h => h.isHeld && (h.partId === part.id || h.partCode === part.code))
      .reduce((s, h) => s + (h.heldQty || 0), 0),
  );

  const openMosForPart = manufacturingOrdersStore.filter(
    m => (m.partId === part.id || m.partCode === part.code) && (m.status === 'RELEASED' || m.status === 'IN_PROGRESS'),
  );
  const wipActiveQty = fmt(
    openMosForPart.reduce(
      (s, m) => s + m.operations.reduce((os, o) => os + o.waitingInputQty + o.inProgressQty + o.readyForTransferQty, 0),
      0,
    ),
  );

  const competingOrders = customerOrdersStore
    .filter(
      o =>
        o.status !== 'CANCELLED' &&
        o.status !== 'FULFILLED' &&
        o.status !== 'TERMINATED' &&
        o.lines.some(l => l.partId === part.id || l.partCode === part.code),
    )
    .map(o => {
      const openQty = o.lines
        .filter(l => l.partId === part.id || l.partCode === part.code)
        .reduce((s, l) => s + Math.max(0, l.orderedQuantity - (l.deliveredQuantity || 0)), 0);
      return {
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        openQty: fmt(openQty),
        dueDate: o.dueDate,
        status: o.status,
      };
    })
    .filter(o => o.openQty > 0);
  const openCustomerDemandQty = fmt(competingOrders.reduce((s, o) => s + o.openQty, 0));

  const freeFgAfterCustomerDemand = Math.max(0, finishedGoodsAvailable - openCustomerDemandQty);
  const netToManufactureQty = deductExisting
    ? Math.max(0, Math.round(proposedQty - freeFgAfterCustomerDemand - wipActiveQty - wipWarehouseQty))
    : proposedQty;

  // Matching coils by grade/part
  const matchingCoils = stores.physicalCoils.filter(c => {
    const gradeMatch = part.materialGrade
      ? c.materialGrade.toUpperCase() === part.materialGrade.toUpperCase()
      : c.partCode === part.code;
    return gradeMatch && c.remainingWeightKg > 0 && c.qualityStatus === 'AVAILABLE' && c.physicalStatus !== 'BLOCKED';
  });
  const matchingCoilKg = fmt(matchingCoils.reduce((s, c) => s + c.remainingWeightKg, 0));
  const blockedCoilKg = fmt(
    stores.physicalCoils
      .filter(c => {
        const gradeMatch = part.materialGrade
          ? c.materialGrade.toUpperCase() === part.materialGrade.toUpperCase()
          : c.partCode === part.code;
        return gradeMatch && c.remainingWeightKg > 0 && (c.qualityStatus !== 'AVAILABLE' || c.physicalStatus === 'BLOCKED');
      })
      .reduce((s, c) => s + c.remainingWeightKg, 0),
  );

  // Open contracts matching part OR material grade
  const openContracts: MrpFeasibilityContractItem[] = stores.contracts
    .filter(c => {
      if (c.status !== 'ACTIVE') return false;
      const explicitLine = (c.commercialLines || []).some(l => l.partId === part.id || l.partCode === part.code);
      const assocCode = (c.associatedPartCodes || []).some(code => code.toUpperCase() === part.code.toUpperCase());
      const gradeMatch = part.materialGrade && c.materialGrade.toUpperCase() === part.materialGrade.toUpperCase();
      return explicitLine || assocCode || Boolean(gradeMatch);
    })
    .map(c => ({
      id: c.id,
      contractNumber: c.contractNumber,
      title: c.title,
      customerName: c.customerName || 'ساپکو',
      materialGrade: c.materialGrade,
      allocatedWeightKg: fmt(c.allocatedWeightKg),
      totalReceivedKg: fmt(c.totalReceivedKg),
      totalConsumedKg: fmt(c.totalConsumedKg),
      remainingQuotaKg: fmt(Math.max(0, c.allocatedWeightKg - c.totalConsumedKg)),
      status: c.status,
      endDate: c.endDate,
    }));

  // BOM explosion vs fallback material model
  const matchingBom = boms.find(b => b.assemblyPartId === part.id || b.assemblyPartCode === part.code);
  const matchingRouting = stores.routings.find(r => r.partId === part.id || r.partCode === part.code);

  // Track material demand already committed by open MOs on shop floor
  const openMoMaterialCommitments = new Map<string, number>();
  for (const mo of manufacturingOrdersStore) {
    if (mo.status !== 'RELEASED' && mo.status !== 'IN_PROGRESS') continue;
    const remMoQty = Math.max(0, mo.targetQuantity - mo.completedQuantity - mo.initialInputQuantity);
    if (remMoQty <= 0) continue;
    const moBom = boms.find(b => b.assemblyPartId === mo.partId || b.assemblyPartCode === mo.partCode);
    if (moBom) {
      for (const comp of moBom.components) {
        const scrapMult = 1 + (comp.scrapAllowancePercent || 0) / 100;
        const unitQty = comp.componentType === 'RAW_SHEET' && comp.unit === 'KG' && comp.grossWeightKg > 0
          ? comp.grossWeightKg
          : (comp.quantityPerAssembly || 1) * scrapMult;
        const need = unitQty * remMoQty;
        const codeKey = (comp.componentPartCode || '').toUpperCase();
        if (codeKey) {
          openMoMaterialCommitments.set(codeKey, (openMoMaterialCommitments.get(codeKey) || 0) + need);
        }
      }
    } else {
      const moPart = partsById.get(mo.partId) || partsByCode.get(mo.partCode.toUpperCase());
      if (moPart?.materialGrade) {
        const key = `GRADE:${moPart.materialGrade.toUpperCase()}`;
        openMoMaterialCommitments.set(key, (openMoMaterialCommitments.get(key) || 0) + remMoQty * (moPart.weightPerUnitKg || 1) * 1.12);
      }
    }
  }

  const materialRequirements: MrpFeasibilityMaterialRow[] = [];

  if (matchingBom && matchingBom.components.length > 0) {
    for (const comp of matchingBom.components) {
      const compCode = comp.componentPartCode || '';
      const compPart = partsById.get(comp.componentPartId) || partsByCode.get(compCode.toUpperCase());
      const scrapPct = comp.scrapAllowancePercent || 0;
      const scrapMult = 1 + scrapPct / 100;
      const perUnitConsumption =
        comp.componentType === 'RAW_SHEET' && comp.unit === 'KG' && comp.grossWeightKg > 0
          ? comp.grossWeightKg
          : (comp.quantityPerAssembly || 1) * scrapMult;
      const reqGross = fmt(proposedQty * perUnitConsumption);
      const reqNet = fmt(netToManufactureQty * perUnitConsumption);

      const cBalances = getPartBalances(compPart?.id || comp.componentPartId, compCode);
      const whAvailable = fmt(cBalances.reduce((s, b) => s + b.availableQty, 0));

      let coilKg = 0;
      const compGrade = compPart?.materialGrade || (comp.componentType === 'RAW_SHEET' ? part.materialGrade : undefined);
      if (comp.componentType === 'RAW_SHEET' || comp.unit === 'KG') {
        const cGrade = (compGrade || '').toUpperCase();
        coilKg = fmt(
          stores.physicalCoils
            .filter(
              c =>
                c.remainingWeightKg > 0 &&
                c.qualityStatus === 'AVAILABLE' &&
                c.physicalStatus !== 'BLOCKED' &&
                ((c.partCode || '').toUpperCase() === compCode.toUpperCase() ||
                  (cGrade !== '' && c.materialGrade.toUpperCase() === cGrade)),
            )
            .reduce((s, c) => s + c.remainingWeightKg, 0),
        );
      }

      // Avoid double counting if WH-RAW warehouse stock mirrors coil weight: take max cleanly
      const totalAvail = fmt(coilKg > 0 ? Math.max(whAvailable, coilKg) : whAvailable);
      const committed = fmt(
        openMoMaterialCommitments.get(compCode.toUpperCase()) ||
          (compGrade ? openMoMaterialCommitments.get(`GRADE:${compGrade.toUpperCase()}`) || 0 : 0),
      );
      const freeForThisMo = fmt(Math.max(0, totalAvail - committed));
      const activeTargetReq = deductExisting ? reqNet : reqGross;
      const shortageGross = fmt(Math.max(0, reqGross - freeForThisMo));
      const shortageNet = fmt(Math.max(0, reqNet - freeForThisMo));
      const minSafety = compPart?.minStock || 0;
      const projectedBalanceAfterMo = fmt(freeForThisMo - activeTargetReq);
      const leadTimeDays =
        compPart?.leadTimeDays ||
        (comp.componentType === 'RAW_SHEET'
          ? 7
          : comp.componentType === 'FASTENER_HARDWARE' || comp.componentType === 'RUBBER_SEAL'
          ? 5
          : 2);
      const coveragePercent = activeTargetReq > 0 ? Math.min(100, Math.round((freeForThisMo / activeTargetReq) * 100)) : 100;

      const rowStatus: MrpFeasibilityMaterialRow['status'] = !compPart
        ? 'MISSING_MASTER'
        : (deductExisting ? shortageNet : shortageGross) > 0
        ? 'SHORTAGE'
        : minSafety > 0 && projectedBalanceAfterMo < minSafety
        ? 'TIGHT'
        : 'SUFFICIENT';

      materialRequirements.push({
        partId: compPart?.id || comp.componentPartId,
        partCode: compCode,
        partName: compPart?.name || comp.componentPartName,
        categoryLabel:
          comp.componentType === 'RAW_SHEET'
            ? 'ورق / کلاف خام'
            : comp.componentType === 'FASTENER_HARDWARE'
            ? 'اتصالات / مهره جوشی'
            : comp.componentType === 'WIP_SUB_PART'
            ? 'زیرمجموعه نیمه‌ساخته'
            : comp.componentType === 'RUBBER_SEAL'
            ? 'لاستیک / بوش / ضربه‌گیر'
            : 'تکمیل / مواد مصرفی',
        unit: comp.unit,
        materialGrade: compGrade,
        bomQtyPerUnit: fmt(perUnitConsumption),
        scrapPercent: scrapPct,
        requiredGrossQty: reqGross,
        requiredNetQty: reqNet,
        availableStockQty: whAvailable,
        availableCoilKg: coilKg,
        committedToOpenMosQty: committed,
        freeForProposedMoQty: freeForThisMo,
        shortageGrossQty: shortageGross,
        shortageNetQty: shortageNet,
        minSafetyStock: minSafety,
        projectedBalanceAfterMo,
        leadTimeDays,
        coveragePercent,
        status: rowStatus,
      });
    }
  } else {
    // Fallback material requirement derived from Part sheet grade & unit weight
    const grade = (part.materialGrade || 'DC01A').toUpperCase();
    const rawPartMatch = stores.parts.find(
      p => p.category === 'RAW_MATERIAL' && p.materialGrade?.toUpperCase() === grade,
    );
    const grossPerUnit = Math.max(0.1, (part.weightPerUnitKg || 1) * 1.12);
    const reqGross = fmt(proposedQty * grossPerUnit);
    const reqNet = fmt(netToManufactureQty * grossPerUnit);
    const rawBalances = rawPartMatch ? getPartBalances(rawPartMatch.id, rawPartMatch.code) : [];
    const whAvail = fmt(rawBalances.reduce((s, b) => s + b.availableQty, 0));
    const totalAvail = fmt(Math.max(whAvail, matchingCoilKg));
    const committed = fmt(openMoMaterialCommitments.get(`GRADE:${grade}`) || 0);
    const freeForThisMo = fmt(Math.max(0, totalAvail - committed));
    const activeTargetReq = deductExisting ? reqNet : reqGross;
    const shortageGross = fmt(Math.max(0, reqGross - freeForThisMo));
    const shortageNet = fmt(Math.max(0, reqNet - freeForThisMo));
    const leadTimeDays = rawPartMatch?.leadTimeDays || 7;
    const minSafety = rawPartMatch?.minStock || 0;
    const projectedBalanceAfterMo = fmt(freeForThisMo - activeTargetReq);
    const coveragePercent = activeTargetReq > 0 ? Math.min(100, Math.round((freeForThisMo / activeTargetReq) * 100)) : 100;

    materialRequirements.push({
      partId: rawPartMatch?.id || `RAW-${grade}`,
      partCode: rawPartMatch?.code || `RM-COIL-${grade}`,
      partName: rawPartMatch?.name || `کلاف ورق فولادی گرید ${grade} (برآورد وزنی بدون BOM)`,
      categoryLabel: 'ورق / کلاف خام (برآورد استاندارد)',
      unit: 'KG',
      materialGrade: grade,
      bomQtyPerUnit: fmt(grossPerUnit),
      scrapPercent: 12,
      requiredGrossQty: reqGross,
      requiredNetQty: reqNet,
      availableStockQty: whAvail,
      availableCoilKg: matchingCoilKg,
      committedToOpenMosQty: committed,
      freeForProposedMoQty: freeForThisMo,
      shortageGrossQty: shortageGross,
      shortageNetQty: shortageNet,
      minSafetyStock: minSafety,
      projectedBalanceAfterMo,
      leadTimeDays,
      coveragePercent,
      status:
        (deductExisting ? shortageNet : shortageGross) > 0
          ? 'SHORTAGE'
          : minSafety > 0 && projectedBalanceAfterMo < minSafety
          ? 'TIGHT'
          : 'SUFFICIENT',
    });
  }

  // Schedule & Lead Times calculation
  const routingOps = matchingRouting?.operations || [];
  const totalSetupMin = routingOps.reduce((s, o) => s + (o.setupTimeMin || 15), 0);
  const totalCycleSec = routingOps.reduce((s, o) => s + (o.standardCycleTimeSec || 12), 0);
  const targetForRouting = deductExisting ? netToManufactureQty : proposedQty;
  const estimatedProductionHours = fmt(
    targetForRouting > 0 ? totalSetupMin / 60 + (targetForRouting * (totalCycleSec || 25)) / 3600 : 0,
  );
  const estimatedProductionDays = targetForRouting > 0 ? Math.max(1, Math.ceil(estimatedProductionHours / 15)) : 0;
  const partManufacturingLeadTimeDays = part.leadTimeDays || Math.max(1, estimatedProductionDays);
  const criticalMaterialLeadTimeDays = materialRequirements.reduce((maxLt, row) => {
    const hasShortage = (deductExisting ? row.shortageNetQty : row.shortageGrossQty) > 0;
    return hasShortage ? Math.max(maxLt, row.leadTimeDays) : maxLt;
  }, 0);
  const totalCumulativeLeadTimeDays =
    criticalMaterialLeadTimeDays + Math.max(partManufacturingLeadTimeDays, estimatedProductionDays);

  const earliestDate = new Date(Date.now() + totalCumulativeLeadTimeDays * 86400_000);
  const earliestFeasibleDateIso = earliestDate.toISOString().slice(0, 10);
  const earliestFeasibleDateFa = formatToJalali(earliestDate);

  let daysSlackOrDelay: number | undefined;
  if (input.targetDueDate) {
    const targetTime = new Date(input.targetDueDate).getTime();
    if (!Number.isNaN(targetTime)) {
      daysSlackOrDelay = Math.round((targetTime - earliestDate.getTime()) / 86400_000);
    }
  }

  // Build actionable warnings before MO creation
  const warnings: MrpFeasibilityResult['warnings'] = [];
  const shortageRows = materialRequirements.filter(r => r.status === 'SHORTAGE');
  const tightRows = materialRequirements.filter(r => r.status === 'TIGHT');
  const missingMasterRows = materialRequirements.filter(r => r.status === 'MISSING_MASTER');

  if (!matchingRouting || routingOps.length === 0) {
    warnings.push({
      severity: 'CRITICAL',
      title: 'فقدان مسیر عملیات تولید (Routing)',
      detail: `برای قطعه «${part.code}» مسیر ساخت ثبت نشده است. پیش از صدور MO باید عملیات پرس و ماشین‌ها تعریف شوند.`,
    });
  }
  if (!matchingBom) {
    warnings.push({
      severity: 'INFO',
      title: 'محاسبه بر مبنای وزن استاندارد (بدون درخت BOM اختصاصی)',
      detail: `ساختار BOM چندسطحی برای «${part.code}» ثبت نشده و نیازمندی ورق بر اساس وزن قطعه (${part.weightPerUnitKg} kg) + ۱۲٪ پرت برآورد شده است.`,
    });
  }
  if (shortageRows.length > 0) {
    warnings.push({
      severity: 'CRITICAL',
      title: `کسری مواد در ${shortageRows.length} قلم پیش از صدور دستور کار`,
      detail: shortageRows
        .map(
          r =>
            `${r.partName} (${r.partCode}): کسری ${fmt(deductExisting ? r.shortageNetQty : r.shortageGrossQty)} ${r.unit} — زمان تدارک ${r.leadTimeDays} روز`,
        )
        .join(' | '),
    });
  }
  if (tightRows.length > 0) {
    warnings.push({
      severity: 'WARNING',
      title: `افت موجودی ${tightRows.length} قلم به زیر نقطه سفارش (Safety Stock)`,
      detail: tightRows
        .map(r => `${r.partName}: مانده پیش‌بینی‌شده ${r.projectedBalanceAfterMo} از حداقل ایمنی ${r.minSafetyStock}`)
        .join(' | '),
    });
  }
  if (missingMasterRows.length > 0) {
    warnings.push({
      severity: 'WARNING',
      title: `${missingMasterRows.length} قلم زیرمجموعه در کاتالوگ قطعات یافت نشد`,
      detail: missingMasterRows.map(r => r.partCode).join('، '),
    });
  }
  if (qcHeldQty > 0 || blockedCoilKg > 0) {
    warnings.push({
      severity: 'WARNING',
      title: 'وجود موجودی در قرنطینه کیفی (QC Hold)',
      detail: `${qcHeldQty > 0 ? `${qcHeldQty} عدد قطعه` : ''}${qcHeldQty > 0 && blockedCoilKg > 0 ? ' و ' : ''}${blockedCoilKg > 0 ? `${blockedCoilKg} kg کلاف` : ''} در قرنطینه قرار دارد و در موجودی قابل تخصیص لحاظ نشده است.`,
    });
  }
  if (openContracts.length === 0 && part.category !== 'RAW_MATERIAL') {
    warnings.push({
      severity: 'INFO',
      title: 'عدم اتصال به قرارداد فعال ساپکو/مشتری',
      detail: 'قرارداد فعالی با گرید یا کد این قطعه یافت نشد؛ در صورت صدور MO به‌صورت تولید آزاد/ذخیره انبار برنامه‌ریزی می‌شود.',
    });
  } else if (openContracts.length > 0) {
    const totalContractRemaining = openContracts.reduce((s, c) => s + c.remainingQuotaKg, 0);
    const totalSheetReq = materialRequirements
      .filter(r => r.unit === 'KG')
      .reduce((s, r) => s + (deductExisting ? r.requiredNetQty : r.requiredGrossQty), 0);
    if (totalSheetReq > totalContractRemaining) {
      warnings.push({
        severity: 'WARNING',
        title: 'نیاز ورق بیشتر از مانده سهمیه قراردادهای فعال',
        detail: `نیاز ورق (${fmt(totalSheetReq)} kg) از مانده سهمیه قراردادها (${fmt(totalContractRemaining)} kg) بیشتر است.`,
      });
    }
  }
  if (daysSlackOrDelay !== undefined && daysSlackOrDelay < 0) {
    warnings.push({
      severity: 'CRITICAL',
      title: `تاخیر زمانی ${Math.abs(daysSlackOrDelay)} روزه نسبت به تاریخ تحویل هدف`,
      detail: `با توجه به Lead Time تدارک مواد (${criticalMaterialLeadTimeDays} روز) و ساخت (${partManufacturingLeadTimeDays} روز)، اولین تحویل ممکن ${earliestFeasibleDateFa} است.`,
    });
  }

  const feasibilityStatus: MrpFeasibilityResult['feasibilityStatus'] =
    shortageRows.length > 0 || !matchingRouting || routingOps.length === 0 || (daysSlackOrDelay !== undefined && daysSlackOrDelay < 0)
      ? 'BLOCKED_SHORTAGE'
      : warnings.some(w => w.severity === 'WARNING')
      ? 'FEASIBLE_WITH_WARNINGS'
      : 'FEASIBLE_IMMEDIATE';

  const canCreateMoSafely = feasibilityStatus !== 'BLOCKED_SHORTAGE';
  const summaryFa =
    feasibilityStatus === 'FEASIBLE_IMMEDIATE'
      ? `امکان‌سنجی تایید شد: برای تولید ${proposedQty.toLocaleString('fa-IR')} عدد «${part.name}» (خالص ساخت ${netToManufactureQty.toLocaleString('fa-IR')} عدد) تمام مواد، کلاف‌ها و مسیر تولید آماده و تکمیل است.`
      : feasibilityStatus === 'FEASIBLE_WITH_WARNINGS'
      ? `صدور دستور کار امکان‌پذیر است اما ${warnings.length} هشدار کنترلی (نقطه سفارش، قرنطینه یا قرارداد) پیش از صدور MO شناسایی شد.`
      : `هشدار پیش از صدور MO: به دلیل کسری در ${shortageRows.length} قلم متریال${!matchingRouting ? ' / فقدان مسیر عملیات' : ''} صدور دستور کار با ریسک توقف خط همراه است.`;

  return {
    evaluatedAt,
    partExists: true,
    requestedPartQuery: explicitQuery,
    proposedQty,
    netToManufactureQty,
    deductExistingFgAndWip: deductExisting,
    feasibilityStatus,
    canCreateMoSafely,
    summaryFa,
    selectedPart: {
      id: part.id,
      code: part.code,
      name: part.name,
      category: part.category,
      unit: part.unit,
      materialGrade: part.materialGrade,
      thicknessMm: part.thicknessMm,
      weightPerUnitKg: part.weightPerUnitKg || 1,
      minStock: part.minStock || 0,
      leadTimeDays: partManufacturingLeadTimeDays,
      hasBom: Boolean(matchingBom),
      hasRouting: Boolean(matchingRouting && routingOps.length > 0),
    },
    stockSnapshot: {
      finishedGoodsAvailable,
      finishedGoodsReserved,
      wipActiveQty,
      wipWarehouseQty,
      qcHeldQty,
      openCustomerDemandQty,
      matchingCoilKg,
      blockedCoilKg,
    },
    openContracts,
    competingOrders,
    materialRequirements,
    scheduleProjection: {
      partManufacturingLeadTimeDays,
      criticalMaterialLeadTimeDays,
      estimatedProductionHours,
      estimatedProductionDays,
      totalCumulativeLeadTimeDays,
      earliestFeasibleDateIso,
      earliestFeasibleDateFa,
      targetDueDateIso: input.targetDueDate,
      daysSlackOrDelay,
    },
    warnings,
  };
}

export function evaluateIndustrialScenario(
  input: EvaluateScenarioInput,
  stores: ScenarioRuntimeStores,
): EvaluateScenarioResult {
  const scenario = SCENARIO_CATALOG.find(c => c.id === input.scenarioId) || SCENARIO_CATALOG[0];
  const { part, explicitQuery } = findRequestedPart(stores.parts, input.partIdOrCode);
  const qty = Math.max(1, Number(input.quantity) || (input.scenarioId === 'PART_LIFECYCLE_PRODUCTION' ? 5000 : 500));
  const { balances: rawBalances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const balances = applyQcHoldsToBalances(rawBalances, serverQcHoldStore);
  const boms = getAllBoms();

  const selectedCoilObj =
    (input.coilId
      ? stores.physicalCoils.find(c => c.id === input.coilId || c.coilId === input.coilId)
      : undefined) ||
    stores.physicalCoils.find(c => !part?.materialGrade || c.materialGrade === part.materialGrade) ||
    stores.physicalCoils[0] ||
    null;

  const partBalances = part ? balances.filter(b => b.partId === part.id || b.partCode === part.code) : [];
  const availableFg = fmt(partBalances.filter(b => b.warehouseId === 'WH-FINISHED').reduce((s, b) => s + b.availableQty, 0));
  const reservedFg = fmt(
    stores.reservations
      .filter(r => r.status === 'ACTIVE' && part && (r.partId === part.id || r.partCode === part.code))
      .reduce((s, r) => s + r.quantity, 0),
  );
  const wipWarehouseStock = fmt(
    partBalances.filter(b => b.warehouseId !== 'WH-FINISHED' && b.warehouseId !== 'WH-RAW').reduce((s, b) => s + b.availableQty, 0),
  );
  const matchingMos = part ? manufacturingOrdersStore.filter(m => m.partId === part.id || m.partCode === part.code) : [];
  const activeWipQty = fmt(
    matchingMos
      .filter(m => m.status === 'RELEASED' || m.status === 'IN_PROGRESS')
      .reduce((s, m) => s + m.operations.reduce((os, o) => os + o.waitingInputQty + o.inProgressQty + o.readyForTransferQty, 0), 0),
  );

  const matchingBom = part ? boms.find(b => b.assemblyPartId === part.id || b.assemblyPartCode === part.code) : undefined;
  const matchingRouting = part ? stores.routings.find(r => r.partId === part.id || r.partCode === part.code) : undefined;
  const matchingContract = part
    ? stores.contracts.find(c => (c.commercialLines || []).some(l => l.partId === part.id || l.partCode === part.code))
    : undefined;
  const matchingOrders = part
    ? customerOrdersStore.filter(o => o.status !== 'CANCELLED' && o.lines.some(l => l.partId === part.id || l.partCode === part.code))
    : [];

  const matchingCoils = stores.physicalCoils.filter(c => {
    const gradeMatch = !part?.materialGrade || c.materialGrade === part.materialGrade;
    return gradeMatch && c.remainingWeightKg > 0 && c.qualityStatus === 'AVAILABLE' && c.physicalStatus !== 'BLOCKED';
  });
  const totalAvailableCoilKg = fmt(matchingCoils.reduce((s, c) => s + c.remainingWeightKg, 0));

  const heldItems = Object.values(serverQcHoldStore).filter(h => h.isHeld);
  const blockedCoils = stores.physicalCoils.filter(
    c => ['QUARANTINE', 'QUALITY_BLOCKED', 'REJECTED'].includes(c.qualityStatus) || c.physicalStatus === 'BLOCKED',
  );

  // =========================================================================
  // SCN-01: PART_LIFECYCLE_PRODUCTION (e.g., Produce 5000 pcs of Part A!)
  // =========================================================================
  if (scenario.id === 'PART_LIFECYCLE_PRODUCTION') {
    const queryLabel = explicitQuery || part?.code || 'نامشخص';
    const partExists = Boolean(part);
    const unitWeightKg = part?.weightPerUnitKg || 1.0;
    const totalWipCombined = fmt(activeWipQty + wipWarehouseStock);
    const netToProduce = Math.max(0, qty - availableFg - totalWipCombined);
    const grossCoilWeightPerUnit = matchingBom ? matchingBom.totalGrossWeightKg : unitWeightKg * 1.12;
    const reqSheetKg = fmt(netToProduce * grossCoilWeightPerUnit);
    const coilGapKg = Math.max(0, fmt(reqSheetKg - totalAvailableCoilKg));

    const routingOps = matchingRouting?.operations || [];
    const totalSetupMin = routingOps.reduce((s, o) => s + (o.setupTimeMin || 15), 0);
    const totalCycleSec = routingOps.reduce((s, o) => s + (o.standardCycleTimeSec || 10), 0);
    const estimatedMachineHours = fmt(totalSetupMin / 60 + (netToProduce * totalCycleSec) / 3600);

    const firstOp = routingOps[0];
    const eligibilities = firstOp
      ? evaluateMachineEligibility({
          processType: firstOp.processType,
          requiredTonnage: firstOp.requiredTonnage || 100,
          plannedQuantity: Math.max(1, netToProduce),
          standardCycleTimeSec: firstOp.standardCycleTimeSec || 12,
          setupTimeMin: firstOp.setupTimeMin || 20,
          assignedDieId: firstOp.dieMoldId,
          machines: stores.machines,
          dies: stores.dies,
        }).filter(e => e.isEligible)
      : [];
    const primaryMachine = eligibilities[0];
    const scrapNormAvg = routingOps.length > 0
      ? fmt(routingOps.reduce((s, o) => s + (o.scrapNormPercent || 1.5), 0) / routingOps.length)
      : 1.5;

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. احراز وجود قطعه در کاتالوگ مرکزی (Master Data Check)',
        sapCode: 'MM03 / MM01',
        moduleName: 'کاتالوگ مرکزی قطعات',
        status: partExists ? 'READY' : 'BLOCKED',
        summary: partExists
          ? `قطعه «${part!.name}» با کد «${part!.code}» (گرید: ${part!.materialGrade || 'نامشخص'}، وزن واحد: ${part!.weightPerUnitKg} kg) در کاتالوگ سیستم ثبت و فعال است.`
          : `قطعه «${queryLabel}» در کاتالوگ نرم‌افزار تعریف نشده است! لطفاً ابتدا از لینک روبه‌رو وارد کاتالوگ قطعات شده و این قطعه را تعریف نمایید.`,
        metrics: [
          { label: 'جستجوی قطعه', value: queryLabel },
          { label: 'وضعیت وجود در سیستم', value: partExists ? 'موجود و فعال ✓' : 'یافت نشد (نیازمند تعریف)', tone: partExists ? 'good' : 'bad' },
          { label: 'تیراژ درخواستی تولید', value: `${qty.toLocaleString('fa-IR')} عدد` },
          ...(partExists ? [{ label: 'کد ساپکو', value: part!.sapcoCode || '—' }] : []),
        ],
        navTarget: {
          tab: 'parts',
          docQuery: queryLabel,
          label: partExists ? 'مشاهده در کاتالوگ قطعات' : `تعریف فوری قطعه «${queryLabel}» ←`,
        },
      },
      {
        stepNumber: 2,
        title: '۲. بررسی قرارداد تجاری ساپکو و سفارش‌های باز مشتری',
        sapCode: 'VA01 / Contracts',
        moduleName: 'قراردادهای ساپکو و سفارشات فروش',
        status: !partExists ? 'BLOCKED' : matchingContract || matchingOrders.length > 0 ? 'READY' : 'WARNING',
        summary: !partExists
          ? 'پس از تعریف قطعه، اتصال به قرارداد ساپکو یا ثبت سفارش آزاد بررسی می‌شود.'
          : matchingContract
            ? `قرارداد فعال «${matchingContract.contractNumber}» (${matchingContract.title}) به همراه ${matchingOrders.length} سفارش باز مشتری برای این قطعه یافت شد.`
            : `برای این قطعه قرارداد اختصاصی ثبت نشده؛ تولید به‌صورت سفارش داخلی/آزاد (${matchingOrders.length} سفارش فعلی) برنامه‌ریزی می‌شود.`,
        metrics: [
          { label: 'قرارداد مرجع', value: matchingContract?.contractNumber || 'آزاد / بدون قرارداد', tone: matchingContract ? 'good' : 'warn' },
          { label: 'سفارشات باز فعلی', value: `${matchingOrders.length} سفارش` },
        ],
        navTarget: {
          tab: 'contracts',
          subTab: matchingContract ? 'CONTRACTS_QUOTAS' : 'CUSTOMER_ORDERS',
          docQuery: matchingContract?.contractNumber || part?.code || queryLabel,
          label: 'بررسی قرارداد و سفارشات',
        },
      },
      {
        stepNumber: 3,
        title: '۳. بررسی مسیر عملیات تولید (Routing) و تناسب ماشین/قالب',
        sapCode: 'CA03 / CA01',
        moduleName: 'مهندسی مسیر عملیات',
        status: !partExists ? 'BLOCKED' : matchingRouting && routingOps.length > 0 ? 'READY' : 'BLOCKED',
        summary: !partExists
          ? 'قطعه هنوز تعریف نشده است.'
          : matchingRouting
            ? `مسیر عملیات با ${routingOps.length} ایستگاه (کل زمان ستاپ ${totalSetupMin} دقیقه، زمان سیکل واحد ${totalCycleSec} ثانیه) ثبت شده و ${eligibilities.length} پرس واجد شرایط در سالن فعال است.`
            : `برای قطعه «${part!.code}» مسیر عملیات تولید (Routing) ثبت نشده است؛ بدون مسیر تولید امکان زمان‌بندی ماشین و صدور دستور کار نیست.`,
        metrics: [
          { label: 'تعداد ایستگاه‌های مسیر', value: `${routingOps.length} ایستگاه`, tone: routingOps.length > 0 ? 'good' : 'bad' },
          { label: 'زمان ستاپ کل', value: `${totalSetupMin} دقیقه` },
          { label: 'پرس‌های واجد شرایط', value: `${eligibilities.length} دستگاه`, tone: eligibilities.length > 0 ? 'good' : 'warn' },
        ],
        navTarget: {
          tab: 'master_data',
          subTab: 'ROUTINGS',
          docQuery: part?.code || queryLabel,
          label: matchingRouting ? 'مشاهده مسیر عملیات' : 'تعریف مسیر عملیات تولید ←',
        },
      },
      {
        stepNumber: 4,
        title: '۴. اتصال به ساختار درخت محصول (Multi-Level BOM)',
        sapCode: 'CS03 / CS12',
        moduleName: 'درخت مهندسی محصول (BOM)',
        status: !partExists ? 'BLOCKED' : matchingBom ? 'READY' : 'WARNING',
        summary: !partExists
          ? 'نیازمند تعریف اولیه قطعه است.'
          : matchingBom
            ? `درخت BOM فعال (${matchingBom.version}) با ${matchingBom.components.length} جزء (شامل ورق، قطعات نیمه‌ساخته و اتصالات جوشی، راندمان وزنی ${matchingBom.yieldEfficiencyPercent}%) متصل است.`
            : `برای این قطعه ساختار BOM چندسطحی ثبت نشده است؛ محاسبه مصرف مواد بر مبنای وزن قطعه و گرید (${part?.materialGrade || '—'}) انجام می‌شود.`,
        metrics: [
          { label: 'وضعیت BOM', value: matchingBom ? `${matchingBom.version} (${matchingBom.components.length} قلم)` : 'بدون BOM اختصاصی', tone: matchingBom ? 'good' : 'warn' },
          { label: 'وزن ناخالص واحد', value: `${fmt(grossCoilWeightPerUnit)} kg` },
          { label: 'زیرمجموعه نیازمند Sub-MO', value: `${matchingBom ? matchingBom.components.filter(c => c.subMoRequired).length : 0} مورد` },
        ],
        navTarget: {
          tab: 'master_data',
          subTab: 'BOM',
          docQuery: part?.code || queryLabel,
          label: matchingBom ? 'باز کردن درخت BOM قطعه' : 'تعریف BOM قطعه',
        },
      },
      {
        stepNumber: 5,
        title: '۵. کنترل موجودی فیلترشده از مواد اولیه تا WIP و محصول نهایی',
        sapCode: 'MMBE / WIP Stages',
        moduleName: 'کنترل موجودی چندمرحله‌ای',
        status: !partExists ? 'BLOCKED' : coilGapKg > 0 ? 'WARNING' : 'READY',
        summary: !partExists
          ? 'پس از ثبت قطعه، موجودی تمام مراحل قابل پایش خواهد بود.'
          : `فیلتر موجودی برای «${part!.code}»: کلاف ورق آزاد ${totalAvailableCoilKg.toLocaleString('fa-IR')} kg (${matchingCoils.length} رول) | کار در جریان (WIP) ${totalWipCombined.toLocaleString('fa-IR')} عدد | انبار محصول نهایی آزاد ${availableFg.toLocaleString('fa-IR')} عدد (رزروشده: ${reservedFg.toLocaleString('fa-IR')}).`,
        metrics: [
          { label: 'کلاف ورق آزاد متناظر', value: `${totalAvailableCoilKg.toLocaleString('fa-IR')} kg`, tone: coilGapKg > 0 ? 'warn' : 'good' },
          { label: 'موجودی مراحل WIP', value: `${totalWipCombined.toLocaleString('fa-IR')} عدد` },
          { label: 'محصول نهایی آزاد (FG)', value: `${availableFg.toLocaleString('fa-IR')} عدد`, tone: availableFg > 0 ? 'good' : 'neutral' },
          { label: 'موجودی رزروشده FG', value: `${reservedFg.toLocaleString('fa-IR')} عدد` },
        ],
        navTarget: {
          tab: 'inventory',
          subTab: 'STAGES',
          docQuery: part?.code || queryLabel,
          label: 'فیلتر موجودی مراحل WIP تا انبار',
        },
        secondaryNavTargets: [
          { tab: 'inventory', subTab: 'INQUIRY', docQuery: part?.code || queryLabel, label: 'کاردکس انبار این قطعه' },
          { tab: 'inventory', subTab: 'COILS', docQuery: part?.materialGrade || undefined, label: 'فیلتر کلاف‌های ورق' },
        ],
      },
      {
        stepNumber: 6,
        title: '۶. محاسبه خالص نیاز MRP و شاخص‌های کلیدی (ظرفیت، ضایعات و KPI)',
        sapCode: 'MD02 / CRP / KPI',
        moduleName: 'موتور MRP و شاخص‌های عملکرد',
        status: !partExists ? 'BLOCKED' : coilGapKg > 0 ? 'WARNING' : 'READY',
        summary: !partExists
          ? 'در انتظار تعریف قطعه.'
          : `خالص تولید لازم: ${netToProduce.toLocaleString('fa-IR')} عدد | نیاز خالص ورق: ${reqSheetKg.toLocaleString('fa-IR')} kg (${coilGapKg > 0 ? `کسری ${coilGapKg.toLocaleString('fa-IR')} kg ورق` : 'ورق کامل تأمین است'}) | ساعت‌کار برآوردی ماشین: ${estimatedMachineHours} ساعت با نرخ نرم ضایعات ${scrapNormAvg}%.`,
        metrics: [
          { label: 'خالص نیاز تولید (Net)', value: `${netToProduce.toLocaleString('fa-IR')} عدد`, tone: 'good' },
          { label: 'کسری ورق (MRP Gap)', value: `${coilGapKg.toLocaleString('fa-IR')} kg`, tone: coilGapKg > 0 ? 'bad' : 'good' },
          { label: 'ساعت‌کار برآوردی ماشین', value: `${estimatedMachineHours} ساعت` },
          { label: 'نرم ضایعات مهندسی', value: `${scrapNormAvg}%` },
        ],
        navTarget: {
          tab: 'mrp',
          docQuery: part?.code || queryLabel,
          label: 'بررسی در کارتابل MRP',
        },
        secondaryNavTargets: [
          { tab: 'planning', subTab: 'CAPACITY', label: 'تایم‌لاین ظرفیت پرس‌ها' },
          { tab: 'reports', subTab: 'comprehensive_production', docQuery: part?.code || queryLabel, label: 'شاخص‌های بهره‌وری و OEE' },
        ],
      },
      {
        stepNumber: 7,
        title: '۷. پیشنهاد برنامه تولید، تأیید کاربر و صدور رسمی دستور کار (MO)',
        sapCode: 'PRP → Approve → CO01',
        moduleName: 'پیشنهاد برنامه و کارتابل WIP',
        status: !partExists || !matchingRouting ? 'BLOCKED' : 'READY',
        summary: !partExists
          ? 'ابتدا قطعه را تعریف و مسیر تولید را ثبت کنید تا پیشنهاد برنامه محاسبه شود.'
          : !matchingRouting
            ? `برای «${part!.name}» مسیر عملیات ثبت نشده است؛ پس از ثبت مسیر، پیشنهاد برنامه به‌صورت خودکار تولید می‌شود.`
            : `پیشنهاد برنامه برای ${netToProduce.toLocaleString('fa-IR')} عدد روی ماشین منتخب «${primaryMachine?.machineName || 'پرس واجد شرایط'}» در ${routingOps.length} عملیات آماده است. با کلیک روی دکمه تأیید پایین، سفارش ثبت، پیشنهاد تأیید و دستور کار رسمی (MO) صادر می‌شود.`,
        metrics: [
          { label: 'تیراژ پیشنهادی MO', value: `${netToProduce.toLocaleString('fa-IR')} عدد` },
          { label: 'ماشین پیشنهادی شروع', value: primaryMachine ? `${primaryMachine.machineName} (${primaryMachine.currentWorkloadPercent}% بار)` : 'انتخاب از مسیر' },
          { label: 'دستور کارهای فعلی قطعه', value: `${matchingMos.length} مورد` },
        ],
        navTarget: {
          tab: 'planning',
          subTab: 'PROPOSALS',
          docQuery: part?.code || queryLabel,
          label: 'کارتابل پیشنهادهای برنامه',
        },
        secondaryNavTargets: [
          { tab: 'wip', subTab: 'ORDERS', docQuery: part?.code || queryLabel, label: 'صف دستور کارهای WIP' },
        ],
      },
    ];

    const canExecute = Boolean(partExists && matchingRouting && routingOps.length > 0);
    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      requestedPartQuery: queryLabel,
      partExists,
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: selectedCoilObj ? {
        id: selectedCoilObj.id,
        coilId: selectedCoilObj.coilId,
        materialGrade: selectedCoilObj.materialGrade,
        thicknessMm: selectedCoilObj.thicknessMm,
        remainingWeightKg: selectedCoilObj.remainingWeightKg,
        heatNumber: selectedCoilObj.heatNumber || '—',
        qualityStatus: selectedCoilObj.qualityStatus,
      } : null,
      selectedQuantity: qty,
      summary: partExists
        ? `ممیزی ۷ مرحله‌ای قطعه «${part!.name}» (${qty.toLocaleString('fa-IR')} عدد): ${canExecute ? 'تمام پیش‌نیازها آماده تأیید پیشنهاد و صدور MO است.' : 'نیازمند تکمیل مسیر عملیات قبل از صدور MO.'}`
        : `قطعه «${queryLabel}» در کاتالوگ نرم‌افزار وجود ندارد — از لینک مرحله ۱ برای تعریف فوری قطعه استفاده کنید.`,
      canExecute,
      blockingReason: !partExists
        ? `قطعه «${queryLabel}» در کاتالوگ تعریف نشده است. از دکمه مرحله ۱ برای تعریف فوری آن اقدام کنید.`
        : !matchingRouting || routingOps.length === 0
          ? `برای قطعه «${part!.code}» مسیر عملیات تولید (Routing) تعریف نشده است.`
          : undefined,
      proposalPreview: partExists ? {
        netToProduce,
        requiredCoilKg: reqSheetKg,
        estimatedMachineHours,
        routingStepsCount: routingOps.length,
        bomComponentsCount: matchingBom?.components.length || 0,
        primaryMachineName: primaryMachine?.machineName,
      } : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-02: PROD_ORDER
  // =========================================================================
  if (scenario.id === 'PROD_ORDER') {
    const unitWeightKg = part?.weightPerUnitKg || 1.0;
    const reqSheetKg = fmt(qty * unitWeightKg * 1.08);
    const netToProduce = Math.max(0, qty - availableFg - activeWipQty);
    const coilGapKg = Math.max(0, fmt(reqSheetKg - totalAvailableCoilKg));

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. انطباق قرارداد تجاری و سفارش ساپکو',
        sapCode: 'VA01 / Contracts',
        moduleName: 'قراردادهای ساپکو و سفارش مشتریان',
        status: matchingContract ? 'READY' : 'WARNING',
        summary: matchingContract
          ? `قرارداد فعال «${matchingContract.contractNumber}» (${matchingContract.title}) جهت تقاضای ${qty.toLocaleString('fa-IR')} عدد قطعه «${part?.name || '—'}» شناسایی شد.`
          : `قرارداد تجاری متصل به قطعه «${part?.code || explicitQuery || '—'}» یافت نشد؛ سفارش به‌صورت آزاد قابل ثبت است.`,
        metrics: [
          { label: 'کد قطعه', value: part?.code || explicitQuery || 'نامشخص' },
          { label: 'تعداد تقاضای سناریو', value: `${qty.toLocaleString('fa-IR')} عدد` },
          { label: 'شماره قرارداد مرتبط', value: matchingContract?.contractNumber || 'بدون قرارداد' },
          { label: 'موجودی آزاد فعلی (FG)', value: `${availableFg.toLocaleString('fa-IR')} عدد`, tone: availableFg > 0 ? 'good' : 'neutral' },
        ],
        navTarget: { tab: 'contracts', subTab: 'CUSTOMER_ORDERS', docQuery: matchingContract?.contractNumber || part?.code, label: 'باز کردن سفارشات و قراردادها' },
      },
      {
        stepNumber: 2,
        title: '۲. پایش کلاف‌های آزاد ورق در انبار (گرید و ذوب واقعی)',
        sapCode: 'MMBE / Coils',
        moduleName: 'انبار و ردیابی کویل',
        status: coilGapKg > 0 ? 'WARNING' : 'READY',
        summary: coilGapKg > 0
          ? `نیاز ناخالص ورق برای این سفارش ${reqSheetKg.toLocaleString('fa-IR')} کیلوگرم است اما کلاف آزاد هم‌گرید ${totalAvailableCoilKg.toLocaleString('fa-IR')} کیلوگرم موجودی دارد (کسری ${coilGapKg} کیلوگرم).`
          : `تعداد ${matchingCoils.length} کلاف آزاد با گرید «${part?.materialGrade || 'همه‌گریدها'}» به وزن ${totalAvailableCoilKg.toLocaleString('fa-IR')} کیلوگرم در دسترس و آماده برش است.`,
        metrics: [
          { label: 'گرید ورق قطعه', value: part?.materialGrade || 'تعریف‌نشده' },
          { label: 'نیاز ورق برآوردی', value: `${reqSheetKg.toLocaleString('fa-IR')} kg` },
          { label: 'مانده کلاف‌های آزاد', value: `${totalAvailableCoilKg.toLocaleString('fa-IR')} kg`, tone: coilGapKg > 0 ? 'warn' : 'good' },
          { label: 'موجودی رزروشده FG', value: `${reservedFg.toLocaleString('fa-IR')} عدد` },
        ],
        navTarget: { tab: 'inventory', subTab: 'COILS', docQuery: part?.materialGrade || undefined, label: 'مشاهده کلاف‌های انبار' },
        secondaryNavTargets: [
          { tab: 'inventory', subTab: 'STAGES', docQuery: part?.code, label: 'موجودی مراحل تولید' },
        ],
      },
      {
        stepNumber: 3,
        title: '۳. انفجار BOM و موازنه خالص احتیاجات تولید (MRP / WIP Netting)',
        sapCode: 'MD02 / MD04',
        moduleName: 'موتور MRP و احتیاجات تولید',
        status: matchingRouting ? 'READY' : 'BLOCKED',
        summary: matchingRouting
          ? `بر اساس موجودی انبار (${availableFg} عدد) و کار در جریان (${activeWipQty} عدد)، خالص نیاز تولید برابر ${netToProduce.toLocaleString('fa-IR')} عدد در ${matchingRouting.operations.length} ایستگاه کاری است.`
          : `برای قطعه «${part?.code || explicitQuery || '—'}» مسیر تولید (Routing) تعریف نشده است و صدور دستور کار نیازمند ثبت مسیر است.`,
        metrics: [
          { label: 'خالص نیاز تولید جدید', value: `${netToProduce.toLocaleString('fa-IR')} عدد` },
          { label: 'WIP در حال گردش خط', value: `${activeWipQty.toLocaleString('fa-IR')} عدد` },
          { label: 'تعداد اقلام BOM', value: `${matchingBom?.components.length || 0} قلم` },
          { label: 'عملیات‌های مسیر (Routing)', value: `${matchingRouting?.operations.length || 0} ایستگاه`, tone: matchingRouting ? 'good' : 'bad' },
        ],
        navTarget: { tab: 'mrp', label: 'باز کردن تابلوی MRP' },
      },
      {
        stepNumber: 4,
        title: '۴. تولید پیشنهاد، تأیید و صدور مستقیم دستور کار (MO) به WIP',
        sapCode: 'CO01 / PRP→MO',
        moduleName: 'برنامه‌ریزی و کارتابل دستور کار',
        status: matchingRouting ? 'READY' : 'BLOCKED',
        summary: matchingRouting
          ? `با اجرای سناریو، سفارش مشتری ثبت، پیشنهاد برنامه تولید (PRP) تولید و تأیید شده و دستور کار رسمی (MO) به سالن پرس و رهگیری WIP صادر می‌گردد.`
          : 'به دلیل نبود مسیر تولید فعال، صدور خودکار دستور کار امکان‌پذیر نیست.',
        metrics: [
          { label: 'تعداد دستور کارهای فعال فعلی قطعه', value: `${matchingMos.length} دستور کار` },
          { label: 'مسیر انتخابی', value: matchingRouting ? `${matchingRouting.partCode} (V${matchingRouting.version})` : 'فاقد مسیر' },
          { label: 'وضعیت صدور خودکار', value: matchingRouting ? 'آماده صدور MO' : 'مسدود', tone: matchingRouting ? 'good' : 'bad' },
        ],
        navTarget: { tab: 'wip', subTab: 'ORDERS', docQuery: part?.code, label: 'مشاهده دستور کارها (WIP)' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      requestedPartQuery: explicitQuery,
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: selectedCoilObj ? {
        id: selectedCoilObj.id,
        coilId: selectedCoilObj.coilId,
        materialGrade: selectedCoilObj.materialGrade,
        thicknessMm: selectedCoilObj.thicknessMm,
        remainingWeightKg: selectedCoilObj.remainingWeightKg,
        heatNumber: selectedCoilObj.heatNumber || '—',
        qualityStatus: selectedCoilObj.qualityStatus,
      } : null,
      selectedQuantity: qty,
      summary: `ارزیابی زنده زنجیره سفارش تا تولید برای «${part?.name || explicitQuery || '—'}» (${qty.toLocaleString('fa-IR')} عدد) تکمیل شد.`,
      canExecute: Boolean(part && matchingRouting),
      blockingReason: !part ? `قطعه «${explicitQuery || '—'}» یافت نشد.` : !matchingRouting ? `برای قطعه «${part.code}» مسیر تولید (Routing) تعریف نشده است.` : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-03: COIL_SLITTING
  // =========================================================================
  if (scenario.id === 'COIL_SLITTING') {
    const targetWeight = Math.min(Number(input.quantity) || 250, Math.max(1, selectedCoilObj?.remainingWeightKg || 250));
    const isBlocked =
      !selectedCoilObj ||
      selectedCoilObj.remainingWeightKg <= 0 ||
      ['QUARANTINE', 'QUALITY_BLOCKED', 'REJECTED'].includes(selectedCoilObj.qualityStatus) ||
      selectedCoilObj.physicalStatus === 'BLOCKED';
    const eligibleMo =
      manufacturingOrdersStore.find(m => ['PLANNED', 'RELEASED', 'IN_PROGRESS'].includes(m.status)) || null;

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. احراز هویت فیزیکی کلاف مادر و شماره ذوب (Heat Number)',
        sapCode: 'MSC3N / Coils',
        moduleName: 'انبار رول و کلاف',
        status: !selectedCoilObj ? 'BLOCKED' : isBlocked ? 'BLOCKED' : 'READY',
        summary: selectedCoilObj
          ? `کلاف «${selectedCoilObj.coilId}» با گرید ${selectedCoilObj.materialGrade}، ضخامت ${selectedCoilObj.thicknessMm}mm، ذوب «${selectedCoilObj.heatNumber}» و مانده ${selectedCoilObj.remainingWeightKg.toLocaleString('fa-IR')} کیلوگرم بررسی شد.`
          : 'هیچ کلاف فیزیکی در انبار یافت نشد.',
        metrics: [
          { label: 'کد کلاف', value: selectedCoilObj?.coilId || '—' },
          { label: 'شماره ذوب (Heat#)', value: selectedCoilObj?.heatNumber || '—' },
          { label: 'مانده قابل برداشت', value: `${(selectedCoilObj?.remainingWeightKg || 0).toLocaleString('fa-IR')} kg`, tone: isBlocked ? 'bad' : 'good' },
          { label: 'وضعیت کیفی', value: selectedCoilObj?.qualityStatus || '—', tone: isBlocked ? 'bad' : 'good' },
        ],
        navTarget: { tab: 'inventory', subTab: 'COILS', docQuery: selectedCoilObj?.coilId, label: 'باز کردن لیست کلاف‌ها' },
      },
      {
        stepNumber: 2,
        title: '۲. تطبیق حواله جزئی و پیوند به اولین عملیات دستور کار',
        sapCode: 'MIGO 261 / Issue',
        moduleName: 'صدور مصرف پای خط تولید',
        status: eligibleMo && !isBlocked ? 'READY' : 'WARNING',
        summary: eligibleMo
          ? `حواله جزئی ${targetWeight.toLocaleString('fa-IR')} کیلوگرم روی دستور کار «${eligibleMo.moNumber}» (${eligibleMo.partName}) محاسبه می‌شود و باقی کلاف بدون ابطال در انبار می‌ماند.`
          : 'دستور کار فعالی یافت نشد؛ صرفاً ثبت حواله جزئی کلاف روی قرارداد انجام می‌شود.',
        metrics: [
          { label: 'وزن حواله درخواستی', value: `${targetWeight.toLocaleString('fa-IR')} kg` },
          { label: 'مانده پیش‌بینی‌شده پس از حواله', value: `${Math.max(0, fmt((selectedCoilObj?.remainingWeightKg || 0) - targetWeight)).toLocaleString('fa-IR')} kg` },
          { label: 'دستور کار هدف', value: eligibleMo?.moNumber || 'مصرف مستقیم خط برش' },
        ],
        navTarget: { tab: 'wip', subTab: 'ORDERS', moId: eligibleMo?.id, docQuery: eligibleMo?.moNumber, label: 'رهگیری دستور کار و برش' },
      },
      {
        stepNumber: 3,
        title: '۳. به‌روزرسانی کاردکس کلاف و گزارش شجره‌نامه (Genealogy)',
        sapCode: 'MB51 / Genealogy',
        moduleName: 'کاردکس و گزارش مصرف رول',
        status: !isBlocked ? 'READY' : 'BLOCKED',
        summary: 'پس از اجرا، سند مصرف ۲۶۱ در کاردکس انبار ثبت و شجره‌نامه ذوب کلاف به قطعات تولیدی متصل می‌شود.',
        metrics: [
          { label: 'نوع حرکت SAP', value: '۲۶۱ - حواله به تولید' },
          { label: 'انبار مقصد', value: 'خط برش و پرس' },
        ],
        navTarget: { tab: 'reports', subTab: 'LOT_CONSUMPTION', docQuery: selectedCoilObj?.coilId, label: 'گزارش مصرف رول‌ها' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: selectedCoilObj ? {
        id: selectedCoilObj.id,
        coilId: selectedCoilObj.coilId,
        materialGrade: selectedCoilObj.materialGrade,
        thicknessMm: selectedCoilObj.thicknessMm,
        remainingWeightKg: selectedCoilObj.remainingWeightKg,
        heatNumber: selectedCoilObj.heatNumber || '—',
        qualityStatus: selectedCoilObj.qualityStatus,
      } : null,
      selectedQuantity: targetWeight,
      summary: `آماده حواله جزئی ${targetWeight} کیلوگرم از کلاف «${selectedCoilObj?.coilId || '—'}».`,
      canExecute: Boolean(selectedCoilObj && !isBlocked && targetWeight > 0 && targetWeight <= selectedCoilObj.remainingWeightKg),
      blockingReason: !selectedCoilObj
        ? 'کلافی در سیستم ثبت نشده است.'
        : isBlocked
          ? `کلاف «${selectedCoilObj.coilId}» در وضعیت مسدود/قرنطینه یا اتمام مانده قرار دارد.`
          : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-04: QM_UD
  // =========================================================================
  if (scenario.id === 'QM_UD') {
    const blockedCount = heldItems.length + blockedCoils.length;
    const firstHold = heldItems[0];
    const firstBlockedCoil = blockedCoils[0];

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. شناسایی ردیف‌ها و کلاف‌های تحت قرنطینه کیفی (QC Hold)',
        sapCode: 'QA32 / QC Hold',
        moduleName: 'کنترل کیفیت و قرنطینه',
        status: blockedCount > 0 ? 'WARNING' : 'READY',
        summary: blockedCount > 0
          ? `${heldItems.length} ردیف انبار و ${blockedCoils.length} کلاف هم‌اکنون در وضعیت قرنطینه کیفی قرار دارند و توسط MRP از موجودی آزاد کسر شده‌اند.`
          : 'در این لحظه هیچ لوت یا کلافی در قرنطینه نیست؛ در صورت اجرا، گواهی ممیزی و سلامت کیفی روی لوت‌ها صادر می‌شود.',
        metrics: [
          { label: 'ردیف‌های مسدود انبار', value: `${heldItems.length} ردیف`, tone: heldItems.length > 0 ? 'warn' : 'good' },
          { label: 'کلاف‌های قرنطینه', value: `${blockedCoils.length} کلاف`, tone: blockedCoils.length > 0 ? 'warn' : 'good' },
          { label: 'نمونه تحت بررسی', value: firstHold?.lotNumber || firstBlockedCoil?.coilId || 'همه اقلام آزاد' },
        ],
        navTarget: { tab: 'inventory', subTab: 'QUALITY', label: 'کارتابل کنترل کیفیت انبار' },
      },
      {
        stepNumber: 2,
        title: '۲. صدور تصمیم مصرف و انتقال از قرنطینه به موجودی آزاد (Movement 321)',
        sapCode: 'MIGO 321 / UD',
        moduleName: 'اسناد تغییر وضعیت کیفی',
        status: 'READY',
        summary: blockedCount > 0
          ? 'با تأیید تصمیم مصرف کیفی (Usage Decision)، تمام اقلام قرنطینه آزاد شده و بلافاصله در محاسبات MRP و حواله خط لحاظ می‌شوند.'
          : 'با تأیید ممیزی کیفی، وضعیت سلامت لوت‌ها در تاریخچه QC ثبت و موجودی آزاد تائید می‌گردد.',
        metrics: [
          { label: 'کد حرکت انباری', value: '۳۲۱ (QI → Unrestricted)' },
          { label: 'اثر روی MRP', value: blockedCount > 0 ? 'افزایش موجودی قابل مصرف' : 'تثبیت وضعیت آزاد' },
        ],
        navTarget: { tab: 'mrp', label: 'بررسی اثر در محاسبات MRP' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: selectedCoilObj ? {
        id: selectedCoilObj.id,
        coilId: selectedCoilObj.coilId,
        materialGrade: selectedCoilObj.materialGrade,
        thicknessMm: selectedCoilObj.thicknessMm,
        remainingWeightKg: selectedCoilObj.remainingWeightKg,
        heatNumber: selectedCoilObj.heatNumber || '—',
        qualityStatus: selectedCoilObj.qualityStatus,
      } : null,
      selectedQuantity: qty,
      summary: `پایش وضعیت کیفی: ${blockedCount} مورد مسدود/قرنطینه شناسایی شد.`,
      canExecute: true,
      steps,
    };
  }

  // =========================================================================
  // SCN-05: MATERIAL_SHORTAGE
  // =========================================================================
  if (scenario.id === 'MATERIAL_SHORTAGE') {
    const mrpReport = runFullMrp({
      includeWip: true,
      includeConsignment: true,
    });
    const shortageItems = mrpReport.materials.filter(r => r.hardShortageQuantity > 0 || r.shortageQuantity > 0);
    const prCount = mrpPurchaseRequisitionsStore.length;

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. انفجار ساختار محصول (BOM) و استخراج مصرف ورق و اتصالات',
        sapCode: 'CS12 / BOM',
        moduleName: 'ساختار مهندسی محصول (BOM)',
        status: matchingBom ? 'READY' : 'WARNING',
        summary: matchingBom
          ? `درخت BOM قطعه «${matchingBom.assemblyPartName}» شامل ${matchingBom.components.length} جزء (ورق خام، زیرقطعه و پیچ/مهره) است.`
          : `برای قطعه «${part?.code || '—'}» BOM اختصاصی ثبت نشده؛ تحلیل بر اساس کل اقلام موجود در MRP انجام می‌شود.`,
        metrics: [
          { label: 'تعداد کل اقلام تحلیل‌شده', value: `${mrpReport.materials.length} قلم` },
          { label: 'اقلام دارای کسری خالص', value: `${shortageItems.length} قلم`, tone: shortageItems.length > 0 ? 'warn' : 'good' },
          { label: 'درخواست‌های خرید قبلی', value: `${prCount} مورد` },
        ],
        navTarget: { tab: 'bom', docQuery: part?.code, label: 'نمایش درخت مهندسی BOM' },
      },
      {
        stepNumber: 2,
        title: '۲. صدور درخواست خرید (PR) برای جبران کسری مواد اولیه و اتصالات',
        sapCode: 'MD02 → ME51N',
        moduleName: 'کارتابل MRP و تدارکات',
        status: 'READY',
        summary: shortageItems.length > 0
          ? `مهم‌ترین کسری شناسایی‌شده: ${shortageItems.slice(0, 3).map(s => `${s.materialName} (${s.shortageQuantity} ${s.unitCode})`).join('، ')}. با اجرا، درخواست خرید (PR) رسمی صادر می‌شود.`
          : `بر اساس موجودی فعلی و سفارشات، با انتخاب ${qty} عدد تولید جدید، محاسبه کسری و در صورت نیاز درخواست خرید صادر می‌شود.`,
        metrics: shortageItems.slice(0, 3).map(s => ({
          label: s.materialCode,
          value: `کسری ${s.shortageQuantity.toLocaleString('fa-IR')} ${s.unitCode}`,
          tone: 'warn' as const,
        })),
        navTarget: { tab: 'mrp', label: 'مدیریت درخواست‌های خرید (PR)' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: qty,
      summary: `تحلیل زنده MRP برای ${mrpReport.materials.length} قلم انجام شد؛ ${shortageItems.length} قلم دارای کسری هستند.`,
      canExecute: true,
      steps,
    };
  }

  // =========================================================================
  // SCN-06: SUB_ASSEMBLY_PARALLEL
  // =========================================================================
  if (scenario.id === 'SUB_ASSEMBLY_PARALLEL') {
    const assemblyBom = boms.find(b => b.assemblyPartCode === part?.code) || boms[0];
    const subParts = (assemblyBom?.components || []).filter(c => c.subMoRequired || c.componentType === 'WIP_SUB_PART');
    const subMOs = subParts.map(sp => ({
      partCode: sp.componentPartCode,
      partName: sp.componentPartName,
      routing: stores.routings.find(r => r.partCode === sp.componentPartCode || r.partId === sp.componentPartId),
      requiredQty: Math.ceil(qty * sp.quantityPerAssembly),
    }));

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. تفکیک مونتاژ نهایی به زیرمجموعه‌های همزمان (Parent / Child WIP)',
        sapCode: 'CO07 / BOM Tree',
        moduleName: 'درخت محصول و جریان موازی',
        status: subMOs.length > 0 ? 'READY' : 'WARNING',
        summary: subMOs.length > 0
          ? `مونتاژ «${assemblyBom?.assemblyPartName}» دارای ${subMOs.length} زیرمجموعه نیمه‌ساخته است که همزمان دستور کار می‌گیرند.`
          : 'این قطعه زیرمجموعه چندسطحی ندارد؛ می‌توانید روی مجموعه براکت ECU این سناریو را اجرا کنید.',
        metrics: subMOs.map(sm => ({
          label: sm.partCode,
          value: `${sm.requiredQty.toLocaleString('fa-IR')} عدد (${sm.routing ? 'مسیر فعال' : 'بدون مسیر'})`,
          tone: sm.routing ? 'good' : 'warn',
        })),
        navTarget: { tab: 'bom', docQuery: assemblyBom?.assemblyPartCode, label: 'ساختار و جریان موازی BOM' },
      },
      {
        stepNumber: 2,
        title: '۲. کنترل موجودی اتصالات (مهره و پیچ جوشی) و صدور صف موازی WIP',
        sapCode: 'CO24 / MIGO 311',
        moduleName: 'حواله مواد غیرکلافی و WIP',
        status: 'READY',
        summary: 'دستور کار مونتاژ و زیرمجموعه‌ها همزمان در وضعیت RELEASED ایجاد و در جدول رهگیری عملیات WIP ثبت می‌شوند.',
        metrics: [
          { label: 'تیراژ هدف مونتاژ', value: `${qty.toLocaleString('fa-IR')} دست` },
          { label: 'زیرمجموعه‌های دارای مسیر', value: `${subMOs.filter(s => s.routing).length} از ${subMOs.length}` },
        ],
        navTarget: { tab: 'wip', subTab: 'ORDERS', label: 'مشاهده صف دستور کارهای موازی WIP' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: qty,
      summary: `آماده ایجاد دستور کار همزمان مونتاژ و ${subMOs.filter(s => s.routing).length} زیرمجموعه.`,
      canExecute: Boolean(assemblyBom),
      blockingReason: !assemblyBom ? 'هیچ BOM مونتاژی یافت نشد.' : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-07: CAPACITY_REROUTE
  // =========================================================================
  if (scenario.id === 'CAPACITY_REROUTE') {
    const activeMachines = stores.machines.filter(m => m.status === 'ACTIVE');
    const overloaded = [...activeMachines].sort(
      (a, b) => (machineWorkloadHoursMap[b.id] || 0) - (machineWorkloadHoursMap[a.id] || 0),
    )[0];
    const targetOp = matchingRouting?.operations?.[0];
    const eligibilities = targetOp
      ? evaluateMachineEligibility({
          processType: targetOp.processType,
          requiredTonnage: targetOp.requiredTonnage || 100,
          plannedQuantity: qty,
          standardCycleTimeSec: targetOp.standardCycleTimeSec || 12,
          setupTimeMin: targetOp.setupTimeMin || 20,
          assignedDieId: targetOp.dieMoldId,
          machines: stores.machines,
          dies: stores.dies,
        }).filter(e => e.isEligible)
      : [];
    const altMachine = eligibilities.find(e => e.machineId !== overloaded?.id) || eligibilities[0];

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. تشخیص ایستگاه گلوگاه و بار واقعی ماشین‌آلات (Capacity Load)',
        sapCode: 'CM01 / CM25',
        moduleName: 'تایم‌لاین ظرفیت ماشین‌آلات',
        status: overloaded ? 'READY' : 'WARNING',
        summary: overloaded
          ? `پربارترین ماشین فعلی «${overloaded.name}» با ${(machineWorkloadHoursMap[overloaded.id] || 0).toFixed(1)} ساعت بار برنامه‌ریزی‌شده است.`
          : 'اطلاعات ماشین‌آلات فعال یافت نشد.',
        metrics: [
          { label: 'پربارترین ماشین', value: overloaded ? `${overloaded.code} (${machineWorkloadHoursMap[overloaded.id] || 0}h)` : '—', tone: 'warn' },
          { label: 'تعداد ماشین واجد شرایط جایگزین', value: `${eligibilities.length} دستگاه`, tone: eligibilities.length > 0 ? 'good' : 'bad' },
          { label: 'پیشنهاد جایگزین', value: altMachine ? `${altMachine.machineName} (${altMachine.estimatedRunTimeHours}h)` : 'یافت نشد' },
        ],
        navTarget: { tab: 'planning', subTab: 'CAPACITY', label: 'تایم‌لاین ظرفیت ماشین‌آلات' },
      },
      {
        stepNumber: 2,
        title: '۲. ثبت نسخه بازنگری‌شده تخصیص ماشین در پیشنهاد و صدور MO',
        sapCode: 'PRP Revise → CO01',
        moduleName: 'اصلاح پیشنهاد برنامه و صدور دستور کار',
        status: altMachine ? 'READY' : 'WARNING',
        summary: altMachine
          ? `ماشین «${altMachine.machineName}» جایگزین گلوگاه شده و نسخه جدید پیشنهاد (v+1) صادر و به صف دستور کار منتقل می‌شود.`
          : 'ماشین جایگزین مستقلی در این رده تناژ موجود نیست؛ با ماشین پیش‌فرض قابل صدور است.',
        metrics: [
          { label: 'ماشین مقصد انتخابی', value: altMachine?.machineName || 'ماشین پیش‌فرض مسیر' },
          { label: 'تیراژ برنامه', value: `${qty.toLocaleString('fa-IR')} عدد` },
        ],
        navTarget: { tab: 'planning', subTab: 'PROPOSALS', label: 'پیشنهادهای برنامه تولید' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: qty,
      summary: `تحلیل ظرفیت ماشین‌آلات: گلوگاه «${overloaded?.name || '—'}» و ماشین جایگزین «${altMachine?.machineName || '—'}» شناسایی شدند.`,
      canExecute: Boolean(part && matchingRouting),
      blockingReason: !matchingRouting ? `برای قطعه «${part?.code || explicitQuery || '—'}» مسیر تولید یافت نشد.` : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-09: OEE_SCRAP_RECOVERY
  // =========================================================================
  if (scenario.id === 'OEE_SCRAP_RECOVERY') {
    const scrapRows = getScrapByPartAndOperationReport().data;
    const totalScrap = scrapRows.reduce((s, r) => s + r.scrapPieces, 0);
    const highScrap = scrapRows.filter(r => r.isAboveNorm);
    const downMachines = stores.machines.filter(m => m.status !== 'ACTIVE');
    const makeupQty = totalScrap > 0 ? totalScrap : Math.min(qty, 50);

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. ممیزی اثربخشی تجهیزات (OEE = Availability × Performance × Quality)',
        sapCode: 'TPM / OEE',
        moduleName: 'ماژول OEE و بهره‌وری تجهیزات',
        status: downMachines.length > 0 ? 'WARNING' : 'READY',
        summary: `تعداد ${downMachines.length} دستگاه در وضعیت توقف/تعمیرات قرار دارد و کل ضایعات ثبت‌شده در دستور کارها ${totalScrap.toLocaleString('fa-IR')} عدد است.`,
        metrics: [
          { label: 'ماشین‌های متوقف/نت', value: `${downMachines.length} دستگاه`, tone: downMachines.length > 0 ? 'warn' : 'good' },
          { label: 'جمع ضایعات ثبت‌شده', value: `${totalScrap.toLocaleString('fa-IR')} عدد` },
          { label: 'ایستگاه‌های بالای نرم ضایعات', value: `${highScrap.length} ایستگاه`, tone: highScrap.length > 0 ? 'bad' : 'good' },
        ],
        navTarget: { tab: 'reports', subTab: 'oee_module', label: 'تحلیل درختی OEE و ۶ ضایعه بزرگ' },
        secondaryNavTargets: [
          { tab: 'machines', subTab: 'maintenance', label: 'مدیریت نگهداری و تعمیرات (PM/CM)' },
          { tab: 'reports', subTab: 'scrap_analysis', label: 'گزارش ضایعات عملیات' },
        ],
      },
      {
        stepNumber: 2,
        title: '۲. صدور دستور کار جبرانی (Makeup / Rework MO) برای جایگزینی ضایعات',
        sapCode: 'CO01 (Makeup)',
        moduleName: 'کارتابل جبران ضایعات و WIP',
        status: matchingRouting ? 'READY' : 'BLOCKED',
        summary: matchingRouting
          ? `با اجرای این سناریو، دستور کار جبرانی به تیراژ ${makeupQty.toLocaleString('fa-IR')} عدد برای قطعه «${part?.name}» جهت جبران کسری ناشی از ضایعات در صف WIP صادر می‌شود.`
          : 'برای قطعه منتخب مسیر تولید ثبت نشده است.',
        metrics: [
          { label: 'تیراژ دستور کار جبرانی', value: `${makeupQty.toLocaleString('fa-IR')} عدد` },
          { label: 'قطعه هدف', value: part?.code || '—' },
        ],
        navTarget: { tab: 'wip', subTab: 'ORDERS', docQuery: part?.code, label: 'مشاهده دستور کارها (WIP)' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: makeupQty,
      summary: `پایش OEE و ضایعات: ${totalScrap} قطعه ضایعات شناسایی شد؛ آماده صدور دستور کار جبرانی ${makeupQty} عددی.`,
      canExecute: Boolean(part && matchingRouting),
      blockingReason: !matchingRouting ? `برای قطعه «${part?.code || '—'}» مسیر تولید یافت نشد.` : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-10: ECO_REVISION_CONTROL
  // =========================================================================
  if (scenario.id === 'ECO_REVISION_CONTROL') {
    const activeWipMos = manufacturingOrdersStore.filter(m => ['PLANNED', 'RELEASED', 'IN_PROGRESS'].includes(m.status));
    const partWipMos = part ? activeWipMos.filter(m => m.partId === part.id || m.partCode === part.code) : [];
    const draftProposals = listFallbackProposals(stores.parts, stores.routings, stores.machines, stores.inventoryDocs, stores.reservations)
      .filter(p => p.status === 'DRAFT');

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. ممیزی ساختار BOM و مسیر عملیات تحت تغییر مهندسی (ECO Impact)',
        sapCode: 'CC01 / CS03 / CA03',
        moduleName: 'مهندسی محصول و تغییرات (BOM & Routing)',
        status: matchingBom || matchingRouting ? 'READY' : 'WARNING',
        summary: `تغییر مهندسی روی قطعه «${part?.name || '—'}»: نسخه BOM فعلی (${matchingBom?.version || 'بدون BOM'}) و نسخه مسیر (${matchingRouting?.version || '—'}) با ${matchingRouting?.operations.length || 0} عملیات برای ارزیابی Cut-in بررسی شد.`,
        metrics: [
          { label: 'نسخه BOM فعلی', value: matchingBom?.version || 'تعریف‌نشده' },
          { label: 'نسخه مسیر (Routing)', value: matchingRouting?.version || '—' },
          { label: 'تغییرات متریال', value: `${part?.materialGrade || '—'} / ${part?.thicknessMm || '—'} mm` },
        ],
        navTarget: { tab: 'master_data', subTab: 'BOM', docQuery: part?.code, label: 'بررسی BOM در تغییر مهندسی' },
        secondaryNavTargets: [
          { tab: 'master_data', subTab: 'ROUTINGS', docQuery: part?.code, label: 'بررسی مسیر تولید (Routing)' },
        ],
      },
      {
        stepNumber: 2,
        title: '۲. ارزیابی اثر روی دستورات کار باز (WIP) و بازنگری پیشنهاد برنامه (v+1)',
        sapCode: 'CO02 / PRP Revise',
        moduleName: 'پیشنهاد برنامه و کارگاه WIP',
        status: matchingRouting ? 'READY' : 'BLOCKED',
        summary: `${partWipMos.length} دستور کار باز برای این قطعه در سالن فعال است و ${draftProposals.length} پیش‌نویس پیشنهاد وجود دارد. با اجرا، بازنگری رسمی ECO و نسخه جدید پیشنهاد برنامه تولید ثبت می‌شود.`,
        metrics: [
          { label: 'دستور کارهای باز متأثر', value: `${partWipMos.length} مورد`, tone: partWipMos.length > 0 ? 'warn' : 'good' },
          { label: 'پیش‌نویس‌های پیشنهاد برنامه', value: `${draftProposals.length} مورد` },
        ],
        navTarget: { tab: 'planning', subTab: 'PROPOSALS', docQuery: part?.code, label: 'کارتابل پیشنهادهای برنامه' },
        secondaryNavTargets: [
          { tab: 'wip', subTab: 'ORDERS', docQuery: part?.code, label: 'کنترل دستور کارهای باز WIP' },
        ],
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: qty,
      summary: `تحلیل تغییر مهندسی (ECO) برای «${part?.name || '—'}»: ${partWipMos.length} دستور کار باز شناسایی شد.`,
      canExecute: Boolean(part && matchingRouting),
      blockingReason: !matchingRouting ? `برای قطعه «${part?.code || '—'}» مسیر تولید یافت نشد.` : undefined,
      steps,
    };
  }

  // =========================================================================
  // SCN-11: SUBCONTRACT_OUTSIDE_PROC
  // =========================================================================
  if (scenario.id === 'SUBCONTRACT_OUTSIDE_PROC') {
    const agingItems = getWipAgingReport().data;
    const paintOrSubOps = manufacturingOrdersStore.flatMap(mo =>
      mo.operations
        .filter(op => op.processType === 'PAINT' || op.stepName.includes('کاتافورز') || op.stepName.includes('رنگ') || op.stepName.includes('پیمانکار'))
        .map(op => ({ moNumber: mo.moNumber, partCode: mo.partCode, partName: mo.partName, op })),
    );
    const activeVendorQty = paintOrSubOps.reduce((s, r) => s + (r.op.waitingInputQty || 0) + (r.op.inProgressQty || 0), 0);
    const stagnantSubCount = agingItems.filter(a => a.idleHours >= 48).length;

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. پایش موجودی امانی نزد پیمانکار برون‌سپاری (Vendor WIP - کاتافورز / آبکاری)',
        sapCode: 'ME2O / Subcontract',
        moduleName: 'موجودی مراحل برون‌سپاری',
        status: paintOrSubOps.length > 0 ? 'READY' : 'WARNING',
        summary: `تعداد ${paintOrSubOps.length} عملیات برون‌سپاری/رنگ در دستور کارهای فعال با جمع موجودی در جریان ${activeVendorQty.toLocaleString('fa-IR')} عدد شناسایی شد.`,
        metrics: [
          { label: 'ایستگاه‌های رنگ/پیمانکار', value: `${paintOrSubOps.length} عملیات` },
          { label: 'موجودی نزد پیمانکار (Vendor WIP)', value: `${activeVendorQty.toLocaleString('fa-IR')} عدد` },
        ],
        navTarget: { tab: 'inventory', subTab: 'STAGES', docQuery: paintOrSubOps[0]?.partCode, label: 'مشاهده موجودی مراحل WIP' },
        secondaryNavTargets: [
          { tab: 'wip', subTab: 'TRANSFERS', label: 'رهگیری انتقالات بین‌مرحله‌ای' },
        ],
      },
      {
        stepNumber: 2,
        title: '۲. کنترل خواب بین‌عملیاتی (WIP Aging) و ثبت پیگیری تحویل پیمانکار',
        sapCode: 'MIGO 101 / Aging',
        moduleName: 'گزارش سن‌یابی و ماندگاری WIP',
        status: stagnantSubCount > 0 ? 'WARNING' : 'READY',
        summary: `تعداد ${stagnantSubCount} ایستگاه دارای خواب بیش از ۴۸ ساعت است. با اجرا، صورت‌وضعیت پیگیری پیمانکار و ممیزی موجودی نزد پیمانکار در کارنامه ثبت می‌شود.`,
        metrics: [
          { label: 'اقلام خواب بالای ۴۸ ساعت', value: `${stagnantSubCount} ایستگاه`, tone: stagnantSubCount > 0 ? 'warn' : 'good' },
          { label: 'کل ردیف‌های سنی WIP', value: `${agingItems.length} ردیف` },
        ],
        navTarget: { tab: 'reports', subTab: 'wip_aging', label: 'باز کردن گزارش WIP Aging' },
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: qty,
      summary: `پایش برون‌سپاری پیمانکار: ${paintOrSubOps.length} عملیات پیمانکار و ${activeVendorQty} عدد در جریان نزد پیمانکار شناسایی شد.`,
      canExecute: true,
      steps,
    };
  }

  // =========================================================================
  // SCN-12: KPI_EXEC_CONTROL_TOWER
  // =========================================================================
  if (scenario.id === 'KPI_EXEC_CONTROL_TOWER') {
    const kpiSnap = getIndustrialKpiSnapshot(stores);
    const ppKpis = kpiSnap.metrics.filter(m => m.category === 'برنامه‌ریزی تولید' || m.category === 'ظرفیت و WIP');
    const mmKpis = kpiSnap.metrics.filter(m => m.category === 'کنترل موجودی' || m.category === 'کیفیت و OEE');

    const steps: ScenarioStepEvaluation[] = [
      {
        stepNumber: 1,
        title: '۱. پایش شاخص‌های برنامه‌ریزی تولید، ظرفیت و جریان کارگاه (PP / CRP / WIP)',
        sapCode: 'KPI-PP / CRP',
        moduleName: 'شاخص‌های برنامه تولید',
        status: ppKpis.some(k => k.tone === 'bad') ? 'WARNING' : 'READY',
        summary: 'محاسبه زنده تحقق برنامه، تحویل به‌موقع OTD، لود ظرفیت پرس‌ها، حجم WIP و خواب اقلام بالای ۴۸ ساعت.',
        metrics: ppKpis.map(k => ({ label: k.title.split(' (')[0], value: k.valueDisplay, tone: k.tone })),
        navTarget: { tab: 'reports', subTab: 'comprehensive_production', label: 'گزارش جامع بهره‌وری و OEE' },
        secondaryNavTargets: [
          { tab: 'reports', subTab: 'plan_vs_actual', label: 'تطبیق برنامه و واقعی' },
          { tab: 'reports', subTab: 'backlog', label: 'معوقات و Backlog' },
        ],
      },
      {
        stepNumber: 2,
        title: '۲. پایش شاخص‌های کنترل موجودی، نقطه سفارش، کیفیت و انحراف مصرف (MM / QM / CO)',
        sapCode: 'KPI-MM / QM / CO',
        moduleName: 'شاخص‌های کنترل موجودی و کیفیت',
        status: mmKpis.some(k => k.tone === 'bad' || k.tone === 'warn') ? 'WARNING' : 'READY',
        summary: 'محاسبه زنده کسری خالص MRP، اقلام زیر نقطه سفارش، موجودی قرنطینه، نرخ ضایعات و انحراف مصرف واقعی از BOM.',
        metrics: mmKpis.map(k => ({ label: k.title.split(' (')[0], value: k.valueDisplay, tone: k.tone })),
        navTarget: { tab: 'reports', subTab: 'consumption', label: 'گزارش انحراف مصرف BOM' },
        secondaryNavTargets: [
          { tab: 'inventory', subTab: 'ALERTS', label: 'اقلام زیر نقطه سفارش' },
          { tab: 'reports', subTab: 'valuation_qty', label: 'ارزش و تفکیک موجودی انبار' },
        ],
      },
    ];

    return {
      scenario,
      evaluatedAt: new Date().toISOString(),
      partExists: Boolean(part),
      selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
      selectedCoil: null,
      selectedQuantity: qty,
      summary: `برج کنترل KPI با ${kpiSnap.metrics.length} شاخص زنده تولید و موجودی محاسبه شد.`,
      canExecute: true,
      steps,
    };
  }

  // =========================================================================
  // SCN-08: SAFETY_STOCK (Default fallback)
  // =========================================================================
  const belowMinParts = stores.parts
    .map(p => {
      const avail = balances
        .filter(b => b.partId === p.id || b.partCode === p.code)
        .reduce((s, b) => s + b.availableQty, 0);
      const min = p.minStock || 0;
      return { part: p, avail: fmt(avail), min, deficit: Math.max(0, fmt(min - avail)) };
    })
    .filter(x => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit);

  const steps: ScenarioStepEvaluation[] = [
    {
      stepNumber: 1,
      title: '۱. اسکن کامل موجودی انبارها در برابر حداقل موجودی ایمنی (Safety Stock)',
      sapCode: 'MD07 / Stock Alert',
      moduleName: 'موجودی انبار و نقطه سفارش',
      status: belowMinParts.length > 0 ? 'WARNING' : 'READY',
      summary: belowMinParts.length > 0
        ? `تعداد ${belowMinParts.length} قلم کالا زیر حداقل موجودی ایمنی مهندسی قرار دارند. فوری‌ترین: ${belowMinParts.slice(0, 3).map(x => `${x.part.name} (کسری ${x.deficit} ${x.part.unit})`).join('، ')}.`
        : 'همه اقلام هم‌اکنون بالای حداقل موجودی ایمنی هستند؛ با اجرا می‌توانید یک دستور ساخت تکمیلی ذخیره ایمنی برای قطعه منتخب صادر کنید.',
      metrics: belowMinParts.slice(0, 3).map(x => ({
        label: x.part.code,
        value: `موجودی ${x.avail} / حداقل ${x.min}`,
        tone: 'warn' as const,
      })),
      navTarget: { tab: 'inventory', subTab: 'ALERTS', label: 'کارتابل هشدارهای نقطه سفارش' },
      secondaryNavTargets: [
        { tab: 'inventory', subTab: 'STOCK', label: 'کاردکس و موجودی انبارها' },
      ],
    },
    {
      stepNumber: 2,
      title: '۲. تولید سفارش جبرانی خودکار (MO برای قطعات ساختنی / PR برای مواد خریدنی)',
      sapCode: 'CO01 / ME51N',
      moduleName: 'برنامه‌ریزی تولید و درخواست خرید',
      status: 'READY',
      summary: 'برای اقلام ساختنی دارای مسیر، دستور کار جبرانی (MO) و برای مواد اولیه خریدنی، درخواست خرید (PR) صادر می‌شود.',
      metrics: [
        { label: 'اقلام نیازمند جبران', value: `${belowMinParts.length} قلم` },
        { label: 'نوع جبران', value: 'MO خودکار + PR تدارکات' },
      ],
      navTarget: { tab: 'wip', subTab: 'ORDERS', label: 'مشاهده دستور کارهای صادرشده' },
    },
  ];

  return {
    scenario,
    evaluatedAt: new Date().toISOString(),
    partExists: Boolean(part),
    selectedPart: part ? { id: part.id, code: part.code, name: part.name, unit: part.unit, materialGrade: part.materialGrade, minStock: part.minStock || 0 } : null,
    selectedCoil: null,
    selectedQuantity: qty,
    summary: `پایش نقطه سفارش تکمیل شد: ${belowMinParts.length} قلم زیر حداقل موجودی ایمنی هستند.`,
    canExecute: true,
    steps,
  };
}

export async function executeIndustrialScenario(
  input: EvaluateScenarioInput,
  stores: ScenarioRuntimeStores,
): Promise<ExecuteScenarioResult> {
  const actor = input.userName || 'مدیر برنامه‌ریزی و سیستم (KPIMS)';
  const { part, explicitQuery } = findRequestedPart(stores.parts, input.partIdOrCode);
  const qty = Math.max(1, Number(input.quantity) || (input.scenarioId === 'PART_LIFECYCLE_PRODUCTION' ? 5000 : 500));

  if (input.scenarioId === 'PROD_ORDER' || input.scenarioId === 'PART_LIFECYCLE_PRODUCTION') {
    if (!part) {
      throw new Error(`قطعه «${explicitQuery || 'انتخاب‌شده'}» در کاتالوگ وجود ندارد. ابتدا از لینک مرحله ۱ قطعه را تعریف کنید.`);
    }
    const routing = stores.routings.find(r => r.partId === part.id || r.partCode === part.code);
    if (!routing) throw new Error(`برای قطعه «${part.code}» مسیر تولید (Routing) ثبت نشده است.`);

    const dueDate = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
    const orderNum = `SO-SCN-${Date.now().toString().slice(-6)}`;
    const ordId = `ORD-SCN-${Date.now()}`;
    const matchingContract = stores.contracts.find(c =>
      (c.commercialLines || []).some(l => l.partId === part.id || l.partCode === part.code),
    ) || stores.contracts[0];

    const newOrder: CustomerOrder = {
      id: ordId,
      orderNumber: orderNum,
      customerName: matchingContract?.customerName || 'سفارش برنامه‌ریزی سناریو ساپکو',
      contractNumber: matchingContract?.contractNumber || 'CNT-FREE-ORDER',
      orderDate: new Date().toISOString().slice(0, 10),
      dueDate,
      priority: 1,
      status: 'OPEN',
      lines: [
        {
          id: `ORD-LN-SCN-${Date.now()}`,
          orderId: ordId,
          partId: part.id,
          partCode: part.code,
          partName: part.name,
          orderedQuantity: qty,
          deliveredQuantity: 0,
          remainingQuantity: qty,
          dueDate,
        },
      ],
      notes: `ثبت از سناریوی صفر تا صد برای ${qty} عدد «${part.name}»`,
      createdAt: new Date().toISOString(),
    };
    customerOrdersStore.unshift(newOrder);

    const proposal = createFallbackProposal(
      `پیشنهاد تأییدشده سناریوی ${orderNum} برای ${part.name} (${qty} عدد)`,
      stores.parts,
      stores.routings,
      stores.machines,
      stores.inventoryDocs,
      stores.reservations,
    );
    approveFallbackProposal(proposal.id, actor);
    const released = await releaseFallbackProposal(proposal.id, actor, stores.parts, stores.routings);
    await persistProductionWipState();

    const moNumbers = (released.manufacturingOrders || []).map((m: any) => m.moNumber);
    const moIds = (released.manufacturingOrders || []).map((m: any) => m.id);
    return {
      success: true,
      scenarioId: input.scenarioId,
      message: `سفارش «${orderNum}» ثبت، پیشنهاد «${proposal.proposalNumber}» با تأیید کاربر تصویب و برنامه «${released.plan.planNumber}» با دستور کارهای [${moNumbers.join('، ')}] به کارگاه WIP صادر شد.`,
      generatedDocs: {
        orderNumber: orderNum,
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        planNumber: released.plan.planNumber,
        moNumbers,
        moIds,
      },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'COIL_SLITTING') {
    const coil =
      (input.coilId ? stores.physicalCoils.find(c => c.id === input.coilId || c.coilId === input.coilId) : undefined) ||
      stores.physicalCoils.find(c => c.remainingWeightKg > 0 && c.qualityStatus === 'AVAILABLE');
    if (!coil) throw new Error('کلاف قابل حواله یافت نشد.');
    const weightToIssue = Math.min(qty, coil.remainingWeightKg);
    const targetMo = manufacturingOrdersStore.find(m => ['PLANNED', 'RELEASED', 'IN_PROGRESS'].includes(m.status));
    const docNum = `ISS-SCN-${Date.now().toString().slice(-6)}`;
    const issueRes = issuePhysicalCoilPartial(
      coil,
      weightToIssue,
      targetMo?.moNumber || 'LINE-SLITTING',
      docNum,
      0,
      { uid: 'USR-SCN', displayName: actor },
    );
    if (!issueRes.success) throw new Error(issueRes.error || 'خطا در حواله جزئی کلاف');

    const nowIso = new Date().toISOString();
    stores.inventoryDocs.unshift({
      id: `DOC-SCN-${Date.now()}`,
      documentNumber: docNum,
      documentType: 'ISSUE_RAW_MATERIAL',
      movementType: '261',
      movementLabel: '۲۶۱ - حواله مصرف مواد به دستور ساخت (GI to Order)',
      documentDate: nowIso,
      documentStatus: 'CONFIRMED',
      postingStatus: 'POSTED',
      warehouseId: coil.warehouseId || 'WH-RAW',
      warehouseName: coil.warehouseName || 'انبار رول و ورق مواد اولیه',
      ownership: coil.ownership,
      contractNumber: coil.allocations?.[0]?.contractNumber,
      referenceType: targetMo ? 'MANUFACTURING_ORDER' : 'MANUAL',
      referenceNumber: targetMo?.moNumber || coil.coilId,
      auditNote: `حواله جزئی سناریو از کلاف ${coil.coilId} (ذوب ${coil.heatNumber})`,
      lines: [
        {
          id: `LN-SCN-${Date.now()}`,
          documentId: `DOC-SCN-${Date.now()}`,
          lineNumber: 1,
          partId: coil.partId || coil.coilId,
          partCode: coil.partCode || coil.materialGrade,
          partName: coil.partName || `کلاف ورق ${coil.materialGrade}`,
          lotNumber: coil.coilPackNumber || coil.coilId,
          heatNumber: coil.heatNumber,
          ownership: coil.ownership,
          locationCode: coil.warehouseLocationCode || 'LOC-RAW-A1',
          quantity: weightToIssue,
          unit: 'KG',
          quantityKg: weightToIssue,
          qualityStatus: 'AVAILABLE',
          notes: 'حواله سناریوی برش کلاف',
        },
      ],
      totalQuantity: weightToIssue,
      totalWeightKg: weightToIssue,
      createdByUid: 'USR-SCN',
      createdByName: actor,
      postedByUid: 'USR-SCN',
      postedByName: actor,
      postedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    return {
      success: true,
      scenarioId: 'COIL_SLITTING',
      message: `حواله جزئی ${weightToIssue} کیلوگرم از کلاف «${coil.coilId}» با سند «${docNum}» ثبت شد. مانده جدید کلاف: ${coil.remainingWeightKg} kg.`,
      generatedDocs: {
        inventoryDocNumber: docNum,
        moNumbers: targetMo ? [targetMo.moNumber] : [],
        moIds: targetMo ? [targetMo.id] : [],
      },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'QM_UD') {
    const heldKeys = Object.keys(serverQcHoldStore).filter(k => serverQcHoldStore[k]?.isHeld);
    const blockedCoils = stores.physicalCoils.filter(
      c => ['QUARANTINE', 'QUALITY_BLOCKED', 'REJECTED'].includes(c.qualityStatus) || c.physicalStatus === 'BLOCKED',
    );
    let releasedCount = 0;
    for (const k of heldKeys) {
      serverQcHoldStore[k].isHeld = false;
      serverQcHoldStore[k].heldQty = 0;
      serverQcHoldStore[k].heldWeightKg = 0;
      serverQcHoldStore[k].reasonFa = `آزادسازی کیفی توسط ${actor}`;
      serverQcHoldStore[k].updatedAt = new Date().toISOString();
      releasedCount += 1;
    }
    for (const c of blockedCoils) {
      c.qualityStatus = 'AVAILABLE';
      if (c.physicalStatus === 'BLOCKED') c.physicalStatus = 'AVAILABLE';
      c.updatedAt = new Date().toISOString();
      releasedCount += 1;
    }
    const docNum = `UD-321-${Date.now().toString().slice(-6)}`;
    stores.auditLogs.unshift({
      id: `AUD-QM-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'QM_USAGE_DECISION_321',
      entityName: 'QualityControl',
      entityId: docNum,
      user: { uid: 'USR-QM', displayName: actor },
      details: `تصمیم مصرف کیفی ${docNum}: ${releasedCount} ردیف/کلاف از قرنطینه آزاد شد.`,
    });

    return {
      success: true,
      scenarioId: 'QM_UD',
      message: releasedCount > 0
        ? `تصمیم مصرف کیفی «${docNum}» ثبت و ${releasedCount} قلم/کلاف به موجودی آزاد (۳۲۱) منتقل شد.`
        : `گواهی سلامت و بازبینی کیفی «${docNum}» ثبت شد؛ تمام موجودی‌ها در وضعیت آزاد قرار دارند.`,
      generatedDocs: { inventoryDocNumber: docNum },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'MATERIAL_SHORTAGE') {
    const mrpReport = runFullMrp({
      includeWip: true,
      includeConsignment: true,
    });
    const shortages = mrpReport.materials.filter(r => r.hardShortageQuantity > 0 || r.shortageQuantity > 0);
    const prNumbers: string[] = [];
    const targetList = shortages.length > 0 ? shortages.slice(0, 5) : mrpReport.materials.slice(0, 1);

    for (const item of targetList) {
      const reqQty = shortages.length > 0 ? (item.hardShortageQuantity || item.shortageQuantity) : qty;
      const prNum = `PR-${new Date().getFullYear()}-${String(mrpPurchaseRequisitionsStore.length + 1).padStart(4, '0')}`;
      const newPr: MrpPurchaseRequisition = {
        id: `PR-SCN-${Date.now()}-${prNumbers.length}`,
        prNumber: prNum,
        materialCode: item.materialCode,
        materialName: item.materialName,
        materialGrade: item.materialGrade,
        quantity: reqQty,
        unit: item.unitCode,
        status: 'APPROVED',
        requestedBy: actor,
        createdAt: new Date().toISOString(),
        createdAtFa: formatToJalali(new Date(), { includeTime: true }),
        notes: 'درخواست خرید صادرشده از تحلیل زنده کسری متریال (MRP)',
      };
      mrpPurchaseRequisitionsStore.unshift(newPr);
      prNumbers.push(prNum);
    }

    return {
      success: true,
      scenarioId: 'MATERIAL_SHORTAGE',
      message: `تحلیل MRP اجرا و ${prNumbers.length} درخواست خرید رسمی [${prNumbers.join('، ')}] صادر شد.`,
      generatedDocs: { prNumbers },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'SUB_ASSEMBLY_PARALLEL') {
    const boms = getAllBoms();
    const assemblyBom = (part && boms.find(b => b.assemblyPartId === part.id || b.assemblyPartCode === part.code)) || boms[0];
    if (!assemblyBom) throw new Error('BOM مونتاژی برای تولید موازی یافت نشد.');

    const createdMoNumbers: string[] = [];
    const createdMoIds: string[] = [];

    for (const comp of assemblyBom.components.filter(c => c.subMoRequired || c.componentType === 'WIP_SUB_PART')) {
      const subRouting = stores.routings.find(r => r.partCode === comp.componentPartCode || r.partId === comp.componentPartId);
      if (!subRouting) continue;
      const moRes = createManufacturingOrder({
        partId: comp.componentPartId,
        targetQuantity: Math.ceil(qty * comp.quantityPerAssembly),
        initialInputQuantity: 0,
        routingId: subRouting.id,
        dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
        notes: `زیرمجموعه موازی مونتاژ ${assemblyBom.assemblyPartCode}`,
        createdBy: actor,
      });
      if (moRes.success && moRes.data) {
        moRes.data.status = 'RELEASED';
        if (moRes.data.operations[0]) moRes.data.operations[0].status = 'READY';
        createdMoNumbers.push(moRes.data.moNumber);
        createdMoIds.push(moRes.data.id);
      }
    }

    const parentRouting = stores.routings.find(
      r => r.partId === assemblyBom.assemblyPartId || r.partCode === assemblyBom.assemblyPartCode,
    );
    if (parentRouting) {
      const parentMoRes = createManufacturingOrder({
        partId: assemblyBom.assemblyPartId,
        targetQuantity: qty,
        initialInputQuantity: 0,
        routingId: parentRouting.id,
        dueDate: new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
        notes: 'مونتاژ نهایی متصل به زیرمجموعه‌های موازی',
        createdBy: actor,
      });
      if (parentMoRes.success && parentMoRes.data) {
        parentMoRes.data.status = 'RELEASED';
        if (parentMoRes.data.operations[0]) parentMoRes.data.operations[0].status = 'READY';
        createdMoNumbers.push(parentMoRes.data.moNumber);
        createdMoIds.push(parentMoRes.data.id);
      }
    }
    await persistProductionWipState();

    return {
      success: true,
      scenarioId: 'SUB_ASSEMBLY_PARALLEL',
      message: `${createdMoNumbers.length} دستور کار موازی [${createdMoNumbers.join('، ')}] در زنجیره WIP صادر شد.`,
      generatedDocs: { moNumbers: createdMoNumbers, moIds: createdMoIds },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'CAPACITY_REROUTE' || input.scenarioId === 'ECO_REVISION_CONTROL') {
    if (!part) throw new Error('قطعه معتبری انتخاب نشده است.');
    const routing = stores.routings.find(r => r.partId === part.id || r.partCode === part.code);
    if (!routing) throw new Error(`مسیر تولید برای قطعه «${part.code}» یافت نشد.`);

    let proposals = listFallbackProposals(
      stores.parts,
      stores.routings,
      stores.machines,
      stores.inventoryDocs,
      stores.reservations,
    );
    let draft = proposals.find(p => p.status === 'DRAFT');
    if (!draft) {
      const dueDate = new Date(Date.now() + 6 * 86400_000).toISOString().slice(0, 10);
      customerOrdersStore.unshift({
        id: `ORD-CRP-${Date.now()}`,
        orderNumber: `SO-${input.scenarioId === 'ECO_REVISION_CONTROL' ? 'ECO' : 'CAP'}-${Date.now().toString().slice(-5)}`,
        customerName: input.scenarioId === 'ECO_REVISION_CONTROL' ? 'سفارش تغییر مهندسی (ECO)' : 'سفارش موازنه‌سازی ظرفیت پرس',
        contractNumber: stores.contracts[0]?.contractNumber || 'CNT-SAPCO-ECU-BRK',
        orderDate: new Date().toISOString().slice(0, 10),
        dueDate,
        priority: 1,
        status: 'OPEN',
        lines: [{
          id: `ORD-LN-CRP-${Date.now()}`,
          orderId: `ORD-CRP-${Date.now()}`,
          partId: part.id,
          partCode: part.code,
          partName: part.name,
          orderedQuantity: qty,
          deliveredQuantity: 0,
          remainingQuantity: qty,
          dueDate,
        }],
        createdAt: new Date().toISOString(),
      });
      draft = createFallbackProposal(
        input.scenarioId === 'ECO_REVISION_CONTROL'
          ? `پیشنهاد بازنگری مهندسی (ECO) برای ${part.name}`
          : `پیشنهاد موازنه‌سازی ظرفیت برای ${part.name}`,
        stores.parts,
        stores.routings,
        stores.machines,
        stores.inventoryDocs,
        stores.reservations,
      );
    }

    const lineToRevise = draft.lines.find((l: any) => l.partId === part.id) || draft.lines[0];
    let targetProp = draft;
    if (lineToRevise && lineToRevise.operationAssignments?.[0]) {
      const firstOp = lineToRevise.operationAssignments[0];
      const candidates: string[] = firstOp.eligibleMachineIds || [];
      const pickedMachineId =
        (input.machineId && candidates.includes(input.machineId) ? input.machineId : undefined) ||
        candidates.find(id => id !== firstOp.machineId) ||
        firstOp.machineId;
      if (pickedMachineId && (pickedMachineId !== firstOp.machineId || input.scenarioId === 'ECO_REVISION_CONTROL')) {
        targetProp = reviseFallbackProposal(
          draft.id,
          [{ proposalLineId: lineToRevise.id, operationAssignments: [{ routeOperationId: firstOp.routeOperationId, machineId: pickedMachineId }] }],
          input.scenarioId === 'ECO_REVISION_CONTROL'
            ? `ثبت بازنگری مهندسی (ECO) و به‌روزرسانی نسخه پیشنهاد`
            : `بازتخصیص گلوگاه به ماشین جایگزین ${pickedMachineId}`,
        );
      }
    }

    approveFallbackProposal(targetProp.id, actor);
    const released = await releaseFallbackProposal(targetProp.id, actor, stores.parts, stores.routings);
    await persistProductionWipState();
    const moNumbers = (released.manufacturingOrders || []).map((m: any) => m.moNumber);
    const moIds = (released.manufacturingOrders || []).map((m: any) => m.id);

    return {
      success: true,
      scenarioId: input.scenarioId,
      message: `پیشنهاد نسخه ${targetProp.version} («${targetProp.proposalNumber}») با تخصیص جدید تأیید و دستور کارهای [${moNumbers.join('، ')}] صادر شد.`,
      generatedDocs: {
        proposalId: targetProp.id,
        proposalNumber: targetProp.proposalNumber,
        planNumber: released.plan.planNumber,
        moNumbers,
        moIds,
      },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'OEE_SCRAP_RECOVERY') {
    if (!part) throw new Error('قطعه معتبری برای صدور دستور کار جبرانی ضایعات انتخاب نشده است.');
    const routing = stores.routings.find(r => r.partId === part.id || r.partCode === part.code);
    if (!routing) throw new Error(`برای قطعه «${part.code}» مسیر تولید یافت نشد.`);
    const scrapRows = getScrapByPartAndOperationReport().data;
    const totalScrap = scrapRows.reduce((s, r) => s + r.scrapPieces, 0);
    const makeupQty = totalScrap > 0 ? totalScrap : Math.min(qty, 50);

    const moRes = createManufacturingOrder({
      partId: part.id,
      targetQuantity: makeupQty,
      initialInputQuantity: 0,
      routingId: routing.id,
      dueDate: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
      notes: `دستور کار جبرانی ضایعات خط پرس و بهبود OEE (${makeupQty} عدد)`,
      createdBy: actor,
    });
    if (!moRes.success || !moRes.data) {
      throw new Error(moRes.error || 'خطا در صدور دستور کار جبرانی');
    }
    moRes.data.status = 'RELEASED';
    if (moRes.data.operations[0]) moRes.data.operations[0].status = 'READY';
    await persistProductionWipState();

    return {
      success: true,
      scenarioId: 'OEE_SCRAP_RECOVERY',
      message: `دستور کار جبرانی ضایعات «${moRes.data.moNumber}» به تیراژ ${makeupQty.toLocaleString('fa-IR')} عدد در کارتابل WIP صادر و گزارش تحلیل OEE ثبت شد.`,
      generatedDocs: {
        moNumbers: [moRes.data.moNumber],
        moIds: [moRes.data.id],
      },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  if (input.scenarioId === 'SUBCONTRACT_OUTSIDE_PROC' || input.scenarioId === 'KPI_EXEC_CONTROL_TOWER') {
    const auditCode = `${input.scenarioId === 'SUBCONTRACT_OUTSIDE_PROC' ? 'SUB-AUDIT' : 'KPI-AUDIT'}-${Date.now().toString().slice(-6)}`;
    const kpiSnap = getIndustrialKpiSnapshot(stores);
    stores.auditLogs.unshift({
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: input.scenarioId,
      entityName: input.scenarioId === 'SUBCONTRACT_OUTSIDE_PROC' ? 'SubcontractWip' : 'KpiControlTower',
      entityId: auditCode,
      user: { uid: 'USR-ERP', displayName: actor },
      details:
        input.scenarioId === 'SUBCONTRACT_OUTSIDE_PROC'
          ? `ثبت ممیزی و پیگیری عملیات برون‌سپاری پیمانکار (${auditCode})`
          : `ثبت اسنپ‌شات برج کنترل KPI (${kpiSnap.metrics.length} شاخص زنده تولید و موجودی - ${auditCode})`,
    });

    return {
      success: true,
      scenarioId: input.scenarioId,
      message:
        input.scenarioId === 'SUBCONTRACT_OUTSIDE_PROC'
          ? `ممیزی موجودی نزد پیمانکار و کنترل خواب WIP با شماره پیگیری «${auditCode}» ثبت شد.`
          : `گزارش ممیزی ۱۰ شاخص زنده برنامه‌ریزی تولید و کنترل موجودی با کد «${auditCode}» ثبت و آماده پیگیری در گزارش‌ها است.`,
      generatedDocs: { inventoryDocNumber: auditCode },
      evaluation: evaluateIndustrialScenario(input, stores),
    };
  }

  // SAFETY_STOCK
  const { balances: rawBalances } = calculateDetailedStockBalances(stores.inventoryDocs, stores.reservations, stores.parts);
  const balances = applyQcHoldsToBalances(rawBalances, serverQcHoldStore);
  const belowMin = stores.parts
    .map(p => {
      const avail = balances.filter(b => b.partId === p.id || b.partCode === p.code).reduce((s, b) => s + b.availableQty, 0);
      const min = p.minStock || 0;
      return { part: p, deficit: Math.max(0, Math.ceil(min - avail)) };
    })
    .filter(x => x.deficit > 0);

  const createdMoNumbers: string[] = [];
  const createdMoIds: string[] = [];
  const createdPrNumbers: string[] = [];

  for (const row of belowMin.slice(0, 3)) {
    const rtg = stores.routings.find(r => r.partId === row.part.id || r.partCode === row.part.code);
    if (rtg) {
      const moRes = createManufacturingOrder({
        partId: row.part.id,
        targetQuantity: row.deficit,
        initialInputQuantity: 0,
        routingId: rtg.id,
        dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
        notes: `جبران موجودی ایمنی (حداقل ${row.part.minStock})`,
        createdBy: actor,
      });
      if (moRes.success && moRes.data) {
        moRes.data.status = 'RELEASED';
        if (moRes.data.operations[0]) moRes.data.operations[0].status = 'READY';
        createdMoNumbers.push(moRes.data.moNumber);
        createdMoIds.push(moRes.data.id);
      }
    } else {
      const prNum = `PR-SS-${Date.now().toString().slice(-5)}-${createdPrNumbers.length + 1}`;
      mrpPurchaseRequisitionsStore.unshift({
        id: `PR-SS-${Date.now()}-${createdPrNumbers.length}`,
        prNumber: prNum,
        materialCode: row.part.code,
        materialName: row.part.name,
        materialGrade: row.part.materialGrade,
        quantity: row.deficit,
        unit: row.part.unit,
        status: 'APPROVED',
        requestedBy: actor,
        createdAt: new Date().toISOString(),
        createdAtFa: formatToJalali(new Date(), { includeTime: true }),
        notes: `جبران کسری موجودی ایمنی (حداقل ${row.part.minStock} ${row.part.unit})`,
      });
      createdPrNumbers.push(prNum);
    }
  }

  if (createdMoNumbers.length === 0 && createdPrNumbers.length === 0 && part) {
    const rtg = stores.routings.find(r => r.partId === part.id || r.partCode === part.code);
    if (rtg) {
      const moRes = createManufacturingOrder({
        partId: part.id,
        targetQuantity: qty,
        initialInputQuantity: 0,
        routingId: rtg.id,
        dueDate: new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10),
        notes: 'تکمیل ذخیره ایمنی قطعه منتخب',
        createdBy: actor,
      });
      if (moRes.success && moRes.data) {
        moRes.data.status = 'RELEASED';
        if (moRes.data.operations[0]) moRes.data.operations[0].status = 'READY';
        createdMoNumbers.push(moRes.data.moNumber);
        createdMoIds.push(moRes.data.id);
      }
    }
  }
  await persistProductionWipState();

  return {
    success: true,
    scenarioId: 'SAFETY_STOCK',
    message: `جبران موجودی ایمنی انجام شد: ${createdMoNumbers.length} دستور کار و ${createdPrNumbers.length} درخواست خرید صادر گردید.`,
    generatedDocs: {
      moNumbers: createdMoNumbers,
      moIds: createdMoIds,
      prNumbers: createdPrNumbers,
    },
    evaluation: evaluateIndustrialScenario(input, stores),
  };
}
