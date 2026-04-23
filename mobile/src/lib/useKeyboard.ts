import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Retorna la altura actual del teclado (0 si está cerrado).
 * Úsalo en ScrollViews que contengan TextInputs para agregar padding
 * dinámico y que el campo enfocado nunca quede tapado.
 *
 * Ejemplo:
 *   const kb = useKeyboardHeight();
 *   <ScrollView contentContainerStyle={{ paddingBottom: kb + 20 }} ... />
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // iOS usa "WillShow/WillHide" (anima antes de aparecer), Android "DidShow/DidHide".
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}
