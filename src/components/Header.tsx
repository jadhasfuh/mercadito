"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { DELIVERY_ACTIVO } from "@/lib/flags";

interface Props {
  title?: string;
  /** Si true, muestra acción de login/cuenta a la izquierda. Solo aplica
   *  cuando el header se usa en superficies para clientes (cliente/page,
   *  landing). En admin/repartidor/tienda se monta otro header propio. */
  mostrarLogin?: boolean;
}

// eslint-disable-next-line @next/next/no-img-element
export default function Header({ title = "Mercadito", mostrarLogin = false }: Props) {
  const { usuario } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Cuando ya hay sesión cliente, ofrecer el atajo a "mis pedidos". Si no
  // hay sesión, ofrecer "Iniciar sesión" que lleva al cliente al tab de
  // pedidos (ahí vive el formulario con lookup por teléfono).
  const esCliente = usuario?.rol === "cliente";
  const yaEnCliente = pathname.startsWith("/cliente");

  function handleAccion() {
    if (yaEnCliente) {
      // Disparamos un evento global; cliente/page.tsx lo escucha y cambia tab.
      window.dispatchEvent(new CustomEvent("mercadito:abrir-login"));
      return;
    }
    // Sin delivery, /cliente está bloqueada: el botón de "Iniciar sesión" del
    // header —que sale en TODAS las páginas que quedan— rebotaba a /menus sin
    // llegar nunca al formulario. Y con sesión, "mis pedidos" ya no existe:
    // lo suyo son sus reservas.
    if (!DELIVERY_ACTIVO) {
      router.push(esCliente ? "/mis-citas" : "/entrar");
      return;
    }
    router.push("/cliente?tab=pedidos");
  }

  return (
    <header className="bg-brand text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
        {mostrarLogin ? (
          <button
            onClick={handleAccion}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 rounded-full pl-2 pr-3 py-1 active:scale-95 transition-transform"
            aria-label={esCliente ? "Mi cuenta" : "Iniciar sesión"}
          >
            <span className="w-7 h-7 rounded-full bg-white/30 flex items-center justify-center text-sm">
              {esCliente ? "👤" : "🔑"}
            </span>
            <span className="text-xs font-bold">
              {esCliente ? `Hola, ${(usuario?.nombre ?? "").split(" ")[0]}` : "Iniciar sesión"}
            </span>
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Mercadito" className="h-9 w-9 rounded-lg" />
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          </Link>
        )}

        {mostrarLogin && (
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="Mercadito" className="h-9 w-9 rounded-lg" />
            <h1 className="text-lg font-bold tracking-tight">{title}</h1>
          </Link>
        )}
      </div>
    </header>
  );
}
