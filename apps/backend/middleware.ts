import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { clerkClient, verifyToken } from "@clerk/clerk-sdk-node";
import express from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        email: string;
      };
    }
  }
}

export const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    
    if (!token) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    // In development mode, automatically authorize with a dev user ID
    if (process.env.NODE_ENV === 'development') {
      console.log("Using development user ID");
      req.userId = process.env.DEV_USER_ID || 'dev-user-123';
      next();
      return;
    }

    try {
      // For production, verify the token with AUTH_JWT_KEY
      // Make sure to specify the algorithm if your token was signed with a specific one
      const decoded = jwt.verify(token, process.env.AUTH_JWT_KEY!, {
        algorithms: ['HS256'] // Use the algorithm that matches how your token was signed
      });
      
      req.userId = (decoded as any).sub || (decoded as any).userId;
    } catch (verifyError) {
      console.warn("JWT verification failed:", verifyError);
      
      // For development only, bypass authentication
      if (process.env.NODE_ENV === 'development') {
        req.userId = process.env.DEV_USER_ID || 'dev-user-123';
        next();
        return;
      }
      throw verifyError;
    }
    
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(403).json({ message: "Authentication failed" });
  }
};

export async function authMiddlewareOld(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "No token provided" });
      return;
    }

    // Debug logs
    console.log("Received token:", token);

    // Get the JWT verification key from environment variable
    const publicKey = process.env.CLERK_JWT_PUBLIC_KEY!;

    if (!publicKey) {
      console.error("Missing CLERK_JWT_PUBLIC_KEY in environment variables");
      res.status(500).json({ message: "Server configuration error" });
      return;
    }

    // Format the public key properly
    const formattedKey = publicKey.replace(/\\n/g, "\n");

    const decoded = jwt.verify(token, formattedKey, {
      algorithms: ["RS256"],
      issuer:
        process.env.CLERK_ISSUER || "https://clerk.pictora.ai",
      complete: true,
    });

    console.log("Decoded token:", decoded);

    // Extract user ID from the decoded token
    const userId = (decoded as any).payload.sub;

    if (!userId) {
      console.error("No user ID in token payload");
      res.status(403).json({ message: "Invalid token payload" });
      return;
    }

    // Fetch user details from Clerk
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (email) => email.id === user.primaryEmailAddressId
    );

    if (!primaryEmail) {
      console.error("No email found for user");
      res.status(400).json({ message: "User email not found" });
      return;
    }

    // Attach the user ID and email to the request
    req.userId = userId;
    req.user = {
      email: primaryEmail.emailAddress,
    };

    next();
  } catch (error) {
    console.error("Auth error:", error);
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({
        message: "Invalid token",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
      return;
    }
    res.status(500).json({
      message: "Error processing authentication",
      details:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
    return;
  }
}
