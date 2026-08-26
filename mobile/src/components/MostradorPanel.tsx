import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch,
} from "react-native";
import * as Print from "expo-print";
import { theme } from "../lib/theme";
import { listarProductos, type Producto } from "../api/catalogo";
import { cobrarMostrador, type VentaMostrador } from "../api/tienda";
import {
  SERVICIOS, LABEL_SERVICIO, METODOS, LABEL_METODO, type Servicio, type Metodo,
} from "../lib/mostrador";
import SearchBar from "./SearchBar";

interface ProductoCaja { id: string; nombre: string; precio: number; cat: string | null }
interface Linea { key: string; producto_id: string; nombre: string; precio: number; cantidad: number; notas: string }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const money = (n: number) => `$${n.toFixed(2)}`;
const soloNum = (t: string) => t.replace(/[^\d.]/g, "");

/**
 * Ventas desde mostrador — la pantalla del cajero en la app.
 * ESPEJO de src/components/MostradorPanel.tsx (web).
 *
 * Se captura, se cobra y se cierra en un solo movimiento, y la venta entra sola
 * al corte de caja, al tablero de cocina y al resumen. Cero pasos obligatorios
 * de más: servicio y pago traen su default, los datos del cliente sólo salen si
 * el pedido es a domicilio, y el pago mixto vive detrás de un enlace.
 */
