"use client";

import { usePayment } from "@/hooks/usePayment";
import { PlanCard } from "@/components/subscription/PlanCard";

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
          <PlanCard
            key={plan.id}
            plan={plan}
            onSelect={() => handlePayment(plan)}
          />
        ))}
      </div>
    </div>
  );
}
