// Why its own file: GlobalSettings sits at the max-lines ceiling.
/** Anonymous product-telemetry state; optional until the one-shot Store.load() migration populates it.
 *  Holds only consent + identity, not volatile counters — those would amplify the debounced settings write. */
export type OrcaTelemetrySettings = {
  /** New users: true at install. Existing users: null until they resolve the first-launch banner. */
  optedIn: boolean | null
  /** Anonymous UUID v4. Generated on first run. Stable across launches; not surfaced in the UI. */
  installId: string
  /** Cohort marker: true for pre-existing profiles (gates the opt-in banner), false for fresh installs. */
  existedBeforeTelemetryRelease: boolean
}
