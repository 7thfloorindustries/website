import { NextRequest, NextResponse } from "next/server";
import { contactFormSchema } from "@/lib/validation";
import { isValidOrigin, sanitizeForEmail, logError } from "@/lib/security";
import { validateDoubleSubmit } from "@/lib/csrf";
import { verifyTurnstile } from "@/lib/turnstile";

export async function POST(request: NextRequest) {
  try {
    // CSRF protection via origin header
    if (!isValidOrigin(request)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // CSRF token validation (double-submit cookie pattern)
    const cookieToken = request.cookies.get("csrf-token")?.value;
    const bodyToken = body.csrfToken;

    if (cookieToken && bodyToken) {
      if (!validateDoubleSubmit(bodyToken, cookieToken)) {
        return NextResponse.json(
          { error: "Invalid CSRF token" },
          { status: 403 }
        );
      }
    } else if (process.env.NODE_ENV === "production") {
      // In production, require CSRF tokens
      return NextResponse.json(
        { error: "CSRF token required" },
        { status: 403 }
      );
    }

    // Turnstile verification
    const turnstileToken = body.turnstileToken;
    const clientIp = request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;

    const turnstileResult = await verifyTurnstile(turnstileToken, clientIp);
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: turnstileResult.error || "Turnstile verification failed" },
        { status: 403 }
      );
    }

    // Validate input with Zod
    const result = contactFormSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    const { email, message, website } = result.data;

    // Honeypot check - if filled, silently accept (bot detection)
    if (website && website.length > 0) {
      // Return fake success to bots
      return NextResponse.json({ success: true });
    }

    // Sanitize for email HTML
    const safeEmail = sanitizeForEmail(email, 254);
    const safeMessage = sanitizeForEmail(message || "", 5000);

    // If Resend API key is configured, send email
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
        to: "marketing@7thfloor.digital",
        replyTo: safeEmail,
        subject: `New Inquiry from ${safeEmail}`,
        html: `
          <h2>New Contact Inquiry</h2>
          <p><strong>From:</strong> ${safeEmail}</p>
          <p><strong>Message:</strong></p>
          <p>${safeMessage || "(No message provided)"}</p>
          <hr />
          <p style="color: #666; font-size: 12px;">Submitted via 7th Floor Digital website</p>
        `,
      });
    } else {
      // Log to console for development
      console.log("=== NEW CONTACT INQUIRY ===");
      console.log("Email:", safeEmail);
      console.log("Message:", safeMessage || "(none)");
      console.log("===========================");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Contact form error", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
