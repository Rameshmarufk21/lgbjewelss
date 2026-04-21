import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LabGrownBox Production",
    short_name: "LGB Orders",
    description: "Jewelry order management and production tracking",
    start_url: "/",
    display: "standalone",
    background_color: "#fdf6ec",
    theme_color: "#0d2b6e",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
