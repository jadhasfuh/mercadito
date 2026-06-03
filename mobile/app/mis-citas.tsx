import { View } from "react-native";
import { theme } from "../src/lib/theme";
import MisCitasView from "../src/components/MisCitasView";

// Pantalla apilada (se abre tras agendar). El header lo pone el Stack
// del layout raíz con título "Mis citas" + botón atrás.
export default function MisCitasScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.cream }}>
      <MisCitasView />
    </View>
  );
}
