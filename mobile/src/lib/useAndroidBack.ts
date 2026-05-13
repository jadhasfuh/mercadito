import { useCallback, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";
import { useFocusEffect } from "expo-router";

// Devuelve true si el paso consumió el back (no propagar más).
export type BackStep = () => boolean;

// Cadena de pasos a ejecutar al apretar back del sistema.
// Si ningún paso consume, hace doble-tap-exit en Android (toast + segundo back sale).
// Pasar `skipExit: true` para nunca dejar salir (ej. tabs que rutean a home).
export function useAndroidBack(steps: BackStep[], opts: { skipExit?: boolean } = {}) {
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const { skipExit } = opts;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const last = { value: 0 };
      const onBack = () => {
        for (const step of stepsRef.current) {
          if (step()) return true;
        }
        if (skipExit) return true;
        const now = Date.now();
        if (now - last.value < 2000) return false;
        last.value = now;
        ToastAndroid.show("Aprieta atrás otra vez para salir", ToastAndroid.SHORT);
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [skipExit])
  );
}
