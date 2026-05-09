import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useSession } from "../src/contexts/SessionContext";
import Loader from "../src/components/Loader";

export default function IndexScreen() {
  const { usuario, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!usuario) {
      router.replace("/login");
      return;
    }
    if (usuario.rol === "admin") router.replace("/(admin)/pagos");
    else if (usuario.rol === "repartidor") router.replace("/(repartidor)/pedidos");
    else if (usuario.rol === "tienda") router.replace("/(tienda)/pedidos");
    else router.replace("/(tabs)/home");
  }, [usuario, loading, router]);

  return <Loader fullScreen tamano="lg" texto="Mercadito" />;
}
