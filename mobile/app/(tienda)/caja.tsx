import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Print from "expo-print";
import { Ionicons } from "@expo/vector-icons";
import ScreenHeader from "../../src/components/ScreenHeader";
import MostradorPanel from "../../src/components/MostradorPanel";
import TicketsPanel from "../../src/components/TicketsPanel";
import { useSession } from "../../src/contexts/SessionContext";
import { theme } from "../../src/lib/theme";
import { fechaHoraMX } from "../../src/lib/fecha";
import {
  estadoCaja, historialCortes, abrirCaja, movimientoCaja, cerrarCaja,
  type EstadoCaja, type CorteCaja, type CorteHistorial,
} from "../../src/api/tienda";

const money = (n: number) => `$${n.toFixed(2)}`;
const fecha = (iso: string) => fechaHoraMX(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const soloNum = (t: string) => t.replace(/[^\d.]/g, "");

/**
 * Corte de caja a ciegas — espejo de src/components/CajaPanel.tsx (web).
 *
 * El cajero abre el turno con un fondo, registra entradas y retiros durante el
 * día y al cerrar declara cuánto contó SIN ver cuánto debería haber. Recién
 * entonces aparece la diferencia, firmada con nombre y hora. Si el esperado se
 * viera antes, el conteo se ajusta solo y el corte no detecta nada.
 */
export default function CajaScreen() {
  const insets = useSafeAreaInsets();
  const { usuario } = useSession();
  // Sólo el dueño ve los cortes pasados: un cajero que los revisa sabe cuánto
  // puede faltar sin que se note.
  const esDueno = usuario?.rol === "tienda" || usuario?.rol === "admin";
  // Vender y cuadrar viven juntos: el cajero cobra en Mostrador y al final del
  // turno hace su corte sin cambiar de pantalla.
  const [sub, setSub] = useState<"mostrador" | "tickets" | "corte">("mostrador");

  const [estado, setEstado] = useState<EstadoCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const [nombreCaja, setNombreCaja] = useState("Caja principal");
  const [fondo, setFondo] = useState("");
  const [movTipo, setMovTipo] = useState<"entrada" | "retiro" | null>(null);
  const [movMonto, setMovMonto] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [cerrando, setCerrando] = useState(false);
  const [declarado, setDeclarado] = useState("");
  const [fondoSiguiente, setFondoSiguiente] = useState("");
  const [nota, setNota] = useState("");
  const [corte, setCorte] = useState<CorteCaja | null>(null);
  const [historial, setHistorial] = useState<CorteHistorial[] | null>(null);

  const cargar = useCallback(() => {
    estadoCaja().then(setEstado).finally(() => setCargando(false));
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const fallo = (e: unknown) =>
    Alert.alert("No se pudo", (e as { error?: string })?.error || "Intenta de nuevo.");

  async function abrir() {
    setOcupado(true);
    try {
      await abrirCaja(nombreCaja.trim() || "Caja principal", Number(fondo) || 0);
      setFondo(""); cargar();
    } catch (e) { fallo(e); } finally { setOcupado(false); }
  }

  async function registrarMov() {
    if (!movTipo) return;
    setOcupado(true);
    try {
      await movimientoCaja(movTipo, Number(movMonto), movMotivo);
      setMovTipo(null); setMovMonto(""); setMovMotivo(""); cargar();
    } catch (e) { fallo(e); } finally { setOcupado(false); }
  }

  async function cerrar() {
    setOcupado(true);
    try {
      const c = await cerrarCaja(Number(declarado), Number(fondoSiguiente) || 0, nota);
      setCorte(c);
      setCerrando(false); setDeclarado(""); setFondoSiguiente(""); setNota("");
      cargar();
    } catch (e) { fallo(e); } finally { setOcupado(false); }
  }

  async function imprimirCorte(c: CorteCaja) {
    const fila = (l: string, v: number) =>
      `<tr><td>${l}</td><td style="text-align:right">${v < 0 ? "-" : ""}${money(Math.abs(v))}</td></tr>`;
    const html = `<html><body style="font-family:monospace;font-size:13px;padding:16px;max-width:340px">
      <div style="text-align:center;font-weight:bold;font-size:16px">Corte de caja</div>
      <div style="text-align:center;color:#666">${c.caja} · ${c.cerrado_por_nombre ?? ""}</div>
      <hr style="border:none;border-top:1px dashed #999"/>
      <table style="width:100%;border-collapse:collapse">
        ${fila("Fondo inicial", c.fondo_inicial)}
        ${fila("Efectivo recibido", c.ventas_efectivo)}
        ${fila("Entradas", c.entradas)}
        ${fila("Retiros", -c.retiros)}
      </table>
      <hr style="border:none;border-top:1px dashed #999"/>
      <table style="width:100%;border-collapse:collapse;font-weight:bold">
        ${fila("Debía haber", c.esperado)}
        ${fila("Contado", c.declarado)}
        ${fila("Diferencia", c.diferencia)}
      </table>
      ${c.nota ? `<div style="margin-top:10px;color:#666">Nota: ${c.nota}</div>` : ""}
    </body></html>`;
    try { await Print.printAsync({ html }); } catch { /* el usuario canceló */ }
  }

  const pad = { padding: 16, paddingBottom: insets.bottom + 32, gap: 12 };

  // ── Resultado del corte recién cerrado ────────────────────────────────
  if (corte) {
    const cuadra = Math.abs(corte.diferencia) < 0.01;
    const falta = corte.diferencia < 0;
    const tono = cuadra ? theme.colors.accentDark : falta ? theme.colors.dangerDark : theme.colors.warningDark;
    const fondoTono = cuadra ? "#ECFDF5" : falta ? "#FEE2E2" : "#FEF3C7";
    return (
      <View style={styles.safe}>
        <ScreenHeader title="Corte de caja" subtitle={corte.caja} />
        <ScrollView contentContainerStyle={pad}>
          <View style={styles.card}>
            <View style={[styles.resultado, { backgroundColor: fondoTono }]}>
              <Text style={[styles.resultadoLabel, { color: tono }]}>
                {cuadra ? "LA CAJA CUADRA" : falta ? "FALTA DINERO" : "SOBRA DINERO"}
              </Text>
              <Text style={[styles.resultadoNum, { color: tono }]}>
                {cuadra ? money(0) : `${falta ? "−" : "+"}${money(Math.abs(corte.diferencia))}`}
              </Text>
            </View>

            <View style={{ marginTop: 16, gap: 5 }}>
              <Fila label="Fondo con el que abriste" valor={corte.fondo_inicial} />
              <Fila label="Efectivo recibido" valor={corte.ventas_efectivo} />
              <Fila label="Entradas de efectivo" valor={corte.entradas} />
              <Fila label="Retiros" valor={-corte.retiros} />
              <View style={styles.separador} />
              <Fila label="Debía haber en caja" valor={corte.esperado} fuerte />
              <Fila label="Contaste" valor={corte.declarado} fuerte />
            </View>

            {corte.propinas > 0 && (
              <Text style={styles.aviso}>
                Del efectivo recibido, {money(corte.propinas)} son propinas. Si las repartes al cerrar,
                regístralo como retiro para que la caja siga cuadrando.
              </Text>
            )}

            {(corte.ventas_tarjeta > 0 || corte.ventas_transferencia > 0) && (
              <View style={{ marginTop: 16, gap: 5 }}>
                <Text style={styles.seccion}>No pasó por el cajón</Text>
                {corte.ventas_tarjeta > 0 && <Fila label="Tarjeta" valor={corte.ventas_tarjeta} />}
                {corte.ventas_transferencia > 0 && <Fila label="Transferencia" valor={corte.ventas_transferencia} />}
              </View>
            )}

            {corte.nota ? <Text style={styles.notaCierre}>📝 {corte.nota}</Text> : null}

            <Text style={styles.aviso}>
              Sólo entra lo que cobraste dentro de Mercadito ({corte.cuentas}{" "}
              {corte.cuentas === 1 ? "cuenta" : "cuentas"}). Lo que cobraste por fuera no lo podemos ver,
              así que no cuenta como faltante.
            </Text>

            <View style={styles.fila2}>
              <TouchableOpacity onPress={() => imprimirCorte(corte)} style={[styles.btn, styles.btnGris]}>
                <Text style={styles.btnGrisTxt}>🖨️ Imprimir</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setCorte(null)} style={[styles.btn, styles.btnBrand]}>
                <Text style={styles.btnBrandTxt}>Listo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (cargando) {
    return (
      <View style={styles.safe}>
        <ScreenHeader title="Caja" />
        <ActivityIndicator color={theme.colors.brand} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const t = estado?.turno;

  return (
    <View style={styles.safe}>
      <ScreenHeader title="Caja" subtitle={t ? t.caja : "Sin turno abierto"} />
      <ScrollView contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
        <View style={styles.switch}>
          {([["mostrador", "Vender"], ["tickets", "Tickets"], ["corte", "Corte"]] as const).map(([id, label]) => (
            <TouchableOpacity
              key={id}
              onPress={() => setSub(id)}
              style={[styles.switchBtn, sub === id && styles.switchBtnOn]}
              activeOpacity={0.85}
            >
              <Text style={[styles.switchTxt, sub === id && styles.switchTxtOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {sub === "mostrador" ? (
          <MostradorPanel puestoId={usuario?.puesto_id ?? ""} />
        ) : sub === "tickets" ? (
          <TicketsPanel negocioNombre={usuario?.nombre ?? ""} />
        ) : !t ? (
          // ── Abrir turno ──────────────────────────────────────────────
          <View style={styles.card}>
            <Text style={styles.titulo}>Abrir caja</Text>
            <Text style={styles.sub}>
              Empieza el turno diciendo con cuánto efectivo arrancas. Al cerrar vas a contar el cajón y
              Mercadito te dice si cuadra — sin enseñarte el número antes.
            </Text>
            <Text style={styles.label}>Nombre de la caja</Text>
            <TextInput
              value={nombreCaja}
              onChangeText={setNombreCaja}
              placeholder="Caja principal"
              placeholderTextColor={theme.colors.gray400}
              style={styles.input}
            />
            <Text style={styles.label}>Fondo de caja (el cambio con el que abres)</Text>
            <TextInput
              value={fondo}
              onChangeText={(v) => setFondo(soloNum(v))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.gray400}
              style={[styles.input, styles.inputMonto]}
            />
            <TouchableOpacity onPress={abrir} disabled={ocupado} style={[styles.btn, styles.btnBrand, { marginTop: 14 }]}>
              <Text style={styles.btnBrandTxt}>{ocupado ? "Abriendo…" : "Abrir caja"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Turno abierto ────────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={styles.cabecera}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.titulo}>{t.caja}</Text>
                  <Text style={styles.sub}>
                    Abierta {fecha(t.abierto_at)}{t.abierto_por_nombre ? ` por ${t.abierto_por_nombre}` : ""}
                  </Text>
                </View>
                <View style={styles.badge}><Text style={styles.badgeTxt}>ABIERTA</Text></View>
              </View>

              <View style={styles.minis}>
                <Mini n={money(t.fondo_inicial)} label="fondo inicial" />
                <Mini n={money(estado?.entradas ?? 0)} label="entradas" />
                <Mini n={money(estado?.retiros ?? 0)} label="retiros" />
              </View>

              {/* El efectivo esperado NO se muestra aquí a propósito. */}
              <Text style={styles.aviso}>
                El efectivo que llevas se te muestra hasta que cierres y cuentes el cajón. Así el corte
                sirve para algo.
              </Text>

              <View style={styles.fila2}>
                <TouchableOpacity onPress={() => setMovTipo("entrada")} style={[styles.btn, styles.btnVerde]}>
                  <Text style={styles.btnVerdeTxt}>+ Entrada</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMovTipo("retiro")} style={[styles.btn, styles.btnRojo]}>
                  <Text style={styles.btnRojoTxt}>− Retiro / gasto</Text>
                </TouchableOpacity>
              </View>

              {movTipo && (
                <View style={styles.formMov}>
                  <Text style={styles.formTitulo}>
                    {movTipo === "entrada" ? "¿Cuánto efectivo entró?" : "¿Cuánto sacaste y para qué?"}
                  </Text>
                  <TextInput
                    value={movMonto}
                    onChangeText={(v) => setMovMonto(soloNum(v))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.gray400}
                    style={[styles.input, styles.inputMonto]}
                  />
                  <TextInput
                    value={movMotivo}
                    onChangeText={setMovMotivo}
                    maxLength={120}
                    placeholder={movTipo === "entrada" ? "Motivo (opcional)" : "Compra de insumos, pago a proveedor…"}
                    placeholderTextColor={theme.colors.gray400}
                    style={styles.input}
                  />
                  <View style={styles.fila2}>
                    <TouchableOpacity onPress={() => setMovTipo(null)} style={[styles.btn, styles.btnGris]}>
                      <Text style={styles.btnGrisTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={registrarMov} disabled={ocupado} style={[styles.btn, styles.btnBrand]}>
                      <Text style={styles.btnBrandTxt}>Registrar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {(estado?.movimientos?.length ?? 0) > 0 && (
              <View style={styles.card}>
                <Text style={styles.seccion}>Movimientos del turno</Text>
                {estado!.movimientos!.map((m) => (
                  <View key={m.id} style={styles.movFila}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.movMotivo}>
                        {m.motivo || (m.tipo === "entrada" ? "Entrada de efectivo" : "Retiro")}
                      </Text>
                      <Text style={styles.movMeta}>
                        {m.usuario_nombre ? `${m.usuario_nombre} · ` : ""}{fecha(m.created_at)}
                      </Text>
                    </View>
                    <Text style={[styles.movMonto, { color: m.tipo === "entrada" ? theme.colors.accentDark : theme.colors.dangerDark }]}>
                      {m.tipo === "entrada" ? "+" : "−"}{money(m.monto)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.card}>
              {!cerrando ? (
                <TouchableOpacity onPress={() => setCerrando(true)} style={[styles.btn, styles.btnNegro]}>
                  <Text style={styles.btnBrandTxt}>Cerrar caja y hacer el corte</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={styles.titulo}>Cuenta el cajón</Text>
                  <Text style={styles.sub}>
                    Escribe cuánto efectivo hay de verdad, contando el fondo. Al guardar te decimos si cuadra.
                  </Text>
                  <TextInput
                    value={declarado}
                    onChangeText={(v) => setDeclarado(soloNum(v))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.gray300}
                    autoFocus
                    style={[styles.input, styles.inputGrande]}
                  />
                  <Text style={styles.label}>¿Cuánto dejas de fondo para el siguiente turno?</Text>
                  <TextInput
                    value={fondoSiguiente}
                    onChangeText={(v) => setFondoSiguiente(soloNum(v))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={theme.colors.gray400}
                    style={[styles.input, styles.inputMonto]}
                  />
                  <TextInput
                    value={nota}
                    onChangeText={setNota}
                    maxLength={200}
                    placeholder="Nota del turno (opcional)"
                    placeholderTextColor={theme.colors.gray400}
                    style={styles.input}
                  />
                  <View style={styles.fila2}>
                    <TouchableOpacity onPress={() => setCerrando(false)} style={[styles.btn, styles.btnGris]}>
                      <Text style={styles.btnGrisTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={cerrar}
                      disabled={ocupado || !declarado}
                      style={[styles.btn, styles.btnNegro, (ocupado || !declarado) && { opacity: 0.5 }]}
                    >
                      <Text style={styles.btnBrandTxt}>{ocupado ? "Cerrando…" : "Cerrar y comparar"}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </>
        )}

        {esDueno && (
          historial === null ? (
            <TouchableOpacity
              onPress={() => historialCortes().then(setHistorial)}
              style={[styles.card, { alignItems: "center", paddingVertical: 14 }]}
            >
              <Text style={styles.verHistorial}>Ver cortes anteriores</Text>
            </TouchableOpacity>
          ) : historial.length === 0 ? (
            <Text style={styles.vacio}>Todavía no has cerrado ningún corte.</Text>
          ) : (
            <View style={styles.card}>
              <Text style={styles.seccion}>Cortes anteriores</Text>
              {historial.map((c) => {
                const dif = c.diferencia ?? 0;
                const cuadra = Math.abs(dif) < 0.01;
                return (
                  <View key={c.id} style={styles.movFila}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.movMotivo}>{c.caja}</Text>
                      <Text style={styles.movMeta}>
                        {fecha(c.cerrado_at)}{c.cerrado_por_nombre ? ` · ${c.cerrado_por_nombre}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[styles.movMonto, {
                        color: cuadra ? theme.colors.accentDark : dif < 0 ? theme.colors.dangerDark : theme.colors.warningDark,
                      }]}>
                        {cuadra ? "Cuadró" : `${dif < 0 ? "−" : "+"}${money(Math.abs(dif))}`}
                      </Text>
                      <Text style={styles.movMeta}>contó {c.declarado != null ? money(c.declarado) : "—"}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        )}

        {!esDueno && (
          <View style={styles.notaRol}>
            <Ionicons name="lock-closed-outline" size={14} color={theme.colors.gray400} />
            <Text style={styles.notaRolTxt}>Los cortes anteriores los ve el dueño del negocio.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <View style={styles.filaDato}>
      <Text style={[styles.filaLabel, fuerte && styles.filaFuerte]}>{label}</Text>
      <Text style={[styles.filaValor, fuerte && styles.filaFuerte]}>
        {valor < 0 ? `−${money(Math.abs(valor))}` : money(valor)}
      </Text>
    </View>
  );
}

function Mini({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniN}>{n}</Text>
      <Text style={styles.miniL}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.cream },
  switch: { flexDirection: "row", gap: 4, backgroundColor: theme.colors.gray100, borderRadius: 999, padding: 4 },
  switchBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  switchBtnOn: { backgroundColor: "#fff", ...theme.shadow.sm },
  switchTxt: { fontSize: 13.5, fontWeight: "800", color: theme.colors.gray500 },
  switchTxtOn: { color: theme.colors.gray900 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, ...theme.shadow.sm },
  cabecera: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  titulo: { fontSize: 16, fontWeight: "800", color: theme.colors.gray800 },
  sub: { fontSize: 12, color: theme.colors.gray500, lineHeight: 17, marginTop: 3 },
  label: { fontSize: 12, fontWeight: "600", color: theme.colors.gray600, marginTop: 12, marginBottom: 5 },
  input: {
    borderWidth: 1, borderColor: theme.colors.gray200, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.colors.gray900,
    marginTop: 6,
  },
  inputMonto: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  inputGrande: { fontSize: 26, fontWeight: "800", fontVariant: ["tabular-nums"], borderWidth: 2, paddingVertical: 12 },
  badge: { backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeTxt: { fontSize: 10, fontWeight: "800", color: "#047857" },
  minis: { flexDirection: "row", gap: 8, marginTop: 14 },
  mini: { flex: 1, backgroundColor: theme.colors.gray50, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9 },
  miniN: { fontSize: 14, fontWeight: "800", color: theme.colors.gray800, fontVariant: ["tabular-nums"] },
  miniL: { fontSize: 10, color: theme.colors.gray400, marginTop: 2 },
  aviso: { fontSize: 11, color: theme.colors.gray400, lineHeight: 15, marginTop: 12 },
  fila2: { flexDirection: "row", gap: 8, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  btnBrand: { backgroundColor: theme.colors.brand },
  btnBrandTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  btnNegro: { backgroundColor: theme.colors.gray900 },
  btnGris: { backgroundColor: theme.colors.gray100 },
  btnGrisTxt: { color: theme.colors.gray600, fontWeight: "800", fontSize: 14 },
  btnVerde: { backgroundColor: "#ECFDF5" },
  btnVerdeTxt: { color: "#047857", fontWeight: "800", fontSize: 14 },
  btnRojo: { backgroundColor: "#FEE2E2" },
  btnRojoTxt: { color: "#B91C1C", fontWeight: "800", fontSize: 14 },
  formMov: { marginTop: 12, borderWidth: 1, borderColor: theme.colors.gray200, borderRadius: 14, padding: 12 },
  formTitulo: { fontSize: 14, fontWeight: "800", color: theme.colors.gray800 },
  seccion: {
    fontSize: 10.5, fontWeight: "800", color: theme.colors.gray400, letterSpacing: 0.5,
    textTransform: "uppercase", marginBottom: 10,
  },
  movFila: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    gap: 12, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.gray100,
  },
  movMotivo: { fontSize: 13.5, color: theme.colors.gray700, fontWeight: "600" },
  movMeta: { fontSize: 11, color: theme.colors.gray400, marginTop: 1 },
  movMonto: { fontSize: 13.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  resultado: { borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  resultadoLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  resultadoNum: { fontSize: 30, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"] },
  separador: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.gray200, marginVertical: 6 },
  filaDato: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  filaLabel: { fontSize: 13.5, color: theme.colors.gray600, flexShrink: 1 },
  filaValor: { fontSize: 13.5, color: theme.colors.gray600, fontVariant: ["tabular-nums"] },
  filaFuerte: { color: theme.colors.gray900, fontWeight: "800" },
  notaCierre: {
    fontSize: 13, color: theme.colors.gray600, backgroundColor: theme.colors.gray50,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 12,
  },
  verHistorial: { fontSize: 14, fontWeight: "800", color: theme.colors.gray600 },
  vacio: { textAlign: "center", color: theme.colors.gray400, paddingVertical: 20, fontSize: 13 },
  notaRol: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingVertical: 8 },
  notaRolTxt: { fontSize: 11.5, color: theme.colors.gray400 },
});
