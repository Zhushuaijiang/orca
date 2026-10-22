import {
  addMobilePairingCustomAddress,
  normalizeMobilePairingCustomAddress,
  normalizeMobilePairingCustomAddresses
} from '../../../shared/mobile-pairing-custom-address'
import type { GlobalSettings } from '../../../shared/global-settings-types'

/** Normalizes the mobile pairing address write and folds a single address into the list. */
export function applyMobilePairingCustomAddressUpdates(
  currentSettings: GlobalSettings,
  updates: Partial<GlobalSettings>,
  sanitizedUpdates: Partial<GlobalSettings>
): void {
  if ('mobilePairingCustomAddress' in updates) {
    sanitizedUpdates.mobilePairingCustomAddress = normalizeMobilePairingCustomAddress(
      updates.mobilePairingCustomAddress
    )
  }
  if ('mobilePairingCustomAddresses' in updates) {
    sanitizedUpdates.mobilePairingCustomAddresses = normalizeMobilePairingCustomAddresses(
      updates.mobilePairingCustomAddresses
    )
  }
  if (
    'mobilePairingCustomAddress' in sanitizedUpdates ||
    'mobilePairingCustomAddresses' in sanitizedUpdates
  ) {
    const mobilePairingCustomAddress =
      'mobilePairingCustomAddress' in sanitizedUpdates
        ? sanitizedUpdates.mobilePairingCustomAddress
        : currentSettings.mobilePairingCustomAddress
    if (mobilePairingCustomAddress) {
      sanitizedUpdates.mobilePairingCustomAddresses = addMobilePairingCustomAddress(
        sanitizedUpdates.mobilePairingCustomAddresses ??
          currentSettings.mobilePairingCustomAddresses ??
          [],
        mobilePairingCustomAddress
      )
    }
  }
}
