import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import * as Print from "expo-print";
import { theme } from "../lib/theme";
import { fechaHoraMX } from "../lib/fecha";
import { LABEL_METODO, type Metodo } from "../lib/mostrador";
import { listarTickets, type TicketCobrado } from "../api/tienda";
import SearchBar from "./SearchBar";

const money = (n: number) => `$${n.toFixed(2)}`;
const cuando = (iso: string) => fechaHoraMX(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Tickets cobrados, para volver a imprimirlos.
 * ESPEJO de src/components/TicketsPanel.tsx (web).
 *
 * "Se cortó el papel", "el cliente quiere su copia", "¿qué llevaba el folio
 * 214?". El folio se busca como número porque es lo que pide la gente en el
 * mostrador.
 */
export default function TicketsPanel({ negocioNombre }: { negocioNombre: string }) {
  const [tickets, setTickets] = useState<TicketCobrado[] | null>(null);
  const [q, setQ] = useState("");

  const cargar = useCallback((busqueda: string) => {
    listarTickets(busqueda).then(setTickets);
  }, []);

  useEffect(() => {
    // Debounce: el folio se teclea dígito por dígito.
    const t = setTimeout(() => cargar(q), 300);
    return () => clearTimeout(t);
  }, [q, cargar]);

  async function imprimir(t: TicketCobrado) {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const filas = t.items.map((i) => {
      const det = [i.variante, i.notas ? `“${i.notas}”` : null].filter(Boolean).join(" · ");
      return `<tr><td>${i.cantidad}× ${esc(i.nombre)}${det ? `<div style="color:#666;font-size:11px">${esc(det)}</div>` : ""}</td>` +
        `<td style="text-align:right;vertical-align:top">${money(i.subtotal)}</td></tr>`;
    }).join("");
    const html = `<html><body style="font-family:monospace;font-size:13px;padding:16px;max-width:340px">
      <div style="text-align:center;font-weight:bold;font-size:16px">${esc(negocioNombre || "Ticket")}</div>
      <div style="text-align:center;color:#666">${t.folio != null ? `Folio #${t.folio} · ` : ""}${esc(t.titulo)}</div>
      <div style="text-align:center;color:#666;font-size:11px">${cuando(t.cerrada_at)}</div>
      <hr style="border:none;border-top:1px dashed #999"/>
      <table style="width:100%;border-collapse:collapse">${filas}</table>
      <hr style="border:none;border-top:1px dashed #999"/>
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px"><span>TOTAL</span><span>${money(t.total + t.propina)}</span></div>
      <div style="text-align:center;color:#666;margin-top:16px">¡Gracias por su compra!</div>
    </body></html>`;
    try { await Print.printAsync({ html }); } catch { /* el usuario canceló */ }
  }

  return (
    <View style={{ gap: 10 }}>
      <SearchBar value={q} onChange={setQ} placeholder="Busca por folio (ej. 214)…" />

      {tickets === null ? (
        <Text style={styles.vacio}>Cargando…</Text>
      ) : tickets.length === 0 ? (
        <Text style={styles.vacio}>
          {q.trim() ? `No encontramos el folio ${q.trim()}.` : "Todavía no has cobrado ningún ticket."}
        </Text>
      ) : (
        tickets.map((t) => (
          <TouchableOpacity key={t.id} onPress={() => imprimir(t)} style={styles.fila} activeOpacity={0.8}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.titulo} numberOfLines={1}>
                {t.folio != null ? `#${t.folio} · ` : ""}{t.titulo}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {cuando(t.cerrada_at)}
                {t.metodo_pago ? ` · ${LABEL_METODO[t.metodo_pago as Metodo] ?? t.metodo_pago}` : ""}
                {t.cliente_nombre ? ` · ${t.cliente_nombre}` : ""}
              </Text>
            </View>
            <Text style={styles.total}>{money(t.total + t.propina)}</Text>
            <Text style={styles.icono}>🖨️</Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: { textAlign: "center", color: theme.colors.gray400, paddingVertical: 28, fontSize: 13, lineHeight: 18 },
  fila: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 12, padding: 12, ...theme.shadow.sm,
  },
  titulo: { fontSize: 13.5, fontWeight: "800", color: theme.colors.gray800 },
  meta: { fontSize: 11, color: theme.colors.gray400, marginTop: 1 },
  total: { fontSize: 14, fontWeight: "800", color: theme.colors.gray800, fontVariant: ["tabular-nums"] },
  icono: { fontSize: 15 },
});
