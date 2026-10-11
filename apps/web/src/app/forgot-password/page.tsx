"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 p-6">
      <h1 className="text-2xl font-bold">Forgot password</h1>
      <p className="text-sm text-slate-600">
        Password reset emails can be enabled with your SMTP provider. Contact support or use seeded demo accounts in development.
      </p>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
      <Button disabled className="w-full">
        Send reset link (configure SMTP)
      </Button>
      <Link href="/login" className="text-sm text-brand">
        Back to login
      </Link>
    </div>
  );
}
