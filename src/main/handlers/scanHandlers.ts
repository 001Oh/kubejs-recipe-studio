/** 扫描通道的唯一注册入口：modpack:scan / modpack:scanCancel 只在这里出现。 */
import { registerHandler } from '../ipcRegistry'
import { cancelScan, startScan } from '../scanOrchestrator'

export function registerScanHandlers(): void {
  registerHandler('modpack:scan', (req) => startScan(req?.rebuild ?? false))
  registerHandler('modpack:scanCancel', () => cancelScan())
}
