// constants/car-colors.ts
// Car colors offered on the registration vehicle step.
//   en       — what the backend stores in car_color. The rider app prints it next
//              to the car make/model, which are sent in English too, so it stays
//              English for every captain regardless of app language.
//   ar       — Arabic display label.
//   keywords — extra search terms (spelling variants, Iraqi-dialect names).
//   swatch   — preview dot only; real-world paint, not a theme color.
export interface CarColor {
  en: string
  ar: string
  swatch: string
  keywords?: string[]
}

export const CAR_COLORS: CarColor[] = [
  { en: 'White', ar: 'أبيض', swatch: '#FFFFFF' },
  { en: 'Pearl White', ar: 'أبيض لؤلؤي', swatch: '#F3EFE4', keywords: ['لؤلؤي'] },
  { en: 'Black', ar: 'أسود', swatch: '#141414' },
  { en: 'Silver', ar: 'فضي', swatch: '#C4C7CC' },
  { en: 'Gray', ar: 'رمادي', swatch: '#8A8D91', keywords: ['Grey', 'رصاصي'] },
  { en: 'Dark Gray', ar: 'رمادي غامق', swatch: '#4B4E53', keywords: ['Dark Grey', 'رصاصي غامق'] },
  { en: 'Red', ar: 'أحمر', swatch: '#C62828' },
  { en: 'Maroon', ar: 'عنابي', swatch: '#6E1B24', keywords: ['Burgundy', 'خمري', 'نبيذي'] },
  { en: 'Blue', ar: 'أزرق', swatch: '#1F5FAE' },
  { en: 'Navy Blue', ar: 'كحلي', swatch: '#1C2A4D', keywords: ['Navy', 'نيلي'] },
  { en: 'Sky Blue', ar: 'سمائي', swatch: '#8EC3EA', keywords: ['Light Blue', 'سماوي', 'أزرق فاتح'] },
  { en: 'Turquoise', ar: 'فيروزي', swatch: '#1FA3A3', keywords: ['Teal'] },
  { en: 'Green', ar: 'أخضر', swatch: '#2E7D32' },
  { en: 'Beige', ar: 'بيج', swatch: '#D9C9A6', keywords: ['بيجي'] },
  { en: 'Champagne', ar: 'شامبين', swatch: '#E3CFA0', keywords: ['شمبانيا'] },
  { en: 'Gold', ar: 'ذهبي', swatch: '#C9A13B' },
  { en: 'Bronze', ar: 'برونزي', swatch: '#8C6239' },
  { en: 'Brown', ar: 'بني', swatch: '#5D3A1F', keywords: ['قهوائي', 'جوزي'] },
  { en: 'Yellow', ar: 'أصفر', swatch: '#F2C200' },
  { en: 'Orange', ar: 'برتقالي', swatch: '#EF7D1A' },
  { en: 'Purple', ar: 'بنفسجي', swatch: '#6A3D9A', keywords: ['موف'] },
]
