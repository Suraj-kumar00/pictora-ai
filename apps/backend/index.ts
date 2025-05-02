import express from "express";
import {
  TrainModel,
  GenerateImage,
  GenerateImagesFromPack,
} from "common/types";
import { prismaClient } from "db";
import { S3Client } from "bun";
import { ReplicateModel } from "./models/ReplicateModel";
import cors from "cors";
import { authMiddleware } from "./middleware";
import dotenv from "dotenv";

import paymentRoutes from "./routes/payment.routes";
import { router as webhookRouter } from "./routes/webhook.routes";
import healthRoutes from "./routes/health.routes";

const IMAGE_GEN_CREDITS = 1;
const TRAIN_MODEL_CREDITS = 20;

dotenv.config();

const PORT = process.env.PORT || 8000;

const replicateModel = new ReplicateModel();

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Register health check route
app.use("/api/health", healthRoutes);

app.get("/pre-signed-url", async (req, res) => {
  try {
    // Generate a unique key for the ZIP file
    const timestamp = Date.now();
    const random = Math.random().toString().substring(2, 10);
    const key = `models/${timestamp}_${random}.zip`;

    console.log("Generating pre-signed URL with:", {
      key,
      accessKey: process.env.S3_ACCESS_KEY ? "Set" : "Not set",
      secretKey: process.env.S3_SECRET_KEY ? "Set" : "Not set",
      endpoint: process.env.ENDPOINT,
      bucket: process.env.BUCKET_NAME,
    });

    // Verify we have all required credentials
    if (
      !process.env.S3_ACCESS_KEY ||
      !process.env.S3_SECRET_KEY ||
      !process.env.ENDPOINT ||
      !process.env.BUCKET_NAME
    ) {
      console.error("Missing S3 credentials");
      throw new Error("Missing required S3 credentials");
    }

    const url = S3Client.presign(key, {
      method: "PUT",
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      endpoint: process.env.ENDPOINT,
      bucket: process.env.BUCKET_NAME,
      expiresIn: 60 * 5,
      type: "application/zip",
    });

    res.json({
      url,
      key,
    });
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    res.status(500).json({
      message: "Failed to generate pre-signed URL",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/ai/training", authMiddleware, async (req, res) => {
  try {
    console.log(
      "Received training request:",
      JSON.stringify(req.body, null, 2)
    );

    const parsedBody = TrainModel.safeParse(req.body);
    if (!parsedBody.success) {
      console.error("Input validation failed:", parsedBody.error);
      res.status(411).json({
        message: "Input validation failed",
        error: parsedBody.error,
      });
      return;
    }

    console.log("Input validation successful, proceeding with training");

    // Check if the user has enough credits
    const userCredits = await prismaClient.userCredit.findUnique({
      where: {
        userId: req.userId!,
      },
    });

    if ((userCredits?.amount ?? 0) < TRAIN_MODEL_CREDITS) {
      res.status(411).json({
        message: "Not enough credits",
      });
      return;
    }

    try {
      const { request_id, response_url } = await replicateModel.trainModel(
        parsedBody.data.zipUrl,
        parsedBody.data.name
      );

      console.log(
        "Model training initiated successfully with request ID:",
        request_id
      );

      // Create model record in database
      const data = await prismaClient.model.create({
        data: {
          name: parsedBody.data.name,
          type: parsedBody.data.type,
          age: parsedBody.data.age,
          ethinicity: parsedBody.data.ethinicity,
          eyeColor: parsedBody.data.eyeColor,
          bald: parsedBody.data.bald,
          userId: req.userId!,
          zipUrl: parsedBody.data.zipUrl,
          replicateRequestId: request_id,
        },
      });

      // Deduct credits immediately when training starts
      await prismaClient.userCredit.update({
        where: {
          userId: req.userId!,
        },
        data: {
          amount: { decrement: TRAIN_MODEL_CREDITS },
        },
      });

      console.log("Model record created with ID:", data.id);
      console.log(
        `Deducted ${TRAIN_MODEL_CREDITS} credits from user ${req.userId}`
      );

      res.json({
        modelId: data.id,
      });
    } catch (trainingError) {
      console.error("Error in model training:", trainingError);
      res.status(500).json({
        message: "Model training failed",
        error:
          trainingError instanceof Error
            ? trainingError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    console.error("Error in /ai/training endpoint:", error);
    res.status(500).json({
      message: "Training failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/ai/generate", authMiddleware, async (req, res) => {
  const parsedBody = GenerateImage.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(411).json({});
    return;
  }

  const model = await prismaClient.model.findUnique({
    where: {
      id: parsedBody.data.modelId,
    },
  });

  if (!model || !model.tensorPath) {
    res.status(411).json({
      message: "Model not found",
    });
    return;
  }
  // check if the user has enough credits
  const credits = await prismaClient.userCredit.findUnique({
    where: {
      userId: req.userId!,
    },
  });

  if ((credits?.amount ?? 0) < IMAGE_GEN_CREDITS) {
    res.status(411).json({
      message: "Not enough credits",
    });
    return;
  }

  const { request_id, response_url } = await replicateModel.generateImage(
    parsedBody.data.prompt,
    model.tensorPath
  );

  const data = await prismaClient.outputImages.create({
    data: {
      prompt: parsedBody.data.prompt,
      userId: req.userId!,
      modelId: parsedBody.data.modelId,
      imageUrl: "",
      replicateRequestId: request_id,
    },
  });

  await prismaClient.userCredit.update({
    where: {
      userId: req.userId!,
    },
    data: {
      amount: { decrement: IMAGE_GEN_CREDITS },
    },
  });

  res.json({
    imageId: data.id,
  });
});

app.post("/pack/generate", authMiddleware, async (req, res) => {
  const parsedBody = GenerateImagesFromPack.safeParse(req.body);

  if (!parsedBody.success) {
    res.status(411).json({
      message: "Input incorrect",
    });
    return;
  }

  const prompts = await prismaClient.packPrompts.findMany({
    where: {
      packId: parsedBody.data.packId,
    },
  });

  const model = await prismaClient.model.findFirst({
    where: {
      id: parsedBody.data.modelId,
    },
  });

  if (!model) {
    res.status(411).json({
      message: "Model not found",
    });
    return;
  }

  // check if the user has enough credits
  const credits = await prismaClient.userCredit.findUnique({
    where: {
      userId: req.userId!,
    },
  });

  if ((credits?.amount ?? 0) < IMAGE_GEN_CREDITS * prompts.length) {
    res.status(411).json({
      message: "Not enough credits",
    });
    return;
  }

  let requestIds: { request_id: string }[] = await Promise.all(
    prompts.map((prompt) =>
      replicateModel.generateImage(prompt.prompt, model.tensorPath!)
    )
  );

  const images = await prismaClient.outputImages.createManyAndReturn({
    data: prompts.map((prompt, index) => ({
      prompt: prompt.prompt,
      userId: req.userId!,
      modelId: parsedBody.data.modelId,
      imageUrl: "",
      replicateRequestId: requestIds[index].request_id,
    })),
  });

  await prismaClient.userCredit.update({
    where: {
      userId: req.userId!,
    },
    data: {
      amount: { decrement: IMAGE_GEN_CREDITS * prompts.length },
    },
  });

  res.json({
    images: images.map((image) => image.id),
  });
});

app.get("/pack/bulk", authMiddleware, async (req, res) => {
  // Packs are currently global but require authentication to access
  const packs = await prismaClient.packs.findMany({});

  res.json({
    packs,
  });
});

app.get("/image/bulk", authMiddleware, async (req, res) => {
  const ids = req.query.ids as string[];
  const limit = (req.query.limit as string) ?? "100";
  const offset = (req.query.offset as string) ?? "0";

  const imagesData = await prismaClient.outputImages.findMany({
    where: {
      id: { in: ids },
      userId: req.userId!,
      status: {
        not: "Failed",
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: parseInt(offset),
    take: parseInt(limit),
  });

  res.json({
    images: imagesData,
  });
});

app.get("/models", authMiddleware, async (req, res) => {
  const models = await prismaClient.model.findMany({
    where: {
      userId: req.userId,
    },
  });

  res.json({
    models,
  });
});

// Webhook handler for model training
app.post("/replicate/webhook/train", function (req, res) {
  console.log(
    "====================Received training webhook===================="
  );
  console.log("Received training webhook:", req.body);

  // In Replicate's webhook, the id is typically in the body directly
  const requestId = req.body.id || req.body.request_id;

  if (!requestId) {
    console.error("No request ID found in webhook payload");
    res.status(400).json({ error: "Missing request ID in webhook payload" });
    return;
  }

  // Process asynchronously to avoid webhook timeout
  (async () => {
    try {
      // First find the model to get the userId
      const model = await prismaClient.model.findFirst({
        where: {
          replicateRequestId: requestId,
        },
      });

      console.log("Found model:", model);

      if (!model) {
        console.error("No model found for requestId:", requestId);
        return;
      }

      // Handle error case
      if (req.body.status === "failed") {
        console.error("Training error:", req.body.error);
        await prismaClient.model.updateMany({
          where: {
            replicateRequestId: requestId,
          },
          data: {
            trainingStatus: "Failed",
          },
        });
        return;
      }

      // Replicate status is "succeeded" when complete
      if (req.body.status === "succeeded") {
        try {
          // Get the lora URL from output - Replicate format is different
          let loraUrl;

          if (req.body.output && typeof req.body.output === "string") {
            // Sometimes output is a direct URL string
            loraUrl = req.body.output;
          } else if (req.body.output && req.body.output.lora_url) {
            // Or it might be in an object
            loraUrl = req.body.output.lora_url;
          } else if (
            req.body.output &&
            Array.isArray(req.body.output) &&
            req.body.output.length > 0
          ) {
            // Or it might be the first item in an array
            loraUrl = req.body.output[0];
          } else {
            console.error("Could not find lora URL in response:", req.body);
            throw new Error("Lora URL not found in response");
          }

          console.log("Using lora URL:", loraUrl);

          console.log("Generating preview image with lora URL:", loraUrl);
          const { imageUrl } = await replicateModel.generateImageSync(loraUrl);

          console.log("Generated preview image:", imageUrl);

          await prismaClient.model.updateMany({
            where: {
              replicateRequestId: requestId,
            },
            data: {
              trainingStatus: "Generated",
              tensorPath: loraUrl,
              thumbnail: imageUrl,
            },
          });

          // We already deducted credits at submission time
        } catch (error) {
          console.error("Error processing webhook:", error);
          await prismaClient.model.updateMany({
            where: {
              replicateRequestId: requestId,
            },
            data: {
              trainingStatus: "Failed",
            },
          });
        }
      } else if (req.body.status === "processing") {
        // For any other status, keep it as Pending
        console.log("Updating model status to: Pending");
        await prismaClient.model.updateMany({
          where: {
            replicateRequestId: requestId,
          },
          data: {
            trainingStatus: "Pending",
          },
        });
      }
    } catch (error) {
      console.error("Error in webhook processing:", error);
    }
  })();

  // Always respond quickly to the webhook
  res.json({ message: "Webhook received" });
  return;
});

// Webhook handler for image generation
app.post("/replicate/webhook/image", function (req, res) {
  console.log("Received image webhook:", req.body);

  // Get the request ID from Replicate's webhook
  const requestId = req.body.id || req.body.request_id;

  if (!requestId) {
    console.error("No request ID found in webhook payload");
    res.status(400).json({ error: "Missing request ID in webhook payload" });
    return;
  }

  // Process asynchronously to avoid webhook timeout
  (async () => {
    try {
      if (req.body.status === "failed") {
        await prismaClient.outputImages.updateMany({
          where: {
            replicateRequestId: requestId,
          },
          data: {
            status: "Failed",
          },
        });
        return;
      }

      // Only update when succeeded
      if (req.body.status === "succeeded") {
        let imageUrl;

        // Handle different output formats
        if (req.body.output && typeof req.body.output === "string") {
          imageUrl = req.body.output;
        } else if (
          req.body.output &&
          Array.isArray(req.body.output) &&
          req.body.output.length > 0
        ) {
          imageUrl = req.body.output[0];
        } else {
          console.error("Could not find image URL in response:", req.body);
          return;
        }

        await prismaClient.outputImages.updateMany({
          where: {
            replicateRequestId: requestId,
          },
          data: {
            status: "Generated",
            imageUrl: imageUrl,
          },
        });
      }
    } catch (error) {
      console.error("Error processing image webhook:", error);
    }
  })();

  // Always respond quickly to the webhook
  res.json({ message: "Webhook received" });
  return;
});

app.get("/model/status/:modelId", authMiddleware, async (req, res) => {
  try {
    const modelId = req.params.modelId;

    const model = await prismaClient.model.findUnique({
      where: {
        id: modelId,
        userId: req.userId,
      },
    });

    if (!model) {
      res.status(404).json({
        success: false,
        message: "Model not found",
      });
      return;
    }

    // Return basic model info with status
    res.json({
      success: true,
      model: {
        id: model.id,
        name: model.name,
        status: model.trainingStatus,
        thumbnail: model.thumbnail,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      },
    });
    return;
  } catch (error) {
    console.error("Error checking model status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check model status",
    });
    return;
  }
});

// Register other routes
app.use("/api/payments", paymentRoutes);
app.use("/api/webhooks", webhookRouter);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
