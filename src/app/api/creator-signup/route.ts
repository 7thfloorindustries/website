import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { handle, email } = body;

    if (!handle || !email) {
      return NextResponse.json(
        { error: "Handle and email are required" },
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
        subject: `New Creator Signup: ${handle}`,
        html: `
          <h2>New Creator Signup</h2>
          <p><strong>TikTok Handle:</strong> ${handle}</p>
          <p><strong>Email:</strong> ${email}</p>
          <hr />
          <p style="color: #666; font-size: 12px;">Submitted via 7th Floor Digital website</p>
        `,
      });
    } else {
      // Log to console for development
      console.log("=== NEW CREATOR SIGNUP ===");
      console.log("Handle:", handle);
      console.log("Email:", email);
      console.log("==========================");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Creator signup error:", error);
    return NextResponse.json(
      { error: "Failed to process signup" },
      { status: 500 }
    );
  }
}
