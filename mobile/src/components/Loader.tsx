import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Image, Animated, Easing, ViewStyle } from "react-native";

type Props = {
  texto?: string;
  fullScreen?: boolean;
  tamano?: "sm" | "md" | "lg";
};

const TAMANOS = {
  sm: { logo: 56, dot: 7 },
  md: { logo: 88, dot: 9 },
  lg: { logo: 112, dot: 11 },
};

export default function Loader({ texto = "Cargando", fullScreen = true, tamano = "md" }: Props) {
  const { logo, dot } = TAMANOS[tamano];
  const pulse = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true })
    ).start();
    dots.forEach((d, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true }),
          Animated.delay(400 - i * 150),
        ])
      ).start();
    });
  }, [pulse, ring, dots]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.4] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });

  const wrapperStyle: ViewStyle = fullScreen ? styles.fullScreen : styles.inline;

  return (
    <View style={wrapperStyle}>
      <View style={[styles.logoWrap, { width: logo, height: logo }]}>
        <Animated.View
          style={[
            styles.ring,
            {
              width: logo,
              height: logo,
              borderRadius: logo / 2,
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />
        <Animated.Image
          source={require("../../assets/icon.png")}
          style={{ width: logo, height: logo, transform: [{ scale }] }}
          resizeMode="contain"
        />
      </View>
      <View style={styles.dotsRow}>
        {dots.map((d, i) => {
          const ty = d.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
          const op = d.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
          return (
            <Animated.View
              key={i}
              style={{
                width: dot,
                height: dot,
                borderRadius: dot / 2,
                backgroundColor: "#FF7A2B",
                marginHorizontal: 3,
                opacity: op,
                transform: [{ translateY: ty }],
              }}
            />
          );
        })}
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
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    backgroundColor: "rgba(242,140,40,0.25)",
  },
  dotsRow: {
    flexDirection: "row",
    marginTop: 20,
  },
  texto: {
    marginTop: 14,
    color: "rgba(146,64,14,0.7)",
    fontSize: 14,
    fontWeight: "500",
  },
});
