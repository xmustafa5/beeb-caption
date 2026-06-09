import * as Updates from 'expo-updates'
import { DevSettings } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const RESTART_FLAG = '__rtl_restart_pending'

export async function restartApp() {
  await AsyncStorage.setItem(RESTART_FLAG, 'true')
  if (__DEV__) {
    DevSettings.reload()
    return
  }
  await Updates.reloadAsync()
}

export async function consumeRestartFlag(): Promise<boolean> {
  const flag = await AsyncStorage.getItem(RESTART_FLAG)
  if (flag) {
    await AsyncStorage.removeItem(RESTART_FLAG)
    return true
  }
  return false
}
