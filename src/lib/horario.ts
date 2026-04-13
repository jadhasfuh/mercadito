// Business hours configuration (Mexico City timezone)
const TIMEZONE = "America/Mexico_City";

export interface HorarioInfo {
  abierto: boolean;
  esNocturno: boolean; // 10pm-11pm surcharge period
  recargoNocturno: number; // Extra charge for nocturno
  mensaje: string;
  horaActual: string;
}

export function getHorarioInfo(): HorarioInfo {
  const now = new Date();
  const mx = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const hora = mx.getHours();
  const minutos = mx.getMinutes();
  const horaActual = `${hora.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}`;

  // 8:00 AM - 10:00 PM → normal
  if (hora >= 8 && hora < 22) {
    return {
      abierto: true,
      esNocturno: false,
      recargoNocturno: 0,
      mensaje: "",
      horaActual,
    };
  }

  // 10:00 PM - 11:00 PM → nocturno with surcharge
  if (hora >= 22 && hora < 23) {
    return {
      abierto: true,
      esNocturno: true,
      recargoNocturno: 30,
      mensaje: "Horario nocturno: se aplica un recargo de $30 por entrega fuera de horario",
      horaActual,
    };
  }

  // 11:00 PM - 8:00 AM → closed
  return {
    abierto: false,
    esNocturno: false,
    recargoNocturno: 0,
    mensaje: "Estamos cerrados. Nuestro horario es de 8:00 AM a 11:00 PM. Hasta las 10 PM sin recargo.",
    horaActual,
  };
}
