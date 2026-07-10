"use client";

import { useActionState, useState } from "react";

import {
  signIn,
  signUp,
  type AuthActionState,
} from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LoginFormProps = {
  redirectTo: string;
  initialError?: string;
};

const initialState: AuthActionState = {};

export function LoginForm({ redirectTo, initialError }: LoginFormProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialError ? { error: initialError } : initialState,
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUp,
    initialState,
  );

  const state = mode === "sign-in" ? signInState : signUpState;
  const action = mode === "sign-in" ? signInAction : signUpAction;
  const pending = mode === "sign-in" ? signInPending : signUpPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["sign-in", "登录"],
            ["sign-up", "创建账号"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <form action={action} className="flex flex-col gap-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">邮箱</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">密码</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              placeholder="••••••••"
              minLength={6}
              required
            />
          </Field>
        </FieldGroup>

        {state.error ? (
          <FieldError errors={[{ message: state.error }]} />
        ) : null}

        {state.success ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {state.success}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending
            ? "请稍候…"
            : mode === "sign-in"
              ? "登录"
              : "创建账号"}
        </Button>
      </form>
    </div>
  );
}
