"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "default" | "secondary" | "danger";
type Size = "default" | "sm";

const variantClass: Record<Variant, string> = {
  default: "btn btn-primary",
  secondary: "btn btn-secondary",
  danger: "btn btn-danger",
};

const sizeClass: Record<Size, string> = {
  default: "",
  sm: "btn-sm",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(variantClass[variant], sizeClass[size], className)}
      {...props}
    />
  );
}
