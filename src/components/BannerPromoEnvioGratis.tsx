"use client";

import { useEffect, useState } from "react";

interface PromoEstado {
  activa: boolean;
  cada: number;
  entregados?: number;
  proximo_gratis?: boolean;
  faltan_para_gratis?: number;
  termina?: string;
}

interface Props {
  /** Teléfono del cliente para calcular su progreso. Sin teléfono, banner genérico. */
  telefono?: string;
}

/**
 * Banner de la promo "envío gratis cada N pedidos". Se renderiza solo si
 * la promo está activa según el backend. Si conocemos al cliente (telefono)
 * mostramos su progreso; si no, mensaje genérico que invita a registrarse.
 */
export default function BannerPromoEnvioGratis({ telefono }: Props) {
  const [estado, setEstado] = useState<PromoEstado | null>(null);

  useEffect(() => {
    let cancel = false;
    const url = telefono ? `/api/cliente/promo-envios?telefono=${encodeURIComponent(telefono)}` : `/api/cliente/promo-envios`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => { if (!cancel) setEstado(data); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [telefono]);

  if (!estado || !estado.activa) return null;

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm mb-4 bg-orange-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/promo-envio-gratis-mayo.png"
        alt="Promo de mayo: envío gratis cada 4° pedido"
        className="w-full block"
      />
      {/* Estado del cliente debajo de la imagen */}
      <div className="px-3 py-2 bg-white border-t border-orange-200">
        {estado.proximo_gratis ? (
          <p className="text-sm font-bold text-green-700 text-center">
            🎁 Tu próximo envío es <span className="underline">GRATIS</span>. Aplicamos el descuento al confirmar el pedido.
          </p>
        ) : estado.entregados != null && estado.faltan_para_gratis != null ? (
          <p className="text-xs text-gray-600 text-center">
            Llevas <strong>{estado.entregados}</strong> pedido{estado.entregados === 1 ? "" : "s"} entregado{estado.entregados === 1 ? "" : "s"}.
            Te {estado.faltan_para_gratis === 1 ? "falta" : "faltan"} <strong>{estado.faltan_para_gratis}</strong> para tu envío gratis.
          </p>
        ) : (
          <p className="text-xs text-gray-500 text-center">
            Empieza a pedir. Cada {estado.cada}° pedido completado, el siguiente envío es gratis.
          </p>
        )}
      </div>
    </div>
  );
}
