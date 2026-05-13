import { useRef, useState } from "react";
import { View, TextInput, TouchableWithoutFeedback, StyleSheet, Pressable } from "react-native";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Número de slots visibles. PIN del backend acepta 4-6, mostramos 6 por
   *  default para que el usuario pueda usar el máximo si quiere — si se
   *  conforma con 4-5, deja los slots finales vacíos y presiona Entrar. */
  length?: number;
  autoFocus?: boolean;
  error?: boolean;
}

/**
 * Input de PIN visual con slots tipo dot-grid. Reemplaza al TextInput
 * con `secureTextEntry` que en algunos Android (combinado con
 * keyboardType="number-pad") no renderiza el carácter de máscara y
 * deja al usuario sin feedback de cuánto lleva escrito.
 *
 * Internamente sigue habiendo un TextInput numérico (oculto) que
 * captura los dígitos y el teclado nativo; los slots solo dibujan el
 * estado.
 */
export default function PinInput({ value, onChange, length = 6, autoFocus, error }: Props) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  function handleChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, length);
    onChange(digits);
  }

  return (
    <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
      <View style={styles.row}>
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          const cursorAqui = focused && i === value.length;
          return (
            <Pressable
              key={i}
              onPress={() => inputRef.current?.focus()}
              style={[
                styles.slot,
                filled && styles.slotFilled,
                cursorAqui && styles.slotCursor,
                error && styles.slotError,
              ]}
            >
              {filled ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
        <TextInput
          placeholderTextColor="#9C8B72"
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          maxLength={length}
          autoFocus={autoFocus}
          // textContentType=oneTimeCode permite el autofill de SMS en iOS
          // si llegáramos a usarlo; no afecta este flujo.
          textContentType="oneTimeCode"
          style={styles.hiddenInput}
          caretHidden
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center", paddingVertical: 6 },
  slot: { width: 40, height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: "#E5E7EB", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  slotFilled: { borderColor: "#F2A65A", backgroundColor: "#FEF5EA" },
  slotCursor: { borderColor: "#F2A65A", borderWidth: 2 },
  slotError: { borderColor: "#DC2626" },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#F2A65A" },
  hiddenInput: { position: "absolute", opacity: 0, width: 1, height: 1 },
});
