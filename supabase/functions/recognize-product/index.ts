// recognize-product — identifies a grocery product from a photo using Claude vision.
//
// Request  (POST, JSON):  { image_base64: string, media_type?: string }
// Response (JSON):        { name, category, storage, expiry_estimate_days, confidence, notes }
//
// The ANTHROPIC_API_KEY is read from the function's environment (a Supabase
// secret) so it never ships inside the mobile app. Calls require a valid
// Supabase JWT (verify_jwt = true), which the app sends automatically.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
// Haiku is fast + cheap and handles this single-image extraction well.
const MODEL = Deno.env.get('RECOGNIZE_MODEL') ?? 'claude-haiku-4-5';

const FOOD_CATEGORIES = [
  'Produce', 'Dairy', 'Meat', 'Seafood', 'Bakery', 'Frozen',
  'Pantry', 'Beverages', 'Condiments', 'Snacks', 'Other',
] as const;

const STORAGE = ['frozen', 'refrigerated', 'cool', 'room'] as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Tool the model must call — guarantees structured output.
const recordProductTool = {
  name: 'record_product',
  description: 'Record the identified grocery/food product from the image.',
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Concise product name as a shopper would write it, e.g. "Organic Whole Milk", "Bananas", "Cheddar Cheese". Title case, no brand fluff unless on the label.',
      },
      category: { type: 'string', enum: FOOD_CATEGORIES as unknown as string[] },
      storage: {
        type: 'string',
        enum: STORAGE as unknown as string[],
        description: 'Best storage temperature class for this item.',
      },
      expiry_estimate_days: {
        type: ['integer', 'null'],
        description: 'Rough shelf life in days from purchase for a typical unopened item, or null if unknown.',
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: {
        type: ['string', 'null'],
        description: 'Short note if the image is ambiguous or shows multiple items, else null.',
      },
    },
    required: ['name', 'category', 'storage', 'confidence'],
  },
};

const SYSTEM_PROMPT =
  'You identify a single food or grocery product from a photo for a pantry-tracking app. ' +
  'Read any visible packaging/label text. Return the most useful, concise product name a person ' +
  'would put on their inventory list. Always call the record_product tool exactly once.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'Server is missing ANTHROPIC_API_KEY. Set it as a Supabase secret.' }, 503);
  }

  let body: { image_base64?: string; media_type?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const image = (body.image_base64 ?? '').replace(/^data:[^;]+;base64,/, '');
  if (!image) return json({ error: 'Missing image_base64' }, 400);
  const mediaType = body.media_type ?? 'image/jpeg';

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        tools: [recordProductTool],
        tool_choice: { type: 'tool', name: 'record_product' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'Identify this product.' },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error('Anthropic API error', resp.status, detail);
      return json({ error: 'Recognition failed', status: resp.status }, 502);
    }

    const data = await resp.json();
    const toolUse = (data.content ?? []).find((c: { type: string }) => c.type === 'tool_use');
    if (!toolUse?.input?.name) {
      return json({ error: 'Could not identify a product in the image.' }, 422);
    }

    const r = toolUse.input;
    return json({
      name: String(r.name),
      category: FOOD_CATEGORIES.includes(r.category) ? r.category : null,
      storage: STORAGE.includes(r.storage) ? r.storage : null,
      expiry_estimate_days:
        typeof r.expiry_estimate_days === 'number' ? r.expiry_estimate_days : null,
      confidence: r.confidence ?? null,
      notes: r.notes ?? null,
    });
  } catch (err) {
    console.error('recognize-product error', err);
    return json({ error: 'Unexpected server error' }, 500);
  }
});
