export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// S3 configuration
export const S3_BUCKET = "pictora-ai-s3";
export const S3_REGION = "ap-south-1";
export const S3_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

// For backward compatibility, map Cloudflare URL to S3
export const CLOUDFLARE_URL = S3_URL;
