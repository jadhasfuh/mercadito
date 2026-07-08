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

// PINs demasiado fáciles de adivinar. Se rechazan al CREAR/asignar un PIN
// (no al iniciar sesión — quien ya tiene uno débil igual puede entrar hasta
// que lo cambie). Combinado con el rate-limit, sube el piso del brute-force.
const PIN_COMUNES = new Set([
  "000000", "111111", "222222", "333333", "444444", "555555", "666666",
  "777777", "888888", "999999", "123456", "654321", "121212", "112233",
  "123123", "101010", "012345", "098765",
]);

/** true si el PIN es de 6 dígitos Y no está en la lista de comunes. */
export function esPinFuerte(pin: unknown): pin is string {
  return esPinValido(pin) && !PIN_COMUNES.has(pin as string);
}

export const PIN_DEBIL_MENSAJE = "Ese PIN es muy fácil de adivinar (ej. 123456). Elige otro de 6 dígitos.";
