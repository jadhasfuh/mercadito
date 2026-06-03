import { useModo } from "../contexts/ModoContext";
import { colors } from "./theme";

// Colores de la UI (chrome) según el modo activo. En "servicios" todo el
// naranja de marca se vuelve índigo; en "mercado" queda el naranja de siempre.
// Centraliza el recoloreo del header, la tab bar y el fondo de pantalla para
// que el switch tiña toda la interfaz, no solo los botones.
export function useModoUI() {
  const { modo } = useModo();
  const serv = modo === "servicios";
  return {
    serv,
    // Acento principal (botones, íconos activos, header, tab bar).
    accent: serv ? colors.serv : "#ED8E3C",
    accentDark: serv ? colors.servDark : colors.brandDark,
    // Fondo de pantalla — igualado al de la web (#fcfbfa) en ambos modos. El
    // azul del modo Citas vive en header/tabs/tarjetas, no en el fondo.
    screenBg: "#FCFBFA",
    // Tab bar
    tabActive: serv ? colors.serv : "#ED8E3C",
    tabInactive: serv ? "#8A93AD" : "#8B7B69",
  } as const;
}
