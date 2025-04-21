import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if Razorpay credentials are set
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    return NextResponse.json({
      status: 'success',
      message: 'Razorpay debug info',
      razorpayConfigured: !!(keyId && keySecret),
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'Not set',
      keyIdPrefix: keyId ? keyId.substring(0, 4) + '...' : 'Not set',
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: 'Failed to get debug info',
      error: (error as Error).message,
    }, { status: 500 });
  }
} 