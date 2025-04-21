import { useAuth } from "@clerk/clerk-react"; // Or whatever auth provider you're using

export async function getToken() {
  try {
    // If using Clerk
    const { getToken } = useAuth();
    return await getToken();
  } catch (error) {
    console.error("Error getting authentication token:", error);
    
    // For development environment, return a fallback token
    if (process.env.NODE_ENV === 'development') {
      console.log("Using development fallback token");
      return "dev-token-for-testing";
    }
    throw error;
  }
} 