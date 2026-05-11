// Número único de Mercadito — Fernando atiende WhatsApp y llamadas.
// Audiencia: muchos clientes de la región no manejan bien el celular,
// así que el número se expone con botones visibles en pantallas clave
// (no solo en perfil/soporte).
// Formato sin el "1" después de 52 — México lo removió en 2019.
// Marcar +5213531278217 falla; +523531278217 conecta bien para llamadas y WhatsApp.
export const MERCADITO_TEL = "523531278217";
export const MERCADITO_TEL_DISPLAY = "353 127 8217";

export function waUrl(mensaje: string = ""): string {
  const txt = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${MERCADITO_TEL}${txt}`;
}

export function telUrl(): string {
  return `tel:+${MERCADITO_TEL}`;
}
