import { supabase } from './supabase';
import { ProductRecognition } from '../types';

export interface RecognizeResult {
  data: ProductRecognition | null;
  error: string | null;
}

/**
 * Sends a base64 JPEG to the `recognize-product` edge function, which uses
 * Claude vision to identify the product. The Anthropic key lives server-side.
 */
export async function recognizeProduct(
  imageBase64: string,
  mediaType = 'image/jpeg'
): Promise<RecognizeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('recognize-product', {
      body: { image_base64: imageBase64, media_type: mediaType },
    });

    if (error) {
      // Edge function returns a JSON { error } body on failure; surface it if present.
      let message = error.message ?? 'Recognition failed';
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const payload = await ctx.json();
          if (payload?.error) message = payload.error;
        } catch {
          /* ignore parse failure, keep default message */
        }
      }
      return { data: null, error: message };
    }

    if (data?.error) return { data: null, error: data.error };
    if (!data?.name) return { data: null, error: 'No product detected. Try a clearer photo.' };

    return { data: data as ProductRecognition, error: null };
  } catch (err: any) {
    return { data: null, error: err?.message ?? 'Recognition failed' };
  }
}
