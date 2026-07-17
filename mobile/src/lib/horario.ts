// Horario de servicio — espejo de src/lib/horario.ts del backend.
// Mantener sincronizado: el server usa esta misma lógica para sumar el
// recargo nocturno; si divergen, el total mostrado no coincide con el cobrado.
const TIMEZONE = "America/Mexico_City";

export interface HorarioInfo {
  abierto: boolean;
  esNocturno: boolean; // 10pm-11pm con recargo
  recargoNocturno: number;
  mensaje: string;
  horaActual: string;
}

export function getHorarioInfo(): HorarioInfo {
  const now = new Date();
  const mx = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const hora = mx.getHours();
  const minutos = mx.getMinutes();
  const horaActual = `${hora.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}`;

  if (hora >= 8 && hora < 22) {
    return { abierto: true, esNocturno: false, recargoNocturno: 0, mensaje: "", horaActual };
  }
  if (hora >= 22 && hora < 23) {
    return {
      abierto: true,
      esNocturno: true,
      recargoNocturno: 30,
      mensaje: "Horario nocturno: se aplica un recargo de $30 por entrega fuera de horario",
      horaActual,
    };
  }
  return {
    abierto: false,
    esNocturno: false,
    recargoNocturno: 0,
    mensaje: "Estamos cerrados. Nuestro horario es de 8:00 AM a 11:00 PM. Hasta las 10 PM sin recargo.",
    horaActual,
  };
}
