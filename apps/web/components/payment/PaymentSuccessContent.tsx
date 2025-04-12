"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

type PaymentStatus = "loading" | "success" | "error";

interface PaymentSuccessContentProps {
  status: PaymentStatus;
  error?: string;
}

export function PaymentSuccessContent({ status, error }: PaymentSuccessContentProps) {
  return (
    <div className="flex min-h-screen items-center justify-center py-10">
      <div className="text-center">
        {status === "loading" && (
          <>
            <h1 className="text-2xl font-bold">Verifying Payment...</h1>
            <p className="mt-2 text-muted-foreground">
              Please wait while we verify your payment.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <h1 className="text-2xl font-bold">Payment Successful!</h1>
            <p className="mt-2 text-muted-foreground">
              Thank you for your purchase. Your credits have been added to your account.
            </p>
            <div className="mt-6">
              <Button asChild>
                <Link href="/dashboard">Go to Dashboard</Link>
              </Button>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-2xl font-bold text-destructive">Payment Failed</h1>
            <p className="mt-2 text-muted-foreground">
              {error || "There was an error processing your payment."}
            </p>
            <div className="mt-6">
              <Button variant="outline" asChild>
                <Link href="/pricing">Try Again</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
