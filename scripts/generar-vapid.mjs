#!/usr/bin/env node
// Genera un par de claves VAPID para Web Push. Corre una sola vez y guarda las
// claves como env vars en Railway (y en tu .env local para probar):
//
//   VAPID_PUBLIC_KEY=...     (pública; el navegador la usa para suscribirse)
//   VAPID_PRIVATE_KEY=...    (SECRETA; nunca la subas al repo)
//   VAPID_SUBJECT=mailto:soporte@mercadito.cx
//
// Uso:  node scripts/generar-vapid.mjs
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + publicKey);
console.log("VAPID_PRIVATE_KEY=" + privateKey);
console.log("VAPID_SUBJECT=mailto:soporte@mercadito.cx");
console.log("\n⚠  Guarda estas 3 en las env vars del server (Railway). NO cambies");
console.log("   las claves después: si las cambias, todas las suscripciones web");
console.log("   existentes dejan de funcionar y hay que re-suscribir a todos.");
