import { NativeImage } from "electron";
import { encode as blurHashEncode } from "blurhash";

export const getBlurHash = async (image: NativeImage) => {
    let blurhash: string = null;
    let calcImage = image;

    try {
        let size = calcImage.getSize();

        // If the image is "too big", rescale it so blurhash is computed faster
        if (size.width > 320) {
            calcImage = calcImage.resize({ width: 320, quality: "good" });
            size = calcImage.getSize();
        }

        // Compute blurhash
        blurhash = blurHashEncode(Uint8ClampedArray.from(calcImage.toBitmap()), size.width, size.height, 3, 3);
    } catch (ex) {
        console.log(ex);
        console.log(`Could not compute blurhash`);
    }

    return blurhash;
};
