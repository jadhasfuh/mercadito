import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing, ViewStyle } from "react-native";

type Props = {
  texto?: string;
  fullScreen?: boolean;
  tamano?: "sm" | "md" | "lg";
};

const TAMANOS = {
  sm: { logo: 56, moto: 34, ancho: 200 },
  md: { logo: 88, moto: 46, ancho: 260 },
  lg: { logo: 112, moto: 56, ancho: 300 },
};

export default function Loader({ texto = "Cargando", fullScreen = true, tamano = "md" }: Props) {
  const { logo, moto, ancho } = TAMANOS[tamano];
  const pulse = useRef(new Animated.Value(0)).current;
  const motoX = useRef(new Animated.Value(0)).current;
  const motoBounce = useRef(new Animated.Value(0)).current;
  const road = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(motoX, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(motoX, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(motoBounce, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(motoBounce, { toValue: 0, duration: 200, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(road, { toValue: 1, duration: 600, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [pulse, motoX, motoBounce, road]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const dist = ancho - moto - 12;
  const tx = motoX.interpolate({ inputRange: [0, 1], outputRange: [0, dist] });
  const rot = motoX.interpolate({ inputRange: [0, 0.5, 1], outputRange: ["-3deg", "2deg", "-3deg"] });
  const ty = motoBounce.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const dashTx = road.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });

  const wrapperStyle: ViewStyle = fullScreen ? styles.fullScreen : styles.inline;

  // Carretera con dashes: array fijo de marcas. Lo desplazamos con translateX
  // y duplicamos para que el loop sea visualmente continuo.
  const numDashes = Math.ceil(ancho / 16) + 2;

  return (
    <View style={wrapperStyle}>
      <Animated.Image
        source={require("../../assets/icon.png")}
        style={{ width: logo, height: logo, transform: [{ scale }], borderRadius: 16 }}
        resizeMode="contain"
      />
      <View style={[styles.roadWrap, { width: ancho, height: moto + 22, marginTop: 18 }]}>
        <View style={[styles.roadClip, { width: ancho }]}>
          <Animated.View style={[styles.roadRow, { width: numDashes * 16, transform: [{ translateX: dashTx }] }]}>
            {Array.from({ length: numDashes }).map((_, i) => (
              <View key={i} style={styles.dash} />
            ))}
          </Animated.View>
        </View>
        <Animated.View
          style={{
            position: "absolute",
            bottom: 8,
            left: 6,
            transform: [{ translateX: tx }, { rotate: rot }],
          }}
        >
          <Animated.View style={{ transform: [{ translateY: ty }] }}>
            <Text style={{ fontSize: moto, lineHeight: moto + 4 }}>🛵</Text>
          </Animated.View>
        </Animated.View>
      </View>
      {texto ? <Text style={styles.texto}>{texto}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7EB",
  },
  inline: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  roadWrap: {
    position: "relative",
  },
  roadClip: {
    position: "absolute",
    bottom: 4,
    left: 0,
    height: 3,
    overflow: "hidden",
  },
  roadRow: {
    flexDirection: "row",
    height: 3,
  },
  dash: {
    width: 8,
    height: 3,
    marginRight: 8,
    backgroundColor: "rgba(146,64,14,0.4)",
    borderRadius: 2,
  },
  texto: {
    marginTop: 14,
    color: "rgba(146,64,14,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
});
