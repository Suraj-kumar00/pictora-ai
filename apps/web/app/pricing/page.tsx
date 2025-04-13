"use client";

import { usePayment } from "@/hooks/usePayment";
import { PlanCard } from "@/components/subscription/PlanCard";
import { useAuth, SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 9.99,
    credits: 100,
    features: [
      "100 AI image generations",
      "Basic image editing",
      "Standard resolution",
      "Email support",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: 29.99,
    credits: 500,
    features: [
      "500 AI image generations",
      "Advanced image editing",
      "High resolution",
      "Priority support",
      "Custom styles",
    ],
  },
];

export default function PricingPage() {
  const { handlePayment } = usePayment();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const handlePlanSelect = async (plan: any) => {
    if (!isSignedIn) {
      return;
    }
    await handlePayment(plan);
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
        <p className="text-muted-foreground">
          Select the plan that best fits your needs
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {PLANS.map((plan) => (
          <div key={plan.id}>
            <SignedIn>
              <PlanCard
                plan={plan}
                onSelect={() => handlePlanSelect(plan)}
              />
            </SignedIn>
            <SignedOut>
              <div className="relative">
                <PlanCard
                  plan={plan}
                  onSelect={() => {}}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                  <SignInButton mode="modal">
                    <Button
                      variant="default"
                      size="lg"
                      className="bg-gradient-to-r from-neutral-800 to-neutral-900 text-white dark:from-neutral-700 dark:to-neutral-800 border border-neutral-600 dark:border-neutral-700 rounded-lg shadow-md shadow-neutral-800/20 dark:shadow-black/30 px-6 py-3 font-medium tracking-wide transition-all duration-300 ease-in-out hover:shadow-lg hover:scale-[1.02] hover:from-neutral-700 hover:to-neutral-900 dark:hover:from-neutral-600 dark:hover:to-neutral-750"
                    >
                      Sign in to Purchase
                    </Button>
                  </SignInButton>
                </div>
              </div>
            </SignedOut>
          </div>
        ))}
      </div>
    </div>
  );
}
