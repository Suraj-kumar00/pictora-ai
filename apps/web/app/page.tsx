"use client";
import { Hero } from "@/components/home/Hero";
import { useAuth } from "@/hooks/useAuth";
import { SignedIn, SignedOut } from "@clerk/nextjs";

export default function Home() {
  const { user } = useAuth();

  return (
    <div>
      <SignedOut>
        <Hero />
      </SignedOut>
      <SignedIn>
        <Hero />
      </SignedIn>
    </div>
  );
}
