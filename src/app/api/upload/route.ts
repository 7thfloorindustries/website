/**
 * Image Upload API Route
 * Uploads campaign cover images to Vercel Blob storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const campaignSlug = formData.get('campaignSlug') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!campaignSlug) {
      return NextResponse.json({ error: 'No campaign slug provided' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 5MB' },
        { status: 400 }
      );
    }

    // Get file extension
    const ext = file.name.split('.').pop() || 'jpg';

    // Upload to Vercel Blob with campaign-specific path
    const blob = await put(`campaigns/${campaignSlug}/cover.${ext}`, file, {
      access: 'public',
      addRandomSuffix: false, // Use consistent naming so we can overwrite
    });

    // Update the manifest file to track cover images
    await updateManifest(campaignSlug, blob.url);

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

// Helper to update the manifest JSON in blob storage
async function updateManifest(campaignSlug: string, coverUrl: string) {
  try {
    // Try to fetch existing manifest
    let manifest: Record<string, { coverImage: string; updatedAt: string }> = {};

    const { blobs } = await list({ prefix: 'campaigns/manifest' });
    if (blobs.length > 0) {
      const response = await fetch(blobs[0].url);
      if (response.ok) {
        manifest = await response.json();
      }
    }

    // Update manifest with new cover image
    manifest[campaignSlug] = {
      coverImage: coverUrl,
      updatedAt: new Date().toISOString(),
    };

    // Save updated manifest
    await put('campaigns/manifest.json', JSON.stringify(manifest, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    });
  } catch (error) {
    console.error('Failed to update manifest:', error);
    // Don't throw - the image was still uploaded successfully
  }
}

// GET endpoint to retrieve manifest/cover images
export async function GET(request: NextRequest) {
  const campaignSlug = request.nextUrl.searchParams.get('campaign');

  try {
    const { blobs } = await list({ prefix: 'campaigns/manifest' });

    if (blobs.length === 0) {
      return NextResponse.json({ manifest: {} });
    }

    const response = await fetch(blobs[0].url);
    if (!response.ok) {
      return NextResponse.json({ manifest: {} });
    }

    const manifest = await response.json();

    // If specific campaign requested, return just that
    if (campaignSlug) {
      return NextResponse.json({
        coverImage: manifest[campaignSlug]?.coverImage || null,
      });
    }

    return NextResponse.json({ manifest });
  } catch (error) {
    console.error('Failed to fetch manifest:', error);
    return NextResponse.json({ manifest: {} });
  }
}
