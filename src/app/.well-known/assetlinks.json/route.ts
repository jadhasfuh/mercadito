import { NextResponse } from "next/server";

// Android App Links (Digital Asset Links) — habilita que al tocar
// https://mercadito.cx/producto/<id> Android abra la app directo.
//
// El fingerprint SHA-256 es el del certificado con el que se FIRMA el APK/AAB
// que llega al dispositivo. Con Play App Signing suele haber DOS:
//   1) la "App signing key" (la que usa Google al distribuir) y
//   2) la "Upload key".
// Conviene poner AMBAS. Las obtienes en:
//   Play Console → tu app → Configuración → Integridad de la app → huellas SHA-256
// o con: eas credentials  (Android → ver fingerprints).
//
// Se leen de la env ANDROID_CERT_SHA256 (coma-separadas) para no hardcodear.
// `force-dynamic` para leerlas en runtime (al setearlas en docker-compose no
// hace falta rebuild). Mientras no se setee, sirve un placeholder y la
// verificación de Android quedará pendiente (iOS funciona aparte).
export const dynamic = "force-dynamic";

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 || "REEMPLAZAR_CON_SHA256_DEL_CERT")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  return NextResponse.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "mx.mercadito.cx",
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
