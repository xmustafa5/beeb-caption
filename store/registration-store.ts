// store/registration-store.ts
import { create } from 'zustand'
import type { CaptainGender } from '@/lib/captain-mappers'

// In-memory only (NOT persisted) — holds the cross-step registration draft so
// each wizard screen stays focused. Cleared on submit or abandon.
interface RegistrationDraft {
  phone: string
  name: string
  nameAr: string
  gender: CaptainGender
  nationalId: string
  carMake: string
  carModel: string
  carColor: string
  carPlate: string
  cityId: string
  setPhone: (phone: string) => void
  setStep1: (v: Pick<RegistrationDraft, 'name' | 'nameAr' | 'gender' | 'nationalId'>) => void
  setStep2: (v: Pick<RegistrationDraft, 'carMake' | 'carModel' | 'carColor' | 'carPlate' | 'cityId'>) => void
  reset: () => void
}

const EMPTY = {
  phone: '',
  name: '',
  nameAr: '',
  gender: 'male' as CaptainGender,
  nationalId: '',
  carMake: '',
  carModel: '',
  carColor: '',
  carPlate: '',
  cityId: '',
}

export const useRegistrationStore = create<RegistrationDraft>((set) => ({
  ...EMPTY,
  setPhone: (phone) => set({ phone }),
  setStep1: (v) => set(v),
  setStep2: (v) => set(v),
  reset: () => set(EMPTY),
}))
