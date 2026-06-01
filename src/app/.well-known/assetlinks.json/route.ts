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
// Ambas huellas SHA-256 son públicas (Google las publica en Play Console) y
// fijas, así que van baked-in:
//   - APP SIGNING KEY: con la que GOOGLE re-firma el app distribuido. Es la
//     que verifica el dispositivo en instalaciones desde Play → la primaria.
//   - UPLOAD KEY: firma los AAB antes de subirlos; útil para builds internos.
// (Play Console → Integridad de la app → Clave de firma de apps / de carga.)
//
// `force-dynamic` + merge con env por si hay que agregar otra huella sin deploy.
export const dynamic = "force-dynamic";

const APP_SIGNING_KEY_SHA256 =
  "7A:B1:1D:97:AE:11:20:78:C0:4C:CF:64:DA:22:F4:61:4E:74:00:58:CF:EC:6A:DD:F4:70:47:53:AF:4A:FF:59";
const UPLOAD_KEY_SHA256 =
  "D2:41:4F:A4:4F:AE:F4:96:18:2F:C8:C2:64:15:7E:4A:FC:55:06:82:08:22:95:4D:CC:EB:94:80:FF:41:AC:49";

export function GET() {
  const fromEnv = (process.env.ANDROID_CERT_SHA256 || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  const fingerprints = Array.from(new Set([APP_SIGNING_KEY_SHA256, UPLOAD_KEY_SHA256, ...fromEnv]));

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
