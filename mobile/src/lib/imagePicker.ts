import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Lado máximo de la imagen guardada. Igual que el resize de la web
// (canvas a 1200px) — sin esto el base64 de una foto de celular puede
// pesar varios MB, lo que congela la UI al codificarlo y al subirlo.
const MAX_DIM = 1200;

/**
 * Selecciona una imagen de cámara o galería, la REDIMENSIONA a máx 1200px y
 * la comprime (JPEG 0.85), retornándola como data URL base64 (mismo formato
 * que guarda el backend en puestos.logo y productos.imagen).
 *
 * El resize es clave: antes pedíamos base64 directo al picker sin
 * redimensionar, y una foto de 3–5 MB codificada en base64 (+33%) trababa
 * el hilo JS al elegirla/cambiarla y mandaba un PATCH de varios MB.
 *
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

  // Sin `base64` aquí — primero redimensionamos, luego codificamos. `quality: 1`
  // para no doble-comprimir: la compresión real la hace el manipulator.
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  };

  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync(opts)
    : await ImagePicker.launchImageLibraryAsync(opts);

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    // Solo reducir; nunca agrandar (evita inflar fotos chicas).
    if (asset.width && asset.width > MAX_DIM) {
      ctx.resize({ width: MAX_DIM });
    }
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
    if (!out.base64) return null;
    return `data:image/jpeg;base64,${out.base64}`;
  } catch {
    return null;
  }
}
