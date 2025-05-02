import Replicate from "replicate";
import { BaseModel } from "./BaseModel";

export class ReplicateModel {
  private replicate: Replicate;

  constructor() {
    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });
  }

  public async generateImage(prompt: string, tensorPath: string) {
    console.log(
      "Generating image with prompt:",
      prompt,
      "and tensorPath:",
      tensorPath
    );

    try {
      // Prepare prediction configuration
      const predictionConfig = {
        version: "black-forest-labs/flux-1.1-pro-ultra",
        input: {
          prompt: prompt,
          lora_url: tensorPath,
          lora_scale: 1,
          num_inference_steps: 28,
          guidance_scale: 7.5,
        },
      };

      // Add webhook configuration for all environments using HTTPS
      if (process.env.WEBHOOK_BASE_URL) {
        let webhookUrl = process.env.WEBHOOK_BASE_URL;
        // Make sure the webhook URL starts with https
        if (webhookUrl.startsWith("http://")) {
          webhookUrl = webhookUrl.replace("http://", "https://");
        } else if (!webhookUrl.startsWith("https://")) {
          webhookUrl = `https://${webhookUrl}`;
        }

        // Trim any trailing slash
        webhookUrl = webhookUrl.replace(/\/+$/, "");

        // Use any to bypass TypeScript type checking
        (predictionConfig as any).webhook =
          `${webhookUrl}/replicate/webhook/image`;
        (predictionConfig as any).webhook_events_filter = ["completed"];

        console.log("Using webhook URL:", (predictionConfig as any).webhook);
      } else {
        console.log(
          "Warning: No webhook URL configured, using synchronous mode"
        );
      }

      // Log the final configuration for debugging
      console.log("Final prediction config:", predictionConfig);

      const prediction =
        await this.replicate.predictions.create(predictionConfig);

      console.log("Prediction created:", prediction.id);
      return {
        request_id: prediction.id,
        response_url: prediction.urls.get,
      };
    } catch (error) {
      console.error("Error generating image:", error);
      throw error;
    }
  }

  public async trainModel(zipUrl: string, triggerWord: string) {
    console.log("Training model with URL:", zipUrl);

    try {
      // Check if it's an S3 URL (from AWS)
      const isS3Url =
        zipUrl.includes("s3.ap-south-1.amazonaws.com") ||
        zipUrl.includes("pictora-ai-s3") ||
        zipUrl.includes(process.env.BUCKET_NAME || "");

      // Validate the URL is accessible
      if (!isS3Url) {
        try {
          console.log("Validating ZIP URL accessibility:", zipUrl);
          const response = await fetch(zipUrl, { method: "HEAD" });
          console.log("ZIP URL check response status:", response.status);

          if (!response.ok) {
            console.error(
              `ZIP URL not accessible: ${zipUrl}, status: ${response.status}`
            );
            throw new Error(`ZIP URL not accessible: ${response.status}`);
          }
        } catch (fetchError) {
          console.error("Error checking ZIP URL:", fetchError);
          throw new Error(`ZIP URL validation failed: ${fetchError}`);
        }
      } else {
        console.log("S3 URL detected, skipping accessibility check:", zipUrl);
      }

      // Now proceed with model training
      console.log("Submitting model training with zipUrl:", zipUrl);

      // Check if REPLICATE_API_TOKEN exists
      if (!process.env.REPLICATE_API_TOKEN) {
        console.error("REPLICATE_API_TOKEN is not set");
        throw new Error("Replicate API token is missing");
      }

      // Prepare the prediction configuration
      const predictionConfig = {
        version:
          "ostris/flux-dev-lora-trainer:4ffd32160efd92e956d39c5338a9b8fbafca58e03f791f6d8011f3e20e8ea6fa",
        input: {
          input_images: zipUrl,
          trigger_word: triggerWord,
          prompt: `A photo of ${triggerWord}`,
          steps: 1000,
          batch_size: 4,
          learning_rate: 1e-4,
          resolution: 1024,
        },
      };

      // Add webhook configuration for all environments using HTTPS
      if (process.env.WEBHOOK_BASE_URL) {
        let webhookUrl = process.env.WEBHOOK_BASE_URL;
        // Make sure the webhook URL starts with https
        if (webhookUrl.startsWith("http://")) {
          webhookUrl = webhookUrl.replace("http://", "https://");
        } else if (!webhookUrl.startsWith("https://")) {
          webhookUrl = `https://${webhookUrl}`;
        }

        // Trim any trailing slash
        webhookUrl = webhookUrl.replace(/\/+$/, "");

        // Use any to bypass TypeScript type checking
        (predictionConfig as any).webhook =
          `${webhookUrl}/replicate/webhook/train`;
        (predictionConfig as any).webhook_events_filter = ["completed"];

        console.log("Using webhook URL:", (predictionConfig as any).webhook);
      } else {
        console.log(
          "Warning: No webhook URL configured, using synchronous mode"
        );
      }

      // Log the final configuration for debugging
      console.log("Final prediction config:", predictionConfig);

      const prediction =
        await this.replicate.predictions.create(predictionConfig);

      console.log(
        "Model training submitted successfully, prediction ID:",
        prediction.id
      );
      return {
        request_id: prediction.id,
        response_url: prediction.urls.get,
      };
    } catch (error) {
      console.error("Error in trainModel:", error);
      throw error;
    }
  }

  public async generateImageSync(tensorPath: string) {
    try {
      console.log(
        "Generating image synchronously with tensorPath:",
        tensorPath
      );

      // Use a different approach to avoid using 'wait'
      const prediction = await this.replicate.predictions.create({
        version: "black-forest-labs/flux-1.1-pro-ultra",
        input: {
          prompt:
            "A professional headshot photo in front of a white background",
          lora_url: tensorPath,
          lora_scale: 1,
          num_inference_steps: 28,
          guidance_scale: 7.5,
        },
      });

      // Now explicitly poll for completion
      let completedPrediction = await this.replicate.predictions.get(
        prediction.id
      );

      // Poll until the prediction is complete
      while (
        completedPrediction.status !== "succeeded" &&
        completedPrediction.status !== "failed"
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second between polls
        completedPrediction = await this.replicate.predictions.get(
          prediction.id
        );
        console.log("Polling prediction status:", completedPrediction.status);
      }

      console.log("Sync image generation completed:", completedPrediction);

      // Handle different output formats from Replicate
      let imageUrl;
      if (
        completedPrediction.output &&
        Array.isArray(completedPrediction.output) &&
        completedPrediction.output.length > 0
      ) {
        imageUrl = completedPrediction.output[0];
      } else if (
        completedPrediction.output &&
        typeof completedPrediction.output === "string"
      ) {
        imageUrl = completedPrediction.output;
      } else {
        throw new Error("No image URL found in Replicate response");
      }

      return {
        imageUrl: imageUrl,
      };
    } catch (error) {
      console.error("Error in generateImageSync:", error);
      throw error;
    }
  }
}
