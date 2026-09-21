import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador flotante de desarrollo tapa la navegación del staff, que vive
  // abajo a la izquierda justamente donde él se pone.
  devIndicators: false,
};

export default nextConfig;
