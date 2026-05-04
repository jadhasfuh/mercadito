// Reglas únicas de teléfono y PIN. Cualquier endpoint o componente que
// reciba estos campos debe validarlos con estos helpers — la BD ya tiene
// teléfonos malformados de antes de endurecer.
export const TELEFONO_REGEX = /^\d{10}$/;
export const PIN_REGEX = /^\d{6}$/;

export function esTelefonoValido(tel: unknown): tel is string {
  return typeof tel === "string" && TELEFONO_REGEX.test(tel);
}

export function esPinValido(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_REGEX.test(pin);
}

export const TELEFONO_MENSAJE = "El teléfono debe ser de 10 dígitos";
export const PIN_MENSAJE = "El PIN debe ser de 6 dígitos numéricos";
