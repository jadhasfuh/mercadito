"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "@/components/SessionProvider";
import { showNotification, playBeep } from "@/lib/notifications";
import NotificationBanner from "@/components/NotificationBanner";
import Loader from "@/components/Loader";

const MapaTiendasAdmin = dynamic(() => import("@/components/MapaTiendasAdmin"), { ssr: false });
const MapaPedido = dynamic(() => import("@/components/MapaPedido"), { ssr: false });

/** Cada cuánto se refresca solo el panel. Dos minutos: suficiente para
 *  enterarte de un pago o un negocio nuevo sin que la pantalla se te mueva
 *  debajo mientras estás leyendo algo. */
const REFRESCO_MS = 120_000;

type Tab = "resumen" | "finanzas" | "tiendas" | "repartidores" | "anuncios" | "pagos" | "pedidos" | "usuarios" | "soporte";

// PagoPendiente es exactamente el shape de PedidoConItems filtrado.
// Lo reutilizamos directo para poder pasarlo al componente PedidoDesglose.
import type { PedidoConItems } from "@/lib/types";
import PedidoDesglose from "@/components/PedidoDesglose";
import PanelUsuarios from "@/components/PanelUsuarios";
import IngresoManualModal from "@/components/IngresoManualModal";
import { labelEstado, type EstadoPedido } from "@/lib/estadoPedido";
import { fechaHoraMX, diaCortoMX } from "@/lib/fecha";
import { DELIVERY_ACTIVO } from "@/lib/flags";
import AdminResumenMenus from "@/components/AdminResumenMenus";
import AdminSoporte from "@/components/AdminSoporte";
import { confirmar, avisar, preguntar } from "@/components/Dialogos";
import { esPinFuerte, esPinValido, PIN_MENSAJE, PIN_DEBIL_MENSAJE } from "@/lib/validators";
type PagoPendiente = PedidoConItems & { comprobante_pago: string | null };

interface Stats {
  totales: {
    total_pedidos: number;
    entregados: number;
    cancelados: number;
    activos: number;
    ventas_total: number;
    subtotal_productos: number;
    ingresos_envio: number;
    ingresos_comisiones: number;
    ingresos_manuales: number;
    clientes_unicos: number;
  };
  ventasPorDia: { fecha: string; pedidos: number; total: number; envios: number; manuales?: number }[];
  ventasPorTienda: { puesto_id: string; puesto_nombre: string; pedidos: number; total_vendido: number; comision_total: number }[];
  ventasPorRepartidor: { repartidor: string; pedidos_entregados: number; total: number; envios: number }[];
  topProductos: { producto: string; cantidad_total: number; total_vendido: number }[];
  tiendasPendientes: { id: string; nombre: string; descripcion: string; nombre_dueno: string; telefono_dueno: string; usuario_id: string }[];
  tiendasActivas: { id: string; nombre: string; descripcion: string; activo: boolean; lat: number | null; lng: number | null; ubicacion: string | null; telefono_contacto: string | null; ciudad?: string; usuario_id: string; nombre_dueno: string; telefono_dueno: string; rol_dueno: string; total_productos: number; esServicio?: boolean; planInfo?: { estado: "trial" | "pro" | "vencido"; dias_restantes: number; hasta: string | null } | null }[];
  ingresosManuales: {
    total: number;
    count: number;
    por_repartidor: { repartidor: string; ventas: number; total: number }[];
    recientes: {
      id: string;
      tipo: "tienda" | "mandado";
      monto: number;
      metodo_pago: string;
      detalle: string | null;
      created_at: string;
      cliente_nombre: string | null;
      cliente_telefono: string | null;
      repartidor_nombre: string;
      puesto_nombre: string | null;
    }[];
  };
}

export default function AdminPage() {
  const { usuario, loading: sessionLoading, logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (!usuario || usuario.rol !== "admin") router.replace("/admin/login");
  }, [usuario, sessionLoading, router]);

  if (sessionLoading || !usuario || usuario.rol !== "admin") {
    return <Loader fullScreen texto={sessionLoading ? "Cargando…" : "Redirigiendo…"} />;
  }

  return <AdminDashboard onLogout={logout} />;
}

