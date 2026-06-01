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
// La UPLOAD KEY (la que firma los AAB localmente) va baked-in — su SHA-256
// es información pública (se publica en este mismo archivo). Sirve para
// builds internos/EAS y como secundaria.
//
// ⚠️ FALTA la APP SIGNING KEY de Google: como usamos Play App Signing, el
// dispositivo verifica contra la llave con la que GOOGLE re-firma el app
// distribuido, NO la upload key. Esa huella está en:
//   Play Console → tu app → Integridad de la app → Clave de firma de apps → SHA-256
// Agrégala (coma-separada) en la env ANDROID_CERT_SHA256 del VPS y se servirá
// junto con la upload key. Sin ella, la verificación de App Links fallará
// para instalaciones desde Play (iOS funciona aparte).
//
// `force-dynamic` para leer la env en runtime (sin rebuild al setearla).
export const dynamic = "force-dynamic";

const UPLOAD_KEY_SHA256 =
  "D2:41:4F:A4:4F:AE:F4:96:18:2F:C8:C2:64:15:7E:4A:FC:55:06:82:08:22:95:4D:CC:EB:94:80:FF:41:AC:49";

export function GET() {
  const fromEnv = (process.env.ANDROID_CERT_SHA256 || "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  // Upload key siempre + las de la env (app signing key de Google), sin duplicar.
  const fingerprints = Array.from(new Set([UPLOAD_KEY_SHA256, ...fromEnv]));

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
