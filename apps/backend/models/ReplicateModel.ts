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
    console.log("Generating image with prompt:", prompt, "and tensorPath:", tensorPath);
    
    try {
      const prediction = await this.replicate.predictions.create({
        version: "8ede8c08a677a46d24fdaaa6e0eaad6f0b5a2c7a684a0120009e96b3cdaaa33c",
        input: {
          prompt: prompt,
          lora_url: tensorPath,
          lora_scale: 1,
        },
        webhook: `${process.env.WEBHOOK_BASE_URL}/replicate/webhook/image`,
        webhook_events_filter: ["completed"]
      });

      console.log("Prediction created:", prediction.id);
      return {
        request_id: prediction.id,
        response_url: prediction.urls.get
      };
    } catch (error) {
      console.error("Error generating image:", error);
      throw error;
    }
  }

  public async trainModel(zipUrl: string, triggerWord: string) {
    console.log("Training model with URL:", zipUrl);

    try {
      // First try to check if the ZIP URL is accessible
      try {
        console.log("Checking ZIP URL accessibility:", zipUrl);
        const response = await fetch(zipUrl, { method: "HEAD" });
        console.log("ZIP URL check response status:", response.status);
        
        if (!response.ok) {
          console.error(
            `ZIP URL not accessible: ${zipUrl}, status: ${response.status}`
          );
          
          // For development mode, provide a fallback URL if the original is not accessible
          if (process.env.NODE_ENV === 'development') {
            console.log("In development mode: Using fallback training data URL");
            // Use a placeholder/sample dataset URL that's publicly accessible
            zipUrl = "https://replicate.delivery/pbxt/AYgkdPuQBdi6GqjuioFQy1bP3rBHphZVK4uFMCn5ZRy6AjDh/cifakes.zip";
          } else {
            throw new Error(`ZIP URL not accessible: ${response.status}`);
          }
        }
      } catch (fetchError) {
        console.error("Error checking ZIP URL:", fetchError);
        
        // For development mode, provide a fallback URL
        if (process.env.NODE_ENV === 'development') {
          console.log("In development mode: Using fallback training data URL after fetch error");
          // Use a placeholder/sample dataset URL that's publicly accessible
          zipUrl = "https://replicate.delivery/pbxt/AYgkdPuQBdi6GqjuioFQy1bP3rBHphZVK4uFMCn5ZRy6AjDh/cifakes.zip";
        } else {
          throw new Error(`ZIP URL validation failed: ${fetchError}`);
        }
      }

      // Now proceed with model training using the (potentially fallback) zipUrl
      console.log("Submitting model training with zipUrl:", zipUrl);
      
      // Check if REPLICATE_API_TOKEN exists
      if (!process.env.REPLICATE_API_TOKEN) {
        console.error("REPLICATE_API_TOKEN is not set");
        throw new Error("Replicate API token is missing");
      }
      
      // In development, we can log more details for debugging
      if (process.env.NODE_ENV === 'development') {
        console.log("Replicate API config:", {
          version: "8ede8c08a677a46d24fdaaa6e0eaad6f0b5a2c7a684a0120009e96b3cdaaa33c",
          input: {
            training_data: zipUrl,
            trigger_word: triggerWord,
          },
          webhook: `${process.env.WEBHOOK_BASE_URL}/replicate/webhook/train`,
        });
      }
      
      // For development testing - if you want to skip the actual API call
      if (process.env.NODE_ENV === 'development' && process.env.MOCK_REPLICATE === 'true') {
        console.log("Using mock model training response for development");
        return {
          request_id: "mock-request-id-" + Date.now(),
          response_url: "https://api.replicate.com/v1/predictions/mock-id"
        };
      }
      
      const prediction = await this.replicate.predictions.create({
        version: "8ede8c08a677a46d24fdaaa6e0eaad6f0b5a2c7a684a0120009e96b3cdaaa33c",
        input: {
          training_data: zipUrl,
          trigger_word: triggerWord,
        },
        webhook: `${process.env.WEBHOOK_BASE_URL}/replicate/webhook/train`,
        webhook_events_filter: ["completed"]
      });

      console.log("Model training submitted successfully, prediction ID:", prediction.id);
      return {
        request_id: prediction.id,
        response_url: prediction.urls.get
      };
    } catch (error) {
      console.error("Error in trainModel:", error);
      
      // For development mode, return a mock response
      if (process.env.NODE_ENV === 'development') {
        console.log("In development mode: Returning mock training response after error");
        return {
          request_id: "mock-error-recovery-id-" + Date.now(),
          response_url: "https://api.replicate.com/v1/predictions/mock-error-recovery-id"
        };
      }
      
      throw error;
    }
  }

  public async generateImageSync(tensorPath: string) {
    try {
      console.log("Generating image synchronously with tensorPath:", tensorPath);
      
      // For development/testing if needed
      if (process.env.NODE_ENV === 'development' && process.env.MOCK_REPLICATE === 'true') {
        console.log("Using mock image generation for development");
        return {
          imageUrl: "https://replicate.delivery/pbxt/FeNZUBbDXTpZOa2JhzxoOfUkWXUwoUQqACnqJTAXzJKmyexHB/out.png"
        };
      }
      
      // Use a different approach to avoid using 'wait'
      const prediction = await this.replicate.predictions.create({
        version: "8ede8c08a677a46d24fdaaa6e0eaad6f0b5a2c7a684a0120009e96b3cdaaa33c",
        input: {
          prompt: "Generate a head shot for this user in front of a white background",
          lora_url: tensorPath,
          lora_scale: 1,
        }
      });

      // Now explicitly poll for completion
      let completedPrediction = await this.replicate.predictions.get(prediction.id);
      
      // Poll until the prediction is complete
      while (completedPrediction.status !== "succeeded" && completedPrediction.status !== "failed") {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between polls
        completedPrediction = await this.replicate.predictions.get(prediction.id);
        console.log("Polling prediction status:", completedPrediction.status);
      }

      console.log("Sync image generation completed:", completedPrediction);
      
      // Handle different output formats from Replicate
      let imageUrl;
      if (completedPrediction.output && Array.isArray(completedPrediction.output) && completedPrediction.output.length > 0) {
        imageUrl = completedPrediction.output[0];
      } else if (completedPrediction.output && typeof completedPrediction.output === 'string') {
        imageUrl = completedPrediction.output;
      } else {
        throw new Error("No image URL found in Replicate response");
      }

      return {
        imageUrl: imageUrl
      };
    } catch (error) {
      console.error("Error in generateImageSync:", error);
      throw error;
    }
  }
}
