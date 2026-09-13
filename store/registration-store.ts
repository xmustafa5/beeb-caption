// store/registration-store.ts
import { create } from 'zustand'
import type { CaptainGender } from '@/lib/captain-mappers'

// In-memory only (NOT persisted) — holds the cross-step registration draft so
// each wizard screen stays focused. Cleared on submit or abandon.
interface RegistrationDraft {
  phone: string
  // Set by the account step (phone → OTP → password): the register-purpose ticket
  // minted by verifyOtp() and the password the captain chose. Both are required
  // by /captains/register. In-memory only — never persisted.
  ticket: string
  password: string
  name: string
  gender: CaptainGender
  nationalId: string
  carMake: string
  carModel: string
  carColor: string
  carPlate: string
  cityId: string
  // Vehicle-catalog selection. '' when the captain used the free-text fallback
  // instead of the picker — the register call then sends NO catalog ids and the
  // backend caps that captain's car star at 2 (it can't grade an unresolved car).
  carBrandId: string
  carModelId: string
  // Localized labels for the chosen catalog entry, kept only so the vehicle step
  // can render "{brand} {model}" without re-fetching. car_make / car_model are
  // still sent to the API as the ENGLISH names.
  carBrandName: string
  carModelName: string
  /** Model year, held as a STRING while it's being typed; coerced to an int at submit. */
  carYear: string
  setPhone: (phone: string) => void
  setAccount: (v: Pick<RegistrationDraft, 'phone' | 'ticket' | 'password'>) => void
  setStep1: (v: Pick<RegistrationDraft, 'name' | 'gender' | 'nationalId'>) => void
  setStep2: (
    v: Pick<
      RegistrationDraft,
      | 'carMake'
      | 'carModel'
      | 'carColor'
      | 'carPlate'
      | 'cityId'
      | 'carBrandId'
      | 'carModelId'
      | 'carBrandName'
      | 'carModelName'
      | 'carYear'
    >,
  ) => void
  /**
   * Set ONLY the car identity. The car picker is a separate route, so it must be
   * able to hand its selection back without knowing (or clobbering) the unrelated
   * step-2 fields the vehicle form still owns — colour, plate, city, year.
   */
  setCar: (
    v: Pick<RegistrationDraft, 'carBrandId' | 'carModelId' | 'carBrandName' | 'carModelName' | 'carMake' | 'carModel'>,
  ) => void
  reset: () => void
}

const EMPTY = {
  phone: '',
  ticket: '',
  password: '',
  name: '',
  gender: 'male' as CaptainGender,
  nationalId: '',
  carMake: '',
  carModel: '',
  carColor: '',
  carPlate: '',
  cityId: '',
  carBrandId: '',
  carModelId: '',
  carBrandName: '',
  carModelName: '',
  carYear: '',
}

export const useRegistrationStore = create<RegistrationDraft>((set) => ({
  ...EMPTY,
  setPhone: (phone) => set({ phone }),
  setAccount: (v) => set(v),
  setStep1: (v) => set(v),
  setStep2: (v) => set(v),
  setCar: (v) => set(v),
  reset: () => set(EMPTY),
}))
