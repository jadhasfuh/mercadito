import { useEffect, useState, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/contexts/SessionContext";
import { getTabScreenOptions } from "../../src/lib/tabStyles";
import { apiFetch } from "../../src/api/client";
import { listarMisMensajes, marcarMensajesLeidos, type Mensaje } from "../../src/api/admin";
import MensajesTiendaModal from "../../src/components/MensajesTiendaModal";
import { DELIVERY_ACTIVO } from "../../src/lib/flags";

interface Puesto { id: string; nombre: string; activo: boolean; aprobado: boolean }

export default function TiendaLayout() {
  const { usuario, loading } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tiendaDesactivada, setTiendaDesactivada] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [verMensajes, setVerMensajes] = useState(false);
  const noLeidos = mensajes.filter((m) => !m.leido).length;

  // Bloqueo "Tienda desactivada" — paridad con web. Si el admin desactivó
  // la tienda, no le dejamos seguir usando los tabs (riesgo de aceptar
  // pedidos que no podrá entregar).
  useEffect(() => {
    if (loading) return;
    // Grace period — evita race con setUsuario post-login (ver comentario
    // idéntico en (admin)/_layout.tsx). El fetch del puesto sí lo dejamos
    // sin delay porque solo corre cuando ya hay usuario válido.
    const t = setTimeout(() => {
      if (!usuario) { router.replace("/login"); return; }
      if (usuario.rol !== "tienda" && usuario.rol !== "repartidor") { router.replace("/(tabs)/home"); return; }
    }, 250);
    if (usuario?.puesto_id) {
      apiFetch<Puesto[]>("/api/puestos").then((puestos) => {
        const mi = puestos.find((p) => p.id === usuario.puesto_id);
        setTiendaDesactivada(!mi);
      }).catch(() => {});
    }
    return () => clearTimeout(t);
  }, [usuario, loading, router]);

  const cargarMensajes = useCallback(() => {
    if (usuario?.rol !== "tienda" || !usuario.puesto_id) return;
    listarMisMensajes().then(setMensajes).catch(() => {});
  }, [usuario]);

  useEffect(() => {
    cargarMensajes();
    const i = setInterval(cargarMensajes, 30000);
    return () => clearInterval(i);
  }, [cargarMensajes]);

  async function abrirMensajes() {
    setVerMensajes(true);
    if (noLeidos > 0) {
      try {
        await marcarMensajesLeidos();
        setMensajes((prev) => prev.map((m) => ({ ...m, leido: true })));
      } catch { /* no-op */ }
    }
  }

  if (tiendaDesactivada) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FCFBFA", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 24, alignItems: "center", maxWidth: 360, width: "100%" }}>
          <Text style={{ fontSize: 48 }}>🚫</Text>
          <Text style={{ fontSize: 18, fontWeight: "800", color: "#1F2937", marginTop: 12 }}>Tienda desactivada</Text>
          <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginTop: 8, lineHeight: 19 }}>
            Tu tienda fue desactivada por el administrador. Contacta a soporte si crees que es un error.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/login")}
            style={{ marginTop: 16, backgroundColor: "#E5E7EB", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 999 }}
          >
            <Text style={{ color: "#6B7280", fontWeight: "700" }}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Sólo el rol tienda recibe mensajes del admin; repartidor no.
  const mostrarBuzon = usuario?.rol === "tienda";

  return (
    <>
      {/* Botón flotante de mensajes — paridad con el 🔔 del header web.
          Posicionado para no chocar con el botón "Solicitar repartidor" del
          tab Pedidos. Solo para rol tienda. */}
      {mostrarBuzon && (
        <TouchableOpacity
          onPress={abrirMensajes}
          activeOpacity={0.85}
          style={{
            position: "absolute",
            top: insets.top + 8,
            right: 12,
            zIndex: 100,
            backgroundColor: "rgba(255,255,255,0.95)",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 4,
            elevation: 3,
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Ionicons name="notifications-outline" size={18} color="#92400E" />
          {noLeidos > 0 && (
            <View style={{ backgroundColor: "#DC2626", borderRadius: 999, paddingHorizontal: 6, minWidth: 18, alignItems: "center" }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{noLeidos}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
      <Tabs screenOptions={getTabScreenOptions(insets.bottom)}>
        <Tabs.Screen
          name="pedidos"
          options={{
            title: "Pedidos",
            tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" size={22} color={color} />,
            // Son los pedidos de reparto de Mercadito. Sin delivery no entra
            // ninguno (los del menú van al WhatsApp del negocio), así que el
            // tab solo confundiría con una lista siempre vacía.
            ...(DELIVERY_ACTIVO ? {} : { href: null as null }),
          }}
        />
        <Tabs.Screen
          name="productos"
          options={{
            title: "Productos",
            tabBarIcon: ({ color }) => <Ionicons name="pricetags-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="mesas"
          options={{
            title: "Mesas",
            tabBarIcon: ({ color }) => <Ionicons name="restaurant-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="citas"
          options={{
            title: "Reservas",
            tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="mi-tienda"
          options={{
            title: "Mi tienda",
            tabBarIcon: ({ color }) => <Ionicons name="storefront-outline" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: "Perfil",
            tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={22} color={color} />,
          }}
        />
      </Tabs>
      <MensajesTiendaModal
        abierto={verMensajes}
        onClose={() => setVerMensajes(false)}
        mensajes={mensajes}
      />
    </>
  );
}
