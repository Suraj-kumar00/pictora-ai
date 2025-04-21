"use client";
import { Hero } from "@/components/home/Hero";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  // Keep the homepage accessible to all users (logged in or not)
  return (
    <div>
      <Hero />
    </div>
  );
}
