import type { LatLng } from '@/hooks/use-current-location'

export interface Place {
  id: string
  name: { en: string; ar: string }
  area: { en: string; ar: string }
  coord: LatLng
  category: 'airport' | 'landmark' | 'mall' | 'hospital' | 'university' | 'neighborhood' | 'government'
}

// Curated list of well-known Baghdad places. Used as instant search results
// before falling back to system geocoding.
export const BAGHDAD_PLACES: Place[] = [
  { id: 'bia',          name: { en: 'Baghdad International Airport',    ar: 'مطار بغداد الدولي'        }, area: { en: 'Al-Furat',     ar: 'الفرات'        }, coord: { latitude: 33.2625, longitude: 44.2346 }, category: 'airport' },
  { id: 'mansour-mall', name: { en: 'Mansour Mall',                     ar: 'منصور مول'                 }, area: { en: 'Al-Mansour',   ar: 'المنصور'       }, coord: { latitude: 33.3105, longitude: 44.3592 }, category: 'mall' },
  { id: 'baghdad-mall', name: { en: 'Baghdad Mall',                     ar: 'بغداد مول'                 }, area: { en: 'Al-Mansour',   ar: 'المنصور'       }, coord: { latitude: 33.3160, longitude: 44.3550 }, category: 'mall' },
  { id: 'zawraa',       name: { en: 'Al-Zawraa Park',                   ar: 'متنزه الزوراء'             }, area: { en: 'Al-Mansour',   ar: 'المنصور'       }, coord: { latitude: 33.3193, longitude: 44.3614 }, category: 'landmark' },
  { id: 'tahrir',       name: { en: 'Tahrir Square',                    ar: 'ساحة التحرير'              }, area: { en: 'Al-Rusafa',    ar: 'الرصافة'       }, coord: { latitude: 33.3127, longitude: 44.4209 }, category: 'landmark' },
  { id: 'firdos',       name: { en: 'Firdos Square',                    ar: 'ساحة الفردوس'              }, area: { en: 'Karada',       ar: 'الكرادة'       }, coord: { latitude: 33.3145, longitude: 44.4186 }, category: 'landmark' },
  { id: 'mutanabbi',    name: { en: 'Al-Mutanabbi Street',              ar: 'شارع المتنبي'              }, area: { en: 'Al-Rusafa',    ar: 'الرصافة'       }, coord: { latitude: 33.3403, longitude: 44.3870 }, category: 'landmark' },
  { id: 'baghdad-uni',  name: { en: 'University of Baghdad',            ar: 'جامعة بغداد'               }, area: { en: 'Jadriya',      ar: 'الجادرية'      }, coord: { latitude: 33.2734, longitude: 44.3793 }, category: 'university' },
  { id: 'medical-city', name: { en: 'Medical City Hospital',            ar: 'مدينة الطب'                }, area: { en: 'Bab Al-Muadham', ar: 'باب المعظم'   }, coord: { latitude: 33.3556, longitude: 44.3870 }, category: 'hospital' },
  { id: 'green-zone',   name: { en: 'Green Zone',                       ar: 'المنطقة الخضراء'           }, area: { en: 'Karkh',        ar: 'الكرخ'         }, coord: { latitude: 33.3050, longitude: 44.3787 }, category: 'government' },
  { id: 'kadhimiya',    name: { en: 'Al-Kadhimiya Shrine',              ar: 'مرقد الإمام الكاظم'         }, area: { en: 'Kadhimiya',    ar: 'الكاظمية'      }, coord: { latitude: 33.3801, longitude: 44.3367 }, category: 'landmark' },
  { id: 'karada-in',    name: { en: 'Karada Inside',                    ar: 'كرادة داخل'                }, area: { en: 'Karada',       ar: 'الكرادة'       }, coord: { latitude: 33.3079, longitude: 44.4200 }, category: 'neighborhood' },
  { id: 'arasat',       name: { en: 'Arasat Al-Hindiya',                ar: 'عرصات الهندية'             }, area: { en: 'Karada',       ar: 'الكرادة'       }, coord: { latitude: 33.3036, longitude: 44.4290 }, category: 'neighborhood' },
  { id: 'jadriya',      name: { en: 'Al-Jadriya',                       ar: 'الجادرية'                  }, area: { en: 'Karkh',        ar: 'الكرخ'         }, coord: { latitude: 33.2762, longitude: 44.3814 }, category: 'neighborhood' },
  { id: 'doura',        name: { en: 'Al-Doura',                         ar: 'الدورة'                    }, area: { en: 'Karkh',        ar: 'الكرخ'         }, coord: { latitude: 33.2547, longitude: 44.3961 }, category: 'neighborhood' },
  { id: 'zayuna',       name: { en: 'Zayuna',                           ar: 'زيونة'                     }, area: { en: 'Al-Rusafa',    ar: 'الرصافة'       }, coord: { latitude: 33.3404, longitude: 44.4520 }, category: 'neighborhood' },
  { id: 'al-aamiriya',  name: { en: 'Al-Amiriya',                       ar: 'العامرية'                  }, area: { en: 'Karkh',        ar: 'الكرخ'         }, coord: { latitude: 33.3131, longitude: 44.3120 }, category: 'neighborhood' },
  { id: 'al-yarmouk',   name: { en: 'Al-Yarmouk',                       ar: 'اليرموك'                   }, area: { en: 'Karkh',        ar: 'الكرخ'         }, coord: { latitude: 33.2960, longitude: 44.3220 }, category: 'neighborhood' },
  { id: 'al-saidiya',   name: { en: 'Al-Saidiya',                       ar: 'السيدية'                   }, area: { en: 'Karkh',        ar: 'الكرخ'         }, coord: { latitude: 33.2683, longitude: 44.3580 }, category: 'neighborhood' },
  { id: 'al-shorja',    name: { en: 'Al-Shorja Market',                 ar: 'سوق الشورجة'               }, area: { en: 'Al-Rusafa',    ar: 'الرصافة'       }, coord: { latitude: 33.3470, longitude: 44.3920 }, category: 'landmark' },
  { id: 'al-rasheed',   name: { en: 'Al-Rasheed Street',                ar: 'شارع الرشيد'               }, area: { en: 'Al-Rusafa',    ar: 'الرصافة'       }, coord: { latitude: 33.3412, longitude: 44.3850 }, category: 'landmark' },
  { id: 'palestine-st', name: { en: 'Palestine Street',                 ar: 'شارع فلسطين'               }, area: { en: 'Al-Rusafa',    ar: 'الرصافة'       }, coord: { latitude: 33.3340, longitude: 44.4395 }, category: 'landmark' },
]
