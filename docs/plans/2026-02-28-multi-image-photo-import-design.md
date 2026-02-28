# Multi-Image Photo Import Design

## Problem

When screenshotting TikTok recipe descriptions, the recipe often doesn't fit in a single screenshot. Users need to take multiple screenshots with potential overlap between them.

## Solution

Allow uploading up to 10 images in the photo import flow. All images are sent to Mistral pixtral-large in a single API call (which natively supports multi-image input). The model handles overlapping text naturally since it sees all images at once.

## Design Decisions

- **Approach:** Single multi-image Mistral call (vs parallel OCR + merge). Simpler, cheaper, and Mistral handles overlap naturally.
- **Max images:** 10
- **Camera flow:** Takes one photo at a time; user can tap "Take Photo" again to add more. Library picker supports multi-select.

## Changes

### UI (`src/app/(tabs)/recipes/create.tsx`)

Photo mode becomes a two-step flow:

1. **Staging area:** Horizontal scrollable row of image thumbnails. Each has an X button to remove. Below the thumbnails: "Add from Library" and "Take Photo" buttons. "Import Recipe" button enabled when 1+ images staged.
2. **Processing:** Uploads all images to Supabase Storage, collects public URLs, sends to edge function.

### Client (`src/lib/ai.ts`)

- New export: `parseRecipeFromPhotos(imageUrls: string[])`
- Sends `{ image_urls: string[] }` to the edge function
- Keep old `parseRecipeFromPhoto()` as wrapper for backward compat

### Edge Function (`supabase/functions/parse-recipe-photo/index.ts`)

- Accept both `image_url` (string) and `image_urls` (string[]), normalize to array
- Validate: 1-10 images, each URL max 2000 chars
- Build Mistral content array with all images in one message
- Update OCR prompt: "Extract ALL text from these images. They may be multiple screenshots of the same content with overlap — deduplicate and return the combined text."
- Bump OCR timeout to 45s for multi-image
- GPT-4o system prompt: add note about possible duplicated content from overlapping screenshots
