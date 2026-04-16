"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username && password) { router.push("/leads"); }
    else { setError("Please fill in all fields"); }
  };

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Left/Top: Brand section */}
      <div className="flex-1 bg-gradient-to-br from-primary via-primary-dark to-primary flex flex-col items-center justify-center px-6 py-12 md:py-0">
        <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-6 mb-6">
          <Image src="/logos/logo-sena-white.png" alt="Sena Solar Energy" width={120} height={120} className="opacity-90" />
        </div>
        <h1 className="text-2xl font-bold text-white">Solar Sales</h1>
        <p className="text-white/60 text-sm mt-1">SENA SOLAR ENERGY</p>
      </div>

      {/* Right/Bottom: Form section */}
      <div className="bg-white rounded-t-3xl md:rounded-none px-6 pt-8 pb-10 md:flex md:items-center md:justify-center md:w-[480px]">
        <div className="w-full max-w-sm md:max-w-none">
          <h2 className="text-lg font-bold mb-6">Sign In</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Username</label>
              <input type="text" placeholder="Enter username" value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Password</label>
              <input type="password" placeholder="Enter password" value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-gray-light focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
            </div>
            {error && <p className="text-danger text-sm text-center bg-red-50 py-2 rounded-xl">{error}</p>}
            <button type="submit"
              className="w-full py-4 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-bold text-base active:scale-[0.98] transition-all shadow-lg shadow-primary/20">
              Sign In
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
