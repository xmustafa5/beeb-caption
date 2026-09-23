// constants/car-colors.ts
// Car colors offered on the registration vehicle step.
//   en       — what the backend stores in car_color. The rider app prints it next
//              to the car make/model, which are sent in English too, so it stays
//              English for every captain regardless of app language.
//   ar       — Arabic display label.
//   ckb      — Kurdish (Sorani) display label.
//   keywords — extra search terms (spelling variants, Iraqi-dialect names).
//   swatch   — preview dot only; real-world paint, not a theme color.
export interface CarColor {
  en: string
  ar: string
  ckb: string
  swatch: string
  keywords?: string[]
}

export const CAR_COLORS: CarColor[] = [
  { en: 'White', ar: 'أبيض', ckb: 'سپی', swatch: '#FFFFFF' },
  { en: 'Pearl White', ar: 'أبيض لؤلؤي', ckb: 'سپیی مرواری', swatch: '#F3EFE4', keywords: ['لؤلؤي', 'مرواری'] },
  { en: 'Black', ar: 'أسود', ckb: 'ڕەش', swatch: '#141414' },
  { en: 'Silver', ar: 'فضي', ckb: 'زیوی', swatch: '#C4C7CC' },
  { en: 'Gray', ar: 'رمادي', ckb: 'خۆڵەمێشی', swatch: '#8A8D91', keywords: ['Grey', 'رصاصي', 'ڕەساسی'] },
  { en: 'Dark Gray', ar: 'رمادي غامق', ckb: 'خۆڵەمێشیی تۆخ', swatch: '#4B4E53', keywords: ['Dark Grey', 'رصاصي غامق', 'ڕەساسیی تۆخ'] },
  { en: 'Red', ar: 'أحمر', ckb: 'سوور', swatch: '#C62828' },
  { en: 'Maroon', ar: 'عنابي', ckb: 'شەرابی', swatch: '#6E1B24', keywords: ['Burgundy', 'خمري', 'نبيذي', 'عەنابی'] },
  { en: 'Blue', ar: 'أزرق', ckb: 'شین', swatch: '#1F5FAE' },
  { en: 'Navy Blue', ar: 'كحلي', ckb: 'شینی تۆخ', swatch: '#1C2A4D', keywords: ['Navy', 'نيلي', 'کوحلی'] },
  { en: 'Sky Blue', ar: 'سمائي', ckb: 'شینی ئاسمانی', swatch: '#8EC3EA', keywords: ['Light Blue', 'سماوي', 'أزرق فاتح', 'شینی کاڵ'] },
  { en: 'Turquoise', ar: 'فيروزي', ckb: 'فیرۆزەیی', swatch: '#1FA3A3', keywords: ['Teal'] },
  { en: 'Green', ar: 'أخضر', ckb: 'سەوز', swatch: '#2E7D32' },
  { en: 'Beige', ar: 'بيج', ckb: 'بێج', swatch: '#D9C9A6', keywords: ['بيجي', 'بێژ'] },
  { en: 'Champagne', ar: 'شامبين', ckb: 'شامپانی', swatch: '#E3CFA0', keywords: ['شمبانيا'] },
  { en: 'Gold', ar: 'ذهبي', ckb: 'ئاڵتوونی', swatch: '#C9A13B', keywords: ['زێڕین'] },
  { en: 'Bronze', ar: 'برونزي', ckb: 'برۆنزی', swatch: '#8C6239' },
  { en: 'Brown', ar: 'بني', ckb: 'قاوەیی', swatch: '#5D3A1F', keywords: ['قهوائي', 'جوزي'] },
  { en: 'Yellow', ar: 'أصفر', ckb: 'زەرد', swatch: '#F2C200' },
  { en: 'Orange', ar: 'برتقالي', ckb: 'پرتەقاڵی', swatch: '#EF7D1A' },
  { en: 'Purple', ar: 'بنفسجي', ckb: 'مۆر', swatch: '#6A3D9A', keywords: ['موف', 'وەنەوشەیی'] },
]

/** The color's display label in the app language (i18n.language). */
export function carColorName(color: CarColor, lang: string): string {
  return lang === 'ckb' ? color.ckb : lang === 'ar' ? color.ar : color.en
}
