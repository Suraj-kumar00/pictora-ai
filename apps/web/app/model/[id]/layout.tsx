import { Metadata } from "next";
import { Appbar } from "@/components/Appbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Model Details | Pictora AI",
  description: "View and use your trained AI model",
};

export default function ModelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Appbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
} 