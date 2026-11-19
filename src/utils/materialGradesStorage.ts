export type MaterialGradeCategory =
  | 'COLD_ROLLED'
  | 'HOT_ROLLED'
  | 'GALVANIZED'
  | 'HIGH_STRENGTH'
  | 'STAINLESS'
  | 'ALUMINUM'
  | 'OTHER';

export interface MaterialGradeItem {
  id: string;
  code: string;
  name: string;
  category: MaterialGradeCategory;
  standard?: string;
  densityGCm3: number;
  notes?: string;
  isDefault?: boolean;
}

export const MATERIAL_GRADES_STORAGE_KEY = 'kpims_material_grades_v1';

export const MATERIAL_GRADE_CATEGORIES: Record<MaterialGradeCategory, string> = {
  COLD_ROLLED: 'ورق سرد / روغنی (Cold Rolled)',
  HOT_ROLLED: 'ورق گرم / سیاه (Hot Rolled)',
  GALVANIZED: 'ورق گالوانیزه و پوشش‌دار',
  HIGH_STRENGTH: 'فولاد استحکام بالا (HSLA)',
  STAINLESS: 'استنلس استیل (ضدزنگ)',
  ALUMINUM: 'ورق آلومینیوم و آلیاژی',
  OTHER: 'سایر آلیاژها و مواد اولیه',
};

export const DEFAULT_MATERIAL_GRADES: MaterialGradeItem[] = [
  {
    id: 'GRD-ST12',
    code: 'ST12',
    name: 'ورق سرد معمولی (نورد سرد)',
    category: 'COLD_ROLLED',
    standard: 'DIN 1623 / EN 10130',
    densityGCm3: 7.85,
    notes: 'مناسب خمکاری و پرسکاری ساده بدنه',
    isDefault: true,
  },
  {
    id: 'GRD-ST13',
    code: 'ST13',
    name: 'ورق سرد نیمه‌کشش',
    category: 'COLD_ROLLED',
    standard: 'DIN 1623 / EN 10130',
    densityGCm3: 7.85,
    notes: 'مناسب فرم‌دهی و کشش متوسط',
    isDefault: true,
  },
  {
    id: 'GRD-ST14',
    code: 'ST14',
    name: 'ورق سرد فوق‌کشش (Deep Drawing)',
    category: 'COLD_ROLLED',
    standard: 'DIN 1623 / EN 10130',
    densityGCm3: 7.85,
    notes: 'مناسب کشش عمیق قطعات بدنه خودرو',
    isDefault: true,
  },
  {
    id: 'GRD-DC01',
    code: 'DC01',
    name: 'ورق روغنی استاندارد اروپایی DC01',
    category: 'COLD_ROLLED',
    standard: 'EN 10130',
    densityGCm3: 7.85,
    notes: 'معادل ST12 با کیفیت سطحی یکنواخت',
    isDefault: true,
  },
  {
    id: 'GRD-DC01A',
    code: 'DC01A',
    name: 'ورق روغنی خودروسازی DC01A',
    category: 'COLD_ROLLED',
    standard: 'EN 10130 / SAPCO',
    densityGCm3: 7.85,
    notes: 'پرکاربرد در براکت‌ها و قطعات پرسی خودرو',
    isDefault: true,
  },
  {
    id: 'GRD-DC04',
    code: 'DC04',
    name: 'ورق روغنی فوق‌کشش DC04',
    category: 'COLD_ROLLED',
    standard: 'EN 10130 / SAPCO',
    densityGCm3: 7.85,
    notes: 'معادل ST14 برای کشش عمیق بدون ترک',
    isDefault: true,
  },
  {
    id: 'GRD-ST37',
    code: 'ST37',
    name: 'ورق گرم (سیاه) ساختمانی و صنعتی',
    category: 'HOT_ROLLED',
    standard: 'DIN 17100 / S235JR',
    densityGCm3: 7.85,
    notes: 'مناسب قطعات ضخیم شاسی و تقویتی',
    isDefault: true,
  },
  {
    id: 'GRD-SPHC',
    code: 'SPHC',
    name: 'ورق گرم اسیدشویی‌شده (Pickled)',
    category: 'HOT_ROLLED',
    standard: 'JIS G3131',
    densityGCm3: 7.85,
    notes: 'مناسب پرسکاری قطعات ضخیم و شاسی خودرو',
    isDefault: true,
  },
  {
    id: 'GRD-S355MC',
    code: 'S355MC',
    name: 'ورق فولادی استحکام بالا (HSLA)',
    category: 'HIGH_STRENGTH',
    standard: 'EN 10149-2',
    densityGCm3: 7.85,
    notes: 'مناسب تیر عرضی سپر و قطعات ایمنی',
    isDefault: true,
  },
  {
    id: 'GRD-DX51D',
    code: 'DX51D',
    name: 'ورق گالوانیزه گرم (Zinc Coated)',
    category: 'GALVANIZED',
    standard: 'EN 10346',
    densityGCm3: 7.85,
    notes: 'مقاوم در برابر خوردگی برای قطعات زیربدنه',
    isDefault: true,
  },
  {
    id: 'GRD-SS304',
    code: 'SS304',
    name: 'ورق استنلس استیل ۳۰۴ نگیر',
    category: 'STAINLESS',
    standard: 'ASTM A240',
    densityGCm3: 7.93,
    notes: 'مقاوم به زنگ‌زدگی و حرارت',
    isDefault: true,
  },
  {
    id: 'GRD-AL5052',
    code: 'AL5052',
    name: 'ورق آلومینیوم آلیاژی ۵۰۵۲',
    category: 'ALUMINUM',
    standard: 'ASTM B209',
    densityGCm3: 2.68,
    notes: 'سبک با فرم‌پذیری بالا',
    isDefault: true,
  },
];

function notifyMaterialGradesUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kpims-material-grades-updated'));
  }
}

export function loadMaterialGrades(): MaterialGradeItem[] {
  if (typeof window === 'undefined') return DEFAULT_MATERIAL_GRADES;
  try {
    const raw = localStorage.getItem(MATERIAL_GRADES_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(MATERIAL_GRADES_STORAGE_KEY, JSON.stringify(DEFAULT_MATERIAL_GRADES));
      return DEFAULT_MATERIAL_GRADES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(MATERIAL_GRADES_STORAGE_KEY, JSON.stringify(DEFAULT_MATERIAL_GRADES));
      return DEFAULT_MATERIAL_GRADES;
    }
    return parsed;
  } catch {
    return DEFAULT_MATERIAL_GRADES;
  }
}

export function saveMaterialGrades(items: MaterialGradeItem[]): MaterialGradeItem[] {
  const safe = items.length > 0 ? items : DEFAULT_MATERIAL_GRADES;
  if (typeof window !== 'undefined') {
    localStorage.setItem(MATERIAL_GRADES_STORAGE_KEY, JSON.stringify(safe));
    notifyMaterialGradesUpdated();
  }
  return safe;
}

export function upsertMaterialGrade(item: Omit<MaterialGradeItem, 'id'> & { id?: string }): MaterialGradeItem[] {
  const list = loadMaterialGrades();
  const cleanCode = item.code.trim().toUpperCase();
  const existingIdx = list.findIndex(
    g => (item.id && g.id === item.id) || g.code.toUpperCase() === cleanCode
  );
  const record: MaterialGradeItem = {
    id: item.id || (existingIdx >= 0 ? list[existingIdx].id : `GRD-${Date.now().toString(36).toUpperCase()}`),
    code: cleanCode,
    name: item.name.trim() || cleanCode,
    category: item.category || 'COLD_ROLLED',
    standard: item.standard?.trim() || '',
    densityGCm3: Number(item.densityGCm3) > 0 ? Number(item.densityGCm3) : 7.85,
    notes: item.notes?.trim() || '',
    isDefault: existingIdx >= 0 ? list[existingIdx].isDefault : false,
  };

  const next =
    existingIdx >= 0
      ? list.map((g, idx) => (idx === existingIdx ? record : g))
      : [record, ...list];
  return saveMaterialGrades(next);
}

export function deleteMaterialGrade(id: string): MaterialGradeItem[] {
  const list = loadMaterialGrades();
  if (list.length <= 1) return list;
  const next = list.filter(g => g.id !== id);
  return saveMaterialGrades(next);
}

export function resetMaterialGrades(): MaterialGradeItem[] {
  return saveMaterialGrades(DEFAULT_MATERIAL_GRADES);
}