interface Anuncio {
  id: string;
  titulo: string;
  mensaje: string;
  tipo: string;
  activo: boolean;
  imagen?: string | null;
  link?: string | null;
  created_at: string;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("resumen");
  // Badge de soporte: cuántos mensajes de negocios están sin contestar. Se
  // consulta al entrar para que el admin lo vea sin abrir el tab.
  const [soporteSinLeer, setSoporteSinLeer] = useState(0);
  useEffect(() => {
    if (DELIVERY_ACTIVO) return;
    fetch("/api/mensajes/hilos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSoporteSinLeer(Number(d.sin_leer_total) || 0); })
      .catch(() => {});
  }, [tab]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showIngresoModal, setShowIngresoModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const prevPendientesRef = useRef(0);
  // Periodo del dashboard (1 semana / 15 días / 1 mes), igual que el móvil.
  const [dias, setDias] = useState(7);
  const diasRef = useRef(7);
  diasRef.current = dias;

  // Announcements state
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [nuevoAnuncioTitulo, setNuevoAnuncioTitulo] = useState("");
  const [nuevoAnuncioMensaje, setNuevoAnuncioMensaje] = useState("");
  const [nuevoAnuncioTipo, setNuevoAnuncioTipo] = useState("general");
  const [nuevoAnuncioImagen, setNuevoAnuncioImagen] = useState<string | null>(null);
  const [nuevoAnuncioLink, setNuevoAnuncioLink] = useState("");
  const [creandoAnuncio, setCreandoAnuncio] = useState(false);

  // Messaging state
  const [mensajePuesto, setMensajePuesto] = useState<string | null>(null); // puesto_id to message
  const [mensajeTexto, setMensajeTexto] = useState("");
  const [dandoPrueba, setDandoPrueba] = useState(false);
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);

  // Store detail view
  const [tiendaSeleccionada, setTiendaSeleccionada] = useState<string | null>(null);

  // Pagos pendientes
  const [pagosPendientes, setPagosPendientes] = useState<PagoPendiente[]>([]);
  const [comprobanteZoom, setComprobanteZoom] = useState<string | null>(null);
  const prevPagosPendientesRef = useRef(0);

  // Liquidaciones de repartidores (saldo = lo que deben a Mercadito).
  type RepartidorSaldo = { id: string; nombre: string; telefono: string; ciudad: string; activo: boolean; repartidor_confianza: boolean; total_cargos: string; total_abonos: string; saldo: string };
  const [liquidaciones, setLiquidaciones] = useState<RepartidorSaldo[]>([]);

  // Historial de pedidos (admin ve todo)
  const [historialPedidos, setHistorialPedidos] = useState<PedidoConItems[]>([]);
  const [historialEstado, setHistorialEstado] = useState<"todos" | "entregado" | "cancelado" | "activos">("todos");
  const [historialLoading, setHistorialLoading] = useState(false);

  // Cuentas por cobrar a tiendas (B2B envíos absorbidos por la tienda).
  // Se muestra en la pestaña Finanzas. Default: últimos 7 días = corte
  // semanal típico para pasarles cuenta los lunes.
  const [cuentasTienda, setCuentasTienda] = useState<{
    dias: number;
    total_general: number;
    tiendas: Array<{
      tienda_id: string;
      tienda_nombre: string;
      telefono_contacto: string | null;
      num_pedidos: number;
      total_a_cobrar: number;
      primer_pedido: string;
      ultimo_pedido: string;
    }>;
  } | null>(null);
  const [cuentasDias, setCuentasDias] = useState<7 | 30>(7);

  // Aporte de tiendas foráneas al envío ($20 cuando no hay repartidor local).
  type AporteTienda = { id: string; nombre: string; ciudad: string; telefono_contacto: string | null; num_pedidos: number; total_a_cobrar: string };
  const [aporteTiendas, setAporteTiendas] = useState<AporteTienda[]>([]);

  async function fetchAporteTiendas() {
    try {
      const res = await fetch("/api/admin/aporte-tiendas");
      if (res.ok) setAporteTiendas(await res.json());
    } catch { /* ignore */ }
  }

  async function darPruebaATodos() {
    if (!(await confirmar({
      emoji: "🎁",
      titulo: "¿Darles la prueba completa a todos los negocios?",
      mensaje: "A los que ya la tenían corriendo se les reinicia desde hoy, así todos quedan parejos.",
      ok: "Sí, dársela a todos",
    }))) return;
    setDandoPrueba(true);
    try {
      const res = await fetch("/api/admin/plan-todos", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { avisar({ emoji: "😕", titulo: "No se pudo activar", mensaje: d?.error }); return; }
      const n = Number(d?.negocios ?? 0);
      avisar({
        emoji: "🎁",
        titulo: n === 1 ? "Listo, 1 negocio con la prueba activa" : `Listo, ${n} negocios con la prueba activa`,
        mensaje: `A todos les corre desde hoy y les vence en ${d?.dias ?? ""} días.`,
      });
      fetchStats();
    } finally {
      setDandoPrueba(false);
    }
  }

  async function marcarAportePagado(puestoId: string, nombre: string) {
    if (!(await confirmar({
      emoji: "💸",
      titulo: `¿${nombre} ya pagó su aporte de envío?`,
      mensaje: "Lo marcamos como pagado y sale de la lista de pendientes.",
      ok: "Sí, ya pagó",
    }))) return;
    const res = await fetch("/api/admin/aporte-tiendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puesto_id: puestoId }),
    });
    if (res.ok) fetchAporteTiendas(); else avisar({ emoji: "😕", titulo: "No se pudo marcar como pagado." });
  }

  useEffect(() => {
    if (tab !== "finanzas") return;
    fetch(`/api/admin/cuentas-tienda?dias=${cuentasDias}`)
      .then((r) => r.json())
      .then(setCuentasTienda)
      .catch(() => setCuentasTienda(null));
    fetchAporteTiendas();
  }, [tab, cuentasDias]);

  async function fetchHistorialPedidos() {
    setHistorialLoading(true);
    try {
      const res = await fetch("/api/pedidos");
      if (!res.ok) return;
      const data: PedidoConItems[] = await res.json();
      setHistorialPedidos(data);
    } catch (e) {
      console.error("[fetchHistorialPedidos]", e);
    } finally {
      setHistorialLoading(false);
    }
  }

  async function fetchPagosPendientes() {
    try {
      const res = await fetch("/api/pedidos?estado=pendiente");
      if (!res.ok) return;
      const pedidos: PagoPendiente[] = await res.json();
      const pendientes = pedidos.filter((p) => p.metodo_pago === "transferencia" && !p.pago_validado_at);
      if (prevPagosPendientesRef.current > 0 && pendientes.length > prevPagosPendientesRef.current) {
        playBeep(900, 0.4);
        showNotification("Mercadito - Nuevo pago por validar", "Hay un comprobante nuevo para validar");
      }
      prevPagosPendientesRef.current = pendientes.length;
      setPagosPendientes(pendientes);
    } catch (e) {
      console.error("[fetchPagosPendientes]", e);
    }
  }

  async function validarPago(pedidoId: string) {
    if (!(await confirmar({
      emoji: "✅",
      titulo: "¿El pago es válido?",
      mensaje: "Le avisamos al cliente y al equipo en cuanto lo confirmes.",
      ok: "Sí, validarlo",
    }))) return;
    const res = await fetch(`/api/pedidos/${pedidoId}/validar-pago`, { method: "POST" });
    if (res.ok) {
      playBeep(900, 0.2);
      showNotification("Mercadito", "Pago validado ✓");
      fetchPagosPendientes();
    } else {
      const err = await res.json().catch(() => ({}));
      avisar({ emoji: "😕", titulo: "No se pudo validar el pago", mensaje: err?.error });
    }
  }

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  async function fetchStats() {
    setLoading(true);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hastaD = new Date();
    const desdeD = new Date();
    desdeD.setDate(desdeD.getDate() - diasRef.current + 1);
    const res = await fetch(`/api/admin/stats?desde=${ymd(desdeD)}&hasta=${ymd(hastaD)}`);
    if (res.ok) {
      const data = await res.json();

      // Notify on new pending stores
      const pendientes = data.tiendasPendientes?.length || 0;
      if (prevPendientesRef.current > 0 && pendientes > prevPendientesRef.current) {
        playBeep(700, 0.4);
        showNotification(
          "Mercadito - Nueva tienda pendiente",
          "Hay una nueva tienda esperando aprobacion",
          "/admin"
        );
      }
      prevPendientesRef.current = pendientes;

      setStats(data);
    }
    setLoading(false);
  }

  // Auto-refresh del panel. Estaba en 30s (y los pagos en 15s): con la
  // operación de hoy eso no aporta datos nuevos y sí se siente como
  // parpadeo constante mientras trabajas dentro de una pestaña.
  useEffect(() => {
    const interval = setInterval(fetchStats, REFRESCO_MS);
    return () => clearInterval(interval);
  }, []);

  async function fetchAnuncios() {
    const res = await fetch("/api/anuncios");
    if (res.ok) setAnuncios(await res.json());
  }

  async function crearAnuncio() {
    if (!nuevoAnuncioTitulo || !nuevoAnuncioMensaje) return;
    setCreandoAnuncio(true);
    const res = await fetch("/api/anuncios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: nuevoAnuncioTitulo,
        mensaje: nuevoAnuncioMensaje,
        tipo: nuevoAnuncioTipo,
        imagen: nuevoAnuncioImagen,
        link: nuevoAnuncioLink || null,
      }),
    });
    if (res.ok) {
      setNuevoAnuncioTitulo("");
      setNuevoAnuncioMensaje("");
      setNuevoAnuncioImagen(null);
      setNuevoAnuncioLink("");
      fetchAnuncios();
    }
    setCreandoAnuncio(false);
  }

  async function handleAnuncioImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Comprimimos a 1024 px max para no inflar la DB con banners de 4MB.
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const max = 1024;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setNuevoAnuncioImagen(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = String(ev.target?.result || "");
    };
    reader.readAsDataURL(f);
  }

  async function toggleAnuncio(id: string, activo: boolean) {
    await fetch("/api/anuncios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, activo }),
    });
    fetchAnuncios();
  }

  async function eliminarAnuncio(id: string) {
    if (!(await confirmar({
      emoji: "🗑️",
      titulo: "¿Eliminar este anuncio?",
      mensaje: "Deja de aparecer para los clientes.",
      ok: "Sí, eliminarlo",
      peligro: true,
    }))) return;
    await fetch("/api/anuncios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAnuncios();
  }

  async function enviarMensaje(puestoId: string) {
    if (!mensajeTexto.trim()) return;
    setEnviandoMensaje(true);
    const res = await fetch("/api/mensajes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para_puesto_id: puestoId, mensaje: mensajeTexto }),
    });
    if (res.ok) {
      setMensajeTexto("");
      setMensajePuesto(null);
      avisar({ emoji: "📨", titulo: "Mensaje enviado." });
    }
    setEnviandoMensaje(false);
  }

  // Fetch announcements when tab switches
  useEffect(() => {
    if (tab === "anuncios") fetchAnuncios();
    if (tab === "pagos") fetchPagosPendientes();
    if (tab === "pedidos") fetchHistorialPedidos();
    if (tab === "repartidores") fetchLiquidaciones();
  }, [tab]);

  async function fetchLiquidaciones() {
    try {
      const res = await fetch("/api/admin/liquidaciones");
      if (res.ok) setLiquidaciones(await res.json());
    } catch { /* ignore */ }
  }

  async function registrarAbono(repartidorId: string, nombre: string, saldo: number) {
    const txt = await preguntar({
      emoji: "💵",
      titulo: `¿Cuánto pagó ${nombre}?`,
      mensaje: `Ahorita trae un saldo de $${saldo.toFixed(0)}.`,
      valor: saldo.toFixed(0),
      tipo: "numero",
      ok: "Registrar abono",
    });
    if (txt == null) return;
    const monto = Number(txt);
    if (!isFinite(monto) || monto <= 0) { avisar({ emoji: "🔢", titulo: "Ese monto no es válido", mensaje: "Escribe una cantidad mayor a cero." }); return; }
    const res = await fetch("/api/admin/liquidaciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repartidor_id: repartidorId, monto }),
    });
    if (res.ok) fetchLiquidaciones(); else avisar({ emoji: "😕", titulo: "No se pudo registrar el abono." });
  }

  async function actualizarRepartidor(repartidorId: string, cambios: { ciudad?: string; repartidor_confianza?: boolean; activo?: boolean }) {
    const res = await fetch("/api/admin/liquidaciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repartidor_id: repartidorId, ...cambios }),
    });
    if (res.ok) fetchLiquidaciones(); else avisar({ emoji: "😕", titulo: "No se pudo actualizar." });
  }

  // Poll para pagos pendientes aunque no estes en la tab (para el badge y sonido).
  useEffect(() => {
    fetchPagosPendientes();
    const i = setInterval(fetchPagosPendientes, REFRESCO_MS);
    return () => clearInterval(i);
  }, []);

  async function aprobarTienda(puestoId: string, aprobado: boolean) {
    const res = await fetch("/api/tiendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puesto_id: puestoId, aprobado }),
    });
    if (res.ok) fetchStats();
  }

  async function cambiarCiudadTienda(puestoId: string, ciudad: string) {
    const res = await fetch("/api/tiendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puesto_id: puestoId, ciudad }),
    });
    if (res.ok) fetchStats();
  }

  async function rechazarTienda(puestoId: string, nombre: string) {
    if (!(await confirmar({
      emoji: "⚠️",
      titulo: `¿Rechazar y eliminar "${nombre}"?`,
      mensaje:
        "Se borra la tienda, sus productos y la cuenta del dueño. No se puede deshacer.\n\n" +
        "Eso sí, el dueño puede volver a registrarse con los datos correctos.",
      ok: "Sí, rechazarla",
      peligro: true,
    }))) return;
    const res = await fetch("/api/tiendas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puesto_id: puestoId }),
    });
    if (res.ok) {
      fetchStats();
    } else {
      const err = await res.json().catch(() => ({}));
      avisar({ emoji: "😕", titulo: "No se pudo rechazar la tienda", mensaje: err?.error });
    }
  }

  async function activarPlan(puestoId: string, action: "pro" | "trial" | "cancelar", nombre: string) {
    const labels: Record<string, string> = { pro: "activar Pro 1 mes", trial: "reiniciar la prueba gratis", cancelar: "vencer el acceso ahora" };
    if (!(await confirmar({
      emoji: action === "cancelar" ? "🚫" : "🎁",
      titulo: `¿${labels[action][0].toUpperCase()}${labels[action].slice(1)} para ${nombre}?`,
      ok: "Sí, adelante",
      peligro: action === "cancelar",
    }))) return;
    const res = await fetch("/api/admin/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ puesto_id: puestoId, action, meses: 1 }),
    });
    if (res.ok) fetchStats();
    else avisar({ emoji: "😕", titulo: "No se pudo actualizar el plan." });
  }

  async function resetPin(usuarioId: string, nombre: string) {
    const nuevoPin = await preguntar({
      emoji: "🔑",
      titulo: `Nuevo PIN para ${nombre}`,
      mensaje: "Son 6 dígitos, solo números. Evita los obvios (123456, 111111…): el sistema los rechaza.",
      tipo: "pin",
      placeholder: "······",
      ok: "Guardar PIN",
    });
    if (nuevoPin === null) return;
    if (!esPinValido(nuevoPin)) { avisar({ emoji: "🔢", titulo: PIN_MENSAJE, mensaje: "Solo números, sin letras." }); return; }
    if (!esPinFuerte(nuevoPin)) { avisar({ emoji: "🔓", titulo: "Ese PIN es muy fácil de adivinar", mensaje: PIN_DEBIL_MENSAJE }); return; }
    const res = await fetch("/api/admin/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario_id: usuarioId, nuevo_pin: nuevoPin }),
    });
    if (res.ok) {
      avisar({ emoji: "🔑", titulo: `Listo, el PIN de ${nombre} ahora es ${nuevoPin}`, mensaje: "Pásaselo para que pueda entrar." });
    } else {
      // Antes decía solo "No se pudo cambiar el PIN" y se comía el motivo: el
      // servidor rechaza los PIN fáciles de adivinar y desde el panel eso se
      // veía como una falla sin explicación.
      const d = await res.json().catch(() => ({}));
      avisar({ emoji: "😕", titulo: "No se pudo cambiar el PIN", mensaje: d?.error });
    }
  }

  const t = stats?.totales;
  // Ganancia = envíos pedidos + comisiones + ingresos manuales (capturas
  // del repartidor por WhatsApp/mandados — ya son puro margen Mercadito).
  // Pago a tiendas = subtotal de productos - comisiones (las manuales no
  // tocan tiendas porque no pasan por items de catálogo).
  const gananciaEnvios = t?.ingresos_envio ?? 0;
  const gananciaComisiones = t?.ingresos_comisiones ?? 0;
  const gananciaManuales = t?.ingresos_manuales ?? 0;
  const gananciaTotal = gananciaEnvios + gananciaComisiones + gananciaManuales;
  const pagoTiendas = (t?.subtotal_productos ?? 0) - gananciaComisiones;

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Mercadito" className="h-8 w-8 rounded-lg" />
            <h1 className="text-lg font-bold">Admin Mercadito</h1>
          </div>
          <button onClick={onLogout} className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-lg mx-auto flex bg-white border-b sticky top-14 z-30 overflow-x-auto">
        {/* Sin delivery no hay pedidos que despachar, ni pagos de repartidor
            que validar, ni equipo de reparto, ni comisiones que cuadrar: esos
            cuatro tabs quedaban vacíos o mostrando historia congelada. El
            panel se reduce a lo que sí se opera hoy. */}
        {(DELIVERY_ACTIVO
          ? [
              { id: "resumen" as Tab, label: "Resumen", icon: "📊" },
              { id: "pagos" as Tab, label: "Pagos", icon: "🏦", badge: pagosPendientes.length || undefined },
              { id: "pedidos" as Tab, label: "Pedidos", icon: "📦" },
              { id: "finanzas" as Tab, label: "Finanzas", icon: "💰" },
              { id: "tiendas" as Tab, label: "Tiendas", icon: "🏪", badge: stats?.tiendasPendientes.length || undefined },
              { id: "repartidores" as Tab, label: "Equipo", icon: "🛵" },
              { id: "anuncios" as Tab, label: "Anuncios", icon: "📢" },
              { id: "usuarios" as Tab, label: "Usuarios", icon: "👥" },
            ]
          : [
              { id: "resumen" as Tab, label: "Resumen", icon: "📊" },
              { id: "soporte" as Tab, label: "Soporte", icon: "💬", badge: soporteSinLeer || undefined },
              { id: "tiendas" as Tab, label: "Negocios", icon: "🏪", badge: stats?.tiendasPendientes.length || undefined },
              { id: "usuarios" as Tab, label: "Usuarios", icon: "👥" },
              { id: "anuncios" as Tab, label: "Avisos", icon: "📢" },
            ]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-center font-bold text-xs border-b-2 transition-colors relative min-w-0 ${
              tab === t.id ? "border-brand text-brand-dark" : "border-transparent text-gray-400"
            }`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="block text-[10px] mt-0.5">{t.label}</span>
            {t.badge ? (
              <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 pb-8">
        <div className="mt-3">
          <NotificationBanner mensaje="Activa las notificaciones para saber cuando se registre una nueva tienda" />
        </div>
        {loading ? (
          <Loader texto="Cargando datos…" />
        ) : !stats ? (
          <div className="text-center py-12 text-gray-400">Error al cargar</div>
        ) : (
          <>
            {/* ══════════════ TAB: RESUMEN ══════════════ */}
            {/* Sin delivery, el resumen de ventas/comisiones/envíos no mide
                nada: se sustituye por suscripciones, cobros por vencer y
                actividad de menús. El de abajo vuelve con el flag. */}
            {tab === "resumen" && !DELIVERY_ACTIVO && <AdminResumenMenus />}
            {tab === "soporte" && <AdminSoporte />}
            {tab === "resumen" && DELIVERY_ACTIVO && (
              <div className="mt-4">
                {/* Periodo (1 semana / 15 días / 1 mes), igual que el móvil */}
                <div className="flex gap-2 mb-3">
                  {[{ d: 7, l: "1 semana" }, { d: 15, l: "15 días" }, { d: 30, l: "1 mes" }].map((p) => (
                    <button
                      key={p.d}
                      onClick={() => setDias(p.d)}
                      className={`flex-1 py-2 rounded-full text-sm font-bold transition-colors ${dias === p.d ? "bg-brand text-white" : "bg-white text-gray-500"}`}
                    >
                      {p.l}
                    </button>
                  ))}
                </div>

                {/* Ganancia destacada del periodo */}
                <div className="bg-white rounded-2xl p-5 text-center shadow-sm mb-4">
                  <p className="text-xs text-gray-400">Ganancia Mercadito</p>
                  <p className="text-3xl font-extrabold text-green-600 mt-1">
                    ${(t!.ingresos_envio + t!.ingresos_comisiones + (t!.ingresos_manuales ?? 0)).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Ventas totales ${t!.ventas_total.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                  </p>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-navy">{t!.entregados}</p>
                    <p className="text-xs text-gray-400">Pedidos entregados</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-green-600">${t!.ventas_total.toFixed(0)}</p>
                    <p className="text-xs text-gray-400">Ventas totales</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-amber-600">{t!.activos}</p>
                    <p className="text-xs text-gray-400">Pedidos activos</p>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-3xl font-bold text-purple-600">{t!.clientes_unicos}</p>
                    <p className="text-xs text-gray-400">Clientes</p>
                  </div>
                </div>

                {/* Quick P&L */}
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <h3 className="font-bold text-gray-700 mb-3">Resumen financiero</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ventas totales</span>
                      <span className="font-bold">${t!.ventas_total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pago a tiendas (productos)</span>
                      <span className="font-bold text-red-600">-${pagoTiendas.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2">
                      <span className="text-gray-500">Ganancia envios</span>
                      <span className="font-bold text-green-600">${gananciaEnvios.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Ganancia comisiones</span>
                      <span className="font-bold text-green-600">${gananciaComisiones.toFixed(2)}</span>
                    </div>
                    {gananciaManuales > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Ingresos manuales</span>
                        <span className="font-bold text-green-600">${gananciaManuales.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2">
                      <span className="font-bold text-gray-700">Ganancia total</span>
                      <span className="font-bold text-green-600">${gananciaTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Top products */}
                {stats.topProductos.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-gray-700 mb-3">Productos más vendidos</h3>
                    <div className="space-y-2">
                      {stats.topProductos.map((p, i) => (
                        <div key={p.producto} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs bg-gray-100 text-gray-500 w-6 h-6 rounded-full flex items-center justify-center font-bold">
                              {i + 1}
                            </span>
                            <span className="text-sm text-gray-700">{p.producto}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-gray-700">${p.total_vendido.toFixed(0)}</span>
                            <span className="text-xs text-gray-400 ml-1">({p.cantidad_total}u)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={fetchStats}
                  className="w-full mt-4 py-3 border-2 border-brand text-brand-dark rounded-full font-medium active:scale-95 transition-transform"
                >
                  Actualizar datos
                </button>
              </div>
            )}

            {/* ══════════════ TAB: FINANZAS ══════════════ */}
            {tab === "finanzas" && (
              <div className="mt-4">
                {/* Breakdown */}
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <h3 className="font-bold text-gray-700 mb-3">Desglose de ingresos</h3>
                  <div className="space-y-3">
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">GANANCIA ENVIOS</p>
                      <p className="text-2xl font-bold text-green-700">${gananciaEnvios.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">GANANCIA COMISIONES</p>
                      <p className="text-2xl font-bold text-green-700">${gananciaComisiones.toFixed(2)}</p>
                    </div>
                    {gananciaManuales > 0 && (
                      <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-xs text-green-600 font-medium">INGRESOS MANUALES</p>
                        <p className="text-2xl font-bold text-green-700">${gananciaManuales.toFixed(2)}</p>
                      </div>
                    )}
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-xs text-green-600 font-medium">GANANCIA TOTAL</p>
                      <p className="text-2xl font-bold text-green-700">${gananciaTotal.toFixed(2)}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-xs text-red-600 font-medium">PAGO A TIENDAS (productos)</p>
                      <p className="text-2xl font-bold text-red-700">${pagoTiendas.toFixed(2)}</p>
                    </div>
                    <div className="bg-navy-50 rounded-lg p-3">
                      <p className="text-xs text-navy font-medium">TOTAL COBRADO</p>
                      <p className="text-2xl font-bold text-navy">${t!.ventas_total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Aporte de tiendas foráneas al envío ($20/pedido cuando no
                    hay repartidor local). Cuenta por cobrar aparte del B2B. */}
                {aporteTiendas.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                    <h3 className="font-bold text-gray-700">Aporte de tiendas foráneas</h3>
                    <p className="text-xs text-gray-400 mb-3">$20 por pedido entregado de Jiquilpan/San Pedro cuando lo cubrió un repartidor de Sahuayo.</p>
                    <div className="space-y-2">
                      {aporteTiendas.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg p-2.5">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 text-sm truncate">{t.nombre}</p>
                            <p className="text-[11px] text-gray-400">{t.num_pedidos} pedido{t.num_pedidos === 1 ? "" : "s"} · {t.ciudad}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-base font-bold text-amber-700">${Number(t.total_a_cobrar).toFixed(0)}</span>
                            {t.telefono_contacto && (
                              <a
                                href={`https://wa.me/52${t.telefono_contacto.replace(/\D/g, "")}`}
                                target="_blank" rel="noopener noreferrer"
                                className="text-xs bg-green-100 text-green-700 px-2 py-1.5 rounded-lg font-semibold"
                              >
                                WA
                              </a>
                            )}
                            <button
                              onClick={() => marcarAportePagado(t.id, t.nombre)}
                              className="text-xs bg-brand text-white px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform"
                            >
                              Pagado
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cuentas por cobrar a tiendas — flow B2B (envíos
                    absorbidos por la tienda). Solo cuenta entregados. */}
                {cuentasTienda && cuentasTienda.tiendas.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-700">Cuentas por cobrar a tiendas</h3>
                        <p className="text-xs text-gray-400">Envíos B2B absorbidos por la tienda — pásales factura los lunes</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setCuentasDias(7)}
                          className={`text-xs px-2 py-1 rounded-full ${cuentasDias === 7 ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                        >
                          7 días
                        </button>
                        <button
                          onClick={() => setCuentasDias(30)}
                          className={`text-xs px-2 py-1 rounded-full ${cuentasDias === 30 ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
                        >
                          30 días
                        </button>
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 mb-3 flex items-baseline justify-between">
                      <span className="text-xs text-amber-800 font-medium">TOTAL POR COBRAR</span>
                      <span className="text-2xl font-black text-amber-900">${cuentasTienda.total_general.toFixed(2)}</span>
                    </div>
                    <div className="space-y-2">
                      {cuentasTienda.tiendas.map((t) => (
                        <div key={t.tienda_id} className="bg-gray-50 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-700 truncate">{t.tienda_nombre}</p>
                              <p className="text-[11px] text-gray-400">
                                {t.num_pedidos} pedido{t.num_pedidos !== 1 ? "s" : ""}
                                {t.telefono_contacto && (
                                  <> · <a href={`https://wa.me/52${t.telefono_contacto.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, te paso la cuenta de envíos de Mercadito de los últimos ${cuentasTienda.dias} días: $${t.total_a_cobrar.toFixed(2)} (${t.num_pedidos} pedido${t.num_pedidos !== 1 ? "s" : ""}). ¿Cómo te queda transferir hoy?`)}`} target="_blank" rel="noopener noreferrer" className="text-green-600 underline">WhatsApp</a></>
                                )}
                              </p>
                            </div>
                            <span className="font-bold text-amber-700 ml-2">${t.total_a_cobrar.toFixed(2)}</span>
                          </div>
                          <button
                            onClick={async () => {
                              if (!(await confirmar({
                                emoji: "💰",
                                titulo: `¿${t.tienda_nombre} ya pagó $${t.total_a_cobrar.toFixed(2)}?`,
                                mensaje: `Son ${t.num_pedidos} pedido${t.num_pedidos !== 1 ? "s" : ""} de su cuenta.`,
                                ok: "Sí, ya pagó",
                              }))) return;
                              const res = await fetch("/api/admin/cuentas-tienda", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ tienda_id: t.tienda_id }),
                              });
                              if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                avisar({ emoji: "😕", titulo: "No se pudo marcar como pagado", mensaje: err.error });
                                return;
                              }
                              // Refrescar lista
                              const r = await fetch(`/api/admin/cuentas-tienda?dias=${cuentasDias}`);
                              const data = await r.json();
                              setCuentasTienda(data);
                            }}
                            className="mt-2 w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 rounded-lg active:scale-95 transition-transform"
                          >
                            ✓ Marcar como pagado
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Per-store breakdown */}
                {stats.ventasPorTienda.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                    <h3 className="font-bold text-gray-700 mb-3">Pago por tienda</h3>
                    <p className="text-xs text-gray-400 mb-3">Lo que debemos a cada tienda por productos vendidos</p>
                    <div className="space-y-2">
                      {stats.ventasPorTienda.map((tienda) => (
                        <div key={tienda.puesto_id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                          <div>
                            <span className="font-medium text-gray-700">{tienda.puesto_nombre}</span>
                            <span className="text-xs text-gray-400 ml-2">{tienda.pedidos} pedidos</span>
                          </div>
                          <span className="font-bold text-red-600">${tienda.total_vendido.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily sales */}
                {stats.ventasPorDia.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-gray-700 mb-3">Ventas por día</h3>
                    <div className="space-y-1">
                      {stats.ventasPorDia.map((dia) => {
                        const man = Number(dia.manuales ?? 0);
                        return (
                          <div key={dia.fecha} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                            <div>
                              <span className="text-sm text-gray-700">
                                {diaCortoMX(dia.fecha)}
                              </span>
                              <span className="text-xs text-gray-400 ml-2">
                                {dia.pedidos} pedidos{man > 0 ? ` · +$${man.toFixed(0)} man.` : ""}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold">${(dia.total + man).toFixed(0)}</span>
                              <span className="text-xs text-green-600 ml-1">(${dia.envios.toFixed(0)} envío)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ TAB: TIENDAS ══════════════ */}
            {tab === "tiendas" && (
              <div className="mt-4">
                <div className="mb-4 bg-white rounded-xl p-3 shadow-sm flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">🎁</span>
                  <p className="flex-1 min-w-0 text-xs text-gray-500 leading-snug">
                    Prueba completa para todos los negocios (mesas, meseros y reservas).
                    A los que ya la traían se les reinicia desde hoy.
                  </p>
                  <button
                    onClick={darPruebaATodos}
                    disabled={dandoPrueba}
                    className="flex-shrink-0 bg-brand text-white text-xs font-bold rounded-lg px-3 py-2 disabled:opacity-50"
                  >
                    {dandoPrueba ? "Activando…" : "Dársela a todos"}
                  </button>
                </div>
                {/* Pending approvals */}
                {stats.tiendasPendientes.length > 0 && (
                  <div className="mb-6">
                    <h2 className="font-bold text-red-600 mb-3">
                      Pendientes de aprobacion ({stats.tiendasPendientes.length})
                    </h2>
                    <div className="space-y-3">
                      {stats.tiendasPendientes.map((tienda) => (
                        <div key={tienda.id} className="bg-white rounded-xl p-4 shadow-sm border-2 border-amber-200">
                          <h3 className="font-bold text-gray-800">{tienda.nombre}</h3>
                          <p className="text-sm text-gray-500">{tienda.descripcion || "Sin descripcion"}</p>
                          <p className="text-sm text-gray-400 mt-1">
                            Dueno: {tienda.nombre_dueno} — {tienda.telefono_dueno}
                          </p>
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => aprobarTienda(tienda.id, true)}
                              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium active:scale-95 transition-transform"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => rechazarTienda(tienda.id, tienda.nombre)}
                              className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2 rounded-lg font-medium active:scale-95 transition-transform"
                            >
                              Rechazar
                            </button>
                            <a
                              href={`https://wa.me/52${(tienda.telefono_dueno || "").replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 bg-green-100 text-green-700 py-2 rounded-lg font-medium text-center text-sm"
                              aria-label="Contactar por WhatsApp"
                            >
                              💬
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Store detail view */}
                {tiendaSeleccionada ? (() => {
                  const tienda = stats.tiendasActivas.find((t) => t.id === tiendaSeleccionada);
                  if (!tienda) return null;
                  const ventas = stats.ventasPorTienda.find((v) => v.puesto_id === tienda.id);
                  return (
                    <div>
                      <button
                        onClick={() => { setTiendaSeleccionada(null); setMensajePuesto(null); setMensajeTexto(""); }}
                        className="flex items-center gap-1 text-sm text-navy font-medium mb-3 active:scale-95 transition-transform"
                      >
                        ← Volver a todas las tiendas
                      </button>

                      <div className="bg-white rounded-xl p-5 shadow-sm">
                        {/* Header */}
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h2 className="text-xl font-bold text-gray-800">{tienda.nombre}</h2>
                            {tienda.descripcion && (
                              <p className="text-sm text-gray-400 mt-0.5">{tienda.descripcion}</p>
                            )}
                          </div>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            {tienda.total_productos} productos
                          </span>
                        </div>

                        {/* Info */}
                        <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-1.5">
                          {tienda.nombre_dueno && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400 w-16">Dueno:</span>
                              <span className="text-gray-700 font-medium">{tienda.nombre_dueno}</span>
                              <span className="text-xs text-gray-300">({tienda.rol_dueno})</span>
                            </div>
                          )}
                          {(tienda.telefono_contacto || tienda.telefono_dueno) && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-gray-400 w-16">Tel:</span>
                              <span className="text-gray-700">{tienda.telefono_contacto || tienda.telefono_dueno}</span>
                            </div>
                          )}
                          {tienda.ubicacion && (
                            <div className="flex items-start gap-2 text-sm">
                              <span className="text-gray-400 w-16 flex-shrink-0">Dir:</span>
                              <span className="text-gray-700">{tienda.ubicacion}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-gray-400 w-16 flex-shrink-0">Ciudad:</span>
                            {/* Texto libre desde ago 2026. Era un <select> con las tres
                                ciudades de reparto: con el pivote a menús digitales el
                                negocio puede estar donde sea, y de paso la opción más
                                larga ("San Pedro (Venustiano Carranza)") estiraba el
                                control y desbordaba la tarjeta. `min-w-0` es lo que
                                deja que el flex encoja de verdad. */}
                            <input
                              key={tienda.id}
                              defaultValue={tienda.ciudad || ""}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v !== (tienda.ciudad || "")) cambiarCiudadTienda(tienda.id, v);
                              }}
                              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              placeholder="Sahuayo"
                              maxLength={60}
                              className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:border-brand outline-none"
                            />
                          </div>
                          {DELIVERY_ACTIVO && tienda.ciudad && tienda.ciudad !== "sahuayo" && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1">
                              Tienda foránea: aplica impuesto de ciudad y, si no hay repartidor
                              local, aporta $20 por envío.
                            </p>
                          )}
                        </div>

                        {/* Sales */}
                        {ventas && (
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-navy-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-navy">{ventas.pedidos}</p>
                              <p className="text-[10px] text-gray-400">Pedidos</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-2 text-center">
                              <p className="text-lg font-bold text-amber-700">${ventas.total_vendido.toFixed(0)}</p>
                              <p className="text-[10px] text-amber-400">Vendido</p>
                            </div>
                          </div>
                        )}

                        {/* Map */}
                        {tienda.lat && tienda.lng && (
                          <MapaPedido
                            lat={tienda.lat}
                            lng={tienda.lng}
                            direccion={tienda.ubicacion || tienda.nombre}
                          />
                        )}

                        {/* Actions */}
                        <div className="space-y-2 mt-3">
                          <div className="flex gap-2">
                            {tienda.usuario_id && (
                              <button
                                onClick={() => resetPin(tienda.usuario_id, tienda.nombre_dueno || tienda.nombre)}
                                className="flex-1 text-sm bg-gray-100 text-gray-700 px-3 py-2.5 rounded-lg font-medium active:scale-95 transition-transform"
                              >
                                Cambiar PIN
                              </button>
                            )}
                            {(tienda.telefono_contacto || tienda.telefono_dueno) && (
                              <a
                                href={`https://wa.me/52${(tienda.telefono_contacto || tienda.telefono_dueno || "").replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-sm bg-green-100 text-green-700 px-3 py-2.5 rounded-lg font-medium text-center"
                              >
                                WhatsApp
                              </a>
                            )}
                          </div>

                          {/* Plan de citas (solo negocios de servicios) — activación manual */}
                          {tienda.esServicio && tienda.planInfo && (
                            <div className="bg-gray-50 rounded-lg p-2.5">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-gray-600">Plan reservas</span>
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tienda.planInfo.estado === "pro" ? "bg-serv text-white" : tienda.planInfo.estado === "trial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                                  {tienda.planInfo.estado === "pro" ? `Pro · ${tienda.planInfo.dias_restantes}d` : tienda.planInfo.estado === "trial" ? `Prueba · ${tienda.planInfo.dias_restantes}d` : "Vencido"}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => activarPlan(tienda.id, "pro", tienda.nombre)} className="flex-1 text-xs bg-serv text-white px-2 py-2 rounded-lg font-semibold">Activar Pro 1 mes</button>
                                <button onClick={() => activarPlan(tienda.id, "trial", tienda.nombre)} className="flex-1 text-xs bg-gray-200 text-gray-700 px-2 py-2 rounded-lg font-semibold">Reiniciar prueba</button>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => setMensajePuesto(mensajePuesto === tienda.id ? null : tienda.id)}
                            className="w-full text-sm bg-navy-50 text-navy px-3 py-2.5 rounded-lg font-medium active:scale-95 transition-transform"
                          >
                            Enviar mensaje por la app
                          </button>

                          {/* Inline message form */}
                          {mensajePuesto === tienda.id && (
                            <div className="bg-navy-50 rounded-lg p-3 space-y-2">
                              <textarea
                                value={mensajeTexto}
                                onChange={(e) => setMensajeTexto(e.target.value)}
                                placeholder="Escribe un mensaje para esta tienda..."
                                rows={2}
                                className="w-full border border-navy/20 rounded-lg px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => enviarMensaje(tienda.id)}
                                  disabled={enviandoMensaje || !mensajeTexto.trim()}
                                  className="flex-1 bg-brand text-white py-2 rounded-lg text-sm font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
                                >
                                  {enviandoMensaje ? "Enviando..." : "Enviar"}
                                </button>
                                <button
                                  onClick={() => { setMensajePuesto(null); setMensajeTexto(""); }}
                                  className="px-4 bg-gray-200 text-gray-600 py-2 rounded-lg text-sm active:scale-95 transition-transform"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={async () => {
                              if (await confirmar({
                                emoji: "🚫",
                                titulo: `¿Desactivar ${tienda.nombre}?`,
                                mensaje: "Deja de aparecer para los clientes hasta que la vuelvas a aprobar.",
                                ok: "Sí, desactivarla",
                                peligro: true,
                              })) {
                                aprobarTienda(tienda.id, false);
                                setTiendaSeleccionada(null);
                              }
                            }}
                            className="w-full text-sm bg-red-50 text-red-500 px-3 py-2.5 rounded-lg font-medium active:scale-95 transition-transform"
                          >
                            Desactivar tienda
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  /* Store map + list view */
                  <>
                    {/* Store map */}
                    {stats.tiendasActivas.some((t) => t.lat && t.lng) && (
                      <div className="mb-4">
                        <h2 className="font-bold text-gray-700 mb-2">Toca una tienda en el mapa</h2>
                        <MapaTiendasAdmin
                          tiendas={stats.tiendasActivas
                            .filter((t) => t.lat && t.lng)
                            .map((t) => ({
                              id: t.id,
                              nombre: t.nombre,
                              lat: t.lat!,
                              lng: t.lng!,
                              ubicacion: t.ubicacion,
                              telefono: t.telefono_contacto || t.telefono_dueno,
                              productos: t.total_productos,
                            }))}
                          onTiendaClick={(id) => setTiendaSeleccionada(id)}
                          selectedId={tiendaSeleccionada}
                        />
                      </div>
                    )}

                    {/* Active stores list */}
                    <div>
                      <h2 className="font-bold text-gray-700 mb-3">
                        Tiendas activas ({stats.tiendasActivas.length})
                      </h2>
                      {stats.tiendasActivas.length > 0 ? (
                        <div className="space-y-2">
                          {stats.tiendasActivas.map((tienda) => {
                            const ventas = stats.ventasPorTienda.find((v) => v.puesto_id === tienda.id);
                            return (
                              <button
                                key={tienda.id}
                                onClick={() => setTiendaSeleccionada(tienda.id)}
                                className="w-full bg-white rounded-xl p-3 shadow-sm text-left active:scale-[0.98] transition-transform flex items-center gap-3"
                              >
                                <span className="text-2xl">🏪</span>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-gray-800 text-sm">{tienda.nombre}</h3>
                                  <p className="text-xs text-gray-400 truncate">
                                    {tienda.nombre_dueno && `${tienda.nombre_dueno} — `}
                                    {tienda.total_productos} productos
                                    {ventas ? ` — $${ventas.total_vendido.toFixed(0)} vendido` : ""}
                                  </p>
                                </div>
                                <span className="text-gray-300 text-lg">›</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <span className="text-4xl block mb-3">🏪</span>
                          <p className="text-gray-400">No hay tiendas activas</p>
                        </div>
                      )}
                    </div>

                    {/* Share link */}
                    <div className="mt-4 bg-navy-50 rounded-xl p-4 text-center">
                      <p className="text-sm text-navy">
                        Comparte este link para que se registren tiendas:
                      </p>
                      <p className="font-mono text-sm font-bold text-navy mt-1">
                        mercadito.cx/tienda/registro
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ══════════════ TAB: REPARTIDORES ══════════════ */}
            {tab === "repartidores" && (
              <div className="mt-4 space-y-4">
                {/* Registrar venta manual rápida desde admin (pedidos por
                    WhatsApp con cobro mental, mandados directos). */}
                <button
                  onClick={() => setShowIngresoModal(true)}
                  className="w-full bg-brand text-white font-bold py-3 rounded-xl shadow-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                >
                  <span>+</span> Registrar venta manual
                </button>

                {/* ═══ Liquidaciones: deuda de repartidores con Mercadito ═══ */}
                {liquidaciones.length > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <h3 className="font-bold text-gray-700 mb-1">🧾 Liquidaciones</h3>
                    <p className="text-[11px] text-gray-400 mb-3">
                      Deuda del repartidor con Mercadito (comisión de pedidos en efectivo que cobró completos).
                      Fernando y los de confianza no acumulan. Registra el abono cuando te paguen.
                    </p>
                    <div className="space-y-3">
                      {liquidaciones.map((r) => {
                        const saldo = Number(r.saldo);
                        const moroso = saldo >= 100;
                        return (
                          <div key={r.id} className={`rounded-lg p-3 border ${moroso ? "border-red-200 bg-red-50" : "border-gray-100"}`}>
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                                  {r.nombre}
                                  {r.repartidor_confianza && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">confianza</span>}
                                  {!r.activo && <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">baja</span>}
                                </p>
                                <p className="text-[11px] text-gray-400">{r.telefono}</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-lg font-bold ${saldo > 0 ? (moroso ? "text-red-600" : "text-amber-600") : "text-green-600"}`}>${saldo.toFixed(0)}</p>
                                <p className="text-[10px] text-gray-400">debe</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <select
                                value={r.ciudad || "sahuayo"}
                                onChange={(e) => actualizarRepartidor(r.id, { ciudad: e.target.value })}
                                className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:border-brand outline-none"
                              >
                                <option value="sahuayo">Sahuayo</option>
                                <option value="jiquilpan">Jiquilpan</option>
                                <option value="venustiano">San Pedro</option>
                              </select>
                              {saldo > 0 && (
                                <button
                                  onClick={() => registrarAbono(r.id, r.nombre, saldo)}
                                  className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform"
                                >
                                  Registrar pago
                                </button>
                              )}
                              <button
                                onClick={() => actualizarRepartidor(r.id, { activo: !r.activo })}
                                className={`text-xs px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-transform ml-auto ${r.activo ? "bg-red-50 text-red-500" : "bg-green-100 text-green-700"}`}
                              >
                                {r.activo ? "Dar de baja" : "Reactivar"}
                              </button>
                            </div>
                            {moroso && r.activo && (
                              <p className="text-[11px] text-red-600 mt-2">⚠️ Deuda alta — considera darlo de baja por morosidad si no liquida.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Ingresos manuales (ventas por WhatsApp / mandados directos) */}
                {stats.ingresosManuales.count > 0 && (
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-gray-700">💰 Ventas manuales</h3>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                        {stats.ingresosManuales.count} ventas · ${stats.ingresosManuales.total.toFixed(0)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-3">
                      Pedidos por WhatsApp / mandados con cobro mental que el repartidor capturó. Monto = ganancia Mercadito (envío + servicio).
                    </p>
                    {stats.ingresosManuales.por_repartidor.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {stats.ingresosManuales.por_repartidor.map((r) => (
                          <div key={r.repartidor} className="bg-emerald-50 rounded-lg p-2">
                            <p className="text-xs text-emerald-700 font-semibold truncate">{r.repartidor}</p>
                            <p className="text-base font-bold text-emerald-900">${r.total.toFixed(0)}</p>
                            <p className="text-[10px] text-emerald-600">{r.ventas} venta{r.ventas === 1 ? "" : "s"}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {stats.ingresosManuales.recientes.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-brand font-semibold text-xs">
                          Ver últimas {stats.ingresosManuales.recientes.length} ›
                        </summary>
                        <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
                          {stats.ingresosManuales.recientes.map((r) => (
                            <div key={r.id} className="border border-gray-100 rounded-lg p-2 text-xs">
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-gray-700">
                                    {r.tipo === "tienda" ? `🏪 ${r.puesto_nombre || "—"}` : `🛵 ${r.cliente_nombre || "Cliente"}`}
                                  </p>
                                  <p className="text-gray-400 text-[10px]">
                                    {r.repartidor_nombre} · {r.metodo_pago} · {fechaHoraMX(r.created_at)}
                                  </p>
                                  {r.detalle && <p className="text-gray-500 mt-1 text-[11px]">{r.detalle}</p>}
                                  {r.cliente_telefono && (
                                    <a href={`tel:${r.cliente_telefono}`} className="text-blue-600 text-[10px]">
                                      📞 {r.cliente_telefono}
                                    </a>
                                  )}
                                </div>
                                <span className="font-bold text-emerald-700 whitespace-nowrap">
                                  ${r.monto.toFixed(0)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {stats.ventasPorRepartidor.length > 0 ? (
                  <div className="space-y-3">
                    {stats.ventasPorRepartidor.map((r) => (
                      <div key={r.repartidor} className="bg-white rounded-xl p-4 shadow-sm">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-700">{r.repartidor}</h3>
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            {r.pedidos_entregados} entregas
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-gray-700">${r.total.toFixed(0)}</p>
                            <p className="text-xs text-gray-400">Total manejado</p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-green-700">${r.envios.toFixed(0)}</p>
                            <p className="text-xs text-gray-400">Envíos cobrados</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <span className="text-5xl block mb-4">🛵</span>
                    <p className="text-gray-400">Sin entregas registradas aún</p>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ TAB: ANUNCIOS ══════════════ */}
            {tab === "anuncios" && (
              <div className="mt-4">
                {/* Create announcement */}
                <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                  <h3 className="font-bold text-gray-700 mb-3">Nuevo anuncio</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={nuevoAnuncioTitulo}
                      onChange={(e) => setNuevoAnuncioTitulo(e.target.value)}
                      placeholder="Titulo del anuncio"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                    />
                    <textarea
                      value={nuevoAnuncioMensaje}
                      onChange={(e) => setNuevoAnuncioMensaje(e.target.value)}
                      placeholder="Mensaje..."
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none resize-none"
                    />
                    <div className="flex gap-2 flex-wrap">
                      {(["general", "clientes", "tiendas"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNuevoAnuncioTipo(t)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            nuevoAnuncioTipo === t
                              ? "bg-brand text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {t === "general" ? "Todos" : t === "clientes" ? "Solo clientes" : "Solo tiendas"}
                        </button>
                      ))}
                    </div>

                    {/* Imagen opcional — para banners promocionales */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">
                        Imagen <span className="text-gray-400 font-normal">(opcional · banner del anuncio)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        {nuevoAnuncioImagen ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={nuevoAnuncioImagen} alt="" className="w-20 h-20 rounded-lg object-cover" />
                        ) : null}
                        <label className="flex-1 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg py-3 text-center text-sm text-gray-500 cursor-pointer">
                          {nuevoAnuncioImagen ? "📷 Cambiar imagen" : "📷 Subir imagen"}
                          <input type="file" accept="image/*" onChange={handleAnuncioImage} className="hidden" />
                        </label>
                        {nuevoAnuncioImagen && (
                          <button
                            type="button"
                            onClick={() => setNuevoAnuncioImagen(null)}
                            className="text-xs text-red-500 underline"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      value={nuevoAnuncioLink}
                      onChange={(e) => setNuevoAnuncioLink(e.target.value)}
                      placeholder="Link al tocar (opcional)"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none text-sm"
                    />

                    <button
                      onClick={crearAnuncio}
                      disabled={creandoAnuncio || !nuevoAnuncioTitulo || !nuevoAnuncioMensaje}
                      className="w-full bg-brand text-white py-2 rounded-full font-bold disabled:bg-gray-300 active:scale-95 transition-transform"
                    >
                      {creandoAnuncio ? "Publicando..." : "Publicar anuncio"}
                    </button>
                  </div>
                </div>

                {/* Existing announcements */}
                {anuncios.length > 0 ? (
                  <div className="space-y-3">
                    {anuncios.map((a) => (
                      <div key={a.id} className={`bg-white rounded-xl p-4 shadow-sm ${!a.activo ? "opacity-50" : ""}`}>
                        {a.imagen && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.imagen} alt="" className="w-full max-h-40 object-cover rounded-lg mb-2" />
                        )}
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-gray-800">{a.titulo}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            a.tipo === "general" ? "bg-navy-50 text-navy"
                            : a.tipo === "clientes" ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {a.tipo === "general" ? "Todos" : a.tipo === "clientes" ? "Clientes" : "Tiendas"}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{a.mensaje}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {fechaHoraMX(a.created_at, { dateStyle: "short" })}
                          </span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleAnuncio(a.id, !a.activo)}
                              className={`text-xs px-3 py-1 rounded-lg ${
                                a.activo
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {a.activo ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              onClick={() => eliminarAnuncio(a.id)}
                              className="text-xs bg-red-50 text-red-500 px-3 py-1 rounded-lg"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <span className="text-4xl block mb-3">📢</span>
                    <p className="text-gray-400">No hay anuncios</p>
                  </div>
                )}
              </div>
            )}

            {/* ══════════════ TAB: PAGOS ══════════════ */}
            {tab === "pagos" && (
              <div className="mt-4 space-y-3">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <h3 className="font-bold text-gray-700 mb-1">Pagos por validar</h3>
                  <p className="text-xs text-gray-500">Revisa cada comprobante y valida para liberar el pedido al equipo.</p>
                </div>

                {pagosPendientes.length === 0 ? (
                  <div className="bg-white rounded-xl p-8 shadow-sm text-center">
                    <span className="text-4xl block mb-3">🏦</span>
                    <p className="text-gray-400">No hay pagos pendientes</p>
                  </div>
                ) : (
                  pagosPendientes.map((p) => (
                    <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2 gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-800 truncate">{p.cliente_nombre}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {fechaHoraMX(p.created_at)} &bull; #{p.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>
                        <span className="font-bold text-navy whitespace-nowrap shrink-0">${Number(p.total).toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm text-gray-500">📱 {p.cliente_telefono}</span>
                        <a
                          href={`https://wa.me/52${p.cliente_telefono.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium"
                        >
                          WhatsApp
                        </a>
                      </div>
                      {/* Desglose de lo que el cliente compró (o detalles del envío) */}
                      {p.tipo === "envio" ? (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 text-xs space-y-0.5">
                          <p className="font-bold text-amber-700">
                            {p.es_mandado || p.monto_mandado != null || p.ida_vuelta
                              ? `🛍️ Mandado${p.ida_vuelta ? " · Ida y vuelta ↔️" : ""}`
                              : `📦 Envío ${p.peso_kg != null ? `(${Number(p.peso_kg).toFixed(1)} kg)` : ""}`}
                          </p>
                          {p.descripcion_contenido && <p className="text-gray-700">{p.descripcion_contenido}</p>}
                          {p.monto_mandado != null && Number(p.monto_mandado) > 0 && (
                            <p className="text-amber-800 font-semibold">💸 Adelanto repartidor: ${Number(p.monto_mandado).toFixed(2)}</p>
                          )}
                          {p.destino_descripcion && <p className="text-gray-700">En destino: {p.destino_descripcion}</p>}
                          {p.destino_monto != null && Number(p.destino_monto) > 0 && (
                            <p className="text-amber-800 font-semibold">💰 Monto en destino: ${Number(p.destino_monto).toFixed(2)}</p>
                          )}
                          {p.recogida_nombre && <p className="text-gray-600">Origen: {p.recogida_nombre}{p.recogida_telefono ? ` · ${p.recogida_telefono}` : ""}</p>}
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-2 mb-3 text-xs space-y-0.5 max-h-36 overflow-y-auto">
                          {p.items.map((it) => {
                            const extras = [it.variante_nombre, ...(it.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ");
                            return (
                            <div key={it.id} className="flex justify-between">
                              <span className="text-gray-700">
                                {Number(it.cantidad)} {it.unidad ?? ""} {it.producto_nombre}
                                {extras && <span className="block text-xs font-semibold text-amber-700">↳ {extras}</span>}
                              </span>
                              <span className="text-gray-500">${Number(it.subtotal).toFixed(2)}</span>
                            </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="mb-3">
                        <PedidoDesglose pedido={p} compact />
                      </div>

                      {p.comprobante_pago ? (
                        <button
                          onClick={() => setComprobanteZoom(p.comprobante_pago)}
                          className="w-full mb-3 overflow-hidden rounded-lg border"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.comprobante_pago} alt="Comprobante" className="w-full max-h-64 object-contain bg-gray-50" />
                        </button>
                      ) : (
                        <p className="text-xs text-red-500 mb-3">Sin comprobante (revisar manualmente)</p>
                      )}
                      <button
                        onClick={() => validarPago(p.id)}
                        className="w-full py-2 bg-green-600 text-white rounded-lg font-bold active:scale-95"
                      >
                        ✓ Validar pago y liberar pedido
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ══════════════ TAB: PEDIDOS (HISTORIAL) ══════════════ */}
            {tab === "pedidos" && (
              <PedidosHistorialTab
                pedidos={historialPedidos}
                loading={historialLoading}
                estado={historialEstado}
                setEstado={setHistorialEstado}
                onReload={fetchHistorialPedidos}
              />
            )}

            {/* ══════════════ TAB: USUARIOS ══════════════ */}
            {tab === "usuarios" && <PanelUsuarios />}
          </>
        )}
      </main>

      {/* Zoom de comprobante */}
      {comprobanteZoom && (
        <div
          onClick={() => setComprobanteZoom(null)}
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={comprobanteZoom} alt="Comprobante" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      <IngresoManualModal
        abierto={showIngresoModal}
        onClose={() => setShowIngresoModal(false)}
        onGuardado={() => { setShowIngresoModal(false); fetchStats(); }}
      />
    </div>
  );
}

// Mensajes para el botón de WhatsApp en el historial. Cancelado pide qué se
// pudo mejorar; entregado pide calificación. La idea es que Adrian abra el
// chat con el texto ya cargado y solo pulse enviar.
function mensajeFeedback(estado: string, nombre: string): string {
  const primerNombre = (nombre || "").split(" ")[0] || "hola";
  if (estado === "cancelado") {
    return `Hola ${primerNombre}, te escribo del equipo de Mercadito 🛵. Vimos que tu pedido se canceló y nos importa mucho saber qué pasó. ¿Hubo algo que no te gustó o que pudiéramos haber hecho mejor? Tu respuesta nos ayuda a mejorar el servicio. ¡Gracias!`;
  }
  if (estado === "entregado") {
    return `Hola ${primerNombre}, soy del equipo de Mercadito 🛍️. ¡Ojalá hayas disfrutado tu pedido! ¿Nos podrías regalar 1 minuto para calificarnos del 1 al 5 y contarnos qué te gustó o qué mejoraríamos? Tu opinión nos ayuda mucho a crecer 🙌`;
  }
  return `Hola ${primerNombre}, te escribo del equipo de Mercadito sobre tu pedido reciente. ¿Tienes un minuto?`;
}

function waLink(telefono: string, mensaje: string): string {
  const limpio = (telefono || "").replace(/\D/g, "");
  return `https://wa.me/52${limpio}?text=${encodeURIComponent(mensaje)}`;
}

function badgeEstado(estado: string, tipo?: "mercado" | "envio" | null): { txt: string; cls: string } {
  const cls = (() => {
    switch (estado) {
      case "entregado": return "bg-green-100 text-green-700";
      case "cancelado": return "bg-red-100 text-red-700";
      case "en_camino": return "bg-blue-100 text-blue-700";
      case "en_compra": return "bg-amber-100 text-amber-700";
      case "pendiente": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  })();
  return { txt: labelEstado(estado as EstadoPedido, tipo), cls };
}

function RepartidorReview({ pedido }: { pedido: PedidoConItems }) {
  // Solo lectura. La calificación la escribe el cliente; el admin nada más
  // la consulta. Si todavía no hay rating ni review, no renderizamos.
  if (pedido.repartidor_rating == null && !pedido.repartidor_review) return null;
  return (
    <div className="border-t border-dashed mt-3 pt-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
        Calificación que el cliente le dio al repartidor
      </p>
      {pedido.repartidor_rating != null && (
        <div className="flex items-center gap-0.5 mb-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className="text-lg leading-none"
              style={{ opacity: n <= (pedido.repartidor_rating ?? 0) ? 1 : 0.25, filter: n <= (pedido.repartidor_rating ?? 0) ? "none" : "grayscale(1)" }}
            >
              ⭐
            </span>
          ))}
          <span className="ml-1 text-xs font-bold text-amber-700">{pedido.repartidor_rating}/5</span>
        </div>
      )}
      {pedido.repartidor_review && (
        <p className="text-xs text-gray-700 italic break-words">&ldquo;{pedido.repartidor_review}&rdquo;</p>
      )}
    </div>
  );
}

function PedidosHistorialTab({
  pedidos,
  loading,
  estado,
  setEstado,
  onReload,
}: {
  pedidos: PedidoConItems[];
  loading: boolean;
  estado: "todos" | "entregado" | "cancelado" | "activos";
  setEstado: (e: "todos" | "entregado" | "cancelado" | "activos") => void;
  onReload: () => void;
}) {
  const filtrados = pedidos.filter((p) => {
    if (estado === "todos") return true;
    if (estado === "activos") return !["entregado", "cancelado"].includes(p.estado);
    return p.estado === estado;
  });

  return (
    <div className="mt-4 space-y-3">
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">Historial de pedidos</h3>
          <button onClick={onReload} className="text-xs bg-gray-100 px-3 py-1 rounded-full">
            Actualizar
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {([
            { id: "todos", label: "Todos" },
            { id: "activos", label: "Activos" },
            { id: "entregado", label: "Entregados" },
            { id: "cancelado", label: "Cancelados" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setEstado(opt.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                estado === opt.id
                  ? "bg-brand text-white"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && pedidos.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm">
          <Loader texto="Cargando…" tamano="sm" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <span className="text-4xl block mb-3">📦</span>
          <p className="text-gray-400">No hay pedidos en este filtro</p>
        </div>
      ) : (
        filtrados.map((p) => {
          const b = badgeEstado(p.estado, p.tipo);
          const fechaCorta = fechaHoraMX(p.created_at, {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          });
          return (
            <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">{p.cliente_nombre}</p>
                  <p className="text-xs text-gray-400">
                    {fechaCorta} &bull; #{p.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${b.cls}`}>
                    {b.txt}
                  </span>
                  <span className="font-bold text-navy">${Number(p.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-sm text-gray-500">📱 {p.cliente_telefono}</span>
                <a
                  href={`https://wa.me/52${p.cliente_telefono.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium"
                >
                  WhatsApp
                </a>
                {p.estado === "cancelado" && (
                  <a
                    href={waLink(p.cliente_telefono, mensajeFeedback("cancelado", p.cliente_nombre))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium"
                  >
                    💬 Pedir feedback
                  </a>
                )}
                {p.estado === "entregado" && (
                  <a
                    href={waLink(p.cliente_telefono, mensajeFeedback("entregado", p.cliente_nombre))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium"
                  >
                    ⭐ Pedir calificación
                  </a>
                )}
              </div>

              {p.tipo === "envio" ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs space-y-0.5">
                  <p className="font-bold text-amber-700">
                    {p.es_mandado
                      ? `🛍️ Mandado${p.ida_vuelta ? " · Ida y vuelta ↔️" : ""}`
                      : `📦 Envío ${p.peso_kg != null ? `(${Number(p.peso_kg).toFixed(1)} kg)` : ""}`}
                  </p>
                  {p.descripcion_contenido && <p className="text-gray-700">{p.descripcion_contenido}</p>}
                  {p.es_mandado && p.monto_mandado != null && Number(p.monto_mandado) > 0 && (
                    <p className="text-amber-800 font-semibold">💸 Adelanto: ${Number(p.monto_mandado).toFixed(2)}</p>
                  )}
                  {p.es_mandado && p.destino_monto != null && Number(p.destino_monto) > 0 && (
                    <p className="text-amber-800 font-semibold">💰 En destino: ${Number(p.destino_monto).toFixed(2)}</p>
                  )}
                  {p.recogida_nombre && <p className="text-gray-600">{p.recogida_nombre} → {p.cliente_nombre}</p>}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-2 text-xs space-y-0.5 max-h-36 overflow-y-auto">
                  {p.items.map((it) => {
                    const extras = [it.variante_nombre, ...(it.modificadores ?? []).map((m) => `${m.modificador_nombre}: ${m.opcion_nombre}`)].filter(Boolean).join(" · ");
                    return (
                    <div key={it.id} className="flex justify-between">
                      <span className="text-gray-700 pr-2 min-w-0">
                        <span className="truncate block">{Number(it.cantidad)} {it.unidad ?? ""} {it.producto_nombre}</span>
                        {extras && <span className="block text-xs font-semibold text-amber-700">↳ {extras}</span>}
                      </span>
                      <span className="text-gray-500">${Number(it.subtotal).toFixed(2)}</span>
                    </div>
                    );
                  })}
                </div>
              )}

              {p.repartidor_nombre && (
                <p className="text-[11px] text-gray-500 mt-2">
                  🛵 {p.repartidor_nombre}
                </p>
              )}

              <RepartidorReview pedido={p} />
            </div>
          );
        })
      )}
    </div>
  );
}
