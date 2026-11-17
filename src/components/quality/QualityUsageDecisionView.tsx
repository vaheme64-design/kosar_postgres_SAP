import React, { useState } from 'react';
import {
  ShieldCheck,
  Check,
  X,
  Layers,
  TrendingUp,
  FileText,
  Lock,
  Unlock,
} from 'lucide-react';
import { Part, StageInventorySummary } from '../../types/inventory';
import { formatNumber, toPersianDigits } from '../../utils/formatters';
import { useEnterpriseUx } from '../../context/EnterpriseUxContext';

interface QualityUsageDecisionViewProps {
  parts: Part[];
  stageBalances?: StageInventorySummary[];
  onGlobalRefresh?: () => Promise<void>;
}

export const QualityUsageDecisionView: React.FC<QualityUsageDecisionViewProps> = ({
  parts,
  stageBalances = [],
  onGlobalRefresh,
}) => {
  const { recordAudit } = useEnterpriseUx();
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [cmmPassed, setCmmPassed] = useState(true);
  const [visualPassed, setVisualPassed] = useState(true);
  const [burrPassed, setBurrPassed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [activeQmTab, setActiveQmTab] = useState<'UD_WORKBENCH' | 'ROUTING_TRACKER' | 'OEE_MONITOR'>('UD_WORKBENCH');

  const quarantineItems = parts.map(p => {
    const matchingBalance = stageBalances.find(sb => sb.partId === p.id || sb.partCode === p.code) as any;
    const qiQty = matchingBalance?.qualityInspectionQty || matchingBalance?.qualityInspectionKg || (p.minStock ? Math.round(p.minStock * 0.2) : 15);
    return {
      ...p,
      qiQty,
      lotNumber: `LOT-QI-${p.code}-${Date.now().toString().slice(-4)}`,
      inspectionStatus: qiQty > 0 ? 'QUARANTINE_QI' : 'RELEASED',
    };
  }).filter(p => p.qiQty > 0);

  const selectedPart = quarantineItems.find(p => p.id === selectedPartId) || quarantineItems[0];

  const handleUsageDecision = async (decision: 'RELEASE_AVAILABLE' | 'BLOCK_SCRAP') => {
    if (!selectedPart) return;
    setLoading(true);
    setToastMessage(null);
    try {
      const movementCode = decision === 'RELEASE_AVAILABLE' ? '321' : '322';
      const payload = {
        documentType: 'COUNT_ADJUSTMENT',
        referenceType: 'PHYSICAL_COUNT',
        referenceNumber: `QM-UD-${Date.now()}`,
        notes: `تصمیم کیفی (Usage Decision) - ${decision === 'RELEASE_AVAILABLE' ? 'ترخیص به آزاد (مفاد 321)' : 'انتقال به مسدود/ضایعات (مفاد 322)'}. CMM: ${cmmPassed ? 'قبول' : 'رد'}, چشمی: ${visualPassed ? 'قبول' : 'رد'}. توضیحات: ${inspectionNotes}`,
        lines: [
          {
            partId: selectedPart.id,
            partCode: selectedPart.code,
            quantity: selectedPart.qiQty,
            unitId: selectedPart.unit === 'KG' ? 'UNIT-KG' : 'UNIT-PCS',
            qualityStatus: decision === 'RELEASE_AVAILABLE' ? 'AVAILABLE' : 'BLOCKED',
          },
        ],
      };

      const res = await fetch('/api/inventory/validate-and-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در ثبت تصمیم کیفی در سرور');
      }

      recordAudit({
        moduleName: 'کنترل کیفیت (SAP QM - UD)',
        actionType: 'UPDATE',
        entityId: selectedPart.id,
        entityCode: selectedPart.code,
        title: `صدور تصمیم کیفی (UD) برای قطعه ${selectedPart.code}`,
        details: `قطعه «${selectedPart.name}» به تعداد ${selectedPart.qiQty} عدد با سند حرکت ${movementCode} تعیین تکلیف شد.`,
      });

      setToastMessage(
        decision === 'RELEASE_AVAILABLE'
          ? `✓ قطعه «${selectedPart.name}» با موفقیت ترخیص و به موجودی آزاد منتقل شد (کد حرکت ۳۲۱).`
          : `✓ قطعه «${selectedPart.name}» به قرنطینه مسدود/ضایعات ارجاع شد (کد حرکت ۳۲۲).`
      );

      if (onGlobalRefresh) await onGlobalRefresh();
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'خطای ارتباط با سرور کنترل کیفیت');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Bar & QM Sub-Navigation */}
      <div className="sap-card p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#007cc0]" />
            <h2 className="text-base font-bold text-[#333333]">
              ماژول کنترل کیفیت و تصمیم‌گیری (SAP QM - Usage Decision)
            </h2>
          </div>
          <p className="text-xs text-[#666666] mt-1">
            مدیریت قرنطینه کیفی (QI)، چک‌لیست‌های ابعادی CMM، سند حرکت ترخیص ۳۲۱ و مانیتورینگ مسیر تولید (Routing & Work Centers)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveQmTab('UD_WORKBENCH')}
            className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition ${
              activeQmTab === 'UD_WORKBENCH'
                ? 'bg-[#007cc0] text-white'
                : 'bg-[#f5f5f5] text-[#333333] hover:bg-[#e5f3fa]'
            }`}
          >
            ۱. تصمیم‌گیری کیفی (QM-UD)
          </button>
          <button
            type="button"
            onClick={() => setActiveQmTab('ROUTING_TRACKER')}
            className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition ${
              activeQmTab === 'ROUTING_TRACKER'
                ? 'bg-[#007cc0] text-white'
                : 'bg-[#f5f5f5] text-[#333333] hover:bg-[#e5f3fa]'
            }`}
          >
            ۲. ردیابی ایستگاه‌های کاری (Routing & Work Centers)
          </button>
          <button
            type="button"
            onClick={() => setActiveQmTab('OEE_MONITOR')}
            className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer transition ${
              activeQmTab === 'OEE_MONITOR'
                ? 'bg-[#007cc0] text-white'
                : 'bg-[#f5f5f5] text-[#333333] hover:bg-[#e5f3fa]'
            }`}
          >
            ۳. مانیتورینگ OEE خطوط پرس
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 rounded bg-[#ebf5ec] border border-[#b7dfbf] text-[#107e3e] flex items-center justify-between text-xs">
          <span className="font-medium">{toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* Tab 1: Usage Decision (UD) Master-Detail Layout */}
      {activeQmTab === 'UD_WORKBENCH' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Master List (Right 1/3) */}
          <div className="lg:col-span-4 sap-card p-3 space-y-2 max-h-[72vh] overflow-y-auto">
            <div className="text-xs font-bold text-[#333333] border-b border-[#e8e8e8] pb-2 flex items-center justify-between">
              <span>قطعات در قرنطینه کیفی (QI: {toPersianDigits(quarantineItems.length)})</span>
              <span className="text-[10px] text-[#e9730c] font-semibold bg-[#fff4e5] px-1.5 py-0.5 rounded">نیازمند بازرسی UD</span>
            </div>

            {quarantineItems.length === 0 ? (
              <div className="text-center py-12 text-xs text-[#666666]">
                هیچ قطعه‌ای در قرنطینه کیفی (QI) وجود ندارد. تمام اقلام ترخیص شده‌اند.
              </div>
            ) : (
              quarantineItems.map(item => {
                const isSelected = selectedPartId === item.id || (!selectedPartId && quarantineItems[0]?.id === item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPartId(item.id)}
                    className={`p-3 rounded border cursor-pointer transition ${
                      isSelected
                        ? 'bg-[#e5f3fa] border-[#007cc0] shadow-sm'
                        : 'bg-[#ffffff] border-[#d9d9d9] hover:bg-[#f5f5f5]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-[#333333]">
                      <span>{item.code}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7]">
                        {toPersianDigits(item.qiQty)} {item.unit}
                      </span>
                    </div>
                    <div className="text-xs text-[#333333] font-medium mt-1 truncate">{item.name}</div>
                    <div className="text-[11px] text-[#666666] mt-1 flex items-center justify-between font-mono">
                      <span>{item.lotNumber}</span>
                      <span>{item.carModel || 'بدنه خودرو'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Detail Panel & Inspection Checklist (Left 2/3) */}
          <div className="lg:col-span-8 sap-card p-4 space-y-4">
            {!selectedPart ? (
              <div className="text-center py-20 text-xs text-[#666666]">
                لطفاً یک قطعه را از لیست قرنطینه کیفی در سمت راست انتخاب کنید.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#333333] font-mono">{selectedPart.code}</h3>
                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#fff4e5] text-[#e9730c] border border-[#f5cba7]">
                        قرنطینه بازرسی (QI)
                      </span>
                    </div>
                    <p className="text-xs text-[#666666] mt-1 font-medium">{selectedPart.name}</p>
                  </div>
                  <div className="text-left font-mono">
                    <div className="text-xs text-[#666666]">موجودی قرنطینه:</div>
                    <div className="text-sm font-bold text-[#333333]">{formatNumber(selectedPart.qiQty)} {selectedPart.unit}</div>
                  </div>
                </div>

                {/* Quality Checklist */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-[#333333] flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#007cc0]" />
                    <span>چک‌لیست ترخیص کیفی و اندازه‌برداری CMM:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div
                      onClick={() => setCmmPassed(!cmmPassed)}
                      className={`p-3 rounded border cursor-pointer flex items-center justify-between transition ${
                        cmmPassed ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]' : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                      }`}
                    >
                      <span className="text-xs font-semibold">تست ابعادی CMM / فیکسچر</span>
                      {cmmPassed ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </div>

                    <div
                      onClick={() => setVisualPassed(!visualPassed)}
                      className={`p-3 rounded border cursor-pointer flex items-center justify-between transition ${
                        visualPassed ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]' : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                      }`}
                    >
                      <span className="text-xs font-semibold">بازرسی چشمی و خط و خش سطح</span>
                      {visualPassed ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </div>

                    <div
                      onClick={() => setBurrPassed(!burrPassed)}
                      className={`p-3 rounded border cursor-pointer flex items-center justify-between transition ${
                        burrPassed ? 'bg-[#ebf5ec] border-[#b7dfbf] text-[#107e3e]' : 'bg-[#ffecec] border-[#f5b7b1] text-[#bb0000]'
                      }`}
                    >
                      <span className="text-xs font-semibold">کنترل پلیسه لبه و ضخامت</span>
                      {burrPassed ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[#333333]">یادداشت‌ها و نظریه بازرس کنترل کیفیت (Inspection Notes):</label>
                    <textarea
                      value={inspectionNotes}
                      onChange={e => setInspectionNotes(e.target.value)}
                      rows={2}
                      placeholder="توضیحات بازرس آزمایشگاه متالورژی و ابعادی..."
                      className="w-full bg-[#ffffff] border border-[#bfbfbf] rounded p-2 text-xs text-[#333333] focus:outline-none focus:border-[#007cc0]"
                    />
                  </div>
                </div>

                {/* Usage Decision Action Buttons (Movement 321 vs 322) */}
                <div className="flex items-center justify-between pt-4 border-t border-[#e8e8e8]">
                  <div className="text-xs text-[#666666]">
                    صدور سند UD به صورت اتوماتیک سند حرکت انبار (MM-IM) را صادر می‌کند.
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleUsageDecision('BLOCK_SCRAP')}
                      className="px-3.5 py-1.5 text-xs font-semibold text-[#bb0000] bg-[#ffecec] hover:bg-[#f5b7b1] border border-[#f5b7b1] rounded cursor-pointer flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>رد و انتقال به مسدود/ضایعات (کد ۳۲۲)</span>
                    </button>

                    <button
                      type="button"
                      disabled={loading || !cmmPassed || !visualPassed}
                      className="sap-btn-emphasized px-4 py-1.5 text-xs font-semibold cursor-pointer flex items-center gap-1.5"
                      onClick={() => handleUsageDecision('RELEASE_AVAILABLE')}
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>تایید و ترخیص به موجودی آزاد (کد ۳۲۱)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Routing & Work Centers Tracking (ردیابی ایستگاه‌های کاری و جریان تولید) */}
      {activeQmTab === 'ROUTING_TRACKER' && (
        <div className="sap-card p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[#e8e8e8] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#007cc0]" />
                <span>ردیابی جریان قطعات فلزی در ایستگاه‌های کاری (Work Centers & Routing Flow)</span>
              </h3>
              <p className="text-xs text-[#666666] mt-0.5">
                توالی ایستگاه‌ها از پرس‌های سنگین، جوش نقطه‌ای و CO2 تا خط رنگ کاتافورز (ED) و بسته بندی نهایی
              </p>
            </div>
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-[#e5f3fa] text-[#007cc0] border border-[#b3ddf2]">
              ۵۲ قطعه فعال در خطوط تولید
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { title: '۱. ایستگاه پرس‌کاری (Press Line)', count: 18, desc: 'کشش عمیق، بلنک و فرم‌دهی ورق‌های ST14 / DC04', color: 'border-[#007cc0] bg-[#e5f3fa]/40' },
              { title: '۲. سلول جوش (Spot & CO2 Weld)', count: 14, desc: 'پرس‌جوش مقاومتی نقطه‌ای و جوش رباتیک', color: 'border-[#e9730c] bg-[#fff4e5]/40' },
              { title: '۳. خط رنگ کاتافورز (Paint & ED)', count: 12, desc: 'شستشوی فسفاته و پوشش ضدزنگ الکتروفورتیک', color: 'border-[#107e3e] bg-[#ebf5ec]/40' },
              { title: '۴. کنترل کیفیت و بسته‌بندی (QC Pack)', count: 8, desc: 'تست ابعادی CMM، فیکسچر کنترلی و پالت فلزی ساپکو', color: 'border-[#7d3c98] bg-[#f4ecf7]/40' },
            ].map((station, idx) => (
              <div key={idx} className={`p-3.5 rounded border ${station.color} space-y-2`}>
                <div className="font-bold text-[#333333] text-xs">{station.title}</div>
                <div className="text-[11px] text-[#666666]">{station.desc}</div>
                <div className="flex items-center justify-between pt-2 border-t border-[#d9d9d9] text-xs font-mono font-bold">
                  <span>قطعات فعال:</span>
                  <span className="text-[#007cc0]">{toPersianDigits(station.count)} نوع قطعه</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 rounded bg-[#f5f5f5] border border-[#d9d9d9] text-xs text-[#333333] flex items-center justify-between">
            <span className="font-medium">دستور کار جاری در خط: انتقال میان‌ایستگاهی خودکار از پرس به جوش CO2 با موفقیت فعال است.</span>
            <span className="font-mono text-[#007cc0]">استاندارد SAP PP-PI</span>
          </div>
        </div>
      )}

      {/* Tab 3: OEE Monitoring Dashboard (داشبورد مانیتورینگ اثربخشی تجهیزات) */}
      {activeQmTab === 'OEE_MONITOR' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            <div className="sap-card p-3.5 space-y-1">
              <div className="text-xs text-[#666666]">میانگین OEE کارخانه</div>
              <div className="text-xl font-bold text-[#107e3e] font-mono">۸۶.۴٪</div>
              <div className="text-[10px] text-[#107e3e]">بالاتر از استاندارد کلاس جهانی (۸۵٪)</div>
            </div>
            <div className="sap-card p-3.5 space-y-1">
              <div className="text-xs text-[#666666]">دسترس‌پذیری (Availability)</div>
              <div className="text-xl font-bold text-[#007cc0] font-mono">۹۱.۲٪</div>
              <div className="text-[10px] text-[#666666]">زمان کار مفید ماشین‌آلات پرس</div>
            </div>
            <div className="sap-card p-3.5 space-y-1">
              <div className="text-xs text-[#666666]">عملکرد سرعت (Performance)</div>
              <div className="text-xl font-bold text-[#e9730c] font-mono">۹۴.۸٪</div>
              <div className="text-[10px] text-[#666666]">تعداد ضرب در دقیقه (SPM)</div>
            </div>
            <div className="sap-card p-3.5 space-y-1">
              <div className="text-xs text-[#666666]">نرخ کیفیت سالم (Quality / FPY)</div>
              <div className="text-xl font-bold text-[#107e3e] font-mono">۹۹.۸٪</div>
              <div className="text-[10px] text-[#107e3e]">بدون پرت و ضایعات کشش</div>
            </div>
          </div>

          <div className="sap-card p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#333333] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#007cc0]" />
              <span>وضعیت زنده خطوط پرس و سلول‌های جوش (Press Line OEE Analytics)</span>
            </h3>
            <p className="text-xs text-[#666666]">
              محاسبه لحظه‌ای OEE بر اساس سنسورهای شمارنده ضرب PLC و توقفات ثبت‌شده در شیفت‌های کاری.
            </p>

            <div className="space-y-2 pt-2">
              {[
                { name: 'پرس هیدرولیک ۸۰۰ تن (PRS-800-01)', av: 92.5, perf: 95.0, ql: 99.9, oee: 87.8 },
                { name: 'پرس مکانیکی ۴۰۰ تن (PRS-400-02)', av: 90.0, perf: 94.2, ql: 99.5, oee: 84.3 },
                { name: 'سلول رباتیک جوش CO2 (WELD-01)', av: 93.1, perf: 96.5, ql: 100, oee: 89.9 },
              ].map((m, i) => (
                <div key={i} className="bg-[#f5f5f5] p-3 rounded border border-[#d9d9d9] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-[#333333] font-mono">{m.name}</div>
                    <div className="text-[11px] text-[#666666] mt-0.5">شیفت کاری: صبح | قالب فعال: DIE-206-BRK-OP10</div>
                  </div>
                  <div className="flex items-center gap-4 text-left font-mono">
                    <div>
                      <span className="text-[#666666] text-[10px] block">Availability</span>
                      <span className="font-bold text-[#333333]">{toPersianDigits(m.av)}٪</span>
                    </div>
                    <div>
                      <span className="text-[#666666] text-[10px] block">Performance</span>
                      <span className="font-bold text-[#333333]">{toPersianDigits(m.perf)}٪</span>
                    </div>
                    <div>
                      <span className="text-[#666666] text-[10px] block">Quality</span>
                      <span className="font-bold text-[#333333]">{toPersianDigits(m.ql)}٪</span>
                    </div>
                    <div className="bg-[#ebf5ec] px-3 py-1 rounded border border-[#b7dfbf]">
                      <span className="text-[#107e3e] text-[10px] block font-sans">OEE کل</span>
                      <span className="font-bold text-[#107e3e] text-sm">{toPersianDigits(m.oee)}٪</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
