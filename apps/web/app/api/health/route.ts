import { NextResponse } from 'next/server';

/**
 * Health check endpoint
 * @route GET /api/health
 * @returns {Object} 200 - Health check response
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'frontend',
  });
} 