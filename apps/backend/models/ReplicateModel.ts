import Replicate from "replicate";
import { BaseModel } from "./BaseModel.js";

if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error("REPLICATE_API_TOKEN environment variable is not set");
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export class ReplicateModel extends BaseModel {
  constructor() {
    super();
  }

  public async generateImage(
    prompt: string,
    modelId?: `${string}/${string}` | `${string}/${string}:${string}`
  ): Promise<{ imageUrl: string; status: string }> {
    const output = await replicate.run(
      modelId || "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b" as `${string}/${string}:${string}`,
      {
        input: {
          prompt,
        },
      }
    );

    if (!Array.isArray(output) || output.length === 0) {
      throw new Error("No image generated");
    }

    return {
      imageUrl: output[0] as string,
      status: "completed",
    };
  }

  public async trainModel(zipUrl: string, triggerWord: string): Promise<void> {
    throw new Error("Training models is not supported with Replicate");
  }

  public async generateImageSync(prompt: string): Promise<{ imageUrl: string; status: string }> {
    return this.generateImage(prompt);
  }
} 