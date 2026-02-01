import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, message } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // If Resend API key is configured, send email
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
        to: "marketing@7thfloor.digital",
        replyTo: email,
        subject: `New Inquiry from ${email}`,
        html: `
          <h2>New Contact Inquiry</h2>
          <p><strong>From:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <p>${message || "(No message provided)"}</p>
          <hr />
          <p style="color: #666; font-size: 12px;">Submitted via 7th Floor Digital website</p>
        `,
      });
    } else {
      // Log to console for development
      console.log("=== NEW CONTACT INQUIRY ===");
      console.log("Email:", email);
      console.log("Message:", message || "(none)");
      console.log("===========================");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
