# Image Fixtures for Vision E2E Tests

This directory contains image fixtures for testing the GPT-4 Vision integration.

## Test Images

### product-photo.jpg

- **Format**: JPEG
- **Resolution**: ~800x600 pixels
- **Size**: ~8KB (< 500KB for fast testing)
- **Source**: Public domain image from Unsplash (https://unsplash.com/license)
- **Content**: Modern smartphone with triple camera on white surface
- **Purpose**: Tests VIS-01 (image acquisition), VIS-02 (format validation), VIS-03 (Vision API analysis), VIS-08 (latency), VIS-10 (cost tracking)

### document-scan.jpg

- **Format**: JPEG
- **Resolution**: ~1024x768 pixels
- **Size**: ~45KB (< 500KB for fast testing)
- **Source**: Placeholder (executor should provide real document/receipt/text image)
- **Content**: Document with visible text about "OpenWA" configuration (API Key, Webhook)
- **Purpose**: Tests VIS-06 (document/OCR case), VIS-09 (LLM-as-judge semantic validation)
- **Note**: May use `detail: 'high'` if OCR accuracy requires it

### scene-photo.jpg

- **Format**: JPEG
- **Resolution**: ~1024x768 pixels
- **Size**: ~52KB (< 500KB for fast testing)
- **Source**: Placeholder (executor should provide real office/environment scene)
- **Content**: Modern office workspace with laptop, coffee, natural lighting
- **Purpose**: Tests VIS-07 (scene/environment case), VIS-09 (LLM-as-judge semantic validation)

## Environment Setup

To run Vision E2E tests, you need:

```bash
export OPENAI_API_KEY="your-api-key-here"
```

## Test Behavior

- **With OPENAI_API_KEY present + image fixture exists**: Tests run normally
- **Without OPENAI_API_KEY or image < 1KB**: Tests skip gracefully with warning (no failure)

## Cost Control

Vision tests use **gpt-4o-mini** with **detail: 'low'** for cost efficiency:

- `detail: 'low'` = fixed 85 tokens per image
- gpt-4o-mini pricing: $0.15/1M input tokens, $0.60/1M output tokens
- Expected cost per test run: ~$0.0003 (0.03 cents)

## Adding New Images

When adding new test images:

1. Keep files < 500KB for fast test execution
2. Use public domain or properly licensed images
3. Create corresponding `*-expected.json` with:
   - `imageFile`: filename
   - `format`: 'jpeg' | 'png' | 'webp' | 'gif'
   - `sizeBytes`: file size
   - `expectedDescription`: brief PT description of visual content
   - `minSimilarity`: LLM-as-judge threshold (typically 0.7)
   - `visualElements`: array of key visual elements
4. Manually verify the description matches the image content

## Format Validation

All images are validated by magic bytes before submission to Vision API:

- **JPEG**: `FF D8 FF`
- **PNG**: `89 50 4E 47`
- **WebP**: `RIFF` ... `WEBP`
- **GIF**: `GIF`

Unsupported formats throw clear errors without calling the API (T-04-02 mitigation).
