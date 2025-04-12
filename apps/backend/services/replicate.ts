import Replicate from "replicate";
import { REPLICATE_MODELS } from "./replicateModels";

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error("Missing REPLICATE_API_TOKEN environment variable");
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function generateImageWithReplicate(
  prompt: string,
  modelId: string = "flux-1.1-pro-ultra"
) {
  const model = REPLICATE_MODELS[modelId];
  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }

  try {
    const output = await replicate.run(
      `black-forest-labs/${modelId}:${model.version}`,
      {
        input: {
          prompt,
          ...model.config,
        },
      }
    );

    if (!output || !Array.isArray(output) || output.length === 0) {
      throw new Error("No image generated");
    }

    return {
      imageUrl: output[0],
      status: "completed",
    };
  } catch (error) {
    console.error("Replicate generation error:", error);
    throw error;
  }
}

export { replicate }; 