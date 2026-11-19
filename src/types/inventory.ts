/**
 * Data models for Automotive Sheet Metal Production Planning & Inventory Control
 * سیستم جامع برنامه‌ریزی تولید، قالب‌ها، خطوط پرس و کنترل موجودی قطعات فلزی خودرو
 */

export type PartCategory = 'RAW_MATERIAL' | 'WIP_PART' | 'FINISHED_GOOD';
export type UnitOfMeasure = 'KG' | 'PCS';

export type ProcessType =
  | 'SHEARING'          // برش و نواربری ورق
  | 'BLANKING'          // پرس بلنکینگ سنبه و ماتریس
  | 'DRAWING'           // کشش عمیق قالب پرس سنگین
  | 'PUNCH_FORM'        // پانچ، سوراخ‌کاری و فرم‌دهی
  | 'BENDING'           // خم‌کاری و پرس برک
  | 'TRIMMING'          // دوربری و آرایش لبه
  | 'SPOT_WELD'         // پرس‌جوش مقاومتی نقطه و مهره
  | 'CO2_WELD'          // جوشکاری دستی و رباتیک CO2
  | 'PAINT'             // شستشو، چربی‌زدایی و رنگ کاتافورز ED
  | 'ASSEMBLY';         // مونتاژ مجموعه‌ها، هِمینگ و بسته‌بندی

export type MachineStatus = 'ACTIVE' | 'MAINTENANCE' | 'IDLE';

export interface ProcessDefinition {
  id: string;
  code: ProcessType;
  name: string;
  category: 'STAMPING' | 'FORMING' | 'JOINING' | 'SURFACE_FINISH' | 'ASSEMBLY';
  description?: string;
}

export interface OperationDefinition {
  id: string;
  code: string;                // e.g. OP-10, OP-WELD-NUT, OP-BEND-3
  name: string;                // عنوان عملیات
  stationType: string;         // نوع ایستگاه کاری (خط برش، پرس ضربه‌ای، پرس هیدرولیک، پرس‌جوش، جوش CO2، خط رنگ)
  cycleTimeSec: number;        // زمان چرخه استاندارد (ثانیه)
  setupTimeMin: number;        // زمان ستاپ / تعویض قالب (دقیقه)
  category: 'SHEARING' | 'STAMPING' | 'BENDING' | 'WELDING' | 'SURFACE_FINISH' | 'QC_PACK';
  description?: string;
  active: boolean;
}

export interface FactoryHall {
  id: string;
  code: string;
  name: string;
  type: 'STAMPING' | 'WELDING' | 'PAINT' | 'ASSEMBLY' | 'WAREHOUSE';
  supervisorName?: string;
  capacityDesc?: string;
  description?: string;
  active?: boolean;
}

export interface Operator {
  id: string;
  personnelCode: string;
  fullName: string;
  skillProcessTypes: ProcessType[];
  defaultShift: 'MORNING' | 'EVENING' | 'NIGHT';
  phone?: string;
  hallId?: string;
  active: boolean;
  isDemo?: boolean;
}

export interface CustomerDefinition {
  id: string;
  code: string;
  name: string;
  contractType: string;
  phone?: string;
  email?: string;
  address?: string;
  isDefault?: boolean;
}

export interface UnitDefinition {
  id: string;
  symbol: string;
  title: string;
  description: string;
  conversionFactorToKg?: number;
  isBaseUnit?: boolean;
}

export interface CarModel {
  id: string;
  code: string;
  name: string;
  oem: string;               // ساپکو (ایران‌خودرو)، سازه‌گستر (سایپا)، بهمن و...
  description?: string;
  active: boolean;
}

export interface ShiftDefinition {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  netWorkMinutes: number;
  status: 'ACTIVE' | 'INACTIVE';
  // Overtime & Factory Calendar enhancements
  hasOvertime?: boolean;
  overtimeStartTime?: string;      // e.g. 15:00 (ساعت ۳ بعدازظهر)
  overtimeEndTime?: string;        // e.g. 17:00 (ساعت ۵ عصر)
  overtimeMinutes?: number;        // e.g. 120 دقیقه
  overtimeDaysDescription?: string;// e.g. شنبه تا چهارشنبه
  thursdayStatus?: 'OFF' | 'OVERTIME_15_17' | 'FULL_SHIFT'; // وضعیت پنجشنبه: تعطیل / اضافه‌کاری ۱۵ تا ۱۷ / شیفت کامل
}

export interface DieMold {
  id: string;
  code: string;               // e.g. DIE-206-BRK01
  name: string;               // e.g. قالب سنبه ماتریس کشش براکت رادیاتور پژو ۲۰۶
  partId: string;             // قطعه تولیدی مرتبط
  partCode: string;
  partName: string;
  processType: ProcessType;   // نوع عملیات این قالب
  requiredTonnage: number;    // تناژ مورد نیاز پرس برای کار با این قالب (تن)
  compatibleMachineCodes?: string[]; // کدهای پرس‌های سازگار
  compatibleMachineIds?: string[];   // شناسه‌های پرس‌های سازگار
  strokeLifeTarget: number;   // عمر اسمی قالب برحسب ضرب
  currentStrokes: number;     // کارکرد ضرب تا کنون
  status: 'READY' | 'UNDER_MAINTENANCE' | 'CALIBRATION';
  location: string;           // قفسه انبار قالب‌ها
  notes?: string;
  isDemo?: boolean;
}

