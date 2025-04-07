"use client";

import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <Sun className="h-5 w-5" />
        <Switch className="data-[state=checked]:bg-pink-500 data-[state=unchecked]:bg-input" />
        <Moon className="h-5 w-5" />
      </div>
    );
  }

  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-2">
      <Sun className="h-5 w-5" />
      <Switch
        className="data-[state=checked]:bg-pink-500 data-[state=unchecked]:bg-input"
        checked={isDark}
        onCheckedChange={() => setTheme(isDark ? "light" : "dark")}
      />
      <Moon className="h-5 w-5" />
    </div>
  );
}
