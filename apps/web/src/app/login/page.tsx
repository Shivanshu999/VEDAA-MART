"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default function LoginPage() {
  const router = useRouter();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-2xl border border-slate-200 p-6">
      <h1 className="text-2xl font-bold">Login</h1>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const { error } = await authClient.signIn.email(values);
          if (error) {
            form.setError("email", { message: error.message ?? "Login failed" });
            return;
          }
          router.push("/account");
        })}
      >
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...form.register("password")} />
        </div>
        <Button type="submit" className="w-full">
          Sign in
        </Button>
      </form>
      <p className="text-sm text-slate-600">
        <Link href="/forgot-password" className="text-brand">
          Forgot password?
        </Link>{" "}
        ·{" "}
        <Link href="/register" className="text-brand">
          Create account
        </Link>
      </p>
    </div>
  );
}
