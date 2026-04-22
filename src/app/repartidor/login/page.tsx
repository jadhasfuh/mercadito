"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import LoginRepartidor from "@/components/LoginRepartidor";

export default function RepartidorLoginPage() {
  const { usuario, loading: sessionLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (sessionLoading) return;
    if (usuario?.rol === "repartidor") {
      router.replace("/repartidor");
    }
  }, [usuario, sessionLoading, router]);

  return <LoginRepartidor />;
}
