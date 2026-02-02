import { NextResponse } from 'next/server';
import { generateCsrfToken } from '@/lib/csrf';

export async function GET() {
  const token = generateCsrfToken();

  const response = NextResponse.json({ csrfToken: token });

  // Set httpOnly cookie with the same token for double-submit verification
  response.cookies.set('csrf-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  });

  return response;
}
