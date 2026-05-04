import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../src/contexts/SessionContext";
import { useKeyboardHeight } from "../src/lib/useKeyboard";
import { checkClienteExiste, type ClienteExisteResp } from "../src/api/auth";
import PinInput from "../src/components/PinInput";

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
    destino: "/(tienda)/pedidos",
  },
  admin: {
    label: "Admin",
    icon: "shield-checkmark-outline",
    title: "Panel Admin",
    subtitle: "Validar pagos y gestionar",
    destino: "/(admin)/pagos",
  },
};

export default function LoginScreen() {
  const { loginCliente, loginConPin } = useSession();
  const router = useRouter();
  const kbHeight = useKeyboardHeight();
  const [rol, setRol] = useState<Rol>("cliente");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Lookup automático del cliente cuando el teléfono cumple 10 dígitos:
  // así sabemos si pedir nombre (cliente nuevo), PIN (cliente con PIN) o
  // solo el teléfono (cliente sin PIN).
  const [lookup, setLookup] = useState<ClienteExisteResp | null>(null);

  useEffect(() => {
    if (rol !== "cliente") { setLookup(null); return; }
    const tel = telefono.replace(/\D/g, "");
    if (tel.length < 10) { setLookup(null); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const data = await checkClienteExiste(tel);
      if (!cancel) setLookup(data);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [telefono, rol]);

  const esClienteNuevo = rol === "cliente" && lookup?.existe === false;
  const esClienteConPin = rol === "cliente" && lookup?.existe === true && lookup.tiene_pin === true;
  const esClienteSinPin = rol === "cliente" && lookup?.existe === true && lookup.tiene_pin === false;

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
    // Si está creando PIN (nuevo o cliente existente sin PIN) exigimos
    // confirmación para evitar quedarse fuera por un dígito mal tecleado.
    const debeConfirmar = rol === "cliente" && (esClienteNuevo || esClienteSinPin);
    if (debeConfirmar && pin !== pinConfirm) {
      setError("Los PINs no coinciden");
      return;
    }
    setLoading(true);
    try {
      if (rol === "cliente") {
        if (esClienteNuevo && !nombre.trim()) { setError("Necesitamos tu nombre para crear tu cuenta"); return; }
        const nombreEnviar = esClienteNuevo ? nombre.trim() : (lookup?.nombre ?? nombre.trim());
        const res = await loginCliente(nombreEnviar, tel, pin);
        if (!res.ok) {
          setError(res.error ?? "Error");
        } else router.replace(cfg.destino);
      } else {
        const res = await loginConPin(rol, tel, pin);
        if (!res.ok) setError(res.error ?? "Error");
        else router.replace(cfg.destino);
      }
    } finally {
      setLoading(false);
    }
  }

  const Content = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(kbHeight + 40, 120) }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.logo}>
        <Ionicons name="storefront" size={56} color="#FF7A2B" />
        <Text style={styles.brand}>Mercadito</Text>
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
          {esClienteConPin && lookup?.nombre
            ? `Hola ${lookup.nombre.split(" ")[0]}, escribe tu PIN`
            : esClienteSinPin && lookup?.nombre
              ? `Bienvenido de vuelta, ${lookup.nombre.split(" ")[0]}`
              : esClienteNuevo
                ? "Es tu primera vez. Cuéntanos tu nombre"
                : cfg.subtitle}
        </Text>

        {/* Teléfono primero para todos los roles. */}
        <View style={styles.inputRow}>
          <Ionicons name="call-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
          <TextInput
            value={telefono}
            onChangeText={setTelefono}
            placeholder="Teléfono / WhatsApp"
            keyboardType="phone-pad"
            style={styles.input}
          />
        </View>

        {/* Nombre solo a clientes nuevos. */}
        {esClienteNuevo && (
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={18} color="#8B7B69" style={styles.inputIcon} />
            <TextInput
              value={nombre}
              onChangeText={setNombre}
              placeholder="Tu nombre"
              style={styles.input}
              autoCapitalize="words"
            />
          </View>
        )}

        {/* PIN obligatorio en todos los roles. Para cliente nuevo o sin PIN,
            pedimos también confirmación porque lo está creando ahora. */}
        {(rol !== "cliente" || esClienteConPin || esClienteSinPin || esClienteNuevo) && (
          <>
            <View style={styles.pinLabelRow}>
              <Ionicons name="lock-closed-outline" size={16} color="#8B7B69" />
              <Text style={styles.pinLabel}>
                {esClienteConPin || rol !== "cliente" ? "PIN de 6 dígitos" : "Crea tu PIN de 6 dígitos"}
              </Text>
            </View>
            <PinInput value={pin} onChange={setPin} length={6} />
            {rol === "cliente" && (esClienteNuevo || esClienteSinPin) && (
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
                  El PIN protege tus pedidos. Guárdalo bien.
                </Text>
              </>
            )}
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (loading || (rol === "cliente" && !lookup)) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading || (rol === "cliente" && !lookup)}
        >
          <Ionicons name="log-in-outline" size={20} color="#fff" />
          <Text style={styles.buttonText}>{loading ? "Entrando…" : "Entrar"}</Text>
        </TouchableOpacity>

        {/* Registro de tienda — CTA importante cuando el rol elegido es
            Tienda. Va antes del olvido de PIN porque para alguien que aún
            no se registra es la acción primaria, no la secundaria. */}
        {rol === "tienda" && (
          <TouchableOpacity
            onPress={() => router.push("/registro-tienda")}
            style={styles.registroBtn}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FF7A2B" />
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
              Linking.openURL(`https://wa.me/5215659163241?text=${txt}`);
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
  safe: { flex: 1, backgroundColor: "#FFF7EB" },
  // Sin flexGrow/justifyContent center: así la forma arranca arriba y el
  // botón "Entrar" queda accesible haciendo scroll cuando el teclado aparece
  // (Android con softwareKeyboardLayoutMode=resize achica el viewport).
  scroll: { padding: 24, paddingTop: 30, paddingBottom: 120 },
  logo: { alignItems: "center", marginBottom: 18 },
  brand: { fontSize: 28, fontWeight: "700", color: "#1F2937", marginTop: 8 },
  rolRow: { flexDirection: "row", gap: 6, marginBottom: 14 },
  rolButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14, borderRadius: 14, backgroundColor: "#FBF6EC", borderWidth: 1, borderColor: "transparent" },
  rolButtonActive: { backgroundColor: "#FF7A2B", borderColor: "#FF7A2B" },
  rolText: { color: "#B8AB99", fontWeight: "500", fontSize: 12 },
  rolTextActive: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 24, elevation: 2, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#1F2937", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#8B7B69", textAlign: "center", marginTop: 4, marginBottom: 18 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  inputIcon: { marginRight: 6 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
  button: { flexDirection: "row", gap: 8, backgroundColor: "#FF7A2B", borderRadius: 999, paddingVertical: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  buttonDisabled: { backgroundColor: "#D4D4D8" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#DC2626", textAlign: "center", marginBottom: 8 },
  pinLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 2, alignSelf: "center" },
  pinLabel: { fontSize: 13, color: "#8B7B69", fontWeight: "600" },
  pinHint: { fontSize: 11, color: "#8B7B69", marginTop: 2, marginBottom: 6, lineHeight: 14, textAlign: "center" },
  forgotLink: { paddingVertical: 10, alignItems: "center" },
  forgotLinkTxt: { color: "#9CA3AF", fontSize: 12, fontWeight: "500" },
  registroBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 12, borderRadius: 999, borderWidth: 1.5, borderColor: "#FF7A2B", backgroundColor: "#fff" },
  registroBtnTxt: { color: "#FF7A2B", fontSize: 14, fontWeight: "700" },
});
