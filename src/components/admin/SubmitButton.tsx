"use client";

import { useFormStatus } from "react-dom";
import { BUSY } from "./ActButton";

// A submit button that cannot be tapped twice while its form is sending: a second tap would post twice (a second Facebook post, a second
// Google reply, a second note). Only inside a <form action>. While it sends, the one pressed says so (aria-busy, BUSY): of Save draft and
// Post now, the one with its name and value in what was sent.
export function SubmitButton({ disabled, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending, data } = useFormStatus();
  const pressed = pending && (!props.name || data?.get(props.name) === String(props.value));
  return <button type="submit" {...props} disabled={pending || disabled} aria-busy={pressed || undefined} className={`${className} ${BUSY}`} />;
}
