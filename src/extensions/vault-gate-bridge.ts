export interface VaultGateBridgeApi {
  ensure(): Promise<boolean>
  isUnlocked(): boolean
}

let current: VaultGateBridgeApi | null = null

export function setVaultGateBridge(api: VaultGateBridgeApi | null): void {
  current = api
}

export function getVaultGateBridge(): VaultGateBridgeApi | null {
  return current
}
