# Pictora AI - Fixes and Configuration Guide

Based on a thorough analysis of the codebase, here are the identified issues and their solutions:

## 1. Database Connection Issues

### Problem

The system is using placeholder values in the `DATABASE_URL` environment variable.

### Solution

Update the `DATABASE_URL` in your `.env` file:

```
# Change this:
DATABASE_URL=postgresql://username:password@localhost:5432/pictoraai

# To actual credentials, for example:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pictoraai
```

## 2. Replicate API Integration Issues

### Problem

- Using incorrect parameter name `training_data` instead of `input_images`
- Using outdated version ID for the model
- Webhook URL formatting issues (HTTP instead of HTTPS)

### Solution

1. Ensure the ReplicateModel.ts file uses these settings:

```typescript
// For training models
const predictionConfig = {
  version: "c6e78d25a6a53f842319a81c3ef0b7cbce1f59ee97c0585191391b7f9932f4bf",
  input: {
    input_images: zipUrl, // NOT training_data
    trigger_word: triggerWord,
  },
};

// For generating images
const predictionConfig = {
  version: "c6e78d25a6a53f842319a81c3ef0b7cbce1f59ee97c0585191391b7f9932f4bf",
  input: {
    prompt: prompt,
    lora_url: tensorPath,
    lora_scale: 1,
  },
};
```

2. Ensure webhook URLs are properly formatted with HTTPS:

```typescript
let webhookUrl = process.env.WEBHOOK_BASE_URL;
// Make sure the webhook URL starts with https
if (webhookUrl.startsWith("http://")) {
  webhookUrl = webhookUrl.replace("http://", "https://");
} else if (!webhookUrl.startsWith("https://")) {
  webhookUrl = `https://${webhookUrl}`;
}
```

3. Set up proper environment variable in `.env`:

```
# Make sure to use TOKEN not KEY
REPLICATE_API_TOKEN=your_replicate_api_token
```

## 3. Storage Migration (Cloudflare R2 to AWS S3)

### Problem

The system was migrated from Cloudflare R2 to AWS S3, but some configuration may still reference Cloudflare.

### Solution

1. Ensure Next.js configuration allows S3 domains:

```javascript
// In next.config.js
{
  protocol: "https",
  hostname: "pictora-ai-s3.s3.ap-south-1.amazonaws.com",
},
{
  protocol: "https",
  hostname: "*.s3.amazonaws.com",
},
{
  protocol: "https",
  hostname: "*.s3.ap-south-1.amazonaws.com",
},
```

2. Update S3 configuration in the web app:

```typescript
// In apps/web/app/config.ts
export const S3_BUCKET = "pictora-ai-s3";
export const S3_REGION = "ap-south-1";
export const S3_URL = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;

// For backward compatibility
export const CLOUDFLARE_URL = S3_URL;
```

3. Set proper environment variables:

```
S3_ACCESS_KEY=your_s3_access_key
S3_SECRET_KEY=your_s3_secret_key
BUCKET_NAME=pictora-ai-s3
```

## 4. Webhook URL Configuration

### Problem

Replicate API requires HTTPS webhooks, but the configuration may use HTTP.

### Solution

1. For local development, use ngrok or similar:

```bash
# Terminal 1: Start your backend
npm run dev

# Terminal 2: Start ngrok to create secure tunnel
ngrok http 8000
```

2. Update your `.env` file:

```
# Use the HTTPS URL from ngrok
WEBHOOK_BASE_URL=https://your-ngrok-id.ngrok.io
```

## 5. Complete .env File Template

```
# AI Service
REPLICATE_API_TOKEN=your_replicate_api_token

# Storage
S3_ACCESS_KEY=your_s3_access_key
S3_SECRET_KEY=your_s3_secret_key
BUCKET_NAME=pictora-ai-s3

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pictoraai

# Authentication
AUTH_JWT_KEY=your_jwt_key
CLERK_JWT_PUBLIC_KEY=your_clerk_public_key
SIGNING_SECRET=your_clerk_webhook_signing_secret

# Payments
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret_key

# URLs
WEBHOOK_BASE_URL=https://your-domain.ngrok.io
FRONTEND_URL=http://localhost:3000
```

## 6. Development Mode Handling

Don't rely on fallback or mock data in development mode. Configure all necessary environment variables correctly to ensure real API calls are made in all environments.

## 7. Starting the Application

After making these changes:

1. Install dependencies:

```bash
bun install
# or
npm install
```

2. Generate Prisma client:

```bash
npm run generate:db
```

3. Start backend:

```bash
cd apps/backend
npm run dev
```

4. Start frontend:

```bash
cd apps/web
npm run dev
```

The web app should be available at http://localhost:3000
The backend should be available at http://localhost:8000
