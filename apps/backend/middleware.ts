import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { clerkClient } from "@clerk/clerk-sdk-node";
import axios from "axios";
import jwkToPem from "jwk-to-pem";

// No need to initialize Clerk client as it's handled automatically
// when importing from @clerk/clerk-sdk-node

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

let cachedPublicKey: string | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds

async function getPublicKey(): Promise<string> {
  const now = Date.now();
  
  // Return cached key if it's still valid
  if (cachedPublicKey && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedPublicKey;
  }

  try {
    const jwksUrl = `${process.env.CLERK_ISSUER_URL}/.well-known/jwks.json`;
    const response = await axios.get(jwksUrl);
    const jwk = response.data.keys[0]; // Get the first key
    const pem = jwkToPem(jwk);
    
    // Update cache
    cachedPublicKey = pem;
    lastFetchTime = now;
    
    return pem;
  } catch (error) {
    console.error("Error fetching JWKS:", error);
    throw new Error("Failed to fetch public key");
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader?.split(" ")[1];

    if (!token) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    try {
      const publicKey = await getPublicKey();
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
        issuer: process.env.CLERK_ISSUER_URL,
      }) as any;

      // Extract user ID from the decoded token
      const userId = decoded.sub;

      if (!userId) {
        console.error("No user ID in token payload");
        res.status(403).json({ error: "Invalid token payload" });
        return;
      }

      // Fetch user details from Clerk
      const user = await clerkClient.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId
      );

      if (!primaryEmail) {
        console.error("No email found for user");
        res.status(400).json({ error: "User email not found" });
        return;
      }

      // Attach the user ID and email to the request
      req.userId = userId;
      req.user = {
        email: primaryEmail.emailAddress,
      };

      next();
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);
      res.status(403).json({
        error: "Invalid token",
        details: process.env.NODE_ENV === "development" ? (jwtError as Error).message : undefined,
      });
    }
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({
      error: "Error processing authentication",
      details: process.env.NODE_ENV === "development" ? (error as Error).message : undefined,
    });
  }
}
