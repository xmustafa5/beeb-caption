import { create } from 'zustand'

interface TabStore {
  activeTabIndex: number
  setActiveTabIndex: (index: number) => void
}

export const useTabStore = create<TabStore>((set) => ({
  activeTabIndex: 0,
  setActiveTabIndex: (activeTabIndex) => set({ activeTabIndex }),
}))
