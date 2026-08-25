import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useSession } from "../src/contexts/SessionContext";
import Loader from "../src/components/Loader";
import { DELIVERY_ACTIVO } from "../src/lib/flags";

export default function IndexScreen() {
  const { usuario, loading } = useSession();
  const router = useRouter();
  // El index es el primer landing — decidimos UNA vez a dónde mandar al
  // usuario y nunca más. Sin esto, el `useEffect` se vuelve un guard
  // permanente: tras un logout en /(admin)/perfil, el usuario cambiaba a
  // null aquí, este redirigía a /(tabs)/home, y eso ganaba la carrera
  // contra el redirect a /login del (admin)/_layout. Y al re-loguear,
  // disparaba otra vez compitiendo con el login.tsx.
  const yaRedirigio = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (yaRedirigio.current) return;
    yaRedirigio.current = true;
    // Sin sesión vamos directo al catálogo (paridad con web). Los flujos
    // que sí requieren cuenta (checkout, pedidos, perfil) piden login en
    // el momento, no de entrada — Apple Guideline 5.1.1(v) prohíbe
    // forzar registro para browsing.
    if (!usuario) {
      router.replace("/(tabs)/home");
      return;
    }
    // Sin delivery el tab Pagos está oculto (no hay pagos de repartidor que
    // validar): el admin aterriza en Resumen.
    if (usuario.rol === "admin") router.replace(DELIVERY_ACTIVO ? "/(admin)/pagos" : "/(admin)/resumen");
    else if (usuario.rol === "repartidor") router.replace("/(repartidor)/pedidos");
    // Sin delivery el tab Pedidos de la tienda está oculto: mandarla ahí la
    // dejaría en una pantalla sin barra. Su casa pasa a ser Productos, que
    // es donde arma el menú.
    else if (usuario.rol === "tienda") {
      router.replace(DELIVERY_ACTIVO ? "/(tienda)/pedidos" : "/(tienda)/productos");
    }
    else router.replace("/(tabs)/home");
  }, [usuario, loading, router]);

  return <Loader fullScreen tamano="lg" texto="Mercadito" />;
}
