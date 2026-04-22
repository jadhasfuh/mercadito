import * as ImagePicker from "expo-image-picker";

/**
 * Selecciona una imagen de cámara o galería, la comprime y la retorna como data URL
 * base64 (igual formato que guarda el backend en puestos.logo y productos.imagen).
 * Retorna null si el usuario cancela o no da permiso.
 */
export async function pickImageAsDataUrl(source: "camera" | "library" = "library"): Promise<string | null> {
  let perm;
  if (source === "camera") {
    perm = await ImagePicker.requestCameraPermissionsAsync();
  } else {
    perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  }
  if (!perm.granted) return null;

  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.6,
    allowsEditing: true,
    aspect: [1, 1],
    base64: true,
  };

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const base64 = asset.base64;
  if (!base64) return null;
  const mime = asset.mimeType ?? "image/jpeg";
  return `data:${mime};base64,${base64}`;
}
