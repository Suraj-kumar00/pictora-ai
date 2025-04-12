import express from "express";
import { authMiddleware } from "../middleware.js";
import { prismaClient } from "db";
import { generateImageWithReplicate } from "../services/replicate.js";
import { REPLICATE_MODELS } from "../services/replicateModels.js";

const router = express.Router();

router.post(
  "/generate",
  authMiddleware,
  async (req: express.Request, res: express.Response) => {
    try {
      const { prompt, modelId } = req.body;
      const userId = req.userId!;

      if (!prompt) {
        res.status(400).json({ message: "Prompt is required" });
        return;
      }

      // Get user credits
      const userCredit = await prismaClient.userCredit.findUnique({
        where: { userId },
      });

      if (!userCredit || userCredit.amount < 1) {
        res.status(400).json({ message: "Insufficient credits" });
        return;
      }

      // Create image record
      const image = await prismaClient.image.create({
        data: {
          userId,
          prompt,
          modelId: modelId || "flux-1.1-pro-ultra",
          status: "processing",
        },
      });

      // Generate image
      const result = await generateImageWithReplicate(prompt, modelId);

      // Update image record
      await prismaClient.image.update({
        where: { id: image.id },
        data: {
          status: result.status,
          imageUrl: result.imageUrl,
        },
      });

      // Deduct credits
      await prismaClient.userCredit.update({
        where: { userId },
        data: {
          amount: userCredit.amount - 1,
        },
      });

      res.json({
        success: true,
        image: {
          id: image.id,
          status: result.status,
          imageUrl: result.imageUrl,
        },
      });
    } catch (error) {
      console.error("Image generation error:", error);
      res.status(500).json({
        message: "Error generating image",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

router.get("/models", async (req: express.Request, res: express.Response) => {
  try {
    res.json({
      models: Object.values(REPLICATE_MODELS),
    });
  } catch (error) {
    console.error("Error fetching models:", error);
    res.status(500).json({
      message: "Error fetching models",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router; 