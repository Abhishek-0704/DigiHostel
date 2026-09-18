package expo.modules.digihostelplayintegrity

import com.google.android.gms.tasks.Tasks
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ADR-003 implementation — thin wrapper around Google's official Play
 * Integrity Standard API (`com.google.android.play:integrity`), NOT a
 * hand-rolled attestation mechanism. This module's only job is to obtain a
 * genuine, Google-signed integrity token bound to a server-issued nonce and
 * hand the opaque token back to JS — it never inspects, decodes, or makes any
 * trust decision about the token itself. The actual verdict decision happens
 * exclusively server-side (apps/api/src/domain/device/attestationVerifier.ts)
 * — this class could return a token for an entirely fraudulent request and
 * the backend would still correctly reject it; this module is a courier, not
 * an authority.
 *
 * Requires: a real device (or an emulator running a "Google Play" system
 * image, which the AVD used in Task 8's own physical-device pivot did NOT
 * have) with Google Play services installed and up to date. Real physical-
 * device verification of this exact call is the ADR-003 implementation
 * report's own tracked next step, gated on Google Play Console/Cloud Project
 * provisioning — see that report for the full status.
 */
class DigihostelPlayIntegrityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DigihostelPlayIntegrity")

    // AsyncFunction rather than Function: requestIntegrityToken() returns a
    // Play Services Task, an inherently async network+device operation, and
    // must never block the JS thread.
    AsyncFunction("requestIntegrityToken") { nonce: String, cloudProjectNumber: String ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_NO_CONTEXT", "No Android context available", null)

      val integrityManager = IntegrityManagerFactory.create(context)
      val request = IntegrityTokenRequest.builder()
        .setNonce(nonce)
        .setCloudProjectNumber(cloudProjectNumber.toLong())
        .build()

      try {
        // AsyncFunction already runs off the JS thread; Tasks.await() here
        // blocks only this background thread, not the UI/JS thread, which is
        // the documented, correct way to bridge a Play Services Task into a
        // synchronous-looking call inside an Expo AsyncFunction lambda.
        val response = Tasks.await(integrityManager.requestIntegrityToken(request))
        response.token()
      } catch (e: Exception) {
        // Deliberately surfaced as a real error, never swallowed into a
        // fabricated "success" token — see this file's own doc comment and
        // ADR-003 implementation task §11 (every failure must fail closed).
        throw CodedException(
          "ERR_PLAY_INTEGRITY_REQUEST_FAILED",
          "Play Integrity token request failed: ${e.message}",
          e,
        )
      }
    }
  }
}
