import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

interface Props {
  onPress: () => void;
  /** Color de fondo del botón (acento del negocio). */
  color: string;
  /** Color de la sombra dura — el borde de abajo/derecha. */
  shadow: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Grosor de la sombra. 2 para botones chicos, 3 para el CTA grande. */
  alto?: number;
  radio?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/**
 * Botón con el "efecto pepe" del look de Mercadito: sombra dura sólida abajo
 * y a la derecha, y al presionar el botón se hunde hacia ella.
 *
 * En web es `box-shadow: 2px 2px 0 <shadow>` + `active:translate`. React
 * Native no tiene sombras duras (shadowRadius siempre difumina y `elevation`
 * pinta la sombra gris del sistema), así que la sombra se dibuja como BORDE
 * de abajo/derecha. Al presionar el borde se vuelve transparente y el
 * contenido se traslada esos mismos píxeles: el tamaño total no cambia, así
 * que nada salta en el layout.
 */
export default function Boton3D({
  onPress, color, shadow, children, style, alto = 2, radio = 999, disabled, accessibilityLabel,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        {
          backgroundColor: color,
          borderRadius: radio,
          borderBottomWidth: alto,
          borderRightWidth: alto,
          borderColor: pressed ? "transparent" : shadow,
          opacity: disabled ? 0.5 : 1,
          transform: pressed ? [{ translateX: alto }, { translateY: alto }] : [],
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
