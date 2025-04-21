"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  // Start with a null state until we know the client preference
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  
  // Use useEffect to set the initial theme on client-side only
  useEffect(() => {
    // Get the system preference or stored preference
    const savedTheme = localStorage.getItem('theme') || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(savedTheme as "light" | "dark");
    
    // Apply the theme to document
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  }, []);
  
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };
  
  // Only render the toggle when we know the theme
  if (theme === null) return null;
  
  return (
    <div className="flex items-center space-x-2">
      <Sun className={`h-5 w-5 ${theme === 'dark' ? 'text-pink-500' : ''}`} />
      <button
        type="button"
        role="switch"
        aria-checked={theme === 'dark'}
        data-state={theme === 'dark' ? 'checked' : 'unchecked'}
        className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input"
        onClick={toggleTheme}
      >
        <span
          data-state={theme === 'dark' ? 'checked' : 'unchecked'}
          className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
        />
      </button>
      <Moon className={`h-5 w-5 ${theme === 'dark' ? '' : 'text-pink-500'}`} />
    </div>
  );
}
