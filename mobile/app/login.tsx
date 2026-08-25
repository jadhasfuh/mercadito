import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Linking } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { useSession } from "../src/contexts/SessionContext";
import { useKeyboardHeight } from "../src/lib/useKeyboard";
import {
  checkClienteExiste,
  checkUsuarioExiste,
  type ClienteExisteResp,
  type UsuarioExisteResp,
} from "../src/api/auth";
import PinInput from "../src/components/PinInput";
import { MERCADITO_TEL } from "../src/lib/contacto";
import { DELIVERY_ACTIVO } from "../src/lib/flags";

type Rol = "cliente" | "repartidor" | "tienda" | "admin";

const ROL_CONFIG: Record<Rol, {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  destino: string;
}> = {
  cliente: {
    label: "Cliente",
    icon: "person-outline",
    title: "Bienvenido",
    subtitle: "Entra para hacer tu pedido",
    destino: "/(tabs)/home",
  },
  repartidor: {
    label: "Repartidor",
    icon: "bicycle-outline",
    title: "Panel Repartidor",
    subtitle: "Ingresa con tu teléfono y PIN",
    destino: "/(repartidor)/pedidos",
  },
  tienda: {
    label: "Tienda",
    icon: "storefront-outline",
    title: "Mi Tienda",
    subtitle: "Ingresa con el teléfono y PIN",
    destino: DELIVERY_ACTIVO ? "/(tienda)/pedidos" : "/(tienda)/productos",
  },
  admin: {
    label: "Admin",
    icon: "shield-checkmark-outline",
    title: "Panel Admin",
    subtitle: "Validar pagos y gestionar",
    destino: "/(admin)/pagos",
  },
};

// Destinos por rol — fuente única para el redirect post-login.
// La tienda cambia de casa según el flag: sin delivery su tab Pedidos está
// oculto y aterrizaría en una pantalla sin barra (ver lib/flags).
const DESTINO_POR_ROL: Record<string, string> = {
  cliente: "/(tabs)/home",
  repartidor: "/(repartidor)/pedidos",
  tienda: DELIVERY_ACTIVO ? "/(tienda)/pedidos" : "/(tienda)/productos",
  admin: "/(admin)/pagos",
};

