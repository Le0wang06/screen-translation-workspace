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
  title: "登录",
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
        <CardTitle className="text-xl">欢迎回来</CardTitle>
        <CardDescription>
          登录或创建账号，管理你的截图本地化项目。
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
