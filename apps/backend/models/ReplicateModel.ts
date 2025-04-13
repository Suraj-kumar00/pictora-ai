import Replicate from "replicate";
import { BaseModel } from "./BaseModel.js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

// Check for REPLICATE_API_TOKEN
const replicateToken = process.env.REPLICATE_API_TOKEN;
if (!replicateToken) {
  console.error("REPLICATE_API_TOKEN is not set in environment variables");
  // Don't throw here, let the application start and handle the error when needed
}

const replicate = replicateToken
  ? new Replicate({
      auth: replicateToken,
    })
  : null;

export class ReplicateModel extends BaseModel {
  constructor() {
    super();
  }

  public async generateImage(
    prompt: string,
    modelId?: `${string}/${string}` | `${string}/${string}:${string}`
  ): Promise<{ imageUrl: string; status: string }> {
    if (!replicate) {
      throw new Error("Replicate client not initialized. Check your REPLICATE_API_TOKEN.");
    }

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