import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = {
  searchParams: Promise<{
    redirectTo?: string;
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { redirectTo, error } = await searchParams;

  return (
    <Card className="border-border/70 shadow-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>
          Sign in or create an account to manage localization projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          redirectTo={redirectTo ?? "/dashboard"}
          initialError={error}
        />
      </CardContent>
    </Card>
  );
}
