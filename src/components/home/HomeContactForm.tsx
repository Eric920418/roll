"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { submitHomeContact } from "./contact";
import styles from "./home.module.css";

type Labels = {
  name: string;
  email: string;
  message: string;
  send: string;
  sending: string;
  success: string;
  error: string;
};

export default function HomeContactForm({ locale, labels }: { locale: string; labels: Labels }) {
  const id = useId();
  const pending = useRef(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setError("");
    try {
      await submitHomeContact({
        name: String(data.get("name") ?? ""),
        email: String(data.get("email") ?? ""),
        message: String(data.get("message") ?? ""),
        company: String(data.get("company") ?? ""),
        locale,
      }, labels.error);
      form.reset();
      setStatus("success");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message || labels.error : String(cause || labels.error));
      setStatus("error");
    } finally {
      pending.current = false;
    }
  }

  const sending = status === "sending";
  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-busy={sending}>
      <div className={styles.field}>
        <label htmlFor={`${id}-name`}>{labels.name}</label>
        <input id={`${id}-name`} name="name" autoComplete="name" maxLength={200} readOnly={sending} required />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`}>{labels.email}</label>
        <input id={`${id}-email`} name="email" type="email" autoComplete="email" readOnly={sending} required />
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-message`}>{labels.message}</label>
        <textarea id={`${id}-message`} name="message" rows={3} maxLength={5000} readOnly={sending} required />
      </div>
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor={`${id}-company`}>Company</label>
        <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <button className={styles.submit} type="submit" disabled={sending}>
        {sending ? labels.sending : labels.send}
      </button>
      {status === "success" && <p className={styles.formStatus} role="status">{labels.success}</p>}
      {status === "error" && <p className={styles.formError} role="alert">{error}</p>}
    </form>
  );
}
