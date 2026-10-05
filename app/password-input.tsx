"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PasswordInput({ ru, ...props }: ComponentProps<typeof Input> & { ru: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-input"><Input {...props} type={visible ? "text" : "password"}/><button type="button" className="password-toggle" aria-label={visible ? (ru ? "Скрыть пароль" : "Hide password") : (ru ? "Показать пароль" : "Show password")} aria-pressed={visible} aria-controls={props.id} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>;
}
