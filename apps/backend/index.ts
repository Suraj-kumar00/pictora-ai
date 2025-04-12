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
  region: "auto",
  endpoint: process.env.ENDPOINT || "https://s3.amazonaws.com",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
  forcePathStyle: true, // Required for some S3-compatible services
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
    origin: ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.get("/pre-signed-url", async (req, res) => {
  const key = `models/${Date.now()}_${Math.random()}.zip`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    ContentType: "application/zip",
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    res.json({ url, key });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({ error: "Failed to generate presigned URL" });
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
      OR: [{ userId: req.userId }, { open: true }],
    },
  });

  res.json({
    models,
  });
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
app.use("/api/webhook", webhookRouter);

// Check database connection before starting the server
checkDatabaseConnection();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
