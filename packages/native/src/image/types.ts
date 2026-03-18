/** Sampling filter for resize operations. */
export enum SamplingFilter {
  /** Nearest-neighbor sampling (fast, low quality). */
  Nearest = 1,
  /** Triangle filter (linear interpolation). */
  Triangle = 2,
  /** Catmull-Rom filter with sharper edges. */
  CatmullRom = 3,
  /** Gaussian filter for smoother results. */
  Gaussian = 4,
  /** Lanczos3 filter for high-quality downscaling. */
  Lanczos3 = 5,
}

/** Output image format for encoding. */
export enum ImageFormat {
  /** PNG (lossless, quality ignored). */
  PNG = 0,
  /** JPEG (lossy, quality 0-100). */
  JPEG = 1,
  /** WebP (lossless, quality ignored). */
  WebP = 2,
  /** GIF (quality ignored). */
  GIF = 3,
}

/** Native image handle returned from parse(). */
export interface NativeImageHandle {
  /** Image width in pixels. */
  readonly width: number;
  /** Image height in pixels. */
  readonly height: number;
  /** Encode to bytes in the specified format. Returns a Promise. */
  encode(format: number, quality: number): Promise<number[]>;
  /** Resize to the specified dimensions. Returns a new NativeImage Promise. */
  resize(
    width: number,
    height: number,
    filter: SamplingFilter,
  ): Promise<NativeImageHandle>;
}
