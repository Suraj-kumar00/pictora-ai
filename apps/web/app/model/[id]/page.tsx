"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import axios from "axios";
import { BACKEND_URL } from "@/app/config";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GenerateImage } from "@/components/GenerateImage";

interface ModelDetails {
  id: string;
  name: string;
  status: string;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
}

export default function ModelPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<ModelDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchModelDetails = async () => {
      try {
        setLoading(true);
        const token = await getToken();
        if (!token) {
          router.push("/");
          return;
        }

        console.log(`Fetching model with ID: ${params.id}`);
        const response = await axios.get(
          `${BACKEND_URL}/model/status/${params.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        console.log("API response:", response.data);

        if (response.data.success) {
          setModel(response.data.model);
        } else {
          setError("Failed to load model details");
        }
      } catch (err) {
        console.error("Error fetching model:", err);
        setError("Failed to load model details");
      } finally {
        setLoading(false);
      }
    };

    fetchModelDetails();
  }, [params.id, getToken, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-4">Loading model details...</p>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-red-500">{error || "Model not found"}</p>
        <button
          className="mt-4 px-4 py-2 bg-primary text-white rounded-md"
          onClick={() => router.push("/dashboard")}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{model.name}</CardTitle>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                Status: {model.status}
              </span>
              {model.status === "Pending" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="relative aspect-square overflow-hidden rounded-lg">
                  {model.thumbnail ? (
                    <Image
                      src={model.thumbnail}
                      alt={model.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full h-full bg-muted">
                      <p className="text-center">No thumbnail available</p>
                      <p className="text-center text-sm text-muted-foreground">
                        {model.status === "Pending" 
                          ? "Model is still training"
                          : "Thumbnail generation failed"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium">Model Information</h3>
                  <p className="text-sm text-muted-foreground">
                    Created on{" "}
                    {new Date(model.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {model.status === "Generated" ? (
                  <div>
                    <GenerateImage defaultModelId={params.id} />
                  </div>
                ) : (
                  <div className="p-4 bg-muted rounded-lg">
                    <p>
                      This model is still being trained. Please check back later.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 