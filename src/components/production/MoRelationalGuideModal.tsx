import React, { useState } from 'react';
import {
  X,
  Grid,
  Disc,
  Layers,
  CheckCircle2,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Cpu,
  Play,
  ExternalLink,
  BookOpen,
  ShieldCheck,
  PackagePlus,
  Sparkles,
  FileCheck2,
  GitBranch,
  Link2,
} from 'lucide-react';
import { useErpRouter } from '../../context/RouterContext';
import { toPersianDigits } from '../../utils/formatters';

interface MoRelationalGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: number;
  onOpenCreateMo?: () => void;
}

interface GuideStep {
  id: number;
  shortTitle: string;
  title: string;
  subtitle: string;
  whyItMatters: string;
  checklist: string[];
  actionPrimary: {
    label: string;
    onClick: () => void;
  };
  actionSecondary?: {
    label: string;
    onClick: () => void;
  };
  renderDiagram: () => React.ReactNode;
}

export const MoRelationalGuideModal: React.FC<MoRelationalGuideModalProps> = ({
  isOpen,
  onClose,
  initialStep = 0,
  onOpenCreateMo,
}) => {
  const router = useErpRouter();
  const [activeStep, setActiveStep] = useState(initialStep);

  if (!isOpen) return null;

  const goAndClose = (params: Parameters<typeof router.navigate>[0]) => {
    router.navigate(params);
    onClose();
  };

  const steps: GuideStep[] = [
    {
      id: 1,
      shortTitle: '۱. مسیر ناوبری (کاتالوگ SAP)',
      title: 'دسترسی سریع به ماژول‌ها از «کاتالوگ ماژول‌های SAP HANA»',
      subtitle:
        'در قالب سازمانی SAP S/4HANA Fiori منوی ثابت کنار صفحه حذف شده و همه بخش‌ها از آیکون شبکه‌ای گوشه بالا سمت راست در دسترس هستند.',
      whyItMatters:
        'هر صفحه و زیرتب در سیستم دارای آدرس URL اختصاصی است؛ با دکمه «کپی لینک صفحه» در نوار ناوبری بالای هر صفحه می‌توانید لینک مستقیم همان بخش را ذخیره یا ارسال کنید.',
      checklist: [
        'روی دکمه شبکه‌ای (Grid) در گوشه بالا سمت راست نوار SAP کلیک کنید تا «کاتالوگ ماژول‌های SAP HANA» باز شود.',
        'برای ورود رول و صدور سرکلاف: کاشی «انبار و کیفیت (MM/QM)» یا میانبر «رول‌های ورق و کویل‌پک» را انتخاب کنید.',
        'برای تعریف، رهگیری یا حذف دستور ساخت (MO): کاشی «سفارشات تولید (PP)» ← تب «مدیریت دستورات ساخت (MO)» را باز کنید.',
        'برای صدور خودکار دستور ساخت از کسری قطعات: کاشی «برنامه‌ریزی و MRP» را انتخاب کنید.',
      ],
      actionPrimary: {
        label: 'رفتن به سفارشات تولید (PP)',
        onClick: () =>
          goAndClose({
            tab: 'production',
            productionViewMode: 'ERP_WORKBENCH',
            productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
          }),
      },
      actionSecondary: {
        label: 'رفتن به انبار و کیفیت (MM/QM)',
        onClick: () => goAndClose({ tab: 'inventory', inventorySubTab: 'COILS' }),
      },
      renderDiagram: () => (
        <div className="bg-[#f5f7fa] border border-[#d5dce4] rounded-md p-3.5 space-y-3 text-xs select-none">
          {/* Mock SAP Shell Bar */}
          <div className="bg-white border border-[#d9d9d9] rounded px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <div className="w-7 h-7 rounded bg-[#e5f3fa] border-2 border-[#007cc0] text-[#007cc0] flex items-center justify-center">
                  <Grid className="w-4 h-4" />
                </div>
                <span className="absolute -top-2 -right-2 px-1 bg-[#e9730c] text-white text-[9px] font-bold rounded">
                  اینجا
                </span>
              </div>
              <span className="px-2 py-0.5 bg-[#007cc0] text-white rounded font-mono text-[10px] font-bold">
                SAP | S/4HANA
              </span>
              <span className="text-[11px] font-semibold text-[#333333]">کاتالوگ ماژول‌ها (بالا سمت راست)</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f4f8fe] border border-[#b3ddf2] text-[#007cc0] text-[10px] font-semibold">
              <Link2 className="w-3 h-3" />
              <span>کپی لینک مستقیم هر صفحه</span>
            </div>
          </div>

          {/* Mock Catalog Grid */}
          <div className="bg-white border border-[#d9d9d9] rounded p-3 space-y-2">
            <div className="text-[11px] font-bold text-[#333333] border-b border-[#eeeeee] pb-1.5 flex items-center justify-between">
              <span>کاتالوگ ماژول‌های SAP HANA</span>
              <span className="text-[10px] text-[#007cc0] font-normal">۴ ماژول کلیدی چرخه تولید</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 rounded border-2 border-[#007cc0] bg-[#e5f3fa]/60 text-center space-y-1">
                <Disc className="w-4 h-4 text-[#007cc0] mx-auto" />
                <div className="text-[11px] font-bold text-[#004e7a]">۱. انبار و کیفیت</div>
                <div className="text-[10px] text-[#555555]">ورود رول و سرکلاف</div>
              </div>
              <div className="p-2 rounded border-2 border-[#107e3e] bg-[#eef8f2] text-center space-y-1">
                <Cpu className="w-4 h-4 text-[#107e3e] mx-auto" />
                <div className="text-[11px] font-bold text-[#107e3e]">۲. برنامه‌ریزی و MRP</div>
                <div className="text-[10px] text-[#555555]">صدور خودکار MO</div>
              </div>
              <div className="p-2 rounded border-2 border-[#e9730c] bg-[#fff4e5] text-center space-y-1">
                <Layers className="w-4 h-4 text-[#e9730c] mx-auto" />
                <div className="text-[11px] font-bold text-[#b45309]">۳. سفارشات تولید (PP)</div>
                <div className="text-[10px] text-[#555555]">میز کار، MO و حذف</div>
              </div>
              <div className="p-2 rounded border border-[#d9d9d9] bg-[#fafafa] text-center space-y-1">
                <GitBranch className="w-4 h-4 text-[#007cc0] mx-auto" />
                <div className="text-[11px] font-bold text-[#333333]">۴. جریان ساخت (WIP)</div>
                <div className="text-[10px] text-[#555555]">رهگیری و حواله مراحل</div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 2,
      shortTitle: '۲. ثبت رول و صدور سرکلاف',
      title: 'ثبت ورود رول ورق (Heat Number) و صدور سرکلاف به خط تولید',
      subtitle:
        'سرکلاف تولید از بخش رول‌های ورق و کویل‌پک در انبار (MM/QM) یا مستقیماً از دکمه «بارگذاری سرکلاف» روی هر دستور ساخت صادر می‌شود.',
      whyItMatters:
        'ثبت سرکلاف و شماره ذوب باعث می‌شود هنگام گزارش تولید در OP10_SLIT، موجودی ورق به صورت دقیق و قابل رهگیری از رول فعال کسر شود (Backflush).',
      checklist: [
        'از کاتالوگ SAP وارد «انبار و کیفیت (MM/QM)» و سپس تب «رول‌های ورق و کویل‌پک» شوید.',
        'روی «ثبت ورود کلاف جدید» کلیک کرده، کد رول، شماره ذوب (Heat Number) و وزن (کیلوگرم) را ثبت کنید.',
        'پس از تأیید QC و آزادسازی رول، روی ردیف رول دکمه «ثبت مصرف / حواله به تولید» را بزنید تا سرکلاف به پای خط برش (OP10) ارسال شود.',
        'روش سریع جایگزین: در صفحه «مدیریت دستورات ساخت (MO)» روی دکمه «بارگذاری سرکلاف / مواد (OP10)» در ردیف دستور ساخت کلیک کنید.',
      ],
      actionPrimary: {
        label: 'باز کردن رول‌های ورق و کویل‌پک',
        onClick: () => goAndClose({ tab: 'inventory', inventorySubTab: 'COILS' }),
      },
      actionSecondary: {
        label: 'مدیریت دستورات ساخت (MO)',
        onClick: () =>
          goAndClose({
            tab: 'production',
            productionViewMode: 'ERP_WORKBENCH',
            productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
          }),
      },
      renderDiagram: () => (
        <div className="bg-[#f5f7fa] border border-[#d5dce4] rounded-md p-3.5 space-y-2.5 text-xs select-none">
          <div className="flex items-center justify-between text-[11px] text-[#555555]">
            <span className="font-bold text-[#1d2d3e]">مسیر: انبار و کیفیت (MM/QM) ← رول‌های ورق و کویل‌پک</span>
            <span className="font-mono text-[10px] text-[#007cc0]">#/inventory/coils</span>
          </div>
          <div className="bg-white border border-[#d9d9d9] rounded overflow-hidden">
            <div className="px-3 py-2 bg-[#fafafa] border-b border-[#e5e5e5] flex items-center justify-between">
              <span className="font-bold text-[#333333]">رول ورق DC01A · ضخامت ۲.۰ میلی‌متر</span>
              <span className="px-2 py-0.5 rounded bg-[#eef8f2] border border-[#b7dfc5] text-[#107e3e] text-[10px] font-bold">
                آزادشده برای برش (OK)
              </span>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
              <div className="text-[11px] space-y-0.5">
                <div className="text-[#666666]">شماره ذوب (Heat No):</div>
                <div className="font-mono font-bold text-[#333333]">HT-2025-DC01-884</div>
              </div>
              <div className="text-[11px] space-y-0.5">
                <div className="text-[#666666]">وزن موجود رول:</div>
                <div className="font-mono font-bold text-[#007cc0] tabular-nums">۴,۸۵۰ کیلوگرم</div>
              </div>
              <div className="flex justify-end">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#007cc0] text-white font-bold text-[11px] ring-2 ring-[#007cc0]/30">
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>صدور سرکلاف به OP10</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 3,
      shortTitle: '۳. تعریف MO معتبر در دیتابیس',
      title: 'ثبت دستور ساخت (MO) معتبر در میز کار تولید برای جلوگیری از خطای «متناظر پیدا نشد»',
      subtitle:
        'خطای «برای این کد قطعه دستور ساخت relational متناظر پیدا نشد» زمانی رخ می‌دهد که دستور ساخت در دیتابیس ثبت نشده یا مسیر عملیات (Routing) برای آن تولید نشده باشد.',
      whyItMatters:
        'با ثبت دستور ساخت از فرم استاندارد «+ صدور دستور ساخت جدید (MO)» یا از طریق «پیشنهاد MRP»، رکورد MO به همراه تمام ایستگاه‌های OP10 تا مرحله نهایی به‌صورت یکجا در پایگاه داده ایجاد می‌شود.',
      checklist: [
        'وارد «سفارشات تولید (PP)» ← تب «مدیریت دستورات ساخت (MO) و سرکلاف» شوید (یا از ویجت پایش سریع در میز کار).',
        'روی دکمه آبی «+ صدور دستور ساخت جدید (MO)» کلیک کنید.',
        'کد قطعه (مثلاً 700014 صفحه براکت اصلی، 700026 قطعه مکمل یا 611408 مجموعه نهایی) و تیراژ هدف را انتخاب کنید.',
        'پس از زدن دکمه ثبت، دستور ساخت جدید با وضعیت RELEASED و ردیف عملیات OP10_SLIT تا مرحله نهایی در دیتابیس ذخیره می‌شود.',
      ],
      actionPrimary: {
        label: onOpenCreateMo ? 'باز کردن فرم صدور فوری MO جدید' : 'رفتن به مدیریت دستورات ساخت (MO)',
        onClick: () => {
          if (onOpenCreateMo) {
            onClose();
            onOpenCreateMo();
          } else {
            goAndClose({
              tab: 'production',
              productionViewMode: 'ERP_WORKBENCH',
              productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
            });
          }
        },
      },
      actionSecondary: {
        label: 'صدور خودکار MO از بخش MRP',
        onClick: () => goAndClose({ tab: 'planning', planningSubTab: 'recommendations' }),
      },
      renderDiagram: () => (
        <div className="bg-[#f5f7fa] border border-[#d5dce4] rounded-md p-3.5 space-y-2.5 text-xs select-none">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Path A: Direct Workbench */}
            <div className="bg-white border-2 border-[#007cc0] rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#004e7a]">روش الف: مستقیم در میز کار تولید</span>
                <span className="text-[10px] font-mono text-[#007cc0]">#/production/orders</span>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <div className="p-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded flex items-center justify-between">
                  <span className="text-[#666666]">قطعه:</span>
                  <span className="font-mono font-bold text-[#333333]">700014 · صفحه براکت اصلی</span>
                </div>
                <div className="p-1.5 bg-[#f8fafc] border border-[#e2e8f0] rounded flex items-center justify-between">
                  <span className="text-[#666666]">تیراژ هدف:</span>
                  <span className="font-mono font-bold text-[#107e3e]">۱,۵۰۰ عدد (PCS)</span>
                </div>
              </div>
              <div className="w-full py-1.5 rounded bg-[#007cc0] text-white text-center font-bold text-[11px]">
                + صدور دستور ساخت جدید (MO) و ایجاد OP10..OP50
              </div>
            </div>

            {/* Path B: MRP */}
            <div className="bg-white border border-[#b7dfc5] rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#107e3e]">روش ب: خودکار از پیشنهاد MRP</span>
                <span className="text-[10px] font-mono text-[#107e3e]">#/planning/recommendations</span>
              </div>
              <div className="p-2 bg-[#eef8f2] border border-[#b7dfc5] rounded text-[11px] text-[#1d2d3e] leading-5">
                موتور MRP کسری انبار نسبت به سفارش مشتری را محاسبه کرده و با یک کلیک، دستور ساخت (MO) مادر و زیرقطعات را صادر می‌کند.
              </div>
              <div className="w-full py-1.5 rounded bg-[#107e3e] text-white text-center font-bold text-[11px]">
                تأیید پیشنهاد و صدور فوری MO در دیتابیس
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 4,
      shortTitle: '۴. ثبت خروجی OP10 بدون خطا',
      title: 'ثبت خروجی تولید و کنترل کیفیت در OP10_SLIT (اتصال هوشمند Relational MO)',
      subtitle:
        'هنگام باز کردن فرم ثبت خروجی و QC برای ایستگاه OP10_SLIT، سیستم دستور ساخت متناظر، شیفت و کاربر را به‌صورت خودکار متصل می‌کند.',
      whyItMatters:
        'حتی اگر قطعات در «صف ورودی ایستگاه» (Waiting Input) قرار داشته باشند، سیستم به‌صورت خودکار آن‌ها را به پای دستگاه کشیده، آمار سالم و ضایعات را ثبت کرده و مصرف ورق را کسر می‌کند.',
      checklist: [
        'در جدول دستورات ساخت (MO) یا ویجت پایش سریع، روی ردیف دستور ساخت معتبر کلیک کرده و دکمه «ثبت خروجی (OP10)» را بزنید.',
        'بررسی کنید که فیلد «دستور ساخت متناظر (MO)» به‌صورت خودکار پر شده است (اگر خالی بود، MO معتبر همان قطعه را از لیست انتخاب کنید).',
        'تعداد تولید سالم (Good Qty) و در صورت وجود، تعداد ضایعات (Scrap) را وارد کرده و دکمه ثبت را بزنید.',
        'بلافاصله نوار پیشرفت (Progress Bar) دستور ساخت به‌روز شده و قطعات آماده انتقال به OP20 می‌شوند.',
      ],
      actionPrimary: {
        label: 'رفتن به ثبت خروجی دستورات ساخت',
        onClick: () =>
          goAndClose({
            tab: 'production',
            productionViewMode: 'ERP_WORKBENCH',
            productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
          }),
      },
      actionSecondary: {
        label: 'مشاهده کارتابل جریان ساخت (WIP)',
        onClick: () => goAndClose({ tab: 'wip', wipSubTab: 'ORDERS' }),
      },
      renderDiagram: () => (
        <div className="bg-[#f5f7fa] border border-[#d5dce4] rounded-md p-3.5 space-y-2.5 text-xs select-none">
          <div className="bg-white border border-[#d9d9d9] rounded overflow-hidden">
            <div className="px-3 py-2 bg-[#f7f9fb] border-b border-[#e5e5e5] flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[#333333]">
                <FileCheck2 className="w-4 h-4 text-[#107e3e]" />
                <span>فرم ثبت خروجی تولید و کنترل کیفیت (OP10_SLIT)</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#eef8f2] text-[#107e3e] border border-[#b7dfc5] text-[10px] font-bold">
                متصل به Relational MO
              </span>
            </div>
            <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div className="p-2 rounded bg-[#e5f3fa]/70 border border-[#007cc0]">
                <div className="text-[10px] text-[#004e7a] font-bold">۱. دستور ساخت متناظر (خودکار)</div>
                <div className="font-mono font-bold text-[#333333] mt-0.5">MO-ECU-MAIN-01 (700014)</div>
                <div className="text-[10px] text-[#107e3e] mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>خطای متناظر پیدا نشد برطرف است</span>
                </div>
              </div>
              <div className="p-2 rounded bg-[#fafafa] border border-[#d9d9d9]">
                <div className="text-[10px] text-[#666666] font-bold">۲. خروجی سالم و ضایعات</div>
                <div className="font-mono font-bold text-[#107e3e] mt-0.5 tabular-nums">سالم: ۲۰۰ · ضایعات: ۰</div>
                <div className="text-[10px] text-[#555555] mt-0.5">کشش خودکار از صف ورودی</div>
              </div>
              <div className="p-2 rounded bg-[#eef8f2] border border-[#b7dfc5] flex flex-col justify-between">
                <div className="text-[10px] text-[#107e3e] font-bold">۳. نتیجه ثبت</div>
                <div className="text-[10px] text-[#333333] mt-0.5">
                  کسر خودکار ورق از سرکلاف + افزایش درصد پیشرفت MO
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 5,
      shortTitle: '۵. پایش پیشرفت و حذف امن MO',
      title: 'مشاهده نوار پیشرفت (Progress Bar)، رهگیری WIP و حذف اختصاصی دستورات ساخت',
      subtitle:
        'در ویجت «پایش سریع دستورات ساخت (MO)» و تب «مدیریت دستورات ساخت» می‌توانید تمام دستورات را بر اساس وضعیت فیلتر، درصد پیشرفت را رصد و دستورات غیرضروری را امن حذف کنید.',
      whyItMatters:
        'دکمه حذف اختصاصی پیش از حذف، «پیش‌نمایش بازگشت موجودی (Rollback Preview)» را نمایش می‌دهد و تمام مواد مصرفی و زیرمجموعه‌ها را بدون برهم‌خوردن تراز انبار به موجودی برمی‌گرداند.',
      checklist: [
        'در ماژول «سفارشات تولید (PP)»، ویجت پایش سریع دستورات ساخت (MO) همیشه در دسترس شماست.',
        'ستون «وضعیت» و «نوار پیشرفت (Progress Bar)» درصد تحقق هر دستور کار را به صورت زنده نمایش می‌دهد.',
        'برای حذف هر دستور ساخت غیرضروری، روی دکمه قرمز «حذف» در همان ردیف کلیک کنید.',
        'دلیل حذف را تأیید کنید تا دستور کار حذف و تمامی حواله‌های مصرف ورق/قطعات معکوس و به انبار بازگردانده شود.',
      ],
      actionPrimary: {
        label: 'مشاهده جدول و ویجت دستورات ساخت',
        onClick: () =>
          goAndClose({
            tab: 'production',
            productionViewMode: 'ERP_WORKBENCH',
            productionModuleTab: 'MANUFACTURING_ORDERS_LIST',
          }),
      },
      actionSecondary: {
        label: 'مشاهده کارت دستورات در WIP',
        onClick: () => goAndClose({ tab: 'wip', wipSubTab: 'ORDERS' }),
      },
      renderDiagram: () => (
        <div className="bg-[#f5f7fa] border border-[#d5dce4] rounded-md p-3.5 text-xs select-none">
          <div className="bg-white border border-[#d9d9d9] rounded overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-[#f7f7f7] border-b border-[#d9d9d9] text-[10px] font-bold text-[#555555]">
              <div className="col-span-3">شماره MO / قطعه</div>
              <div className="col-span-2">وضعیت</div>
              <div className="col-span-4">نوار پیشرفت (Progress Bar)</div>
              <div className="col-span-3 text-left">عملیات و حذف اختصاصی</div>
            </div>
            <div className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-[11px]">
              <div className="col-span-3">
                <div className="font-mono font-bold text-[#007cc0]">MO-ECU-MAIN-01</div>
                <div className="text-[10px] text-[#666666] truncate">700014 · صفحه براکت</div>
              </div>
              <div className="col-span-2">
                <span className="px-2 py-0.5 rounded bg-[#fff4e5] border border-[#f5cba7] text-[#b45309] text-[10px] font-bold">
                  در حال ساخت
                </span>
              </div>
              <div className="col-span-4 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                  <span className="text-[#555555]">۱,۲۰۰ / ۱,۵۰۰ PCS</span>
                  <span className="font-bold text-[#007cc0]">۸۰٪</span>
                </div>
                <div className="w-full h-2 bg-[#e8e8e8] rounded-full overflow-hidden">
                  <div className="h-full bg-[#007cc0] w-4/5" />
                </div>
              </div>
              <div className="col-span-3 flex items-center justify-end gap-1.5">
                <span className="px-2 py-1 rounded bg-[#e5f3fa] border border-[#b3ddf2] text-[#007cc0] text-[10px] font-bold">
                  ثبت خروجی
                </span>
                <span className="px-2 py-1 rounded bg-[#fde8e8] border border-[#f5b8b8] text-[#bb0000] text-[10px] font-bold inline-flex items-center gap-1 ring-2 ring-[#bb0000]/20">
                  <Trash2 className="w-3 h-3" />
                  <span>حذف</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const current = steps[activeStep] || steps[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-3 sm:p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-white border border-[#d9d9d9] rounded-md shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-4 py-3 bg-[#f7f9fb] border-b border-[#d9d9d9] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-[#007cc0] text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#1d2d3e] truncate">
                راهنمای تصویری و گام‌به‌گام ثبت دستور ساخت (MO)، صدور سرکلاف و رفع خطای OP10
              </h2>
              <p className="text-[11px] text-[#556b82] truncate">
                مستند تعاملی مخصوص میز کار تولید (Production Workbench) و کاتالوگ SAP HANA · گام{' '}
                {toPersianDigits(activeStep + 1)} از {toPersianDigits(steps.length)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#e8edf2] text-[#555555] cursor-pointer shrink-0"
            title="بستن راهنما"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Step Selector Strip */}
        <div className="px-4 py-2 bg-white border-b border-[#e5e5e5] flex items-center gap-1.5 overflow-x-auto">
          {steps.map((step, idx) => {
            const isActive = idx === activeStep;
            const isDone = idx < activeStep;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`px-2.5 py-1.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#007cc0] text-white border-[#0066a1]'
                    : isDone
                    ? 'bg-[#eef8f2] text-[#107e3e] border-[#b7dfc5] hover:bg-[#e0f3e8]'
                    : 'bg-[#f8f9fa] text-[#333333] border-[#d9d9d9] hover:bg-[#eef4fa]'
                }`}
              >
                {isDone && <CheckCircle2 className="w-3 h-3" />}
                <span>{step.shortTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-[#1d2d3e]">{current.title}</h3>
            <p className="text-xs text-[#555555] leading-relaxed">{current.subtitle}</p>
          </div>

          {/* Visual UI Illustration Frame */}
          <div>{current.renderDiagram()}</div>

          {/* Step Checklist & Explanation */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 bg-white border border-[#d9d9d9] rounded-md p-3.5 space-y-2">
              <div className="text-xs font-bold text-[#1d2d3e] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#007cc0]" />
                <span>مراحل اجرایی در سیستم:</span>
              </div>
              <ol className="space-y-2 text-xs text-[#333333] leading-5">
                {current.checklist.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded bg-[#e5f3fa] text-[#007cc0] font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                      {toPersianDigits(idx + 1)}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-[#f7f9fb] border border-[#d5dce4] rounded-md p-3.5 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[#107e3e] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>چرا این گام مهم است؟</span>
                </div>
                <p className="text-[11px] text-[#444444] leading-5">{current.whyItMatters}</p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[#e2e8f0]">
                <button
                  type="button"
                  onClick={current.actionPrimary.onClick}
                  className="w-full sap-btn-emphasized px-3 py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{current.actionPrimary.label}</span>
                </button>
                {current.actionSecondary && (
                  <button
                    type="button"
                    onClick={current.actionSecondary.onClick}
                    className="w-full sap-btn-standard px-3 py-1.5 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{current.actionSecondary.label}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Step Controls */}
        <div className="px-4 py-2.5 bg-[#f7f7f7] border-t border-[#d9d9d9] flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
            disabled={activeStep === 0}
            className="sap-btn-standard px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>گام قبلی</span>
          </button>

          <div className="flex items-center gap-1.5">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === activeStep ? 'w-6 bg-[#007cc0]' : 'w-2 bg-[#cccccc] hover:bg-[#999999]'
                }`}
                aria-label={`گام ${idx + 1}`}
              />
            ))}
          </div>

          {activeStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setActiveStep(prev => Math.min(steps.length - 1, prev + 1))}
              className="sap-btn-emphasized px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
            >
              <span>گام بعدی</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="sap-btn-emphasized px-4 py-1.5 flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>پایان راهنما</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