export default function MostradorPanel({ puestoId }: { puestoId: string }) {
  const [productos, setProductos] = useState<ProductoCaja[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [servicio, setServicio] = useState<Servicio>("local");
  const [cobrando, setCobrando] = useState(false);
  const [venta, setVenta] = useState<VentaMostrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [mixto, setMixto] = useState(false);
  const [metodo, setMetodo] = useState<Metodo>("caja");
  const [montos, setMontos] = useState<Record<string, string>>({ caja: "", tarjeta: "", transferencia: "" });
  const [recibido, setRecibido] = useState("");
  const [propina, setPropina] = useState("");
  const [aCocina, setACocina] = useState(true);
  const [notaLinea, setNotaLinea] = useState<string | null>(null);
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", direccion: "" });
  const [verCliente, setVerCliente] = useState(false);

  useEffect(() => {
    listarProductos()
      .then((data: Producto[]) => {
        const mios: ProductoCaja[] = [];
        for (const p of data) {
          const pr = p.precios.find((x) => x.puesto_id === puestoId);
          if (pr) mios.push({ id: p.id, nombre: p.nombre, precio: Number(pr.precio), cat: p.subseccion?.trim() || p.seccion?.trim() || null });
        }
        setProductos(mios.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [puestoId]);

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const p of productos) if (p.cat) set.add(p.cat);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [productos]);

  const visibles = useMemo(() => {
    const nq = norm(q.trim());
    return productos.filter((p) => (!nq || norm(p.nombre).includes(nq)) && (!cat || p.cat === cat));
  }, [productos, q, cat]);

  const total = useMemo(
    () => Math.round(lineas.reduce((s, l) => s + l.precio * l.cantidad, 0) * 100) / 100,
    [lineas]
  );
  const piezas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const propinaNum = Math.max(0, Number(propina) || 0);
  const cobrar = Math.round((total + propinaNum) * 100) / 100;

  const pagos = useMemo(() => {
    if (!mixto) return [{ metodo: metodo as string, monto: cobrar }];
    return METODOS
      .map((m) => ({ metodo: m as string, monto: Math.round((Number(montos[m]) || 0) * 100) / 100 }))
      .filter((p) => p.monto > 0);
  }, [mixto, metodo, cobrar, montos]);
  const restante = Math.round((cobrar - pagos.reduce((s, p) => s + p.monto, 0)) * 100) / 100;
  const cambio = metodo === "caja" && !mixto && recibido ? Math.round((Number(recibido) - cobrar) * 100) / 100 : null;

  const agregar = (p: ProductoCaja) =>
    setLineas((prev) => {
      const i = prev.findIndex((l) => l.producto_id === p.id && !l.notas);
      if (i >= 0) {
        const n = [...prev];
        n[i] = { ...n[i], cantidad: n[i].cantidad + 1 };
        return n;
      }
      return [...prev, { key: `${p.id}-${prev.length}`, producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, notas: "" }];
    });

  const cambiarCant = (key: string, delta: number) =>
    setLineas((prev) => prev.flatMap((l) => {
      if (l.key !== key) return [l];
      const c = l.cantidad + delta;
      return c <= 0 ? [] : [{ ...l, cantidad: c }];
    }));

  const limpiar = useCallback(() => {
    setLineas([]); setServicio("local"); setCobrando(false); setMixto(false);
    setMetodo("caja"); setMontos({ caja: "", tarjeta: "", transferencia: "" });
    setRecibido(""); setPropina(""); setACocina(true); setError(null);
    setCliente({ nombre: "", telefono: "", direccion: "" }); setVerCliente(false);
  }, []);

  async function confirmar() {
    setOcupado(true); setError(null);
    try {
      const v = await cobrarMostrador({
        items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, notas: l.notas || null })),
        servicio, pagos, propina: propinaNum, a_cocina: aCocina,
        cliente_nombre: cliente.nombre, cliente_telefono: cliente.telefono, cliente_direccion: cliente.direccion,
      });
      setVenta(v);
      limpiar();
    } catch (e) {
      setError((e as { error?: string })?.error ?? "No se pudo registrar la venta");
    } finally {
      setOcupado(false);
    }
  }

  async function imprimir(v: VentaMostrador) {
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const filas = v.items.map((i) =>
      `<tr><td>${i.cantidad}× ${esc(i.nombre)}${i.notas ? `<div style="color:#666;font-size:11px;font-style:italic">“${esc(i.notas)}”</div>` : ""}</td>` +
      `<td style="text-align:right;vertical-align:top">${money(i.subtotal)}</td></tr>`
    ).join("");
    const html = `<html><body style="font-family:monospace;font-size:13px;padding:16px;max-width:340px">
      <div style="text-align:center;font-weight:bold;font-size:16px">Ticket</div>
      <div style="text-align:center;color:#666">${v.folio != null ? `Folio #${v.folio} · ` : ""}${LABEL_SERVICIO[v.servicio as Servicio] ?? ""}</div>
      <hr style="border:none;border-top:1px dashed #999"/>
      <table style="width:100%;border-collapse:collapse">${filas}</table>
      <hr style="border:none;border-top:1px dashed #999"/>
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:15px"><span>TOTAL</span><span>${money(v.total + v.propina)}</span></div>
      <div style="text-align:center;color:#666;margin-top:16px">¡Gracias por su compra!</div>
    </body></html>`;
    try { await Print.printAsync({ html }); } catch { /* el usuario canceló */ }
  }

  // ── Ticket recién cobrado ────────────────────────────────────────────
  if (venta) {
    return (
      <View style={styles.card}>
        <Text style={styles.ventaLabel}>VENTA REGISTRADA</Text>
        <Text style={styles.ventaTotal}>{money(venta.total + venta.propina)}</Text>
        {venta.folio != null && (
          <Text style={styles.ventaFolio}>
            Folio #{venta.folio} · {LABEL_SERVICIO[venta.servicio as Servicio]}
          </Text>
        )}

        <View style={{ marginTop: 14, gap: 4 }}>
          {venta.items.map((i, n) => (
            <View key={n} style={styles.filaTicket}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.ticketNombre}>{i.cantidad}× {i.nombre}</Text>
                {i.notas ? <Text style={styles.ticketNota}>“{i.notas}”</Text> : null}
              </View>
              <Text style={styles.ticketMonto}>{money(i.subtotal)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.separador} />
        {venta.pagos.map((p) => (
          <View key={p.metodo} style={styles.filaTicket}>
            <Text style={styles.ticketPago}>{LABEL_METODO[p.metodo as Metodo] ?? p.metodo}</Text>
            <Text style={styles.ticketPago}>{money(p.monto)}</Text>
          </View>
        ))}

        {!venta.en_turno && (
          <Text style={styles.avisoTurno}>
            La caja no estaba abierta, así que esta venta no entra a ningún corte. Abre la caja para
            que el efectivo del día cuadre.
          </Text>
        )}

        <View style={styles.fila2}>
          <TouchableOpacity onPress={() => imprimir(venta)} style={[styles.btn, styles.btnGris]}>
            <Text style={styles.btnGrisTxt}>🖨️ Imprimir</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setVenta(null)} style={[styles.btn, styles.btnBrand]}>
            <Text style={styles.btnBrandTxt}>Nueva venta</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (cargando) return <Text style={styles.cargando}>Cargando tus productos…</Text>;

  if (productos.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.vacioTitulo}>🧾</Text>
        <Text style={styles.vacioTxt}>
          Todavía no tienes productos con precio. Cárgalos en Productos y podrás cobrar desde aquí.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Tipo de servicio: cocina no empaca igual para comer aquí que para llevar. */}
      <View style={styles.fila}>
        {SERVICIOS.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => { setServicio(s); if (s === "domicilio") setVerCliente(true); }}
            style={[styles.servBtn, servicio === s && styles.servBtnOn]}
            activeOpacity={0.85}
          >
            <Text style={[styles.servTxt, servicio === s && styles.servTxtOn]}>{LABEL_SERVICIO[s]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SearchBar value={q} onChange={setQ} placeholder="Busca un producto…" />

      {categorias.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          <TouchableOpacity onPress={() => setCat(null)} style={[styles.catChip, !cat && styles.catChipOn]}>
            <Text style={[styles.catTxt, !cat && styles.catTxtOn]}>Todo</Text>
          </TouchableOpacity>
          {categorias.map((c) => (
            <TouchableOpacity key={c} onPress={() => setCat(cat === c ? null : c)} style={[styles.catChip, cat === c && styles.catChipOn]}>
              <Text style={[styles.catTxt, cat === c && styles.catTxtOn]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Cuadrícula: un toque = una pieza. Es la captura más rápida en caja. */}
      <View style={styles.grid}>
        {visibles.map((p) => (
          <TouchableOpacity key={p.id} onPress={() => agregar(p)} style={styles.prod} activeOpacity={0.75}>
            <Text style={styles.prodNombre} numberOfLines={2}>{p.nombre}</Text>
            <Text style={styles.prodPrecio}>{money(p.precio)}</Text>
          </TouchableOpacity>
        ))}
        {visibles.length === 0 && <Text style={styles.cargando}>Sin resultados.</Text>}
      </View>

      {/* ── Ticket en curso ──────────────────────────────────────────── */}
      {lineas.length > 0 && !cobrando && (
        <View style={styles.card}>
          {lineas.map((l) => (
            <View key={l.key}>
              <View style={styles.lineaFila}>
                <Text style={styles.lineaNombre} numberOfLines={1}>{l.nombre}</Text>
                <Text style={styles.lineaMonto}>{money(l.precio * l.cantidad)}</Text>
                <TouchableOpacity onPress={() => cambiarCant(l.key, -1)} style={styles.qtyBtn}><Text style={styles.qtyTxt}>−</Text></TouchableOpacity>
                <Text style={styles.qtyNum}>{l.cantidad}</Text>
                <TouchableOpacity onPress={() => cambiarCant(l.key, 1)} style={styles.qtyBtn}><Text style={styles.qtyTxt}>+</Text></TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNotaLinea(notaLinea === l.key ? null : l.key)}
                  style={[styles.qtyBtn, l.notas ? styles.notaOn : null]}
                  accessibilityLabel="Nota para cocina"
                >
                  <Text style={styles.qtyTxt}>📝</Text>
                </TouchableOpacity>
              </View>
              {(notaLinea === l.key || !!l.notas) && (
                <TextInput
                  value={l.notas}
                  onChangeText={(v) => setLineas((prev) => prev.map((x) => (x.key === l.key ? { ...x, notas: v } : x)))}
                  maxLength={120}
                  placeholder="Sin cebolla, bien cocido…"
                  placeholderTextColor={theme.colors.gray400}
                  style={styles.notaInput}
                />
              )}
            </View>
          ))}
          <View style={styles.fila2}>
            <TouchableOpacity onPress={limpiar} style={[styles.btn, styles.btnGris, { flex: 0, paddingHorizontal: 18 }]}>
              <Text style={styles.btnGrisTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCobrando(true)} style={[styles.btn, styles.btnBrand, styles.btnCobrar]}>
              <Text style={styles.btnBrandTxt}>Cobrar {piezas} {piezas === 1 ? "pieza" : "piezas"}</Text>
              <Text style={styles.btnCobrarTotal}>{money(total)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Cobro ────────────────────────────────────────────────────── */}
      {cobrando && (
        <View style={styles.card}>
          <View style={styles.filaTicket}>
            <Text style={styles.cobroLabel}>Total a cobrar</Text>
            <Text style={styles.cobroTotal}>{money(cobrar)}</Text>
          </View>

          {!mixto ? (
            <>
              <View style={[styles.fila, { marginTop: 10 }]}>
                {METODOS.map((m) => (
                  <TouchableOpacity key={m} onPress={() => setMetodo(m)} style={[styles.metodoBtn, metodo === m && styles.metodoBtnOn]}>
                    <Text style={[styles.metodoTxt, metodo === m && styles.metodoTxtOn]}>{LABEL_METODO[m]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {metodo === "caja" && (
                <View style={[styles.fila, { marginTop: 8, alignItems: "center" }]}>
                  <TextInput
                    value={recibido}
                    onChangeText={(v) => setRecibido(soloNum(v))}
                    keyboardType="decimal-pad"
                    placeholder="¿Con cuánto paga?"
                    placeholderTextColor={theme.colors.gray400}
                    style={[styles.input, { flex: 1 }]}
                  />
                  {cambio != null && cambio >= 0 && (
                    <Text style={styles.cambio}>Cambio {money(cambio)}</Text>
                  )}
                </View>
              )}
              <TouchableOpacity onPress={() => setMixto(true)} style={{ marginTop: 8 }}>
                <Text style={styles.link}>Pagó con dos formas</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.hint}>Escribe cuánto entró por cada vía.</Text>
              {METODOS.map((m) => (
                <View key={m} style={[styles.fila, { alignItems: "center", marginTop: 6 }]}>
                  <Text style={styles.metodoLabel}>{LABEL_METODO[m]}</Text>
                  <TextInput
                    value={montos[m]}
                    onChangeText={(v) => setMontos((prev) => ({ ...prev, [m]: soloNum(v) }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.gray400}
                    style={[styles.input, { flex: 1 }]}
                  />
                </View>
              ))}
              <View style={[styles.filaTicket, { marginTop: 8 }]}>
                <TouchableOpacity onPress={() => setMixto(false)}>
                  <Text style={styles.link}>Una sola forma</Text>
                </TouchableOpacity>
                <Text style={[styles.restante, { color: restante === 0 ? theme.colors.accentDark : theme.colors.dangerDark }]}>
                  {restante === 0 ? "Cuadra" : restante > 0 ? `Faltan ${money(restante)}` : `Sobran ${money(-restante)}`}
                </Text>
              </View>
            </>
          )}

          <View style={[styles.fila, { marginTop: 10, alignItems: "center" }]}>
            <TextInput
              value={propina}
              onChangeText={(v) => setPropina(soloNum(v))}
              keyboardType="decimal-pad"
              placeholder="Propina (opcional)"
              placeholderTextColor={theme.colors.gray400}
              style={[styles.input, { flex: 1 }]}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.hint}>A cocina</Text>
              <Switch value={aCocina} onValueChange={setACocina} trackColor={{ true: theme.colors.brand }} />
            </View>
          </View>

          {(verCliente || servicio === "domicilio") && (
            <View style={{ gap: 6, marginTop: 10 }}>
              <TextInput value={cliente.nombre} onChangeText={(v) => setCliente({ ...cliente, nombre: v })} placeholder="Nombre del cliente" placeholderTextColor={theme.colors.gray400} style={styles.input} />
              <TextInput value={cliente.telefono} onChangeText={(v) => setCliente({ ...cliente, telefono: v.replace(/\D/g, "") })} keyboardType="phone-pad" placeholder="Teléfono" placeholderTextColor={theme.colors.gray400} style={styles.input} />
              {servicio === "domicilio" && (
                <TextInput value={cliente.direccion} onChangeText={(v) => setCliente({ ...cliente, direccion: v })} placeholder="Dirección de entrega" placeholderTextColor={theme.colors.gray400} style={styles.input} />
              )}
            </View>
          )}
          {!verCliente && servicio !== "domicilio" && (
            <TouchableOpacity onPress={() => setVerCliente(true)} style={{ marginTop: 8 }}>
              <Text style={styles.link}>Agregar datos del cliente</Text>
            </TouchableOpacity>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.fila2}>
            <TouchableOpacity onPress={() => setCobrando(false)} style={[styles.btn, styles.btnGris, { flex: 0, paddingHorizontal: 18 }]}>
              <Text style={styles.btnGrisTxt}>Atrás</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmar}
              disabled={ocupado || (mixto && restante !== 0)}
              style={[styles.btn, styles.btnNegro, (ocupado || (mixto && restante !== 0)) && { opacity: 0.5 }]}
            >
              <Text style={styles.btnBrandTxt}>{ocupado ? "Registrando…" : `Cobrar ${money(cobrar)}`}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cargando: { textAlign: "center", color: theme.colors.gray400, paddingVertical: 26, fontSize: 13, width: "100%" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 14, ...theme.shadow.sm },
  fila: { flexDirection: "row", gap: 6 },
  fila2: { flexDirection: "row", gap: 8, marginTop: 12 },
  servBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.colors.gray200, alignItems: "center" },
  servBtnOn: { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand },
  servTxt: { fontSize: 12.5, fontWeight: "800", color: theme.colors.gray500 },
  servTxtOn: { color: "#fff" },
  cats: { gap: 6, paddingVertical: 2 },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.colors.gray200 },
  catChipOn: { backgroundColor: theme.colors.gray900, borderColor: theme.colors.gray900 },
  catTxt: { fontSize: 12, fontWeight: "800", color: theme.colors.gray500 },
  catTxtOn: { color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  prod: {
    width: "48%", backgroundColor: "#fff", borderRadius: 12, borderWidth: 1,
    borderColor: theme.colors.gray200, paddingHorizontal: 11, paddingVertical: 10,
  },
  prodNombre: { fontSize: 13, fontWeight: "600", color: theme.colors.gray800, lineHeight: 17 },
  prodPrecio: { fontSize: 14, fontWeight: "800", color: theme.colors.navy, marginTop: 4, fontVariant: ["tabular-nums"] },
  lineaFila: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  lineaNombre: { flex: 1, minWidth: 0, fontSize: 13.5, color: theme.colors.gray700 },
  lineaMonto: { fontSize: 12, color: theme.colors.gray500, fontVariant: ["tabular-nums"] },
  qtyBtn: { width: 28, height: 28, borderRadius: 999, backgroundColor: theme.colors.gray100, alignItems: "center", justifyContent: "center" },
  notaOn: { backgroundColor: "#FEF3C7" },
  qtyTxt: { fontSize: 14, fontWeight: "800", color: theme.colors.gray700 },
  qtyNum: { width: 20, textAlign: "center", fontSize: 13.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  notaInput: {
    backgroundColor: theme.colors.gray50, borderWidth: 1, borderColor: theme.colors.gray200,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12, marginTop: 4,
  },
  input: {
    borderWidth: 1, borderColor: theme.colors.gray200, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: theme.colors.gray900,
  },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  btnBrand: { backgroundColor: theme.colors.brand },
  btnBrandTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnNegro: { backgroundColor: theme.colors.gray900 },
  btnGris: { backgroundColor: theme.colors.gray100 },
  btnGrisTxt: { color: theme.colors.gray600, fontWeight: "800", fontSize: 14 },
  btnCobrar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  btnCobrarTotal: { color: "#fff", fontWeight: "800", fontSize: 17, fontVariant: ["tabular-nums"] },
  cobroLabel: { fontSize: 14, fontWeight: "800", color: theme.colors.gray800 },
  cobroTotal: { fontSize: 24, fontWeight: "800", color: theme.colors.gray900, fontVariant: ["tabular-nums"] },
  metodoBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.gray100, alignItems: "center" },
  metodoBtnOn: { backgroundColor: theme.colors.gray900 },
  metodoTxt: { fontSize: 12.5, fontWeight: "800", color: theme.colors.gray600 },
  metodoTxtOn: { color: "#fff" },
  metodoLabel: { width: 104, fontSize: 13, color: theme.colors.gray600 },
  cambio: { fontSize: 13.5, fontWeight: "800", color: theme.colors.accentDark },
  hint: { fontSize: 12, color: theme.colors.gray500 },
  link: { fontSize: 12.5, fontWeight: "800", color: theme.colors.navy, textDecorationLine: "underline" },
  restante: { fontSize: 12.5, fontWeight: "800" },
  error: { fontSize: 13, color: theme.colors.dangerDark, marginTop: 8 },
  ventaLabel: { fontSize: 11, fontWeight: "800", color: "#047857", textAlign: "center", letterSpacing: 0.6 },
  ventaTotal: { fontSize: 30, fontWeight: "800", textAlign: "center", color: theme.colors.gray900, fontVariant: ["tabular-nums"], marginTop: 2 },
  ventaFolio: { fontSize: 12, color: theme.colors.gray400, textAlign: "center", marginTop: 2 },
  filaTicket: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  ticketNombre: { fontSize: 13.5, color: theme.colors.gray700 },
  ticketNota: { fontSize: 11.5, color: theme.colors.gray500, fontStyle: "italic" },
  ticketMonto: { fontSize: 13.5, color: theme.colors.gray700, fontVariant: ["tabular-nums"] },
  ticketPago: { fontSize: 13, color: theme.colors.gray500, fontVariant: ["tabular-nums"] },
  separador: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.gray200, marginVertical: 10 },
  avisoTurno: {
    fontSize: 11.5, color: "#92400E", backgroundColor: "#FEF3C7", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, marginTop: 12, lineHeight: 16,
  },
  vacioTitulo: { fontSize: 34, textAlign: "center" },
  vacioTxt: { fontSize: 13, color: theme.colors.gray500, textAlign: "center", lineHeight: 18, marginTop: 8 },
});
