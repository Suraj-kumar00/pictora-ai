import express from "express";
import {
  TrainModel,
  GenerateImage,
  GenerateImagesFromPack,
} from "common/types";
import { prismaClient } from "db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ReplicateModel } from "./models/ReplicateModel.js";
import cors from "cors";
import { authMiddleware } from "./middleware.js";
import dotenv from "dotenv";

import paymentRoutes from "./routes/payment.routes.new.js";
import { router as webhookRouter } from "./routes/webhook.routes.js";

const IMAGE_GEN_CREDITS = 1;
const TRAIN_MODEL_CREDITS = 20;

dotenv.config();

console.log("Stripe key loaded:", !!process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 8000;

const replicateModel = new ReplicateModel();

// Initialize S3 Client
const s3Client = new S3Client({
  region: "ap-south-1",
  endpoint: "https://s3.ap-south-1.amazonaws.com",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  forcePathStyle: false,
});

// Function to check database connection
function checkDatabaseConnection() {
  try {
    prismaClient.$connect();
    console.log("✅ PostgreSQL connected via supabase");
  } catch (error) {
    console.error("❌ Database connection error:", error);
    process.exit(1);
  }
}

const app = express();
app.use(
  cors({
    origin: [process.env.FRONTEND_URL || "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-amz-acl"],
  })
);
app.use(express.json({ limit: "50mb" }));

app.get("/pre-signed-url", async (req, res) => {
  try {
    if (!process.env.BUCKET_NAME) {
      throw new Error("BUCKET_NAME environment variable is not set");
    }

    const key = `models/${Date.now()}_${Math.random().toString(36).substring(7)}.zip`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: key,
      ContentType: "application/zip",
      ACL: "public-read",
    });

    const url = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['host', 'x-amz-acl']),
      signingRegion: 'ap-south-1',
      signingService: 's3',
      useAccelerateEndpoint: false,
    });
    
    res.json({ 
      url, 
      key,
      bucket: process.env.BUCKET_NAME,
      region: "ap-south-1"
    });
  } catch (error: any) {
    console.error("Error generating pre-signed URL:", error);
    res.status(500).json({ 
      error: "Failed to generate upload URL",
      details: error.message
    });
  }
});

app.post("/ai/training", authMiddleware, async (req, res) => {
  try {
    const parsedBody = TrainModel.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(411).json({
        message: "Input incorrect",
        error: parsedBody.error,
      });
      return;
    }

    await replicateModel.trainModel(
      parsedBody.data.zipUrl,
      parsedBody.data.name
    );

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
      },
    });

    res.json({
      modelId: data.id,
    });
  } catch (error) {
    console.error("Error in /ai/training:", error);
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

  const { imageUrl } = await replicateModel.generateImage(
    parsedBody.data.prompt
  );

  const data = await prismaClient.outputImages.create({
    data: {
      prompt: parsedBody.data.prompt,
      userId: req.userId!,
      modelId: parsedBody.data.modelId,
      imageUrl,
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
      userId: req.userId!,
    },
  });

  if (!model || !model.tensorPath) {
    res.status(411).json({
      message: "Model not found",
    });
    return;
  }

  const credits = await prismaClient.userCredit.findUnique({
    where: {
      userId: req.userId!,
    },
  });

  if ((credits?.amount ?? 0) < prompts.length * IMAGE_GEN_CREDITS) {
    res.status(411).json({
      message: "Not enough credits",
    });
    return;
  }

  let generatedImages = await Promise.all(
    prompts.map((prompt) =>
      replicateModel.generateImage(prompt.prompt)
    )
  );

  const outputImages = await Promise.all(
    generatedImages.map((result, index) =>
      prismaClient.outputImages.create({
        data: {
          prompt: prompts[index].prompt,
          userId: req.userId!,
          modelId: model.id,
          imageUrl: result.imageUrl,
        },
      })
    )
  );

  await prismaClient.userCredit.update({
    where: {
      userId: req.userId!,
    },
    data: {
      amount: { decrement: prompts.length * IMAGE_GEN_CREDITS },
    },
  });

  res.json({
    imageIds: outputImages.map((img) => img.id),
  });
});

app.get("/pack/bulk", async (req, res) => {
  try {
    const packs = await prismaClient.packs.findMany({
      include: {
        prompts: true
      }
    });

    const formattedPacks = packs.map(pack => ({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      imageUrl1: pack.imageUrl1,
      imageUrl2: pack.imageUrl2,
      imageUrl3: pack.imageUrl3 || "",
      imageUrl4: pack.imageUrl4 || "",
      category: pack.category || "",
      imagesCount: pack.imagesCount,
      createdAt: pack.createdAt.toISOString(),
      prompts: pack.prompts.map(p => p.prompt)
    }));

    res.json({ packs: formattedPacks });
  } catch (error) {
    console.error("Error fetching packs:", error);
    res.status(500).json({ 
      error: "Failed to fetch packs",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

app.get("/image/bulk", authMiddleware, async (req, res) => {
  try {
    const images = await prismaClient.outputImages.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ images });
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

app.get("/models", authMiddleware, async (req, res) => {
  try {
    const models = await prismaClient.model.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ models });
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({ error: "Failed to fetch models" });
  }
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

app.use("/payment", paymentRoutes);
app.use("/webhook", webhookRouter);

// Check database connection before starting the server
checkDatabaseConnection();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