export interface Part {
  id: string;
  code: string;               // e.g. IKCO-206-BRK01, SAPCO-COIL-ST14
  name: string;               // e.g. براکت دیاق سپر جلو ۲۰۶
  category: PartCategory;     // RAW_MATERIAL | WIP_PART | FINISHED_GOOD
  unit: UnitOfMeasure;        // KG | PCS
  weightPerUnitKg: number;    // وزن واحد به کیلوگرم
  sapcoCode?: string;         // کد تأمین ساپکو / ایران‌خودرو / سایپا
  carModel?: string;          // پژو ۲۰۶، تارا، دنا پلاس، شاهین، کوییک
  thicknessMm?: number;       // ضخامت ورق به میلیمتر
  materialGrade?: string;     // گرید فولاد: ST12, ST14, DX51D, ST37
  description?: string;       // توضیحات فنی، ابعاد، استاندارد و شکل عرضه
  minStock?: number;          // حداقل موجودی اطمینان
  maxStock?: number;          // حداکثر ظرفیت انبار
  leadTimeDays?: number;      // زمان انتظار تدارک یا ساخت (روز)
  isPinned?: boolean;         // نشانه‌گذاری قطعه کلیدی / VIP برای کنترل سریع
  isVIP?: boolean;            // وضعیت رسمی قطعه کلیدی (VIP) در کل سیستم
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface OperationStep {
  stepNumber: number;          // OP10, OP20, OP30...
  stepCode: string;            // OP10_SHEAR, OP20_BLANK...
  stepName: string;            // برش و نواربری، بلنکینگ، خم‌کاری، فرم‌دهی، جوش...
  processType: ProcessType;
  machineId?: string;
  machineName?: string;
  dieMoldId?: string;          // قالب پرس متصل به این مرحله
  dieMoldName?: string;
  requiredTonnage?: number;    // تناژ مورد نیاز پرس
  setupTimeMin?: number;       // زمان ستاپ و تعویض قالب (دقیقه)
  standardCycleTimeSec: number;// زمان استاندارد سیکل به ثانیه
  scrapNormPercent: number;    // نرم استاندارد ضایعات درصدی
  description?: string;
  // Shared / Co-Production Operation (عملیات مشترک / قالب ۲ کویته همزمان)
  isSharedOperation?: boolean;          // آیا این گام یک عملیات مشترک با خروجی همزمان دو یا چند قطعه است؟
  sharedPartId?: string;                // شناسه قطعه دوم (هم‌تولید) مثلاً پشت صندلی راست
  sharedPartCode?: string;              // کد قطعه دوم (مثلاً SAPCO-ST-BACK-RH)
  sharedPartName?: string;              // نام قطعه دوم (مثلاً پشت صندلی راست)
  sharedYieldRatio?: number;            // نسبت خروجی قطعه دوم به ازای هر ضرب (پیش‌فرض ۱)
  sharedOperationNotes?: string;        // توضیحات فرآیند قالب مشترک و خروجی دوگانه
}

export interface Routing {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  version: string;
  operations: OperationStep[];
  notes?: string;
  isDemo?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Machine {
  id: string;
  code: string;               // PRS-800-01, BRK-160-02
  name: string;               // پرس هیدرولیک کشش عمیق ۸۰۰ تن
  capabilities: ProcessType[]; // قابلیت‌های چندگانه پرس (پانچ، خم، کشش، بلنکینگ بسته به قالب)
  processType: ProcessType;   // فرایند اصلی پیش‌فرض
  tonnage?: number;           // تناژ اسمی پرس (تن)
  bolsterSize?: string;       // ابعاد میز پرس (میلیمتر)
  strokeLengthMm?: number;    // کورس ضربه پرس (میلیمتر)
  strokesPerMinute?: number;  // سرعت ضربه (SPM)
  hallId?: string;            // سالن استقرار
  location: string;           // سالن پرس سنگین، سالن جوش، سالن رنگ
  status: MachineStatus;      // فعال، تعمیرات، متوقف
  operatorName?: string;      // اپراتور مسئول شیفت
  isDemo?: boolean;
  createdAt?: string;
}

export type VoucherType =
  | 'OPENING_BALANCE'         // موجودی اول دوره
  | 'RECEIPT'                 // رسید مواد اولیه یا ورودی محصول
  | 'ISSUE'                   // حواله مصرف مواد اولیه به سالن
  | 'CUSTOMER_DELIVERY'       // حواله خروج و تحویل محصول نهایی به مشتری (ساپکو / سایپا و...)
  | 'PRODUCTION_OUTPUT'       // ثبت تولید سالم قطعه در مرحله
  | 'SCRAP'                   // ثبت ضایعات تولیدی
  | 'WIP_TRANSFER_DISPATCH'   // خروج قطعه نیمه‌ساخته به مرحله بعد
  | 'WIP_TRANSFER_RECEIPT'    // ورود و دریافت قطعه در مرحله مقصد
  | 'ADJUSTMENT';             // سند اصلاحی / تعدیل انبارگردانی

export type VoucherStatus = 'CONFIRMED' | 'REVERSED';

export interface InventoryTransaction {
  id: string;
  voucherNumber: string;      // شناسه یکتا مانند VCH-1405-00101
  voucherType: VoucherType;
  partId: string;
  partCode: string;
  partName: string;
  stageId: string;            // مرحله یا انبار مبدا/اصلی
  stageName: string;          // نام فارسی مرحله
  targetStageId?: string;     // مرحله مقصد در صورت انتقال
  targetStageName?: string;   // نام مرحله مقصد
  quantity: number;           // مقدار اصلی (مثبت یا منفی)
  unit: UnitOfMeasure;        // KG | PCS
  quantityKg: number;         // مقدار معادل کیلوگرم
  referenceDoc?: string;      // شماره بارنامه ساپکو، حواله انبار، دستور کار
  operatorName?: string;      // نام اپراتور / مسئول ثبت
  machineId?: string;         // کد ماشین‌آلات درگیر
  dieMoldId?: string;         // قالب پرس استفاده شده
  dieMoldName?: string;
  shift?: 'MORNING' | 'EVENING' | 'NIGHT';
  scrapReason?: string;       // علت ضایعات: پارگی کشش، چروکیدگی، ترک خم و...
  status: VoucherStatus;      // CONFIRMED | REVERSED
  reversalOfVoucherId?: string;
  notes?: string;
  createdByUid?: string;
  createdByName?: string;
  isDemo?: boolean;
  createdAt: string;
}

export interface StageInventorySummary {
  stageId: string;
  stageName: string;
  processType?: ProcessType;
  partId: string;
  partCode: string;
  partName: string;
  unit: UnitOfMeasure;
  totalQty: number;           // موجودی فیزیکی کل مرحله
  reservedQty: number;        // موجودی رزرو شده برای ارسال به مرحله بعد
  inTransitQty: number;       // موجودی در راه (ارسال شده و در انتظار تأیید مقصد)
  usableQty: number;          // موجودی آزاد و قابل استفاده در ایستگاه = totalQty - reservedQty
  totalKg: number;            // وزن کل به کیلوگرم
  scrapQty: number;           // مجموع ضایعات ثبت شده
  scrapRatePercent: number;   // درصد ضایعات به کل تولید
  lastActivityDate?: string;
}

export interface UserRoleProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'PRODUCTION_MANAGER' | 'WAREHOUSE_KEEPER' | 'QC_INSPECTOR' | 'LINE_SUPERVISOR';
  active: boolean;
  createdAt: string;
}

export const PROCESS_DEFINITIONS: ProcessDefinition[] = [
  { id: 'PROC-SHEAR', code: 'SHEARING', name: 'برش و نواربری رول ورق', category: 'STAMPING', description: 'گیوتین، رول‌بازکن و فیدر تغذیه کلاف ساپکو' },
  { id: 'PROC-BLANK', code: 'BLANKING', name: 'بلنکینگ سنبه و ماتریس', category: 'STAMPING', description: 'تولید ورق شیت شکل‌یافته اولیه در پرس ضربه‌ای' },
  { id: 'PROC-DRAW', code: 'DRAWING', name: 'کشش عمیق هیدرولیک', category: 'FORMING', description: 'فرم‌دهی پوسته سه‌بعدی قطعات بدنه در پرس‌های تناژ بالا' },
  { id: 'PROC-PUNCH', code: 'PUNCH_FORM', name: 'پانچ، سوراخ‌کاری و پیرسینگ', category: 'STAMPING', description: 'ایجاد سوراخ‌های عبور مهره و شیارهای پیچ' },
  { id: 'PROC-BEND', code: 'BENDING', name: 'خم‌کاری با قالب و پرس برک', category: 'FORMING', description: 'خم‌های ۹۰ درجه، Z و فلنجینگ لبه‌ها' },
  { id: 'PROC-TRIM', code: 'TRIMMING', name: 'دوربری و پلیسه‌گیری لبه', category: 'STAMPING', description: 'جداسازی زواید ورق پس از فرآیند کشش' },
  { id: 'PROC-SPOT', code: 'SPOT_WELD', name: 'پرس‌جوش مقاومتی نقطه و مهره', category: 'JOINING', description: 'جوش مقاومتی مهره‌های M6, M8 و لچکی‌ها' },
  { id: 'PROC-CO2', code: 'CO2_WELD', name: 'جوشکاری دستی و رباتیک CO2', category: 'JOINING', description: 'جوشکاری پیوسته با گاز محافظ آرگون و CO2' },
  { id: 'PROC-PAINT', code: 'PAINT', name: 'رنگ‌آمیزی الکتروفورز کاتافورز (ED)', category: 'SURFACE_FINISH', description: 'شستشو ۸ مرحله‌ای و پوشش ضدخوردگی استاندارد ساپکو' },
  { id: 'PROC-ASSY', code: 'ASSEMBLY', name: 'مونتاژ، هِمینگ و بسته‌بندی', category: 'ASSEMBLY', description: 'هِمینگ لبه درب‌ها و بسته‌بندی در پالت‌های بارکددار ساپکو' },
];

export const FACTORY_HALLS: FactoryHall[] = [
  { id: 'HALL-RAW-STORE', code: 'HALL-01', name: 'انبار مرکزی مواد اولیه و کویل ساپکو', type: 'WAREHOUSE', supervisorName: 'حسین سلیمانی (انباردار مواد)', capacityDesc: 'ظرفیت ۲۰۰ تن ورق رول و شیت' },
  { id: 'HALL-SHEARING', code: 'HALL-02', name: 'سالن برشکاری، نواربری و آماده‌سازی بلنک', type: 'STAMPING', supervisorName: 'علی رضایی (سرپرست برش)', capacityDesc: '۲ خط رول‌بازکن و گیوتین ۳ متری' },
  { id: 'HALL-HEAVY-PRESS', code: 'HALL-03', name: 'سالن پرس‌های سنگین (۸۰۰ و ۴۰۰ تن)', type: 'STAMPING', supervisorName: 'مهندس قنبری (سرپرست پرس سنگین)', capacityDesc: 'پرس هیدرولیک کشش و شولر ضربه‌ای' },
  { id: 'HALL-MEDIUM-PRESS', code: 'HALL-04', name: 'سالن پرس‌های متوسط و برک CNC (۲۵۰ و ۱۶۰ تن)', type: 'STAMPING', supervisorName: 'حسین مرادی', capacityDesc: 'پرس‌های کلاچ پنوماتیک و خم‌کاری' },
  { id: 'HALL-WELDING', code: 'HALL-05', name: 'سالن جوشکاری رباتیک و پرس‌جوش مقاومتی', type: 'WELDING', supervisorName: 'مهندس اکبری', capacityDesc: 'سلول رباتیک یاسکاوا و دستگاه‌های اسپات ولد' },
  { id: 'HALL-CATAPHORESIS', code: 'HALL-06', name: 'سالن خط رنگ کاتافورز و پوشش ضدخوردگی ED', type: 'PAINT', supervisorName: 'مهندس طاهری', capacityDesc: 'تونل شستشو، فسفاته و کوره پخت ۲۰۰ درجه' },
  { id: 'HALL-ASSEMBLY-QC', code: 'HALL-07', name: 'سالن مونتاژ، هِمینگ و انبار محصول نهایی', type: 'ASSEMBLY', supervisorName: 'حمید رسولی', capacityDesc: 'باکس پالت‌های تحویل به خطوط خودروساز' },
];

export const FACTORY_STAGES = [
  { id: 'STAGE_RAW_STORE', name: 'انبار مواد اولیه ساپکو', type: 'STORE', unit: 'KG' },
  { id: 'STAGE_SHEARING', name: 'ایستگاه ۱: برش و نواربری ورق', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_BLANKING', name: 'ایستگاه ۲: پرس بلنکینگ', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_FORMING', name: 'ایستگاه ۳: پرس پانچ و فرم‌دهی', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_BENDING', name: 'ایستگاه ۴: پرس برک و خم‌کاری', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_SPOT_WELD', name: 'ایستگاه ۵: پرس‌جوش مقاومتی', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_CO2_WELD', name: 'ایستگاه ۶: خط جوشکاری CO2', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_PAINT', name: 'ایستگاه ۷: خط شستشو و رنگ کاتافورز', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_ASSEMBLY', name: 'ایستگاه ۸: مونتاژ مجموعه‌ها', type: 'WIP', unit: 'PCS' },
  { id: 'STAGE_FINISHED_STORE', name: 'انبار قطعات و محصولات نهایی', type: 'STORE', unit: 'PCS' },
  { id: 'STAGE_SCRAP_YARD', name: 'انبار ضایعات پرس و ورق', type: 'SCRAP', unit: 'KG' },
] as const;

export const SCRAP_REASONS = [
  'پارگی کشش عمیق در قالب پرس',
  'چروکیدگی ورق در شعاع خم',
  'عدم انطباق ابعادی سوراخ پانچ',
  'پاشش و سوختگی جوش CO2',
  'عدم استحکام نقطه جوش (عدم نفوذ)',
  'خط و خش و لهیدگی سطح ورق',
  'پوست پرتقالی و ریزش رنگ',
  'عیب مواد اولیه / عدم کشش‌پذیری ورق ساپکو',
  'خرابی یا انحراف روبیک قالب',
  'ضایعات راه‌اندازی و تنظیم خط'
];

export interface ProductionPlan {
  id: string;
  planNumber: string;
  title: string;
  partId: string;
  partCode: string;
  partName: string;
  plannedQty: number;
  producedQty: number;
  startDate: string;
  endDate: string;
  priority: 1 | 2 | 3;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
  isDemo?: boolean;
  createdAt?: string;
}

export interface LinkedCoilProductionBatch {
  batchCode: string;
  moCode: string;
  partId?: string;
  partCode: string;
  partName: string;
  allocatedKg: number;
  targetQtyPcs: number;
  linkedAt: string;
}

export interface SapcoCoilReceipt {
  id: string;
  receiptNumber: string;
  coilNumber: string;
  batchNumber?: string;
  partId: string;
  partCode: string;
  partName: string;
  materialGrade: string;
  thicknessMm: number;
  widthMm: number;
  receivedWeightKg: number;
  consumedWeightKg: number;
  heatNumber?: string;
  receiptDate: string;
  status: 'IN_STOCK' | 'IN_CUTTING' | 'DEPLETED';
  linkedProductionBatches?: LinkedCoilProductionBatch[];
  isDemo?: boolean;
}

// =========================================================================
// INVENTORY MODULE EXTENSIONS
// =========================================================================

export type StockOwnership =
  | 'COMPANY_OWNED'
  | 'SAPCO_SUPPLIER_OWNED'
  | 'CUSTOMER_SUPPLIED'
  | 'THIRD_PARTY_OWNED';
export type StockQualityStatus = 'AVAILABLE' | 'QUALITY_BLOCKED' | 'QUARANTINE' | 'REJECTED';
export type PhysicalCoilStatus = 'AVAILABLE' | 'ISSUED' | 'PARTIALLY_ISSUED' | 'CONSUMED' | 'RETURNED' | 'BLOCKED';
export type DocumentStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type PostingStatus = 'UNPOSTED' | 'POSTED' | 'REVERSED';

export type InventoryDocType =
  | 'OPENING_BALANCE'
  | 'RECEIPT_RAW_MATERIAL'
  | 'RECEIPT_FINISHED_GOODS'
  | 'ISSUE_RAW_MATERIAL'
  | 'ISSUE_FINISHED_GOODS'
  | 'DELIVERY_CUSTOMER'
  | 'SHIPMENT_CUSTOMER'
  | 'TRANSFER'
  | 'STOCK_STATUS_TRANSFER'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export type SapMovementType =
  | '101' // Goods Receipt from Production / PO
  | '102' // Reversal of Goods Receipt
  | '261' // Goods Issue for Order (Production Consumption)
  | '262' // Reversal of Goods Issue for Order
  | '311' // Transfer Posting Storage Location to Storage Location
  | '312' // Reversal of 311 Transfer
  | '321' // Transfer Posting Quality Inspection to Unrestricted
  | '322' // Transfer Posting Unrestricted to Quality Inspection
  | '344' // Transfer Posting Unrestricted to Blocked Stock
  | '561' // Initial Entry of Stock Balances
  | '601' // Goods Issue for Delivery (Customer Dispatch)
  | '602' // Reversal of Goods Issue for Delivery
  | '701' // Physical Inventory Gain (GR Adjustment)
  | '702'; // Physical Inventory Loss (GI Adjustment)

export interface SapMovementMeta {
  code: SapMovementType;
  labelFa: string;
  shortFa: string;
  sapNameEn: string;
  direction: 'IN' | 'OUT' | 'TRANSFER' | 'QM';
  reversalCode?: SapMovementType;
}

export const SAP_MOVEMENT_CATALOG: Record<SapMovementType, SapMovementMeta> = {
  '101': { code: '101', labelFa: '۱۰۱ - رسید قطعه / مواد اولیه به انبار (GR)', shortFa: 'رسید به انبار', sapNameEn: 'GR Production / PO', direction: 'IN', reversalCode: '102' },
  '102': { code: '102', labelFa: '۱۰۲ - ابطال رسید انبار (GR Reversal)', shortFa: 'ابطال رسید', sapNameEn: 'GR Reversal', direction: 'OUT' },
  '261': { code: '261', labelFa: '۲۶۱ - حواله مصرف مواد به دستور ساخت (GI to Order)', shortFa: 'مصرف پای کار', sapNameEn: 'GI for Order', direction: 'OUT', reversalCode: '262' },
  '262': { code: '262', labelFa: '۲۶۲ - ابطال حواله مصرف / برگشت از تولید', shortFa: 'ابطال مصرف / برگشت', sapNameEn: 'GI Order Reversal', direction: 'IN' },
  '311': { code: '311', labelFa: '۳۱۱ - انتقال بین‌انباری / ایستگاه‌های کارخانه', shortFa: 'انتقال بین‌انباری', sapNameEn: 'Storage Transfer', direction: 'TRANSFER', reversalCode: '312' },
  '312': { code: '312', labelFa: '۳۱۲ - ابطال انتقال بین‌انباری', shortFa: 'ابطال انتقال', sapNameEn: 'Transfer Reversal', direction: 'TRANSFER' },
  '321': { code: '321', labelFa: '۳۲۱ - آزادسازی از کنترل کیفی به موجودی آزاد (QI → Unrestricted)', shortFa: 'آزادسازی کیفی', sapNameEn: 'QI to Unrestricted', direction: 'QM', reversalCode: '322' },
  '322': { code: '322', labelFa: '۳۲۲ - انتقال به قرنطینه کنترل کیفی (Unrestricted → QI)', shortFa: 'ورود به قرنطینه', sapNameEn: 'Unrestricted to QI', direction: 'QM', reversalCode: '321' },
  '344': { code: '344', labelFa: '۳۴۴ - مسدودسازی کیفی موجودی (Unrestricted → Blocked)', shortFa: 'مسدودسازی کیفی', sapNameEn: 'Unrestricted to Blocked', direction: 'QM', reversalCode: '321' },
  '561': { code: '561', labelFa: '۵۶۱ - ثبت موجودی اول دوره انبار (Initial Balance)', shortFa: 'موجودی اول دوره', sapNameEn: 'Initial Stock Entry', direction: 'IN', reversalCode: '102' },
  '601': { code: '601', labelFa: '۶۰۱ - حواله خروج و تحویل به مشتری (GI Delivery)', shortFa: 'ارسال به مشتری', sapNameEn: 'GI Delivery', direction: 'OUT', reversalCode: '602' },
  '602': { code: '602', labelFa: '۶۰۲ - ابطال ارسال و برگشت از تحویل مشتری', shortFa: 'ابطال ارسال مشتری', sapNameEn: 'Delivery Reversal', direction: 'IN' },
  '701': { code: '701', labelFa: '۷۰۱ - تعدیل مثبت انبارگردانی (Inventory Gain)', shortFa: 'اضافه انبارگردانی', sapNameEn: 'Inv Gain', direction: 'IN', reversalCode: '702' },
  '702': { code: '702', labelFa: '۷۰۲ - تعدیل منفی انبارگردانی (Inventory Loss)', shortFa: 'کسری انبارگردانی', sapNameEn: 'Inv Loss', direction: 'OUT', reversalCode: '701' },
};

export function resolveSapMovementType(
  docType: InventoryDocType,
  options?: {
    explicitMovementType?: SapMovementType;
    totalQuantity?: number;
    reversalOfDocType?: InventoryDocType;
    reversalOfMovementType?: SapMovementType;
    qmTarget?: 'UNRESTRICTED' | 'QUALITY_INSPECTION' | 'BLOCKED';
  }
): SapMovementType {
  if (options?.explicitMovementType && SAP_MOVEMENT_CATALOG[options.explicitMovementType]) {
    return options.explicitMovementType;
  }
  if (options?.reversalOfMovementType) {
    return SAP_MOVEMENT_CATALOG[options.reversalOfMovementType]?.reversalCode || '102';
  }
  switch (docType) {
    case 'OPENING_BALANCE':
      return '561';
    case 'RECEIPT_RAW_MATERIAL':
    case 'RECEIPT_FINISHED_GOODS':
      return '101';
    case 'ISSUE_RAW_MATERIAL':
    case 'ISSUE_FINISHED_GOODS':
      return '261';
    case 'DELIVERY_CUSTOMER':
    case 'SHIPMENT_CUSTOMER':
      return '601';
    case 'TRANSFER':
      return '311';
    case 'STOCK_STATUS_TRANSFER':
      if (options?.qmTarget === 'BLOCKED') return '344';
      if (options?.qmTarget === 'QUALITY_INSPECTION') return '322';
      return '321';
    case 'ADJUSTMENT':
      return (options?.totalQuantity ?? 0) < 0 ? '702' : '701';
    case 'REVERSAL':
      if (options?.reversalOfDocType) {
        const orig = resolveSapMovementType(options.reversalOfDocType);
        return SAP_MOVEMENT_CATALOG[orig]?.reversalCode || '102';
      }
      return (options?.totalQuantity ?? 0) > 0 ? '262' : '102';
    default:
      return '101';
  }
}

export function getSapMovementReversal(code: SapMovementType): SapMovementType {
  return SAP_MOVEMENT_CATALOG[code]?.reversalCode || '102';
}

export interface WarehouseDefinition {
  id: string;
  code: string;
  name: string;
  type: 'RAW_MATERIALS' | 'WIP' | 'FINISHED_GOODS' | 'SCRAP' | 'TOOLING';
  warehouseType?: string;
  managerName?: string;
  locations: string[];
}

export const WAREHOUSES_LIST: WarehouseDefinition[] = [
  { id: 'WH-RAW', code: 'WH-RAW', name: 'انبار مرکزی رول و ورق مواد اولیه', type: 'RAW_MATERIALS', managerName: 'مرادی', locations: ['LOC-RAW-A1', 'LOC-RAW-A2', 'LOC-RAW-B1', 'LOC-RAW-B2'] },
  { id: 'WH-WIP-STAMP', code: 'WH-WIP-STAMP', name: 'انبار پای کار سالن پرس (WIP)', type: 'WIP', managerName: 'قنبری', locations: ['LOC-WIP-BLANK', 'LOC-WIP-DRAWN', 'LOC-WIP-TRIM'] },
  { id: 'WH-WIP-WELD', code: 'WH-WIP-WELD', name: 'انبار پای کار جوشکاری و مونتاژ', type: 'WIP', managerName: 'اکبری', locations: ['LOC-WELD-IN', 'LOC-WELD-OUT'] },
  { id: 'WH-FINISHED', code: 'WH-FINISHED', name: 'انبار محصولات نهایی آماده تحویل', type: 'FINISHED_GOODS', managerName: 'محمدی', locations: ['LOC-FIN-P1', 'LOC-FIN-P2', 'LOC-FIN-P3'] },
  { id: 'WH-SCRAP', code: 'WH-SCRAP', name: 'انبار ضایعات آهن و پرت ورق', type: 'SCRAP', managerName: 'سلیمانی', locations: ['LOC-SCRAP-YARD'] },
];

export interface InventoryDocumentLine {
  id: string;
  documentId: string;
  lineNumber: number;
  partId: string;
  partCode: string;
  partName: string;
  materialLotId?: string;
  lotNumber?: string;
  heatNumber?: string;
  ownership: StockOwnership;
  contractId?: string;
  contractNumber?: string;
  locationCode?: string;
  targetLocationCode?: string;
  quantity: number;
  unit: UnitOfMeasure;
  quantityKg: number;
  qualityStatus: StockQualityStatus;
  movementType?: SapMovementType;
  qmStatusTarget?: 'UNRESTRICTED' | 'QUALITY_INSPECTION' | 'BLOCKED';
  unitCost?: number;
  notes?: string;
}

export interface DocumentFlowLink {
  docCategory: 'CUSTOMER_ORDER' | 'PRODUCTION_PLAN' | 'MANUFACTURING_ORDER' | 'INVENTORY_DOC' | 'REVERSAL' | 'QC_TRANSFER';
  docNumber: string;
  title: string;
  movementType?: SapMovementType;
  status?: string;
  timestamp?: string;
}

export interface InventoryDocument {
  id: string;
  documentNumber: string;
  documentType: InventoryDocType;
  movementType?: SapMovementType;
  movementLabel?: string;
  qmStatusTarget?: 'UNRESTRICTED' | 'QUALITY_INSPECTION' | 'BLOCKED';
  documentDate: string;
  documentStatus: DocumentStatus;
  postingStatus: PostingStatus;
  warehouseId: string;
  warehouseName: string;
  targetWarehouseId?: string;
  targetWarehouseName?: string;
  ownership: StockOwnership;
  contractId?: string;
  contractNumber?: string;
  referenceType?: string;
  referenceNumber?: string;
  reversalOfDocumentId?: string;
  reversalOfDocNumber?: string;
  reversalOfDocumentNumber?: string;
  documentFlowLinks?: DocumentFlowLink[];
  adjustmentReason?: string;
  auditNote?: string;
  lines: InventoryDocumentLine[];
  totalQuantity: number;
  totalWeightKg: number;
  createdByUid: string;
  createdByName: string;
  postedByUid?: string;
  postedByName?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryReservation {
  id: string;
  reservationNumber: string;
  partId: string;
  partCode: string;
  partName: string;
  warehouseId: string;
  warehouseName: string;
  materialLotId?: string;
  lotNumber?: string;
  ownership: StockOwnership;
  reservedFor: string;
  quantity: number;
  quantityKg: number;
  unit: UnitOfMeasure;
  status: 'ACTIVE' | 'CONSUMED' | 'RELEASED' | 'EXPIRED' | 'CANCELLED';
  validUntil?: string;
  createdAt: string;
}

export interface DetailedStockBalance {
  id: string;
  partId: string;
  partCode: string;
  partName: string;
  category: PartCategory;
  materialGrade?: string;
  thicknessMm?: number;
  warehouseId: string;
  warehouseName: string;
  locationCode: string;
  materialLotId?: string;
  lotNumber?: string;
  heatNumber?: string;
  ownership: StockOwnership;
  contractId?: string;
  contractNumber?: string;
  unit: UnitOfMeasure;
  // Quantities
  physicalQty: number;
  unrestrictedQty: number;
  qualityInspectionQty: number;
  blockedQty: number;
  ownedQty: number;
  supplierOwnedQty: number;
  reservedQty: number;
  qualityBlockedQty: number;
  availableQty: number;
  // Kilograms
  physicalKg: number;
  unrestrictedKg: number;
  qualityInspectionKg: number;
  blockedKg: number;
  ownedKg: number;
  supplierOwnedKg: number;
  reservedKg: number;
  qualityBlockedKg: number;
  availableKg: number;
  lastTransactionAt: string;
}

export type StockBalance = DetailedStockBalance;

export interface SapcoContract {
  id: string;
  contractNumber: string;
  title: string;
  customerName?: string;
  contractType?: 'SAPCO_CONSIGNMENT' | 'CUSTOMER_SUPPLIED' | 'PRODUCT_DELIVERY' | 'HYBRID';
  ownership?: StockOwnership;
  materialGrade: string;
  allocatedWeightKg: number;
  openingBalanceKg: number;
  totalReceivedKg: number;
  totalConsumedKg: number;
  closingBalanceKg: number;
  associatedPartCodes: string[];
  status: 'ACTIVE' | 'FULFILLED' | 'EXPIRED' | 'SUSPENDED' | 'TERMINATED';
  startDate: string;
  endDate: string;
  notes?: string;
  commercialLines?: ContractCommercialLine[];
  coils?: {
    coilId: string;
    coilPackNumber?: string;
    allocatedWeightKg: number;
    thicknessMm?: number;
    widthMm?: number;
    materialGrade?: string;
  }[];
  revisions?: ContractRevisionEntry[];
}

export interface ContractRevisionEntry {
  id: string;
  revisionNumber: number;
  timestamp: string;
  actor: string;
  fieldLabelFa: string;
  oldQty: number;
  newQty: number;
  unit: string;
  oldStatus?: string;
  newStatus?: string;
  reasonFa: string;
}

export interface SapcoContractLedgerEntry {
  id: string;
  contractId: string;
  contractNumber: string;
  documentNumber: string;
  date: string;
  waybillNumber?: string;
  lotNumber?: string;
  heatNumber?: string;
  operationType: 'OPENING' | 'RECEIPT' | 'CONSUMPTION' | 'RETURN' | 'ADJUSTMENT';
  weightKgSigned: number;
  runningBalanceKg: number;
  notes?: string;
}

export interface InventoryDashboardMetrics {
  totalPhysicalKg: number;
  totalPhysicalPcs: number;
  totalAvailableKg: number;
  totalAvailablePcs: number;
  totalReservedKg: number;
  totalReservedPcs: number;
  totalQualityBlockedKg: number;
  totalQualityBlockedPcs: number;
  totalUnrestrictedKg?: number;
  totalQualityInspectionKg?: number;
  totalBlockedKg?: number;
  totalSapcoConsignmentKg: number;
  totalCompanyOwnedKg: number;
  activeLotsCount: number;
  draftDocumentsCount: number;
  postedDocumentsCount: number;
  activeContractsCount: number;
}

// =========================================================================
// PHYSICAL COILS & ENHANCED INVENTORY TRACEABILITY MODELS
// =========================================================================

export interface ContractCoilAllocation {
  id?: string;
  contractId: string;
  contractNumber: string;
  coilId: string;
  allocatedWeightKg: number;
  ownership: StockOwnership;
  sourceDocumentId?: string;
  notes?: string;
  createdAt?: string;
}

export interface PhysicalCoil {
  id: string;
  coilId: string;               // e.g. COIL-1403-0101
  coilPackNumber: string;       // e.g. CP-1001 (searchable and filterable)
  partId?: string;
  partCode?: string;
  partName?: string;
  materialId?: string;
  materialGrade: string;
  heatNumber?: string;
  thicknessMm: number;
  widthMm: number;
  originalWeightKg: number;
  remainingWeightKg: number;
  warehouseId: string;
  warehouseName: string;
  warehouseLocationCode?: string;
  ownership: StockOwnership;
  qualityStatus: StockQualityStatus;
  physicalStatus: PhysicalCoilStatus;
  parentCoilId?: string;
  supplierName?: string;
  receiptDate: string;
  allocations: ContractCoilAllocation[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CoilIssueReturnRecord {
  id: string;
  coilId: string;
  manufacturingOrderId?: string;
  documentNumber: string;
  issuedWeightKg: number;
  consumedWeightKg: number;
  returnedWeightKg: number;
  outstandingWeightKg: number;
  varianceWeightKg: number;
  scrappedKg?: number;
  status: 'ISSUED' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED' | 'CONSUMED';
  issuedAt: string;
  returnedAt?: string;
  notes?: string;
}

export interface ItemTrackingProfile {
  id: string;
  itemCategory: PartCategory;
  partId?: string;
  requiresCoilPack: boolean;
  requiresCoilId: boolean;
  requiresHeatNumber: boolean;
  requiresBatchLot: boolean;
  requiresExpirationDate: boolean;
  requiresActualWeight: boolean;
  trackOwnership: boolean;
  trackContract: boolean;
}

export interface ItemAttributeDefinition {
  id: string;
  key: string;
  displayName: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';
  isRequired: boolean;
  isSearchable: boolean;
  isReportable: boolean;
  applicableCategories: PartCategory[];
  validationRules?: string;
}

export interface ItemAttributeValue {
  id: string;
  partId: string;
  attributeKey: string;
  textValue?: string;
  numberValue?: number;
  dateValue?: string;
  booleanValue?: boolean;
}

export interface ContractCommercialLine {
  id: string;
  contractId: string;
  lineType: 'CUSTOMER_SUPPLIED_MATERIAL' | 'FINISHED_PRODUCT_DELIVERY' | 'SUPPLIER_PURCHASE';
  partId?: string;
  partCode: string;
  partName: string;
  contractQty: number;
  contractWeightKg: number;
  deliveredOrReceivedQty: number;
  deliveredOrReceivedKg: number;
  remainingQty: number;
  remainingKg: number;
  unit: UnitOfMeasure;
  notes?: string;
}

export interface CustomReportColumn {
  key: string;
  label: string;
  category: 'ITEM' | 'LOCATION' | 'TRACEABILITY' | 'QUANTITY' | 'CONTRACT';
}

export interface SavedReportConfig {
  id: string;
  name: string;
  reportType: 'COILS_SUMMARY' | 'COIL_PACK_INQUIRY' | 'CONTRACT_STOCK' | 'WAREHOUSE_STOCK' | 'OWNERSHIP_REPORT' | 'CUSTOM';
  selectedColumns: string[];
  groupBy: string[];
  filters: Record<string, any>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  createdAt?: string;
}

export interface ImportBatchSummary {
  id: string;
  batchNumber?: string;
  idempotencyKey?: string;
  batchType?: string;
  fileName?: string;
  templateType?: string;
  status: 'VALIDATING' | 'IMPORTED' | 'REJECTED' | 'PARTIALLY_IMPORTED' | 'COMPLETED' | 'PARTIAL';
  totalRows: number;
  validRows: number;
  errorRows: number;
  importedBy?: string;
  importedAt?: string;
  createdAt?: string;
  createdByName?: string;
  errors?: {
    rowNumber: number;
    fieldName?: string;
    errorMessage: string;
  }[];
}


