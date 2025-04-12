import { ModelConfig } from "@/types";

export const REPLICATE_MODELS: Record<string, ModelConfig> = {
  "flux-1.1-pro-ultra": {
    id: "flux-1.1-pro-ultra",
    name: "FLUX 1.1 Pro Ultra",
    description: "High-quality image generation with up to 4 megapixels resolution",
    provider: "replicate",
    version: "1.1",
    credits: 1,
    config: {
      width: 1024,
      height: 1024,
      num_outputs: 1,
      scheduler: "K_EULER",
      num_inference_steps: 30,
      guidance_scale: 7.5,
      prompt_strength: 0.8,
      negative_prompt: "blurry, bad quality, distorted, deformed, ugly, bad anatomy, bad proportions",
    },
  },
};

export const DEFAULT_REPLICATE_MODEL = "flux-1.1-pro-ultra"; 