export default function LoginScreen() {
  const { loginCliente, loginConPin } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const kbHeight = useKeyboardHeight();

  // Destino post-login para CLIENTE: si vienen con `?redirect=/checkout` (porque
  // tocaron Continuar en carrito sin sesión, o intentaron ver Pedidos), regresamos
  // ahí. Para repartidor/tienda/admin el redirect NO aplica — siempre van a su
  // panel propio según el rol que devolvió el endpoint.
  const redirectTo = typeof params.redirect === "string" ? params.redirect : null;
  const [rol, setRol] = useState<Rol>("cliente");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [codigoReferido, setCodigoReferido] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Guard síncrono anti doble-tap: evita una fila duplicada antes de que el estado deshabilite el botón.
  const enviandoRef = useRef(false);
  // Lookup automático cuando el teléfono cumple 10 dígitos. Para cliente
  // distingue nuevo / con PIN / sin PIN (con nombre). Para tienda/
  // repartidor/admin distingue con PIN vs sin PIN (legacy reseteados):
  // los sin PIN crean uno al primer login (paridad con cliente).
  const [lookup, setLookup] = useState<ClienteExisteResp | UsuarioExisteResp | null>(null);

  useEffect(() => {
    const tel = telefono.replace(/\D/g, "");
    if (tel.length < 10) { setLookup(null); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const data = rol === "cliente"
        ? await checkClienteExiste(tel)
        : await checkUsuarioExiste(tel, rol);
      if (!cancel) setLookup(data);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [telefono, rol]);

  const esClienteNuevo = rol === "cliente" && lookup?.existe === false;
  const esClienteConPin = rol === "cliente" && lookup?.existe === true && lookup.tiene_pin === true;
  const esClienteSinPin = rol === "cliente" && lookup?.existe === true && lookup.tiene_pin === false;
  // Tienda/repartidor/admin sin PIN — cuentas viejas o reseteadas que
  // crean PIN al primer login.
  const esStaffSinPin = rol !== "cliente" && lookup?.existe === true && lookup.tiene_pin === false;
  const esStaffConPin = rol !== "cliente" && lookup?.existe === true && lookup.tiene_pin === true;

  const cfg = ROL_CONFIG[rol];

  async function handleSubmit() {
    setError("");
    const tel = telefono.replace(/\D/g, "");
    if (!/^\d{10}$/.test(tel)) {
      setError("El teléfono debe ser de 10 dígitos");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("El PIN debe ser de 6 dígitos numéricos");
      return;
    }
    // Si está creando PIN (cliente nuevo, cliente sin PIN, o staff
    // legacy sin PIN) exigimos confirmación para evitar quedarse fuera
    // por un dígito mal tecleado.
    const debeConfirmar = esClienteNuevo || esClienteSinPin || esStaffSinPin;
    if (debeConfirmar && pin !== pinConfirm) {
      setError("Los PINs no coinciden");
      return;
    }
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setLoading(true);
    try {
      if (rol === "cliente") {
        if (esClienteNuevo && !nombre.trim()) { setError("Necesitamos tu nombre para crear tu cuenta"); return; }
        const nombreEnviar = esClienteNuevo ? nombre.trim() : (lookup?.nombre ?? nombre.trim());
        const codigoEnviar = esClienteNuevo ? codigoReferido.trim().toUpperCase() : "";
        const res = await loginCliente(nombreEnviar, tel, pin, codigoEnviar);
        if (!res.ok) {
          // Mensaje contextualizado al sub-flujo. El endpoint /api/auth
          // unifica login + registro, pero el usuario está claramente en
          // uno u otro; mostrar siempre "Error al iniciar sesión" confunde
          // en el flujo de registro.
          setError(res.error ?? fallbackError);
        } else router.replace((redirectTo ?? DESTINO_POR_ROL[res.usuario?.rol ?? "cliente"] ?? "/(tabs)/home") as never);
      } else {
        const res = await loginConPin(rol, tel, pin);
        if (!res.ok) { setError(res.error ?? fallbackError); return; }
        // Decidimos destino con el ROL que efectivamente devolvió la API
        // — no con `cfg.destino` (que depende del tab seleccionado en la
        // UI). Si el backend autenticó como otro rol (ej. el tel/PIN
        // pertenece a un repartidor aunque el usuario tap "Admin"), lo
        // mandamos al panel correcto. Y NUNCA aplicamos `redirectTo`
        // aquí — eso es solo para clientes.
        const rolReal = res.usuario?.rol ?? rol;
        router.replace((DESTINO_POR_ROL[rolReal] ?? "/(tabs)/home") as never);
      }
    } finally {
      enviandoRef.current = false;
      setLoading(false);
    }
  }

  // Texto del botón y mensaje de error genérico según sub-flujo. La pantalla
  // sirve para registro Y login, así que "Entrar" / "Error al iniciar sesión"
  // genéricos confunden al cliente nuevo.
  const ctaText = esClienteNuevo
    ? "Crear cuenta"
    : esClienteSinPin || esStaffSinPin
      ? "Crear PIN y entrar"
      : "Entrar";
  const ctaTextLoading = esClienteNuevo
    ? "Creando…"
    : esClienteSinPin || esStaffSinPin
      ? "Guardando…"
      : "Entrando…";
  const fallbackError = esClienteNuevo
    ? "No pudimos crear tu cuenta. Intenta de nuevo."
    : esClienteSinPin || esStaffSinPin
      ? "No pudimos crear tu PIN. Intenta de nuevo."
      : "Error al iniciar sesión. Intenta de nuevo.";

  const Content = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(kbHeight + 40, 120) }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {/* Salida del login sin loguearse — paridad con web. Apple Guideline
          5.1.1(v) exige que el usuario pueda navegar el catálogo sin cuenta;
          este botón regresa al home. Solo lo mostramos al rol "cliente"
          (repartidor/tienda/admin son apps cerradas por contrato). */}
      {rol === "cliente" && (
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => router.replace("/(tabs)/home")}
          accessibilityLabel="Seguir explorando sin iniciar sesión"
        >
          <Ionicons name="arrow-back" size={18} color="#8B7B69" />
          <Text style={styles.skipText}>Seguir explorando</Text>
        </TouchableOpacity>
      )}

      <View style={styles.logo}>
        <Ionicons name="storefront" size={56} color="#ED8E3C" />
        <Text style={styles.brand}>Mercadito</Text>
        {/* Versión visible — para que si el usuario reporta un error,
            pueda decir qué versión tiene desde la pantalla inicial. */}
        <Text style={styles.version}>v{Constants.expoConfig?.version ?? "?"}</Text>
      </View>

      <View style={styles.rolRow}>
        {(Object.keys(ROL_CONFIG) as Rol[]).map((r) => (
          <RolButton
            key={r}
            icon={ROL_CONFIG[r].icon}
            label={ROL_CONFIG[r].label}
            active={rol === r}
            onPress={() => { setRol(r); setError(""); }}
          />
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>{cfg.title}</Text>
        <Text style={styles.subtitle}>
          {(esClienteConPin || esStaffConPin) && lookup?.nombre
            ? `Hola ${lookup.nombre.split(" ")[0]}, escribe tu PIN`
            : esStaffSinPin && lookup?.nombre
              ? `Hola ${lookup.nombre.split(" ")[0]}, tu cuenta necesita un PIN`
              : esClienteSinPin && lookup?.nombre
                ? `Hola ${lookup.nombre.split(" ")[0]} — crea tu PIN`
                : esClienteNuevo
                ? "Es tu primera vez. Cuéntanos tu nombre"
                : cfg.subtitle}
        </Text>

        {/* Teléfono primero para todos los roles. */}
        <View style={styles.inputRow}>
          <Ionicons name="call-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
          <TextInput
            placeholderTextColor="#9C8B72"
            value={telefono}
            onChangeText={setTelefono}
            placeholder="Teléfono / WhatsApp"
            keyboardType="phone-pad"
            style={styles.input}
          />
        </View>

        {/* Nombre solo a clientes nuevos. */}
        {esClienteNuevo && (
          <>
            <View style={styles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
              <TextInput
                placeholderTextColor="#9C8B72"
                value={nombre}
                onChangeText={setNombre}
                placeholder="Tu nombre"
                style={styles.input}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="gift-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
              <TextInput
                placeholderTextColor="#9C8B72"
                value={codigoReferido}
                onChangeText={(v) => setCodigoReferido(v.toUpperCase())}
                placeholder="Código de invitación"
                style={styles.input}
                autoCapitalize="characters"
              />
            </View>
            {codigoReferido.trim().length > 0 && (
              <Text style={styles.codigoHint}>🎁 Si tu amigo te invitó, ambos ganan $20 al hacer tu primer pedido.</Text>
            )}
          </>
        )}

        {/* Cuenta staff sin PIN: por seguridad ya NO se crea el PIN desde el
            login. Pide a Mercadito que te active uno (botón de WhatsApp abajo). */}
        {esStaffSinPin && (
          <View style={styles.avisoBox}>
            <Text style={styles.avisoTxt}>
              Tu cuenta todavía no tiene PIN. Por seguridad ya no se crea desde
              aquí — pídele a Mercadito que te active uno con el botón de abajo.
            </Text>
          </View>
        )}

        {/* PIN obligatorio en todos los roles. Para cliente nuevo, cliente
            sin PIN, o staff legacy sin PIN, pedimos también confirmación
            porque lo está creando ahora. */}
        {(esClienteConPin || esClienteSinPin || esClienteNuevo || esStaffConPin) && (
          <>
            <View style={styles.pinLabelRow}>
              <Ionicons name="lock-closed-outline" size={16} color="#8B7B69" />
              <Text style={styles.pinLabel}>
                {esClienteConPin || esStaffConPin ? "PIN de 6 dígitos" : "Crea tu PIN de 6 dígitos"}
              </Text>
            </View>
            <PinInput value={pin} onChange={setPin} length={6} />
            {(esClienteNuevo || esClienteSinPin) && (
              <>
                <View style={styles.pinLabelRow}>
                  <Ionicons name="lock-closed-outline" size={16} color="#8B7B69" />
                  <Text style={styles.pinLabel}>Confírmalo</Text>
                </View>
                <PinInput
                  value={pinConfirm}
                  onChange={setPinConfirm}
                  length={6}
                  error={pinConfirm.length === pin.length && pinConfirm !== pin}
                />
                <Text style={styles.pinHint}>
                  El PIN protege tu cuenta. Guárdalo bien.
                </Text>
              </>
            )}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Sin PIN staff: no hay submit (no se crea PIN aquí). El botón de
            WhatsApp de abajo es la acción para reactivar la cuenta. */}
        {!esStaffSinPin && (
          <TouchableOpacity
            style={[styles.button, (loading || !lookup) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading || !lookup}
          >
            <Ionicons
              name={esClienteNuevo ? "person-add-outline" : "log-in-outline"}
              size={20}
              color="#fff"
            />
            <Text style={styles.buttonText}>{loading ? ctaTextLoading : ctaText}</Text>
          </TouchableOpacity>
        )}

        {/* Registro de tienda — CTA importante cuando el rol elegido es
            Tienda. Va antes del olvido de PIN porque para alguien que aún
            no se registra es la acción primaria, no la secundaria. */}
        {rol === "tienda" && (
          <TouchableOpacity
            onPress={() => router.push("/registro-tienda")}
            style={styles.registroBtn}
          >
            <Ionicons name="add-circle-outline" size={18} color="#ED8E3C" />
            <Text style={styles.registroBtnTxt}>Registrar mi negocio</Text>
          </TouchableOpacity>
        )}

        {(esClienteConPin || rol === "tienda" || rol === "repartidor" || rol === "admin") && (
          <TouchableOpacity
            onPress={() => {
              const tel = telefono.replace(/\D/g, "");
              const txt = encodeURIComponent(
                `Hola, olvidé mi PIN de Mercadito. Mi teléfono es ${tel || "[escribe tu teléfono]"}. ¿Pueden resetearlo?`
              );
              Linking.openURL(`https://wa.me/${MERCADITO_TEL}?text=${txt}`);
            }}
            style={styles.forgotLink}
          >
            <Text style={styles.forgotLinkTxt}>¿Olvidaste tu PIN? Escríbenos por WhatsApp</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          {Content}
        </KeyboardAvoidingView>
      ) : (
        Content
      )}
    </SafeAreaView>
  );
}

function RolButton({ icon, label, active, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.rolButton, active && styles.rolButtonActive]}>
      <Ionicons name={icon} size={22} color={active ? "#fff" : "#B8AB99"} />
      <Text style={[styles.rolText, active && styles.rolTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FCFBFA" },
  // Sin flexGrow/justifyContent center: así la forma arranca arriba y el
  // botón "Entrar" queda accesible haciendo scroll cuando el teclado aparece
  // (Android con softwareKeyboardLayoutMode=resize achica el viewport).
  scroll: { padding: 24, paddingTop: 30, paddingBottom: 120 },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: "#FBF6EC",
    borderRadius: 999,
  },
  skipText: { color: "#8B7B69", fontWeight: "600", fontSize: 14 },
  logo: { alignItems: "center", marginBottom: 18 },
  brand: { fontSize: 28, fontWeight: "700", color: "#1F2937", marginTop: 8 },
  version: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  rolRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  rolButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FBF6EC", borderWidth: 1, borderColor: "transparent" },
  rolButtonActive: { backgroundColor: "#ED8E3C", borderColor: "#ED8E3C" },
  rolText: { color: "#B8AB99", fontWeight: "500", fontSize: 12 },
  rolTextActive: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#8B7B69", textAlign: "center", marginTop: 4, marginBottom: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  inputIcon: { marginRight: 6 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
  button: { flexDirection: "row", gap: 8, backgroundColor: "#ED8E3C", borderRadius: 999, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: "#D4D4D8" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8 },
  avisoBox: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: 10, padding: 10, marginBottom: 8 },
  avisoTxt: { color: "#92400E", fontSize: 12, lineHeight: 17 },
  pinLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 2, alignSelf: "center" },
  pinLabel: { fontSize: 13, color: "#8B7B69", fontWeight: "600" },
  pinHint: { fontSize: 11, color: "#8B7B69", marginTop: 2, marginBottom: 6, lineHeight: 14, textAlign: "center" },
  codigoHint: { fontSize: 11, color: "#059669", marginTop: -4, marginBottom: 6, lineHeight: 15 },
  forgotLink: { paddingVertical: 10, alignItems: "center" },
  forgotLinkTxt: { color: "#9CA3AF", fontSize: 12, fontWeight: "500" },
  registroBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 12, borderRadius: 999, borderWidth: 1.5, borderColor: "#ED8E3C", backgroundColor: "#fff" },
  registroBtnTxt: { color: "#ED8E3C", fontSize: 14, fontWeight: "700" },
});
